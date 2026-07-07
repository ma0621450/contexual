import { PlanTier } from '@contexual/database';

export type PlanLimits = {
  maxMembers: number;
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  [PlanTier.FREE]: { maxMembers: 3 },
  [PlanTier.STARTER]: { maxMembers: 10 },
  [PlanTier.PRO]: { maxMembers: 25 },
  [PlanTier.BUSINESS]: { maxMembers: 100 },
};

export function getPlanLimits(planTier: PlanTier): PlanLimits {
  return PLAN_LIMITS[planTier];
}
