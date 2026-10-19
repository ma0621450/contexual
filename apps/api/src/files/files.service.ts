import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FileProcessingJobStatus,
  FileProcessingStatus,
  MembershipRole,
} from '@contexual/database';
import type { AuthUser } from '../auth/auth.types';
import { getActiveMembership } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { getPlanLimits } from '../organizations/plan-limits';
import { sniffFileContent } from './content-sniffer';
import { StorageService } from './storage.service';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  list(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.storedFile.findMany({
        where: { organizationId },
        select: {
          id: true,
          filename: true,
          mimeType: true,
          detectedMimeType: true,
          sizeBytes: true,
          processingStatus: true,
          scanBypassed: true,
          failureCode: true,
          failureMessage: true,
          uploadedById: true,
          uploadedBy: {
            select: {
              name: true,
              email: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  async createUpload(
    organizationId: string,
    userId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    const sizeBytes = file.buffer.length;
    const sniffed = sniffFileContent(file.buffer);
    if (!sniffed) {
      throw new BadRequestException(
        'Unsupported file content. Upload PNG, JPEG, GIF, WEBP, TXT, Markdown, CSV, JSON, PDF, or DOCX files.',
      );
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { planTier: true },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    const limits = getPlanLimits(organization.planTier);
    const maxFileBytes = limits.maxFileBytes;
    if (sizeBytes <= 0 || sizeBytes > maxFileBytes) {
      throw new BadRequestException(
        `File exceeds this plan's ${Math.floor(maxFileBytes / 1_000_000)} MB limit`,
      );
    }
    const objectId = randomUUID();
    const storageKey = await this.storage.putQuarantine(
      organizationId,
      objectId,
      file.buffer,
      sniffed.mimeType,
    );

    try {
      return await this.prisma.withTenant(organizationId, async (tx) => {
        const quotaReserved = await tx.$executeRaw`
          UPDATE "Organization"
          SET "storageBytesUsed" = "storageBytesUsed" + ${BigInt(sizeBytes)},
              "storedFileCount" = "storedFileCount" + 1
          WHERE "id" = ${organizationId}
            AND "storageBytesUsed" + ${BigInt(sizeBytes)} <= ${BigInt(limits.maxStorageBytes)}
            AND "storedFileCount" + 1 <= ${limits.maxStoredFiles}
        `;
        if (quotaReserved !== 1) {
          throw new ForbiddenException(
            'This organization has reached its file storage quota',
          );
        }
        return tx.storedFile.create({
          data: {
            organizationId,
            uploadedById: userId,
            filename: file.originalname.slice(0, 255),
            mimeType: sniffed.mimeType,
            detectedMimeType: sniffed.mimeType,
            sizeBytes,
            storageKey,
            sha256: sniffed.sha256,
            processingStatus: FileProcessingStatus.PENDING_SCAN,
            processingJob: {
              create: {
                organizationId,
                status: FileProcessingJobStatus.PENDING,
              },
            },
          },
          select: {
            id: true,
            filename: true,
            mimeType: true,
            detectedMimeType: true,
            sizeBytes: true,
            processingStatus: true,
            scanBypassed: true,
            failureCode: true,
            failureMessage: true,
            uploadedById: true,
            uploadedBy: {
              select: {
                name: true,
                email: true,
              },
            },
            createdAt: true,
            updatedAt: true,
          },
        });
      });
    } catch (error) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  createText(
    organizationId: string,
    userId: string,
    filename: string,
    content: string,
  ) {
    const normalizedFilename = filename.toLowerCase().endsWith('.txt')
      ? filename
      : `${filename}.txt`;
    const body = Buffer.from(content, 'utf8');
    return this.createUpload(organizationId, userId, {
      originalname: normalizedFilename,
      mimetype: 'text/plain',
      size: body.length,
      buffer: body,
    });
  }

  async getFile(organizationId: string, fileId: string) {
    const file = await this.prisma.withTenant(organizationId, (tx) =>
      tx.storedFile.findFirst({
        where: { id: fileId, organizationId },
      }),
    );
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  async getDetail(organizationId: string, fileId: string) {
    const file = await this.prisma.withTenant(organizationId, (tx) =>
      tx.storedFile.findFirst({
        where: { id: fileId, organizationId },
        select: {
          id: true,
          filename: true,
          mimeType: true,
          detectedMimeType: true,
          sizeBytes: true,
          processingStatus: true,
          scanBypassed: true,
          scanStartedAt: true,
          scannedAt: true,
          extractionStartedAt: true,
          extractedAt: true,
          failureCode: true,
          failureMessage: true,
          uploadedById: true,
          uploadedBy: {
            select: {
              name: true,
              email: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      }),
    );
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  async download(organizationId: string, fileId: string) {
    const file = await this.getFile(organizationId, fileId);
    if (file.processingStatus !== FileProcessingStatus.READY) {
      throw new ConflictException('File processing is not complete');
    }
    return { file, body: await this.storage.get(file.storageKey) };
  }

  async remove(organizationId: string, user: AuthUser, fileId: string) {
    const file = await this.getFile(organizationId, fileId);
    const isAdmin = getActiveMembership(user)?.role === MembershipRole.ADMIN;
    if (file.uploadedById !== user.id && !isAdmin) {
      throw new ForbiddenException('You cannot delete this file');
    }

    await this.prisma.withTenant(organizationId, async (tx) => {
      await tx.storedFile.delete({
        where: { id: file.id, organizationId },
      });
      await tx.$executeRaw`
        UPDATE "Organization"
        SET "storageBytesUsed" = GREATEST(0, "storageBytesUsed" - ${BigInt(file.sizeBytes)}),
            "storedFileCount" = GREATEST(0, "storedFileCount" - 1)
        WHERE "id" = ${organizationId}
      `;
    });
    await this.storage.remove(file.storageKey).catch(() => undefined);
    return { ok: true };
  }

  async getAttachments(organizationId: string, fileIds: string[]) {
    if (fileIds.length === 0) return [];
    const uniqueIds = [...new Set(fileIds)];
    const files = await this.prisma.withTenant(organizationId, (tx) =>
      tx.storedFile.findMany({
        where: {
          organizationId,
          id: { in: uniqueIds },
          processingStatus: FileProcessingStatus.READY,
        },
      }),
    );
    if (files.length !== uniqueIds.length) {
      throw new ConflictException(
        'One or more attachments are unavailable or still processing',
      );
    }
    return files;
  }

  async searchWorkspaceFiles(
    organizationId: string,
    query: string,
    limit = 5,
    scopeFileIds?: string[],
    embeddingApiKey?: string,
  ) {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.replace(/[^\w.-]/g, ''))
      .filter((term) => term.length > 2)
      .slice(0, 6);
    if (terms.length === 0) return [];

    const files = await this.prisma.withTenant(organizationId, (tx) =>
      tx.storedFile.findMany({
        where: {
          organizationId,
          processingStatus: FileProcessingStatus.READY,
          extractedText: { not: null },
          ...(scopeFileIds?.length ? { id: { in: scopeFileIds } } : {}),
        },
        select: {
          id: true,
          filename: true,
          extractedText: true,
          embedding: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: scopeFileIds?.length ? scopeFileIds.length : 80,
      }),
    );

    const queryVector = embeddingApiKey
      ? await embedText(query, embeddingApiKey)
      : null;

    const ranked = await Promise.all(
      files.map(async (file) => {
        const text = file.extractedText ?? '';
        const lower = text.toLowerCase();
        let score = terms.reduce((total, term) => {
          const filenameHits = file.filename.toLowerCase().includes(term)
            ? 8
            : 0;
          const occurrences = lower.split(term).length - 1;
          return total + filenameHits + Math.min(occurrences, 12);
        }, 0);

        let vector = asNumberArray(file.embedding);
        if (queryVector && embeddingApiKey && vector.length === 0 && text) {
          vector = await embedText(text.slice(0, 8000), embeddingApiKey);
          if (vector.length) {
            await this.prisma.storedFile.update({
              where: { id: file.id },
              data: { embedding: vector },
            });
          }
        }
        if (queryVector && vector.length) {
          score += cosineSimilarity(queryVector, vector) * 40;
        }
        if (score <= 0) return null;

        const anchor = terms.find((term) => lower.includes(term)) ?? terms[0]!;
        const index = Math.max(0, lower.indexOf(anchor));
        const snippetStart = Math.max(0, index - 60);

        return {
          id: file.id,
          filename: file.filename,
          score,
          snippet: text.slice(snippetStart, snippetStart + 220).trim(),
          excerpt: text.slice(0, 2400),
        };
      }),
    );

    return ranked
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
    ? value
    : [];
}

function cosineSimilarity(left: number[], right: number[]) {
  const size = Math.min(left.length, right.length);
  if (size === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < size; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! ** 2;
    rightNorm += right[index]! ** 2;
  }
  const denom = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denom === 0 ? 0 : dot / denom;
}

async function embedText(text: string, apiKey: string): Promise<number[]> {
  const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, 8000);
  if (!trimmed) return [];
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: trimmed,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as {
      data?: { embedding?: number[] }[];
    };
    return body.data?.[0]?.embedding ?? [];
  } catch {
    return [];
  }
}
