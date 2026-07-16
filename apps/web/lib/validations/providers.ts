import { z } from 'zod';

export const aiProviderSchema = z.enum(['OPENAI', 'ANTHROPIC', 'GOOGLE', 'XAI']);
export const aiModelSchema = z.enum([
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1',
  'claude-3-5-haiku-latest',
  'claude-sonnet-4-20250514',
  'gemini-2.0-flash',
  'gemini-2.5-pro',
  'grok-3-mini',
  'grok-3',
]);

export const connectProviderSchema = z.object({
  provider: aiProviderSchema,
  apiKey: z
    .string()
    .trim()
    .min(20, 'The API key looks too short'),
  defaultModel: aiModelSchema.optional(),
});

export type ConnectProviderInput = z.infer<typeof connectProviderSchema>;
