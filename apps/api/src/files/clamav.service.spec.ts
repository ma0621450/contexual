import { AddressInfo, createServer } from 'net';
import { ClamAvService, parseClamAvResponse } from './clamav.service';

describe('parseClamAvResponse', () => {
  it('forbids a scanning bypass in production', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'FILE_SCANNING_REQUIRED'
          ? 'false'
          : key === 'NODE_ENV'
            ? 'production'
            : undefined,
      ),
    };
    expect(() => new ClamAvService(config as never)).toThrow(
      'FILE_SCANNING_REQUIRED=false is forbidden in production',
    );
  });

  it('marks an explicit non-production bypass', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'FILE_SCANNING_REQUIRED' ? 'false' : undefined,
      ),
    };
    await expect(
      new ClamAvService(config as never).scan(Buffer.from('test')),
    ).resolves.toEqual({
      outcome: 'bypassed',
      bypassed: true,
      reason: 'Explicit non-production scanning bypass',
    });
  });

  it('parses a clean INSTREAM response', () => {
    expect(parseClamAvResponse('stream: OK\0')).toEqual({
      outcome: 'clean',
      bypassed: false,
    });
  });

  it('parses an infected INSTREAM response', () => {
    expect(parseClamAvResponse('stream: Eicar-Signature FOUND\0')).toEqual({
      outcome: 'infected',
      bypassed: false,
      signature: 'Eicar-Signature',
    });
  });

  it('fails closed on daemon and malformed responses', () => {
    expect(
      parseClamAvResponse('stream: size limit exceeded. ERROR').outcome,
    ).toBe('error');
    expect(parseClamAvResponse('').outcome).toBe('error');
  });

  it('sends clamd INSTREAM framing with a terminal zero chunk', async () => {
    const payload = Buffer.from('safe document');
    let received = Buffer.alloc(0);
    const server = createServer((socket) => {
      socket.on('data', (chunk: Buffer) => {
        received = Buffer.concat([received, chunk]);
        if (
          received.subarray(0, 10).toString('utf8') === 'zINSTREAM\0' &&
          received.length >= 18 + payload.length &&
          received.readUInt32BE(received.length - 4) === 0
        ) {
          socket.end(Buffer.from('stream: OK\0'));
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const port = (server.address() as AddressInfo).port;
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          FILE_SCANNING_REQUIRED: 'true',
          CLAMAV_HOST: '127.0.0.1',
          CLAMAV_PORT: String(port),
          CLAMAV_TIMEOUT_MS: '2000',
        };
        return values[key];
      }),
    };

    try {
      await expect(
        new ClamAvService(config as never).scan(payload),
      ).resolves.toEqual({ outcome: 'clean', bypassed: false });
      expect(received.subarray(0, 10).toString('utf8')).toBe('zINSTREAM\0');
      expect(received.readUInt32BE(10)).toBe(payload.length);
      expect(received.subarray(14, 14 + payload.length)).toEqual(payload);
      expect(received.readUInt32BE(14 + payload.length)).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
