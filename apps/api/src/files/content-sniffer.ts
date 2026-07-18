import { createHash } from 'crypto';

export const SUPPORTED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export type SniffedFile = {
  mimeType: SupportedMimeType;
  sha256: string;
};

const decoder = new TextDecoder('utf-8', { fatal: true });

export function sniffFileContent(buffer: Buffer): SniffedFile | null {
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const pdfHeader = buffer.subarray(0, Math.min(buffer.length, 1024));
  const pdfIndex = pdfHeader.indexOf(Buffer.from('%PDF-'));
  const pdfPrefix = pdfHeader.subarray(0, Math.max(0, pdfIndex));
  const hasSafePdfPrefix =
    pdfPrefix.every((byte) => [0x09, 0x0a, 0x0d, 0x20].includes(byte)) ||
    (pdfPrefix.length === 3 &&
      pdfPrefix[0] === 0xef &&
      pdfPrefix[1] === 0xbb &&
      pdfPrefix[2] === 0xbf);
  if (pdfIndex >= 0 && hasSafePdfPrefix) {
    return { mimeType: 'application/pdf', sha256 };
  }

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(buffer[2] ?? -1) &&
    [0x04, 0x06, 0x08].includes(buffer[3] ?? -1)
  ) {
    const archiveIndex = buffer.toString('latin1');
    if (
      archiveIndex.includes('[Content_Types].xml') &&
      archiveIndex.includes('word/')
    ) {
      return {
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sha256,
      };
    }
    return null;
  }

  let text: string;
  try {
    text = decoder.decode(buffer);
  } catch {
    return null;
  }
  if (text.includes('\u0000')) return null;

  const trimmed = text.trim();
  if (trimmed) {
    try {
      JSON.parse(trimmed);
      return { mimeType: 'application/json', sha256 };
    } catch {
      // Valid UTF-8 that is not JSON remains eligible as another text type.
    }
  }

  const nonEmptyLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const commaCounts = nonEmptyLines
    .slice(0, 20)
    .map((line) => (line.match(/,/g) ?? []).length);
  if (
    commaCounts.length >= 2 &&
    commaCounts[0] > 0 &&
    commaCounts.every((count) => count === commaCounts[0])
  ) {
    return { mimeType: 'text/csv', sha256 };
  }
  if (
    /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|>\s|```)/m.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text)
  ) {
    return { mimeType: 'text/markdown', sha256 };
  }
  return { mimeType: 'text/plain', sha256 };
}
