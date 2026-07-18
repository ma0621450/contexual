import { sniffFileContent } from './content-sniffer';

describe('sniffFileContent', () => {
  it('detects content without trusting a filename or client MIME type', () => {
    expect(sniffFileContent(Buffer.from('%PDF-1.7\n'))?.mimeType).toBe(
      'application/pdf',
    );
    expect(sniffFileContent(Buffer.from('{"safe":true}'))?.mimeType).toBe(
      'application/json',
    );
    expect(
      sniffFileContent(Buffer.from('name,value\na,1\nb,2'))?.mimeType,
    ).toBe('text/csv');
  });

  it('detects a DOCX archive from its package entries', () => {
    const docxLike = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('noise/[Content_Types].xml/noise/word/document.xml'),
    ]);
    expect(sniffFileContent(docxLike)?.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('rejects binary and non-DOCX zip content', () => {
    expect(sniffFileContent(Buffer.from([0xff, 0x00, 0x81]))).toBeNull();
    expect(
      sniffFileContent(
        Buffer.concat([
          Buffer.from([0x50, 0x4b, 0x03, 0x04]),
          Buffer.from('archive.txt'),
        ]),
      ),
    ).toBeNull();
  });
});
