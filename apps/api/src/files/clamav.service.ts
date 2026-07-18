import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createConnection, Socket } from 'net';

export type ClamAvResult =
  | { outcome: 'clean'; bypassed: false }
  | { outcome: 'infected'; bypassed: false; signature: string }
  | { outcome: 'bypassed'; bypassed: true; reason: string }
  | { outcome: 'error'; bypassed: false; message: string };

@Injectable()
export class ClamAvService {
  private readonly required: boolean;
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;
  private readonly maxFileBytes: number;

  constructor(config: ConfigService) {
    this.required = config.get<string>('FILE_SCANNING_REQUIRED') !== 'false';
    this.host = config.get<string>('CLAMAV_HOST') || '127.0.0.1';
    this.port = Number(config.get<string>('CLAMAV_PORT') || 3310);
    this.timeoutMs = Number(config.get<string>('CLAMAV_TIMEOUT_MS') || 30_000);
    this.maxFileBytes = Number(
      config.get<string>('MAX_FILE_BYTES') || 25_000_000,
    );

    if (!this.required && config.get<string>('NODE_ENV') === 'production') {
      throw new Error(
        'FILE_SCANNING_REQUIRED=false is forbidden in production',
      );
    }
  }

  async scan(buffer: Buffer): Promise<ClamAvResult> {
    if (!this.required) {
      return {
        outcome: 'bypassed',
        bypassed: true,
        reason: 'Explicit non-production scanning bypass',
      };
    }
    if (buffer.length > this.maxFileBytes) {
      return {
        outcome: 'error',
        bypassed: false,
        message: 'File exceeds the configured scanner size limit',
      };
    }

    try {
      const response = await this.sendInstream(buffer);
      return parseClamAvResponse(response);
    } catch (error) {
      return {
        outcome: 'error',
        bypassed: false,
        message: error instanceof Error ? error.message : 'ClamAV scan failed',
      };
    }
  }

  isRequired(): boolean {
    return this.required;
  }

  async checkReady(): Promise<void> {
    if (!this.required) return;
    const response = await this.sendCommand('zPING\0');
    if (response.trim() !== 'PONG') {
      throw new Error('ClamAV did not return PONG');
    }
  }

  private sendCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port });
      let response = '';
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(response.split('\u0000', 1)[0]);
      };
      socket.setTimeout(Math.min(this.timeoutMs, 5_000));
      socket.once('timeout', () =>
        finish(new Error('ClamAV readiness check timed out')),
      );
      socket.once('error', finish);
      socket.on('data', (chunk: Buffer) => {
        response += chunk.toString('utf8');
        if (chunk.includes(0) || response.includes('\n')) finish();
      });
      socket.once('end', () => finish());
      socket.once('connect', () => socket.write(command));
    });
  }

  private sendInstream(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket: Socket = createConnection({
        host: this.host,
        port: this.port,
      });
      let settled = false;
      const chunks: Buffer[] = [];
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else
          resolve(Buffer.concat(chunks).toString('utf8').split('\u0000', 1)[0]);
      };

      socket.setTimeout(this.timeoutMs);
      socket.once('timeout', () => finish(new Error('ClamAV scan timed out')));
      socket.once('error', (error) => finish(error));
      socket.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        if (chunk.includes(0)) finish();
      });
      socket.once('end', () => finish());
      socket.once('connect', () => {
        socket.write(Buffer.from('zINSTREAM\0'));
        const chunkSize = 64 * 1024;
        for (let offset = 0; offset < buffer.length; offset += chunkSize) {
          const chunk = buffer.subarray(offset, offset + chunkSize);
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}

export function parseClamAvResponse(response: string): ClamAvResult {
  const normalized = response.split('\u0000', 1)[0].trim();
  if (normalized.endsWith(': OK')) {
    return { outcome: 'clean', bypassed: false };
  }
  const infected = normalized.match(/:\s+(.+)\s+FOUND$/);
  if (infected) {
    return {
      outcome: 'infected',
      bypassed: false,
      signature: infected[1].slice(0, 120),
    };
  }
  const safeMessage = normalized
    ? `ClamAV returned an error: ${normalized.slice(0, 160)}`
    : 'ClamAV returned an empty response';
  return { outcome: 'error', bypassed: false, message: safeMessage };
}
