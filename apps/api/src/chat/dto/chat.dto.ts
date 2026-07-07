import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
  model?: string;
}
