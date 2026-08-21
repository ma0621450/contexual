export type CanvasArtifact = {
  id: string;
  title: string;
  language: string;
  content: string;
};

export type McqData = {
  question: string;
  options: string[];
  answer?: number;
  explanation?: string;
};

export type ToolStepData = {
  title: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
};

export type ContentSegment =
  | { type: 'markdown'; content: string }
  | { type: 'thinking'; content: string; streaming?: boolean }
  | { type: 'mcq'; data: McqData }
  | { type: 'canvas'; artifact: CanvasArtifact }
  | { type: 'collapse'; title: string; content: string }
  | { type: 'filetree'; content: string }
  | { type: 'tool'; data: ToolStepData }
  | { type: 'citation'; label: string }
  | {
      type: 'download';
      filename: string;
      content: string;
      mimeType: string;
      label?: string;
    };

const CANVAS_FENCE_LANGS = new Set(['canvas', 'artifact']);
const DOWNLOAD_FENCE_LANGS = new Set(['csv', 'download', 'file', 'tsv']);

const FENCE_RE =
  /```([a-zA-Z0-9_+-]*)([^\n]*)\n([\s\S]*?)(?:```|$)/g;
const THINKING_TAG_RE =
  /<thinking>([\s\S]*?)(?:<\/thinking>|$)/gi;
const CANVAS_TAG_RE =
  /<canvas(?:\s+title="([^"]*)")?(?:\s+language="([^"]*)")?\s*>([\s\S]*?)(?:<\/canvas>|$)/gi;

function slugId(prefix: string, index: number, seed: string): string {
  const hash = seed.split('').reduce((acc, char) => {
    return (acc * 31 + char.charCodeAt(0)) >>> 0;
  }, index + 1);
  return `${prefix}-${hash.toString(36)}`;
}

function parseFenceMeta(meta: string): { title?: string; language?: string } {
  const trimmed = meta.trim();
  if (!trimmed) return {};

  const titleMatch = /(?:title|name)\s*=\s*"([^"]+)"/i.exec(trimmed);
  const langMatch = /(?:lang|language)\s*=\s*"?([a-zA-Z0-9_+-]+)"?/i.exec(
    trimmed,
  );

  if (titleMatch || langMatch) {
    return {
      title: titleMatch?.[1],
      language: langMatch?.[1],
    };
  }

  // Support: ```canvas:html My Title
  const colonMatch = /^:([a-zA-Z0-9_+-]+)\s*(.*)$/.exec(trimmed);
  if (colonMatch) {
    return {
      language: colonMatch[1],
      title: colonMatch[2]?.trim() || undefined,
    };
  }

  return { title: trimmed };
}

function parseMcqPayload(raw: string): McqData | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as {
      question?: unknown;
      options?: unknown;
      answer?: unknown;
      correct?: unknown;
      explanation?: unknown;
    };
    if (
      typeof parsed.question === 'string' &&
      Array.isArray(parsed.options) &&
      parsed.options.every((item) => typeof item === 'string') &&
      parsed.options.length >= 2
    ) {
      const answerRaw = parsed.answer ?? parsed.correct;
      let answer: number | undefined;
      if (typeof answerRaw === 'number' && Number.isInteger(answerRaw)) {
        answer = answerRaw;
      } else if (typeof answerRaw === 'string') {
        const letter = answerRaw.trim().toUpperCase();
        if (/^[A-Z]$/.test(letter)) {
          answer = letter.charCodeAt(0) - 65;
        } else {
          const index = parsed.options.findIndex(
            (option) =>
              option.toLowerCase() === answerRaw.trim().toLowerCase(),
          );
          if (index >= 0) answer = index;
        }
      }

      return {
        question: parsed.question,
        options: parsed.options,
        answer:
          answer !== undefined &&
          answer >= 0 &&
          answer < parsed.options.length
            ? answer
            : undefined,
        explanation:
          typeof parsed.explanation === 'string'
            ? parsed.explanation
            : undefined,
      };
    }
  } catch {
    // Fall through to plain-text format.
  }

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3) return null;

  let question = '';
  const options: string[] = [];
  let answer: number | undefined;
  let explanation: string | undefined;

  for (const line of lines) {
    const questionMatch = /^(?:Q(?:uestion)?[:.)]\s*)(.+)$/i.exec(line);
    const optionMatch = /^(?:([A-D])[).:\-]\s*|\- |\* )(.+)$/i.exec(line);
    const answerMatch = /^Answer[:\s]+(.+)$/i.exec(line);
    const explanationMatch = /^Explanation[:\s]+(.+)$/i.exec(line);

    if (questionMatch) {
      question = questionMatch[1].trim();
      continue;
    }
    if (optionMatch) {
      options.push(optionMatch[2].trim());
      continue;
    }
    if (answerMatch) {
      const value = answerMatch[1].trim();
      const letter = value.toUpperCase();
      if (/^[A-Z]$/.test(letter)) {
        answer = letter.charCodeAt(0) - 65;
      } else {
        const asNumber = Number(value);
        if (Number.isInteger(asNumber)) answer = asNumber;
      }
      continue;
    }
    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
      continue;
    }
    if (!question) {
      question = line;
    }
  }

  if (!question || options.length < 2) return null;

  return {
    question,
    options,
    answer:
      answer !== undefined && answer >= 0 && answer < options.length
        ? answer
        : undefined,
    explanation,
  };
}

function parseToolPayload(raw: string): ToolStepData | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as {
      title?: unknown;
      status?: unknown;
      detail?: unknown;
    };
    if (typeof parsed.title === 'string' && parsed.title.trim()) {
      const status =
        parsed.status === 'running' ||
        parsed.status === 'done' ||
        parsed.status === 'error'
          ? parsed.status
          : 'done';
      return {
        title: parsed.title.trim(),
        status,
        detail:
          typeof parsed.detail === 'string' ? parsed.detail.trim() : undefined,
      };
    }
  } catch {
    // Fall through to plain-text format.
  }

  let title = '';
  let status: ToolStepData['status'] = 'done';
  let detail: string | undefined;

  for (const line of trimmed.split('\n')) {
    const titleMatch = /^Title:\s*(.+)$/i.exec(line.trim());
    const statusMatch = /^Status:\s*(.+)$/i.exec(line.trim());
    const detailMatch = /^Detail:\s*(.+)$/i.exec(line.trim());
    if (titleMatch) title = titleMatch[1].trim();
    else if (statusMatch) {
      const value = statusMatch[1].trim().toLowerCase();
      if (value === 'running' || value === 'done' || value === 'error') {
        status = value;
      }
    } else if (detailMatch) detail = detailMatch[1].trim();
    else if (!title) title = line.trim();
  }

  return title ? { title, status, detail } : null;
}

function expandCitationSegments(segments: ContentSegment[]): ContentSegment[] {
  const expanded: ContentSegment[] = [];
  const citationRe = /【([^】]+)】/g;

  for (const segment of segments) {
    if (segment.type !== 'markdown') {
      expanded.push(segment);
      continue;
    }

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let found = false;
    const re = new RegExp(citationRe.source, citationRe.flags);

    while ((match = re.exec(segment.content)) !== null) {
      found = true;
      pushMarkdown(expanded, segment.content.slice(lastIndex, match.index));
      expanded.push({ type: 'citation', label: match[1].trim() });
      lastIndex = match.index + match[0].length;
    }

    if (found) {
      pushMarkdown(expanded, segment.content.slice(lastIndex));
    } else {
      expanded.push(segment);
    }
  }

  return expanded;
}

function pushMarkdown(segments: ContentSegment[], content: string) {
  if (!content.trim()) return;
  const last = segments[segments.length - 1];
  if (last?.type === 'markdown') {
    last.content += content;
    return;
  }
  segments.push({ type: 'markdown', content });
}

function extractTaggedBlocks(
  content: string,
  tagRe: RegExp,
  map: (match: RegExpExecArray, index: number) => ContentSegment | null,
): { segments: ContentSegment[]; remainder: string } {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(tagRe.source, tagRe.flags);

  while ((match = re.exec(content)) !== null) {
    pushMarkdown(segments, content.slice(lastIndex, match.index));
    const segment = map(match, index);
    if (segment) {
      segments.push(segment);
      index += 1;
    } else {
      pushMarkdown(segments, match[0]);
    }
    lastIndex = match.index + match[0].length;
  }

  return {
    segments,
    remainder: content.slice(lastIndex),
  };
}

export function parseMessageContent(content: string): ContentSegment[] {
  if (!content) return [];

  // 1) XML-style thinking / canvas tags
  const afterThinking = extractTaggedBlocks(
    content,
    THINKING_TAG_RE,
    (match) => {
      const body = match[1] ?? '';
      const closed = /<\/thinking>\s*$/i.test(match[0]);
      return {
        type: 'thinking',
        content: body.trim(),
        streaming: !closed,
      };
    },
  );

  let working = '';
  const earlySegments: ContentSegment[] = [];
  for (const segment of afterThinking.segments) {
    if (segment.type === 'markdown') {
      working += segment.content;
    } else {
      if (working) {
        earlySegments.push({ type: 'markdown', content: working });
        working = '';
      }
      earlySegments.push(segment);
    }
  }
  working += afterThinking.remainder;

  const afterCanvasTags = extractTaggedBlocks(working, CANVAS_TAG_RE, (match, i) => {
    const title = match[1]?.trim() || `Canvas ${i + 1}`;
    const language = match[2]?.trim() || 'html';
    const body = match[3] ?? '';
    const closed = /<\/canvas>\s*$/i.test(match[0]);
    if (!closed && !body.trim()) return null;
    return {
      type: 'canvas',
      artifact: {
        id: slugId('canvas', i, body.slice(0, 48)),
        title,
        language,
        content: body.trimEnd(),
      },
    };
  });

  working = '';
  for (const segment of afterCanvasTags.segments) {
    if (segment.type === 'markdown') {
      working += segment.content;
    } else {
      if (working) {
        earlySegments.push({ type: 'markdown', content: working });
        working = '';
      }
      earlySegments.push(segment);
    }
  }
  working += afterCanvasTags.remainder;

  // 2) Fenced special blocks inside remaining markdown chunks
  const finalSegments: ContentSegment[] = [];

  function parseFences(text: string) {
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const re = new RegExp(FENCE_RE.source, FENCE_RE.flags);
    let canvasCount = 0;

    while ((match = re.exec(text)) !== null) {
      pushMarkdown(finalSegments, text.slice(lastIndex, match.index));

      const lang = (match[1] ?? '').toLowerCase();
      const meta = match[2] ?? '';
      const body = match[3] ?? '';
      const closed = match[0].endsWith('```');
      const parsedMeta = parseFenceMeta(meta);

      if (lang === 'thinking') {
        finalSegments.push({
          type: 'thinking',
          content: body.trim(),
          streaming: !closed,
        });
      } else if (lang === 'mcq' || lang === 'quiz') {
        const data = parseMcqPayload(body);
        if (data) {
          finalSegments.push({ type: 'mcq', data });
        } else {
          pushMarkdown(finalSegments, match[0]);
        }
      } else if (lang === 'collapse' || lang === 'details') {
        finalSegments.push({
          type: 'collapse',
          title: parsedMeta.title || 'Details',
          content: body.trimEnd(),
        });
      } else if (lang === 'filetree' || lang === 'tree') {
        finalSegments.push({
          type: 'filetree',
          content: body.trimEnd(),
        });
      } else if (lang === 'tool' || lang === 'step' || lang === 'tool-step') {
        const data = parseToolPayload(body);
        if (data) {
          finalSegments.push({ type: 'tool', data });
        } else {
          pushMarkdown(finalSegments, match[0]);
        }
      } else if (DOWNLOAD_FENCE_LANGS.has(lang)) {
        const filename =
          parsedMeta.title ||
          (lang === 'csv' || lang === 'tsv' ? `export.${lang}` : 'download.txt');
        finalSegments.push({
          type: 'download',
          filename,
          content: body.trimEnd(),
          mimeType:
            lang === 'csv' || lang === 'tsv'
              ? 'text/csv;charset=utf-8'
              : lang === 'json'
                ? 'application/json;charset=utf-8'
                : 'text/plain;charset=utf-8',
          label: parsedMeta.title,
        });
      } else if (CANVAS_FENCE_LANGS.has(lang)) {
        const language = parsedMeta.language || 'html';
        const title =
          parsedMeta.title ||
          `${language.toUpperCase()} preview ${canvasCount + 1}`;
        finalSegments.push({
          type: 'canvas',
          artifact: {
            id: slugId('artifact', canvasCount, body.slice(0, 48)),
            title,
            language,
            content: body.trimEnd(),
          },
        });
        canvasCount += 1;
      } else {
        // Keep ordinary fenced code in markdown (including incomplete fences while streaming).
        pushMarkdown(finalSegments, match[0]);
      }

      lastIndex = match.index + match[0].length;
    }

    pushMarkdown(finalSegments, text.slice(lastIndex));
  }

  for (const segment of earlySegments) {
    if (segment.type === 'markdown') {
      parseFences(segment.content);
    } else {
      finalSegments.push(segment);
    }
  }
  parseFences(working);

  return expandCitationSegments(finalSegments).filter((segment) => {
    if (segment.type === 'markdown') return segment.content.length > 0;
    return true;
  });
}

export function extractCanvasArtifacts(content: string): CanvasArtifact[] {
  return parseMessageContent(content)
    .filter(
      (segment): segment is Extract<ContentSegment, { type: 'canvas' }> =>
        segment.type === 'canvas',
    )
    .map((segment) => segment.artifact);
}

export function isPreviewableLanguage(language: string): boolean {
  const normalized = language.toLowerCase();
  return (
    normalized === 'html' ||
    normalized === 'svg' ||
    normalized === 'mermaid' ||
    normalized === 'react' ||
    normalized === 'jsx' ||
    normalized === 'tsx'
  );
}
