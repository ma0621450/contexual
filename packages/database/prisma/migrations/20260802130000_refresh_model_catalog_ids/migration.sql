-- Remap retired/legacy curated model IDs to the Aug 2026 catalog.
-- Mirrors apps/api/src/chat/model-catalog.ts.

-- OpenAI defaults
UPDATE "OrganizationProvider"
SET "defaultModel" = 'gpt-5.6-luna'
WHERE "provider" = 'OPENAI'
  AND "defaultModel" IN (
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4.1',
    'gpt-5',
    'gpt-5-mini'
  );

-- Anthropic defaults (retired Sonnet/Opus 4 IDs)
UPDATE "OrganizationProvider"
SET "defaultModel" = 'claude-sonnet-5'
WHERE "provider" = 'ANTHROPIC'
  AND "defaultModel" IN (
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
    'claude-3-5-haiku-latest'
  );

-- Google defaults
UPDATE "OrganizationProvider"
SET "defaultModel" = 'gemini-3.5-flash-lite'
WHERE "provider" = 'GOOGLE'
  AND "defaultModel" IN (
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
  );

-- xAI defaults
UPDATE "OrganizationProvider"
SET "defaultModel" = 'grok-4.3'
WHERE "provider" = 'XAI'
  AND "defaultModel" IN (
    'grok-3-mini',
    'grok-3',
    'grok-4',
    'grok-4-0709'
  );

-- Replace enabled lists with the current curated catalog per provider.
UPDATE "OrganizationProvider"
SET "enabledModels" = CASE "provider"
  WHEN 'OPENAI' THEN ARRAY[
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol'
  ]::TEXT[]
  WHEN 'ANTHROPIC' THEN ARRAY[
    'claude-sonnet-5',
    'claude-haiku-4-5',
    'claude-opus-5',
    'claude-fable-5'
  ]::TEXT[]
  WHEN 'GOOGLE' THEN ARRAY[
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-2.5-pro'
  ]::TEXT[]
  WHEN 'XAI' THEN ARRAY[
    'grok-4.3',
    'grok-4.5',
    'grok-build-0.1'
  ]::TEXT[]
  ELSE "enabledModels"
END;

-- Keep default inside the enabled set.
UPDATE "OrganizationProvider"
SET "enabledModels" = ARRAY(
  SELECT DISTINCT model_id
  FROM unnest("enabledModels" || ARRAY["defaultModel"]) AS model_id
)
WHERE NOT ("defaultModel" = ANY("enabledModels"));

-- Remap conversation model pins so reopen/send does not hit retired IDs.
UPDATE "Conversation"
SET "model" = CASE "provider"
  WHEN 'OPENAI' THEN 'gpt-5.6-luna'
  WHEN 'ANTHROPIC' THEN 'claude-sonnet-5'
  WHEN 'GOOGLE' THEN 'gemini-3.5-flash-lite'
  WHEN 'XAI' THEN 'grok-4.3'
  ELSE "model"
END
WHERE "model" IN (
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1',
  'gpt-5',
  'gpt-5-mini',
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-3-5-haiku-latest',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'grok-3-mini',
  'grok-3',
  'grok-4',
  'grok-4-0709'
);
