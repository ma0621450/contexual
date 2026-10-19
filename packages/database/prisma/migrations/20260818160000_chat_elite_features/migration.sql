CREATE TABLE "ChatFolder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatFolder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatFolder_organizationId_userId_idx"
ON "ChatFolder"("organizationId", "userId");

ALTER TABLE "ChatFolder"
ADD CONSTRAINT "ChatFolder_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatFolder"
ADD CONSTRAINT "ChatFolder_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation"
ADD COLUMN "folderId" TEXT,
ADD COLUMN "pinnedAt" TIMESTAMP(3),
ADD COLUMN "instructions" TEXT,
ADD COLUMN "shareToken" TEXT,
ADD COLUMN "isShared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "activeLeafId" TEXT,
ADD COLUMN "webSearchEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Conversation_shareToken_key" ON "Conversation"("shareToken");
CREATE INDEX "Conversation_organizationId_shareToken_idx" ON "Conversation"("organizationId", "shareToken");
CREATE INDEX "Conversation_folderId_idx" ON "Conversation"("folderId");

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_folderId_fkey"
FOREIGN KEY ("folderId") REFERENCES "ChatFolder"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Message"
ADD COLUMN "parentId" TEXT;

CREATE INDEX "Message_conversationId_parentId_idx" ON "Message"("conversationId", "parentId");

ALTER TABLE "Message"
ADD CONSTRAINT "Message_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "Message"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

WITH ordered AS (
  SELECT
    id,
    LAG(id) OVER (PARTITION BY "conversationId" ORDER BY "createdAt", id) AS parent_id
  FROM "Message"
)
UPDATE "Message" AS message
SET "parentId" = ordered.parent_id
FROM ordered
WHERE message.id = ordered.id
  AND ordered.parent_id IS NOT NULL;

UPDATE "Conversation" AS conversation
SET "activeLeafId" = (
  SELECT message.id
  FROM "Message" AS message
  WHERE message."conversationId" = conversation.id
  ORDER BY message."createdAt" DESC, message.id DESC
  LIMIT 1
);

ALTER TABLE "ChatFolder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatFolder" FORCE ROW LEVEL SECURITY;
CREATE POLICY "chat_folder_tenant_isolation" ON "ChatFolder"
FOR ALL
USING (
  "organizationId" = current_setting('app.organization_id', true)
)
WITH CHECK (
  "organizationId" = current_setting('app.organization_id', true)
);
