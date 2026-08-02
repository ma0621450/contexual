-- Organization admins choose which curated models are available per connected provider.
ALTER TABLE "OrganizationProvider"
  ADD COLUMN "enabledModels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Existing connections: enable every curated model that matches the provider.
-- Values mirror apps/api/src/chat/model-catalog.ts so chat keeps working after deploy.
UPDATE "OrganizationProvider" AS connection
SET "enabledModels" = CASE connection."provider"
  WHEN 'OPENAI' THEN ARRAY[
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4o',
    'gpt-5',
    'gpt-5-mini'
  ]::TEXT[]
  WHEN 'ANTHROPIC' THEN ARRAY[
    'claude-sonnet-4-20250514',
    'claude-3-5-haiku-latest',
    'claude-opus-4-20250514'
  ]::TEXT[]
  WHEN 'GOOGLE' THEN ARRAY[
    'gemini-2.0-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash'
  ]::TEXT[]
  WHEN 'XAI' THEN ARRAY[
    'grok-3-mini',
    'grok-3',
    'grok-4'
  ]::TEXT[]
  ELSE ARRAY[connection."defaultModel"]::TEXT[]
END
WHERE cardinality(connection."enabledModels") = 0;

-- Ensure the configured default model is always included in the enabled set.
UPDATE "OrganizationProvider"
SET "enabledModels" = ARRAY(
  SELECT DISTINCT model_id
  FROM unnest("enabledModels" || ARRAY["defaultModel"]) AS model_id
)
WHERE NOT ("defaultModel" = ANY("enabledModels"));
