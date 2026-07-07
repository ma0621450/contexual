import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AiProvider } from '@contexual/database';

export class ConnectProviderDto {
  @IsEnum(AiProvider, { message: 'Invalid provider' })
  provider!: AiProvider;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(20, { message: 'The API key looks too short' })
  apiKey!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  defaultModel?: string;
}
