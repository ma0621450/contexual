-- AlterTable
ALTER TABLE "ChatFolder" ADD COLUMN "instructions" TEXT;
ALTER TABLE "ChatFolder" ADD COLUMN "defaultModel" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "shareExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ChatFolderFile" (
    "folderId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "ChatFolderFile_pkey" PRIMARY KEY ("folderId","fileId")
);

-- CreateIndex
CREATE INDEX "ChatFolderFile_fileId_idx" ON "ChatFolderFile"("fileId");

-- AddForeignKey
ALTER TABLE "ChatFolderFile" ADD CONSTRAINT "ChatFolderFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ChatFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatFolderFile" ADD CONSTRAINT "ChatFolderFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
