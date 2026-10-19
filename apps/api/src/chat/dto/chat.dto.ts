import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
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

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  webSearch?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_MODEL_IDS)
  compareModel?: string;

  @IsOptional()
  @IsString()
  parentMessageId?: string;

  @IsOptional()
  @IsString()
  folderId?: string;
}

export class RegenerateMessageDto {
  @IsString()
  conversationId!: string;

  @IsString()
  assistantMessageId!: string;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_MODEL_IDS)
  model?: string;
}

export class UpdateConversationDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  folderId?: string | null;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(4000)
  instructions?: string | null;

  @IsOptional()
  @IsBoolean()
  webSearchEnabled?: boolean;
}

export class CreateFolderDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

export class UpdateFolderDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(4000)
  instructions?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsIn(SUPPORTED_MODEL_IDS)
  defaultModel?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  fileIds?: string[];
}

export class RenameConversationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;
}

export class EditMessageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(16000)
  content!: string;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_MODEL_IDS)
  model?: string;
}

export class MessageFeedbackDto {
  @IsIn(['up', 'down', 'none'])
  rating!: 'up' | 'down' | 'none';
}

export class ShareConversationDto {
  @IsOptional()
  @IsIn(['1h', '24h', '7d', 'never'])
  expiresIn?: '1h' | '24h' | '7d' | 'never';
}

export class RunSandboxDto {
  @IsString()
  @IsIn(['javascript', 'js', 'python', 'py'])
  language!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  code!: string;
}
