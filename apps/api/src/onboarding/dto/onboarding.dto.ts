import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OrganizationType, TeamSize } from '@contexual/database';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimLowercase = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateOrganizationDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, {
    message: 'Organization name must be at least 2 characters long',
  })
  @MaxLength(100)
  @Matches(/[A-Za-z0-9]/, {
    message: 'Organization name must contain at least one letter or number',
  })
  name!: string;

  @IsOptional()
  @Transform(trimLowercase)
  @IsString()
  @MaxLength(64)
  slug?: string;

  @IsOptional()
  @IsEnum(OrganizationType, { message: 'Choose a valid organization type' })
  organizationType?: OrganizationType;

  @IsOptional()
  @IsEnum(TeamSize, { message: 'Choose a valid team size' })
  teamSize?: TeamSize;
}

export class SlugAvailabilityQueryDto {
  @Transform(trimLowercase)
  @IsString()
  @MaxLength(64)
  slug!: string;
}

export class SlugSuggestionQueryDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class JoinOrganizationDto {
  @IsString()
  @MinLength(1)
  token!: string;
}

export class InviteSignupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  proof?: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class SwitchOrganizationDto {
  @IsString()
  @MinLength(1)
  organizationId!: string;
}

export class TransferAdminDto {
  @IsString()
  @MinLength(1)
  targetUserId!: string;
}
