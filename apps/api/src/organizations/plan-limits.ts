import { PlanTier } from '@contexual/database';

export type PlanLimits = {
  maxMembers: number;
  maxMonthlyTokens: number;
  maxMemories: number;
  maxFileBytes: number;
  maxStoredFiles: number;
  maxStorageBytes: number;
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  [PlanTier.FREE]: {
    maxMembers: 3,
    maxMonthlyTokens: 1_000_000,
    maxMemories: 25,
    maxFileBytes: 1_000_000,
    maxStoredFiles: 10,
    maxStorageBytes: 10_000_000,
  },
  [PlanTier.STARTER]: {
    maxMembers: 10,
    maxMonthlyTokens: 10_000_000,
    maxMemories: 100,
    maxFileBytes: 2_000_000,
    maxStoredFiles: 100,
    maxStorageBytes: 100_000_000,
  },
  [PlanTier.PRO]: {
    maxMembers: 25,
    maxMonthlyTokens: 50_000_000,
    maxMemories: 500,
    maxFileBytes: 5_000_000,
    maxStoredFiles: 1_000,
    maxStorageBytes: 1_000_000_000,
  },
  [PlanTier.BUSINESS]: {
    maxMembers: 100,
    maxMonthlyTokens: 200_000_000,
    maxMemories: 2_000,
    maxFileBytes: 10_000_000,
    maxStoredFiles: 10_000,
    maxStorageBytes: 10_000_000_000,
  },
};

export function getPlanLimits(planTier: PlanTier): PlanLimits {
  return PLAN_LIMITS[planTier];
}
