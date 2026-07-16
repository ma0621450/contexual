CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "extractedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageAttachment" (
    "messageId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("messageId", "fileId")
);

CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");
CREATE INDEX "StoredFile_organizationId_createdAt_idx" ON "StoredFile"("organizationId", "createdAt");
CREATE INDEX "StoredFile_organizationId_uploadedById_idx" ON "StoredFile"("organizationId", "uploadedById");
CREATE INDEX "MessageAttachment_fileId_idx" ON "MessageAttachment"("fileId");

ALTER TABLE "StoredFile"
ADD CONSTRAINT "StoredFile_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoredFile"
ADD CONSTRAINT "StoredFile_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageAttachment"
ADD CONSTRAINT "MessageAttachment_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageAttachment"
ADD CONSTRAINT "MessageAttachment_fileId_fkey"
FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
