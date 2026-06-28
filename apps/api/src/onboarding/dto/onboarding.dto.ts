import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOrganizationDto {
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
