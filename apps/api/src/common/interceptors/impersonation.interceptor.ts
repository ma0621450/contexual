import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { AuthUser } from '../../auth/auth.types';

type DenyRule = { methods: string[]; pattern: RegExp };

/**
 * Actions a support session must never perform on a customer's behalf. Kept as
 * one central list so the impersonation boundary can be reviewed in a single
 * place rather than inferred from decorators spread across controllers.
 *
 * This runs as an interceptor rather than a global guard because global guards
 * execute before route-level authentication, so `request.user` would not yet
 * be populated.
 */
const DENY_RULES: DenyRule[] = [
  { methods: ['POST'], pattern: /^\/api\/auth\/change-password\/?$/ },
  { methods: ['PATCH'], pattern: /^\/api\/auth\/profile\/?$/ },
  { methods: ['POST'], pattern: /^\/api\/auth\/reset-password\/?$/ },
  { methods: ['POST', 'PATCH', 'DELETE'], pattern: /^\/api\/providers(\/|$)/ },
  { methods: ['POST'], pattern: /^\/api\/billing\/(checkout|portal)\/?$/ },
  { methods: ['PATCH'], pattern: /^\/api\/organizations\/plan\/?$/ },
  { methods: ['PATCH'], pattern: /^\/api\/organizations\/usage-limits\/?$/ },
  { methods: ['DELETE'], pattern: /^\/api\/organizations\/members(\/|$)/ },
  {
    methods: ['PATCH'],
    pattern: /^\/api\/organizations\/members\/[^/]+\/role\/?$/,
  },
  {
    methods: ['POST'],
    pattern:
      /^\/api\/onboarding\/(transfer-admin|leave-organization|create-organization)\/?$/,
  },
];

@Injectable()
export class ImpersonationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();

    if (!request.user?.impersonation) {
      return next.handle();
    }

    const method = request.method.toUpperCase();
    const path = (request.path || request.url.split('?')[0]).toLowerCase();

    const blocked = DENY_RULES.some(
      (rule) => rule.methods.includes(method) && rule.pattern.test(path),
    );

    if (blocked) {
      throw new ForbiddenException(
        'This action is not available while impersonating a customer',
      );
    }

    return next.handle();
  }
}

export const IMPERSONATION_DENY_RULES = DENY_RULES;
