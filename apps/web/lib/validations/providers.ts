import { z } from 'zod';

export const aiProviderSchema = z.enum(['OPENAI', 'ANTHROPIC', 'GOOGLE', 'XAI']);

export const connectProviderSchema = z.object({
  provider: aiProviderSchema,
  apiKey: z
    .string()
    .trim()
    .min(20, 'The API key looks too short'),
  defaultModel: z.string().trim().optional(),
});

export type ConnectProviderInput = z.infer<typeof connectProviderSchema>;
