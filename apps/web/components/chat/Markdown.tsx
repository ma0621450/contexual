'use client';

import {
  Children,
  createContext,
  isValidElement,
  memo,
  useContext,
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
import { CheckIcon, CopyIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import 'katex/dist/katex.min.css';

const InsideCodeBlock = createContext(false);

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

function CopyButton({ value, label }: { value: string; label: string }) {
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
      aria-label={copied ? 'Copied' : label}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-success" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  const language = readLanguage(children);
  const code = toPlainText(children);

  return (
    <div className="not-prose group/code my-4 overflow-hidden rounded-xl border border-border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/60 px-3 py-1.5">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          {language || 'text'}
        </span>
        <CopyButton value={code} label="Copy code" />
      </div>
      <InsideCodeBlock.Provider value={true}>
        <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
          {children}
        </pre>
      </InsideCodeBlock.Provider>
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
      <code className={cn('font-mono', className)} {...props}>
        {children}
      </code>
    );
  }

  return (
    <code
      className="rounded-md border border-border/60 bg-muted px-[0.35em] py-[0.15em] font-mono text-[0.875em] text-foreground"
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
    <p className="my-3 leading-7 first:mt-0 last:mb-0">{children}</p>
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
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-4 w-full overflow-x-auto rounded-xl border border-border first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border">{children}</tbody>
  ),
  tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
  th: ({ children, style }) => (
    <th
      style={style}
      className="px-3 py-2 text-left font-semibold whitespace-nowrap text-foreground"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="px-3 py-2 align-top">
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

export const Markdown = memo(function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
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
  );
});
