import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { AiProvider } from '@contexual/database';
import { SUPPORTED_MODEL_IDS } from '../../chat/model-catalog';

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
  @IsIn(SUPPORTED_MODEL_IDS)
  defaultModel?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Enable at least one model' })
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(SUPPORTED_MODEL_IDS, { each: true })
  enabledModels?: string[];
}

export class UpdateProviderModelsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Enable at least one model' })
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(SUPPORTED_MODEL_IDS, { each: true })
  enabledModels!: string[];

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsIn(SUPPORTED_MODEL_IDS)
  defaultModel!: string;
}
