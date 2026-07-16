import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

@Injectable()
export class StorageService {
  private readonly bucket: string | null;
  private readonly localRoot: string;
  private readonly s3: S3Client | null;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') || null;
    this.localRoot =
      config.get<string>('LOCAL_UPLOAD_DIR') || join(process.cwd(), '.uploads');
    this.s3 = this.bucket
      ? new S3Client({
          region: config.get<string>('S3_REGION') || 'auto',
          endpoint: config.get<string>('S3_ENDPOINT') || undefined,
          forcePathStyle: config.get<string>('S3_FORCE_PATH_STYLE') === 'true',
          credentials:
            config.get<string>('S3_ACCESS_KEY_ID') &&
            config.get<string>('S3_SECRET_ACCESS_KEY')
              ? {
                  accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
                  secretAccessKey: config.getOrThrow<string>(
                    'S3_SECRET_ACCESS_KEY',
                  ),
                }
              : undefined,
        })
      : null;
  }

  async put(key: string, body: Buffer, contentType: string) {
    if (this.s3 && this.bucket) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return;
    }

    const path = join(this.localRoot, key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, body);
  }

  async get(key: string): Promise<Buffer> {
    if (this.s3 && this.bucket) {
      const response = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body) return Buffer.alloc(0);
      return Buffer.from(await response.Body.transformToByteArray());
    }

    return fs.readFile(join(this.localRoot, key));
  }

  async remove(key: string) {
    if (this.s3 && this.bucket) {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return;
    }

    await fs.rm(join(this.localRoot, key), { force: true });
  }
}
