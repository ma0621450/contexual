import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanTier } from '@contexual/database';
import Stripe from 'stripe';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { getPlanLimits } from '../organizations/plan-limits';

const PAID_PLANS: PlanTier[] = [
  PlanTier.STARTER,
  PlanTier.PRO,
  PlanTier.BUSINESS,
];

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripeClient: Stripe | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('STRIPE_SECRET_KEY'));
  }

  async getStatus(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        planTier: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return {
      stripeConfigured: this.isConfigured(),
      planTier: organization.planTier,
      subscriptionStatus: organization.subscriptionStatus,
      hasBillingAccount: Boolean(organization.stripeCustomerId),
      hasActiveSubscription: Boolean(organization.stripeSubscriptionId),
    };
  }

  private getStripe(): Stripe {
    if (this.stripeClient) {
      return this.stripeClient;
    }

    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new ServiceUnavailableException(
        'Billing is not configured. Set STRIPE_SECRET_KEY.',
      );
    }

    this.stripeClient = new Stripe(secretKey);
    return this.stripeClient;
  }

  private webUrl(): string {
    return this.config.get<string>('WEB_URL') ?? 'http://localhost:3000';
  }

  private priceIdForTier(tier: PlanTier): string {
    const priceId = this.config.get<string>(`STRIPE_PRICE_${tier}`);
    if (!priceId) {
      throw new BadRequestException(
        `No Stripe price is configured for the ${tier} plan.`,
      );
    }
    return priceId;
  }

  private tierForPriceId(priceId: string): PlanTier | null {
    for (const tier of PAID_PLANS) {
      if (this.config.get<string>(`STRIPE_PRICE_${tier}`) === priceId) {
        return tier;
      }
    }
    return null;
  }

  async createCheckoutSession(
    organizationId: string,
    actingUserId: string,
    tier: PlanTier,
  ): Promise<{ url: string }> {
    if (!PAID_PLANS.includes(tier)) {
      throw new BadRequestException(
        'Select a paid plan. Use "Manage billing" to cancel or downgrade.',
      );
    }

    const stripe = this.getStripe();
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, stripeCustomerId: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const customerId = await this.ensureCustomer(
      organization.id,
      organization.name,
      organization.stripeCustomerId,
      actingUserId,
    );

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: this.priceIdForTier(tier), quantity: 1 }],
      success_url: `${this.webUrl()}/dashboard/usage?billing=success`,
      cancel_url: `${this.webUrl()}/dashboard/usage?billing=cancelled`,
      client_reference_id: organizationId,
      metadata: { organizationId, planTier: tier },
      subscription_data: { metadata: { organizationId, planTier: tier } },
    });

    if (!session.url) {
      throw new ServiceUnavailableException(
        'Stripe did not return a checkout URL.',
      );
    }

    return { url: session.url };
  }

  async createPortalSession(
    organizationId: string,
  ): Promise<{ url: string }> {
    const stripe = this.getStripe();
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { stripeCustomerId: true },
    });

    if (!organization?.stripeCustomerId) {
      throw new BadRequestException(
        'No billing account yet. Upgrade to a paid plan first.',
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: organization.stripeCustomerId,
      return_url: `${this.webUrl()}/dashboard/usage`,
    });

    return { url: session.url };
  }

  private async ensureCustomer(
    organizationId: string,
    organizationName: string,
    existingCustomerId: string | null,
    actingUserId: string,
  ): Promise<string> {
    if (existingCustomerId) {
      return existingCustomerId;
    }

    const stripe = this.getStripe();
    const actor = await this.prisma.user.findUnique({
      where: { id: actingUserId },
      select: { email: true },
    });

    const customer = await stripe.customers.create({
      name: organizationName,
      email: actor?.email,
      metadata: { organizationId },
    });

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  async handleWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: boolean }> {
    const stripe = this.getStripe();
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'Webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET.',
      );
    }

    if (!rawBody || !signature) {
      throw new BadRequestException('Missing webhook payload or signature');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }

    const alreadyProcessed = await this.prisma.stripeEvent.findUnique({
      where: { id: event.id },
    });
    if (alreadyProcessed) {
      return { received: true };
    }

    let organizationId: string | null = null;

    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        organizationId = await this.syncFromEvent(stripe, event);
        break;
      }
      case 'customer.subscription.deleted': {
        organizationId = await this.downgradeToFree(
          event.data.object as Stripe.Subscription,
        );
        break;
      }
      default:
        break;
    }

    await this.prisma.stripeEvent.create({
      data: { id: event.id, type: event.type, organizationId },
    });

    return { received: true };
  }

  private async syncFromEvent(
    stripe: Stripe,
    event: Stripe.Event,
  ): Promise<string | null> {
    let subscription: Stripe.Subscription;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!session.subscription) {
        return null;
      }
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } else {
      subscription = event.data.object as Stripe.Subscription;
    }

    return this.applySubscription(subscription);
  }

  private async applySubscription(
    subscription: Stripe.Subscription,
  ): Promise<string | null> {
    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;

    const organization = await this.prisma.organization.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });

    if (!organization) {
      this.logger.warn(
        `Subscription ${subscription.id} has no matching organization (customer ${customerId})`,
      );
      return null;
    }

    const priceId = subscription.items.data[0]?.price.id;
    const tierFromPrice = priceId ? this.tierForPriceId(priceId) : null;
    const tierFromMetadata = subscription.metadata?.planTier as
      | PlanTier
      | undefined;
    const tier = tierFromPrice ?? tierFromMetadata ?? null;

    const isActive =
      subscription.status === 'active' || subscription.status === 'trialing';

    const data: {
      subscriptionStatus: string;
      stripeSubscriptionId: string;
      planTier?: PlanTier;
      maxMembers?: number;
    } = {
      subscriptionStatus: subscription.status,
      stripeSubscriptionId: subscription.id,
    };

    if (isActive && tier) {
      data.planTier = tier;
      data.maxMembers = getPlanLimits(tier).maxMembers;
    }

    await this.prisma.organization.update({
      where: { id: organization.id },
      data,
    });

    await this.auditService.record({
      organizationId: organization.id,
      actorId: null,
      action: 'billing.subscription_synced',
      details: { status: subscription.status, planTier: tier },
    });

    return organization.id;
  }

  private async downgradeToFree(
    subscription: Stripe.Subscription,
  ): Promise<string | null> {
    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;

    const organization = await this.prisma.organization.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });

    if (!organization) {
      return null;
    }

    await this.prisma.organization.update({
      where: { id: organization.id },
      data: {
        planTier: PlanTier.FREE,
        maxMembers: getPlanLimits(PlanTier.FREE).maxMembers,
        subscriptionStatus: subscription.status,
        stripeSubscriptionId: null,
      },
    });

    await this.auditService.record({
      organizationId: organization.id,
      actorId: null,
      action: 'billing.subscription_canceled',
    });

    return organization.id;
  }
}
