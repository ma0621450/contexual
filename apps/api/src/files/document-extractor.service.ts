import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mammoth from 'mammoth';

export class DocumentProcessingError extends Error {
  constructor(
    readonly code: string,
    readonly safeMessage: string,
    readonly retryable = false,
  ) {
    super(safeMessage);
  }
}

@Injectable()
export class DocumentExtractorService {
  private readonly maxTextCharacters: number;
  private readonly maxPages: number;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.maxTextCharacters = Number(
      config.get<string>('FILE_MAX_EXTRACTED_CHARACTERS') || 1_000_000,
    );
    this.maxPages = Number(config.get<string>('FILE_MAX_PAGES') || 100);
    this.timeoutMs = Number(
      config.get<string>('FILE_EXTRACTION_TIMEOUT_MS') || 30_000,
    );
  }

  extract(buffer: Buffer, mimeType: string): Promise<string> {
    return this.withTimeout(this.extractByType(buffer, mimeType));
  }

  private async extractByType(
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    let text: string;
    try {
      if (mimeType.startsWith('image/')) {
        return '';
      }
      if (mimeType === 'application/pdf') {
        text = await this.extractPdf(buffer);
      } else if (
        mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        text = (await mammoth.extractRawText({ buffer })).value;
      } else if (
        mimeType.startsWith('text/') ||
        mimeType === 'application/json'
      ) {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } else {
        throw new DocumentProcessingError(
          'UNSUPPORTED_TYPE',
          'The detected file type is not supported',
        );
      }
    } catch (error) {
      if (error instanceof DocumentProcessingError) throw error;
      const detail =
        error instanceof Error ? `${error.name} ${error.message}` : '';
      if (/password|encrypted/i.test(detail)) {
        throw new DocumentProcessingError(
          'ENCRYPTED_DOCUMENT',
          'Encrypted documents are not supported',
        );
      }
      throw new DocumentProcessingError(
        'MALFORMED_DOCUMENT',
        'The document could not be read safely',
      );
    }

    const normalized = text.split('\u0000').join('').trim();
    if (normalized.length > this.maxTextCharacters) {
      throw new DocumentProcessingError(
        'EXTRACTED_TEXT_TOO_LARGE',
        'The extracted document text exceeds the configured limit',
      );
    }
    return normalized;
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
    });
    const document = await loadingTask.promise;
    try {
      if (document.numPages > this.maxPages) {
        throw new DocumentProcessingError(
          'PAGE_LIMIT_EXCEEDED',
          'The document exceeds the configured page limit',
        );
      }
      const pages: string[] = [];
      let characterCount = 0;
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
        characterCount += pageText.length;
        if (characterCount > this.maxTextCharacters) {
          throw new DocumentProcessingError(
            'EXTRACTED_TEXT_TOO_LARGE',
            'The extracted document text exceeds the configured limit',
          );
        }
        pages.push(pageText);
        page.cleanup();
      }
      return pages.join('\n\n');
    } finally {
      await loadingTask.destroy();
    }
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new DocumentProcessingError(
                  'EXTRACTION_TIMEOUT',
                  'Document extraction timed out',
                  true,
                ),
              ),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
