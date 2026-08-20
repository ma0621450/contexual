import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PlatformLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Authentication code must be six digits' })
  totp?: string;
}

export class PlatformConfirmTotpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Authentication code must be six digits' })
  totp!: string;
}

export class PlatformChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(12, {
    message: 'Password must be at least 12 characters',
  })
  @MaxLength(200)
  newPassword!: string;
}

export class ListOrganizationsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['FREE', 'STARTER', 'PRO', 'BUSINESS'])
  planTier?: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class StartImpersonationDto {
  @IsString()
  @MinLength(1)
  userId!: string;

  @IsString()
  @MinLength(1)
  organizationId!: string;

  @IsString()
  @MinLength(10, {
    message: 'Provide a reason of at least 10 characters for the audit record',
  })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  durationMinutes?: number;
}

export class RedeemImpersonationDto {
  @IsString()
  @MinLength(1)
  token!: string;
}
