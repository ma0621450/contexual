ALTER TABLE "Memory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Memory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "memory_tenant_isolation" ON "Memory"
FOR ALL
USING (
  "organizationId" = current_setting('app.organization_id', true)
)
WITH CHECK (
  "organizationId" = current_setting('app.organization_id', true)
);

ALTER TABLE "StoredFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoredFile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stored_file_tenant_isolation" ON "StoredFile"
FOR ALL
USING (
  "organizationId" = current_setting('app.organization_id', true)
)
WITH CHECK (
  "organizationId" = current_setting('app.organization_id', true)
);

ALTER TABLE "MessageAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageAttachment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "message_attachment_tenant_isolation" ON "MessageAttachment"
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM "StoredFile" AS file
    JOIN "Message" AS message ON message."id" = "MessageAttachment"."messageId"
    JOIN "Conversation" AS conversation
      ON conversation."id" = message."conversationId"
    WHERE file."id" = "MessageAttachment"."fileId"
      AND file."organizationId" = current_setting('app.organization_id', true)
      AND conversation."organizationId" =
        current_setting('app.organization_id', true)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "StoredFile" AS file
    JOIN "Message" AS message ON message."id" = "MessageAttachment"."messageId"
    JOIN "Conversation" AS conversation
      ON conversation."id" = message."conversationId"
    WHERE file."id" = "MessageAttachment"."fileId"
      AND file."organizationId" = current_setting('app.organization_id', true)
      AND conversation."organizationId" =
        current_setting('app.organization_id', true)
  )
);
