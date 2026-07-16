import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { MembershipRole, PlanTier } from '@contexual/database';

export class CreateInviteDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Enter a valid email address' })
  email!: string;

  @IsOptional()
  @IsEnum(MembershipRole, { message: 'Invalid role' })
  role?: MembershipRole;
}

export class UpdateMemberRoleDto {
  @IsEnum(MembershipRole, { message: 'Invalid role' })
  role!: MembershipRole;
}

export class SuspendMemberDto {
  @IsBoolean({ message: 'suspended must be a boolean' })
  suspended!: boolean;
}

export class ChangePlanDto {
  @IsEnum(PlanTier, { message: 'Invalid plan' })
  planTier!: PlanTier;
}

export class SetSpendLimitDto {
  @IsInt({ message: 'Limit must be a whole number of cents' })
  @Min(0, { message: 'Limit cannot be negative' })
  limitCents!: number;
}

export class SetTokenLimitDto {
  @IsInt({ message: 'Token limit must be a whole number' })
  @Min(0, { message: 'Token limit cannot be negative' })
  @Max(1_000_000_000)
  tokenLimit!: number;
}

export class SetOrganizationLimitsDto {
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  monthlySpendLimitCents!: number;

  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  monthlyTokenLimit!: number;
}
