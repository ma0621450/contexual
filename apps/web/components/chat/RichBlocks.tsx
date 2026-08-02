'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeMermaidSource } from './mermaid-utils';

export function CollapseBlock({
  title,
  content,
  defaultOpen = false,
}: {
  title: string;
  content: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/40"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 font-medium">{title}</span>
      </button>
      {open ? (
        <div className="border-t border-border px-3 py-2.5 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
          {content}
        </div>
      ) : null}
    </div>
  );
}

type TreeNode = {
  id: string;
  name: string;
  children?: TreeNode[];
};

function stripTreePrefix(line: string): { indent: number; name: string } {
  const normalized = line.replace(/\t/g, '  ');
  const withoutGlyphs = normalized.replace(/^[│├└─┌┐┘┤┬┴┼|`+\-\s]+/, '');
  const leading = /^( *)/.exec(normalized)?.[1]?.length ?? 0;
  // Prefer structural indent from leading spaces; fall back to glyph-stripped indent.
  const indent = Math.max(0, Math.floor(leading / 2));
  const name = withoutGlyphs.trim().replace(/\/$/, '');
  return { indent, name };
}

function parseFileTree(raw: string): TreeNode[] {
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const root: TreeNode[] = [];
  const stack: { indent: number; node: TreeNode }[] = [];
  let sequence = 0;

  for (const line of lines) {
    const { indent, name } = stripTreePrefix(line);
    if (!name) continue;

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const pathParent =
      stack.length > 0 ? stack[stack.length - 1].node.id : 'root';
    const node: TreeNode = {
      id: `${pathParent}/${name}#${sequence++}`,
      name,
      children: [],
    };

    if (stack.length === 0) {
      root.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      parent.children = parent.children ?? [];
      parent.children.push(node);
    }

    stack.push({ indent, node });
  }

  function prune(nodes: TreeNode[]): TreeNode[] {
    return nodes.map((node) => ({
      id: node.id,
      name: node.name,
      children:
        node.children && node.children.length > 0
          ? prune(node.children)
          : undefined,
    }));
  }

  return prune(root);
}

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const hasChildren = Boolean(node.children?.length);
  const [open, setOpen] = useState(() => depth < 2);

  return (
    <div>
      <button
        type="button"
        disabled={!hasChildren}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[13px] leading-5',
          hasChildren
            ? 'hover:bg-muted/60'
            : 'cursor-default text-muted-foreground',
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {hasChildren ? (
          open ? (
            <FolderOpenIcon className="size-3.5 shrink-0 text-primary" />
          ) : (
            <FolderIcon className="size-3.5 shrink-0 text-primary" />
          )
        ) : (
          <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {hasChildren && open
        ? node.children?.map((child) => (
            <TreeItem key={child.id} node={child} depth={depth + 1} />
          ))
        : null}
    </div>
  );
}

export function FileTreeBlock({ content }: { content: string }) {
  const tree = useMemo(() => parseFileTree(content), [content]);

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        File tree
      </div>
      <div className="max-h-80 overflow-auto py-1.5">
        {tree.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">Empty tree</p>
        ) : (
          tree.map((node) => (
            <TreeItem key={node.id} node={node} depth={0} />
          ))
        )}
      </div>
    </div>
  );
}

export function DiffBlock({ content }: { content: string }) {
  const lines = useMemo(
    () => content.replace(/\n$/, '').split('\n'),
    [content],
  );

  return (
    <div className="not-prose my-4 overflow-hidden rounded-xl border border-border bg-muted/30">
      <div className="border-b border-border bg-muted/60 px-3 py-1.5 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        Diff
      </div>
      <pre className="overflow-x-auto p-0 text-[12.5px] leading-6">
        {lines.map((line, index) => {
          const added = line.startsWith('+') && !line.startsWith('+++');
          const removed = line.startsWith('-') && !line.startsWith('---');
          const meta =
            line.startsWith('@@') ||
            line.startsWith('diff ') ||
            line.startsWith('index ') ||
            line.startsWith('+++') ||
            line.startsWith('---');

          return (
            <div
              key={`diff-line-${index}`}
              className={cn(
                'px-3 whitespace-pre-wrap',
                added && 'bg-success/10 text-success',
                removed && 'bg-destructive/10 text-destructive',
                meta && 'bg-muted/50 text-muted-foreground',
              )}
            >
              {line || ' '}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

export { sanitizeMermaidSource } from './mermaid-utils';

export function MermaidBlock({
  content,
  onOpenCanvas,
}: {
  content: string;
  onOpenCanvas?: () => void;
}) {
  const reactId = useId();
  const [mounted, setMounted] = useState(false);
  const sanitized = useMemo(() => sanitizeMermaidSource(content), [content]);
  // Soft gate: only hide while a label is clearly mid-stream incomplete.
  const ready =
    sanitized.trim().length >= 8 && !/\[[^\]]*$/.test(sanitized.trim());

  useEffect(() => {
    setMounted(true);
  }, []);

  const srcDoc = useMemo(() => {
    const diagramId = `mmd-${reactId.replace(/:/g, '')}`;
    return `<!doctype html><html><head><meta charset="utf-8"/><style>html,body{margin:0;min-height:100%;background:#fff;color:#0f172a;font-family:ui-sans-serif,system-ui}body{padding:12px;overflow:auto}.error{color:#b91c1c;white-space:pre-wrap;font-size:12px}</style><script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
try {
  const { svg } = await mermaid.render(${JSON.stringify(diagramId)}, ${JSON.stringify(sanitized)});
  document.getElementById('root').innerHTML = svg;
} catch (error) {
  const message = error && typeof error === 'object' && 'str' in error ? String(error.str) : String(error);
  document.getElementById('root').innerHTML = '<pre class="error">Mermaid could not render this diagram.\\n\\n' + message.replaceAll('<','&lt;') + '</pre>';
}
</script></head><body><div id="root">Rendering diagram…</div></body></html>`;
  }, [sanitized, reactId]);

  return (
    <div className="not-prose my-4 overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/60 px-3 py-1.5">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Mermaid
        </span>
        {onOpenCanvas ? (
          <button
            type="button"
            onClick={onOpenCanvas}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
          >
            Open canvas
          </button>
        ) : null}
      </div>
      {!ready ? (
        <div className="flex h-40 items-center justify-center bg-white px-4 text-center text-sm text-muted-foreground">
          Waiting for complete diagram…
        </div>
      ) : mounted ? (
        <iframe
          key={sanitized}
          title="Mermaid diagram"
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          className="block h-64 w-full border-0 bg-white"
        />
      ) : (
        <div className="flex h-64 items-center justify-center bg-white text-sm text-muted-foreground">
          Rendering diagram…
        </div>
      )}
    </div>
  );
}
