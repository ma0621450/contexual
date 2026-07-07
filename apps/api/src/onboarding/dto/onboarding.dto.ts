import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2, {
    message: 'Organization name must be at least 2 characters long',
  })
  @MaxLength(100)
  @Matches(/[A-Za-z0-9]/, {
    message: 'Organization name must contain at least one letter or number',
  })
  name!: string;
}

export class JoinOrganizationDto {
  @IsString()
  @MinLength(1)
  token!: string;
}
