import { z } from 'zod';

export const aiProviderSchema = z.enum(['OPENAI', 'ANTHROPIC', 'GOOGLE', 'XAI']);

export const connectProviderSchema = z.object({
  provider: aiProviderSchema,
  apiKey: z
    .string()
    .trim()
    .min(20, 'The API key looks too short'),
  defaultModel: z.string().trim().min(1).optional(),
  enabledModels: z.array(z.string().trim().min(1)).min(1).optional(),
});

export const updateProviderModelsSchema = z.object({
  enabledModels: z.array(z.string().trim().min(1)).min(1, 'Enable at least one model'),
  defaultModel: z.string().trim().min(1),
}).refine((value) => value.enabledModels.includes(value.defaultModel), {
  message: 'The default model must be one of the enabled models.',
  path: ['defaultModel'],
});

export type ConnectProviderInput = z.infer<typeof connectProviderSchema>;
export type UpdateProviderModelsInput = z.infer<typeof updateProviderModelsSchema>;
