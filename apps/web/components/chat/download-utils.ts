export type DownloadSegment =
  | { type: 'markdown'; content: string }
  | {
      type: 'download';
      filename: string;
      content: string;
      mimeType: string;
      label?: string;
    };

const HTML_DOWNLOAD_RE =
  /<a\s+[^>]*?\bdownload=["']([^"']+)["'][^>]*?\bhref=["'](data:[^"']+)["'][^>]*?>([\s\S]*?)<\/a>|<a\s+[^>]*?\bhref=["'](data:[^"']+)["'][^>]*?\bdownload=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/a>/gi;

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

export function decodeDataUri(
  dataUri: string,
): { content: string; mimeType: string } | null {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(?:;(base64))?,(.*)$/i.exec(
    dataUri,
  );
  if (!match) return null;

  const mimeType = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? '';

  try {
    const content = isBase64
      ? atob(payload)
      : decodeURIComponent(payload.replace(/\+/g, ' '));
    return { content, mimeType };
  } catch {
    return null;
  }
}

export function splitDownloadLinks(content: string): DownloadSegment[] {
  if (!content.includes('<a') || !content.includes('download=')) {
    return [{ type: 'markdown', content }];
  }

  const segments: DownloadSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(HTML_DOWNLOAD_RE.source, HTML_DOWNLOAD_RE.flags);

  while ((match = re.exec(content)) !== null) {
    pushMarkdown(segments, content.slice(lastIndex, match.index));

    const filename = match[1] ?? match[5] ?? 'download.txt';
    const href = match[2] ?? match[4] ?? '';
    const label = stripInlineMarkdown(match[3] ?? match[6] ?? filename);
    const decoded = decodeDataUri(href);

    if (decoded) {
      segments.push({
        type: 'download',
        filename,
        content: decoded.content,
        mimeType: decoded.mimeType,
        label: label || filename,
      });
    } else {
      pushMarkdown(segments, match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  pushMarkdown(segments, content.slice(lastIndex));
  return segments.filter((segment) => {
    if (segment.type === 'markdown') return segment.content.length > 0;
    return true;
  });
}

function pushMarkdown(segments: DownloadSegment[], content: string) {
  if (!content) return;
  const last = segments[segments.length - 1];
  if (last?.type === 'markdown') {
    last.content += content;
    return;
  }
  segments.push({ type: 'markdown', content });
}

export function guessMimeType(filename: string, language?: string): string {
  const normalized = (language || filename.split('.').pop() || '').toLowerCase();
  if (normalized === 'csv') return 'text/csv;charset=utf-8';
  if (normalized === 'json') return 'application/json;charset=utf-8';
  if (normalized === 'md' || normalized === 'markdown') {
    return 'text/markdown;charset=utf-8';
  }
  if (normalized === 'html') return 'text/html;charset=utf-8';
  if (normalized === 'svg') return 'image/svg+xml;charset=utf-8';
  return 'text/plain;charset=utf-8';
}
