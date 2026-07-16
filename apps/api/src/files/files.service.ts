import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '@contexual/database';
import type { AuthUser } from '../auth/auth.types';
import { getActiveMembership } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { getPlanLimits } from '../organizations/plan-limits';
import { StorageService } from './storage.service';

const ALLOWED_TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

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
          sizeBytes: true,
          uploadedById: true,
          createdAt: true,
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
    if (!ALLOWED_TEXT_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported file type. Upload TXT, Markdown, CSV, or JSON files.',
      );
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { planTier: true },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    const maxFileBytes = getPlanLimits(organization.planTier).maxFileBytes;
    if (file.size <= 0 || file.size > maxFileBytes) {
      throw new BadRequestException(
        `File exceeds this plan's ${Math.floor(maxFileBytes / 1_000_000)} MB limit`,
      );
    }
    if (file.buffer.includes(0)) {
      throw new BadRequestException('Binary content is not allowed');
    }

    const extractedText = file.buffer.toString('utf8');
    const storageKey = `${organizationId}/${randomUUID()}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype);

    try {
      return await this.prisma.withTenant(organizationId, (tx) =>
        tx.storedFile.create({
          data: {
            organizationId,
            uploadedById: userId,
            filename: file.originalname.slice(0, 255),
            mimeType: file.mimetype,
            sizeBytes: file.size,
            storageKey,
            extractedText,
          },
        }),
      );
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

  async download(organizationId: string, fileId: string) {
    const file = await this.getFile(organizationId, fileId);
    return { file, body: await this.storage.get(file.storageKey) };
  }

  async remove(organizationId: string, user: AuthUser, fileId: string) {
    const file = await this.getFile(organizationId, fileId);
    const isAdmin = getActiveMembership(user)?.role === MembershipRole.ADMIN;
    if (file.uploadedById !== user.id && !isAdmin) {
      throw new ForbiddenException('You cannot delete this file');
    }

    await this.prisma.withTenant(organizationId, (tx) =>
      tx.storedFile.delete({
        where: { id: file.id, organizationId },
      }),
    );
    await this.storage.remove(file.storageKey);
    return { ok: true };
  }

  async getAttachments(organizationId: string, fileIds: string[]) {
    if (fileIds.length === 0) return [];
    const uniqueIds = [...new Set(fileIds)];
    const files = await this.prisma.withTenant(organizationId, (tx) =>
      tx.storedFile.findMany({
        where: { organizationId, id: { in: uniqueIds } },
      }),
    );
    if (files.length !== uniqueIds.length) {
      throw new NotFoundException('One or more attachments were not found');
    }
    return files;
  }
}
