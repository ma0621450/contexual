import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SUPPORTED_MODEL_IDS } from '../model-catalog';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty' })
  @MaxLength(16000, { message: 'Message is too long' })
  content!: string;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_MODEL_IDS)
  model?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  attachmentIds?: string[];
}
