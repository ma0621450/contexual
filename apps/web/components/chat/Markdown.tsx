'use client';

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  memo,
  useContext,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import type { PluggableList } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { CheckIcon, ChevronRightIcon, CopyIcon, DownloadIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { DiffBlock, MermaidBlock, DownloadBlock, CitationChip } from './RichBlocks';
import { CodeSandbox } from './CodeSandbox';
import { splitDownloadLinks } from './download-utils';
import 'katex/dist/katex.min.css';

const InsideCodeBlock = createContext(false);
const CanvasActionContext = createContext<
  ((language: string, code: string) => void) | undefined
>(undefined);

function trimTrailingNewline(node: ReactNode): ReactNode {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node).replace(/\n$/, '');
  }
  if (Array.isArray(node)) {
    if (node.length === 0) return node;
    const next = node.slice();
    next[next.length - 1] = trimTrailingNewline(next[next.length - 1]);
    return next;
  }
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return cloneElement(
      node,
      props,
      trimTrailingNewline(props.children),
    );
  }
  return node;
}

function toPlainText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(toPlainText).join('');
  }
  if (isValidElement(node)) {
    return toPlainText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

function readLanguage(node: ReactNode): string {
  for (const child of Children.toArray(node)) {
    if (!isValidElement(child)) continue;
    const className = (child.props as { className?: string }).className ?? '';
    const match = /language-([\w#+.-]+)/.exec(className);
    if (match?.[1]) return match[1];
  }
  return '';
}

const LANGUAGE_LABELS: Record<string, string> = {
  js: 'Javascript',
  javascript: 'Javascript',
  jsx: 'Javascript',
  ts: 'Typescript',
  typescript: 'Typescript',
  tsx: 'Typescript',
  py: 'Python',
  python: 'Python',
  css: 'CSS',
  html: 'HTML',
  json: 'JSON',
  md: 'Markdown',
  markdown: 'Markdown',
  sh: 'Shell',
  bash: 'Shell',
  shell: 'Shell',
  sql: 'SQL',
  yml: 'YAML',
  yaml: 'YAML',
};

const FILE_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  python: 'py',
  py: 'py',
  markdown: 'md',
  md: 'md',
  shell: 'sh',
  bash: 'sh',
  sh: 'sh',
  yaml: 'yml',
  yml: 'yml',
};

function languageLabel(language: string) {
  const key = language.toLowerCase();
  if (!key) return 'Text';
  return (
    LANGUAGE_LABELS[key] ??
    key.charAt(0).toUpperCase() + key.slice(1)
  );
}

function fileExtension(language: string) {
  const key = language.toLowerCase();
  return FILE_EXTENSIONS[key] ?? (key || 'txt');
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? 'Copied' : 'Copy code'}
      className="inline-flex size-7 items-center justify-center rounded-md text-[#a1a1aa] transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-white" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </button>
  );
}

function downloadCode(language: string, code: string) {
  const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `snippet.${fileExtension(language)}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function CodeSurface({
  language,
  code,
  children,
  tall = false,
  onExpand,
}: {
  language: string;
  code: string;
  children: ReactNode;
  tall?: boolean;
  onExpand?: () => void;
}) {
  const label = languageLabel(language);
  const source = code.replace(/\n$/, '');
  const lines = source.length === 0 ? [''] : source.split('\n');

  return (
    <div className="overflow-hidden rounded-[14px] bg-[#2a2a2a] p-1.5">
      <div className="flex items-center justify-between gap-3 px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <span className="rounded-md bg-[#141414] px-2.5 py-1 text-xs font-medium text-white">
            {label}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-[#a1a1aa]">
          <CopyButton value={code} />
          <button
            type="button"
            onClick={() => downloadCode(language, code)}
            aria-label="Download code"
            className="inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none"
          >
            <DownloadIcon className="size-3.5" />
          </button>
          {onExpand ? (
            <button
              type="button"
              onClick={onExpand}
              className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none"
            >
              Expand
              <ChevronRightIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      <div
        className={cn(
          'chat-code overflow-auto rounded-[10px] bg-[#0c0c0c]',
          tall ? 'max-h-[70vh]' : 'max-h-[min(70vh,40rem)]',
        )}
      >
        <div className="flex min-w-full px-4 py-3 font-mono text-[13px] leading-5.5">
          <ol className="sticky left-0 m-0 shrink-0 list-none bg-[#0c0c0c] pr-4 text-right text-shell-muted select-none">
            {lines.map((_, index) => (
              <li key={index} className="h-5.5">
                {index + 1}.
              </li>
            ))}
          </ol>
          <InsideCodeBlock.Provider value={true}>
            <pre className="m-0 min-w-0 flex-1 overflow-visible bg-transparent p-0 text-[13px] leading-5.5 text-[#ececec]">
              {children}
            </pre>
          </InsideCodeBlock.Provider>
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  const language = readLanguage(children);
  const code = toPlainText(children);
  const onOpenCanvas = useContext(CanvasActionContext);
  const normalized = language.toLowerCase();
  const [expanded, setExpanded] = useState(false);

  if (normalized === 'diff') {
    return <DiffBlock content={code} />;
  }

  if (normalized === 'mermaid') {
    return (
      <MermaidBlock
        content={code}
        onOpenCanvas={
          onOpenCanvas
            ? () => onOpenCanvas('mermaid', code)
            : undefined
        }
      />
    );
  }

  const label = languageLabel(language);

  return (
    <div className="not-prose my-4 block w-full">
      <p className="mb-2 text-sm font-semibold text-white">{label} code</p>
      <CodeSurface
        language={language}
        code={code}
        onExpand={() => setExpanded(true)}
      >
        {children}
      </CodeSurface>
      <CodeSandbox language={language} code={code} />
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden border-white/10 bg-[#161616] p-4 sm:p-5">
          <DialogTitle className="pr-8 text-sm font-semibold text-white">
            {label} code
          </DialogTitle>
          <DialogDescription className="sr-only">
            Expanded {label} code block
          </DialogDescription>
          <CodeSurface language={language} code={code} tall>
            {children}
          </CodeSurface>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Code({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'code'>) {
  const insideCodeBlock = useContext(InsideCodeBlock);

  if (insideCodeBlock) {
    return (
      <code
        className={cn(
          'block font-mono text-[13px] leading-5.5 whitespace-pre text-[#ececec]',
          className,
        )}
        {...props}
      >
        {trimTrailingNewline(children)}
      </code>
    );
  }

  const text = toPlainText(children);
  const citationMatch = /^【(.+)】$/.exec(text.trim());
  if (citationMatch) {
    return <CitationChip label={citationMatch[1]} />;
  }

  return (
    <code
      className="rounded-md bg-muted px-[0.35em] py-[0.1em] font-mono text-[0.85em] text-foreground"
      {...props}
    >
      {children}
    </code>
  );
}

const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: Code,
  h1: ({ children }) => (
    <h1 className="mt-6 mb-3 scroll-m-20 text-xl font-semibold tracking-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 mb-3 scroll-m-20 text-lg font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 mb-2 scroll-m-20 text-base font-semibold tracking-tight first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-4 mb-2 text-sm font-semibold tracking-tight first:mt-0">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="mt-4 mb-2 text-sm font-semibold first:mt-0">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase first:mt-0">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="my-3 leading-7 first:mt-0 last:mb-0 [&_code]:align-baseline">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => (
    <del className="text-muted-foreground line-through">{children}</del>
  ),
  ul: ({ children, className }) => (
    <ul
      className={cn(
        'my-3 ml-1 list-outside list-disc space-y-1.5 pl-5 marker:text-muted-foreground first:mt-0 last:mb-0',
        className?.includes('contains-task-list') && 'list-none pl-1',
      )}
    >
      {children}
    </ul>
  ),
  ol: ({ children, start }) => (
    <ol
      start={start}
      className="my-3 ml-1 list-outside list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-muted-foreground first:mt-0 last:mb-0"
    >
      {children}
    </ol>
  ),
  li: ({ children, className }) => (
    <li
      className={cn(
        'leading-7 [&>ol]:my-1.5 [&>ul]:my-1.5',
        className?.includes('task-list-item') && 'flex items-start gap-2',
      )}
    >
      {children}
    </li>
  ),
  input: ({ checked, type }) =>
    type === 'checkbox' ? (
      <span
        aria-hidden
        className={cn(
          'mt-1.5 flex size-4 shrink-0 items-center justify-center rounded border',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background',
        )}
      >
        {checked ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
      </span>
    ) : null,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-primary/40 bg-muted/40 py-1 pl-4 text-muted-foreground italic first:mt-0 last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-border" />,
  a: ({ children, href, download }) => (
    <a
      href={href}
      download={download}
      target={href?.startsWith('data:') ? undefined : '_blank'}
      rel={href?.startsWith('data:') ? undefined : 'noreferrer noopener'}
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-4 w-full overflow-x-auto rounded-xl border border-border shadow-sm first:mt-0 last:mb-0">
      <table className="w-full min-w-[20rem] border-collapse text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/70 text-foreground">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border bg-card/40">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="border-b border-border transition-colors even:bg-muted/20 hover:bg-muted/35">
      {children}
    </tr>
  ),
  th: ({ children, style }) => (
    <th
      style={style}
      className="px-3.5 py-2.5 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-foreground uppercase"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="px-3.5 py-2.5 align-top leading-6">
      {children}
    </td>
  ),
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === 'string' ? src : undefined}
      alt={alt ?? ''}
      loading="lazy"
      className="my-4 max-w-full rounded-xl border border-border"
    />
  ),
};

const remarkPlugins: PluggableList = [remarkGfm, remarkMath, remarkBreaks];
const rehypePlugins: PluggableList = [
  rehypeKatex,
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
];

function MarkdownBody({
  content,
  className,
  onOpenCanvas,
}: {
  content: string;
  className?: string;
  onOpenCanvas?: (language: string, code: string) => void;
}) {
  return (
    <CanvasActionContext.Provider value={onOpenCanvas}>
      <div
        className={cn(
          'markdown-body text-[0.9375rem] wrap-break-word text-foreground',
          className,
        )}
      >
        <ReactMarkdown
          components={components}
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
        >
          {content}
        </ReactMarkdown>
      </div>
    </CanvasActionContext.Provider>
  );
}

export const Markdown = memo(function Markdown({
  content,
  className,
  onOpenCanvas,
}: {
  content: string;
  className?: string;
  onOpenCanvas?: (language: string, code: string) => void;
}) {
  const segments = useMemo(() => splitDownloadLinks(content), [content]);
  const hasDownloads = segments.some((segment) => segment.type === 'download');

  if (!hasDownloads) {
    return (
      <MarkdownBody
        content={content}
        className={className}
        onOpenCanvas={onOpenCanvas}
      />
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {segments.map((segment, index) =>
        segment.type === 'download' ? (
          <DownloadBlock
            key={`download-${index}`}
            filename={segment.filename}
            content={segment.content}
            mimeType={segment.mimeType}
            label={segment.label}
          />
        ) : (
          <MarkdownBody
            key={`md-${index}`}
            content={segment.content}
            onOpenCanvas={onOpenCanvas}
          />
        ),
      )}
    </div>
  );
});
