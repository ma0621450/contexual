'use client';

import { useMemo, useState } from 'react';
import {
  CheckIcon,
  Code2Icon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  RefreshCwIcon,
  XIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CanvasArtifact } from './parseMessageContent';
import { sanitizeMermaidSource } from './mermaid-utils';

const PREVIEW_BASE_STYLES = `
html {
  height: 100%;
  overflow: auto;
}
body {
  margin: 0;
  min-height: 100%;
  box-sizing: border-box;
  padding: 16px;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  background: #fff;
  color: #0f172a;
  font-family: ui-sans-serif, system-ui, sans-serif;
  line-height: 1.5;
}
*, *::before, *::after { box-sizing: border-box; }
img, video, canvas, iframe { max-width: 100%; height: auto; }
svg { max-width: 100%; height: auto; display: block; }
pre, code { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
table { border-collapse: collapse; width: max-content; min-width: 100%; max-width: none; }
th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
.wide-scroll { overflow: auto; max-width: 100%; }
`;

function buildPreviewDocument(artifact: CanvasArtifact): string {
  const language = artifact.language.toLowerCase();
  const content = artifact.content;

  if (language === 'svg') {
    const svg = content.trim().startsWith('<svg')
      ? content
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">${content}</svg>`;
    return `<!doctype html><html><head><meta charset="utf-8"/><style>${PREVIEW_BASE_STYLES}body{display:flex;justify-content:center;align-items:flex-start;background:#f8fafc}svg{max-width:100%}</style></head><body>${svg}</body></html>`;
  }

  if (language === 'mermaid') {
    const diagram = sanitizeMermaidSource(content);
    return `<!doctype html><html><head><meta charset="utf-8"/><style>${PREVIEW_BASE_STYLES}#root{overflow:auto;max-width:100%}.error{color:#b91c1c;white-space:pre-wrap;font-size:12px}</style><script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
try {
  const { svg } = await mermaid.render('diagram', ${JSON.stringify(diagram)});
  document.getElementById('root').innerHTML = svg;
} catch (error) {
  const message = error && typeof error === 'object' && 'str' in error ? String(error.str) : String(error);
  document.getElementById('root').innerHTML = '<pre class="error">Mermaid could not render this diagram.\\n\\n' + message.replaceAll('<','&lt;') + '</pre>';
}
</script></head><body><div id="root">Rendering…</div></body></html>`;
  }

  if (language === 'react' || language === 'jsx' || language === 'tsx') {
    return `<!doctype html><html><head><meta charset="utf-8"/><style>${PREVIEW_BASE_STYLES}</style></head><body><p>React preview is shown as source. Paste into a React app to run.</p><pre>${escapeHtml(content)}</pre></body></html>`;
  }

  if (/<html[\s>]/i.test(content) || /<!doctype/i.test(content)) {
    if (/<\/head>/i.test(content)) {
      return content.replace(
        /<\/head>/i,
        `<style>${PREVIEW_BASE_STYLES}</style></head>`,
      );
    }
    return content;
  }

  return `<!doctype html><html><head><meta charset="utf-8"/><style>${PREVIEW_BASE_STYLES}</style></head><body>${content}</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function CanvasCard({
  artifact,
  onOpen,
}: {
  artifact: CanvasArtifact;
  onOpen: (artifact: CanvasArtifact) => void;
}) {
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-muted/50 to-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Code2Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{artifact.title}</p>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            {artifact.language} · Canvas
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onOpen(artifact)}
        >
          <EyeIcon className="size-3.5" />
          Open
        </Button>
      </div>
      <pre className="max-h-28 overflow-hidden border-t border-border bg-muted/40 px-4 py-3 font-mono text-[11px] leading-5 text-muted-foreground">
        {artifact.content.slice(0, 420)}
        {artifact.content.length > 420 ? '…' : ''}
      </pre>
    </div>
  );
}

export function ArtifactCard({
  artifact,
  onOpen,
}: {
  artifact: CanvasArtifact;
  onOpen: (artifact: CanvasArtifact) => void;
}) {
  return <CanvasCard artifact={artifact} onOpen={onOpen} />;
}

export function CanvasModal({
  artifact,
  open,
  onClose,
}: {
  artifact: CanvasArtifact | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open && Boolean(artifact)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="top-3 left-3 flex h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:top-4 sm:left-4 sm:h-[calc(100vh-2rem)] sm:w-[calc(100vw-2rem)] [&>button]:hidden">
        {artifact ? <CanvasViewer artifact={artifact} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export function CanvasSidePanel({
  artifact,
  onClose,
}: {
  artifact: CanvasArtifact;
  onClose: () => void;
}) {
  return (
    <aside className="hidden h-full w-[min(44rem,45vw)] shrink-0 flex-col border-l border-border bg-background lg:flex">
      <CanvasViewer artifact={artifact} onClose={onClose} className="h-full" />
    </aside>
  );
}

function CanvasViewer({
  artifact,
  onClose,
  className,
}: {
  artifact: CanvasArtifact;
  onClose: () => void;
  className?: string;
}) {
  const [tab, setTab] = useState('preview');
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const srcDoc = useMemo(
    () => buildPreviewDocument(artifact),
    [artifact],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const extension =
      artifact.language === 'svg'
        ? 'svg'
        : artifact.language === 'mermaid'
          ? 'mmd'
          : artifact.language === 'html'
            ? 'html'
            : 'txt';
    const blob = new Blob([artifact.content], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${artifact.title.replace(/[^\w.-]+/g, '-').toLowerCase() || 'canvas'}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Code2Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-sm font-medium">
            {artifact.title}
          </DialogTitle>
          <DialogDescription className="truncate text-[11px] text-muted-foreground uppercase">
            {artifact.language} · Canvas
          </DialogDescription>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => setReloadKey((value) => value + 1)}
          aria-label="Refresh preview"
        >
          <RefreshCwIcon className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => void copy()}
          aria-label={copied ? 'Copied' : 'Copy source'}
        >
          {copied ? (
            <CheckIcon className="size-4 text-success" />
          ) : (
            <CopyIcon className="size-4" />
          )}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={download}
          aria-label="Download source"
        >
          <DownloadIcon className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onClose}
          aria-label="Close canvas"
        >
          <XIcon className="size-4" />
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden"
      >
        <div className="shrink-0 border-b border-border px-3 py-2 sm:px-4">
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent
          value="preview"
          className="mt-0 min-h-0 min-w-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <iframe
            key={`${artifact.id}-${reloadKey}`}
            title={artifact.title}
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            className="block h-full w-full max-w-full border-0 bg-white"
          />
        </TabsContent>
        <TabsContent
          value="code"
          className="mt-0 min-h-0 min-w-0 flex-1 overflow-auto data-[state=inactive]:hidden"
        >
          <pre className="max-w-full p-4 font-mono text-[12px] leading-6 break-words whitespace-pre-wrap sm:p-6">
            {artifact.content}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
