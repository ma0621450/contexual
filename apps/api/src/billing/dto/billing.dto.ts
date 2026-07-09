import { IsEnum } from 'class-validator';
import { PlanTier } from '@contexual/database';

export class CheckoutDto {
  @IsEnum(PlanTier, { message: 'Invalid plan' })
  planTier!: PlanTier;
}
