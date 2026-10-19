'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayIcon } from 'lucide-react';
import { runSandbox } from '@/lib/api/client';

const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/';

function wrapPython(code: string) {
  return `
from io import StringIO
import sys, traceback

class _Stdin:
    def readline(self, *args, **kwargs):
        return "\\n"
    def read(self, *args, **kwargs):
        return ""

_buf = StringIO()
sys.stdin = _Stdin()
sys.stdout = _buf
sys.stderr = _buf
try:
    exec(${JSON.stringify(code)}, {"__name__": "__main__"})
except SystemExit:
    pass
except Exception:
    traceback.print_exc()
_buf.getvalue()
`;
}

let pythonWorker: Worker | null = null;
let pythonWorkerFailed = false;

function getPythonWorker() {
  if (pythonWorkerFailed) return null;
  if (pythonWorker) return pythonWorker;

  const source = `
import { loadPyodide } from '${PYODIDE_INDEX}pyodide.mjs';
let pyodidePromise;
self.onmessage = async (event) => {
  const { id, wrapped } = event.data;
  try {
    pyodidePromise ??= loadPyodide({ indexURL: '${PYODIDE_INDEX}' });
    const pyodide = await pyodidePromise;
    const result = await pyodide.runPythonAsync(wrapped);
    self.postMessage({ id, ok: true, output: result == null ? '' : String(result) });
  } catch (error) {
    self.postMessage({ id, ok: false, output: String(error) });
  }
};
`;
  try {
    const blob = new Blob([source], { type: 'text/javascript' });
    pythonWorker = new Worker(URL.createObjectURL(blob), { type: 'module' });
    pythonWorker.addEventListener('error', () => {
      pythonWorkerFailed = true;
    });
    return pythonWorker;
  } catch {
    pythonWorkerFailed = true;
    return null;
  }
}

function runPython(code: string): Promise<string> {
  return runSandbox('python', code).then((result) => {
    if (result.ok) return result.data.output;
    const wrapped = wrapPython(code);
    const worker = getPythonWorker();
    if (!worker) {
      return Promise.reject(new Error(result.error || 'Python sandbox failed'));
    }

    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer = window.setTimeout(() => {
        worker.removeEventListener('message', onMessage);
        reject(new Error('Timed out after 45s'));
      }, 45_000);

      function onMessage(event: MessageEvent) {
        if (event.data?.id !== id) return;
        window.clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        if (event.data.ok) resolve(event.data.output || '(no output)');
        else reject(new Error(event.data.output));
      }

      worker.addEventListener('message', onMessage);
      worker.postMessage({ id, wrapped });
    });
  });
}

export function CodeSandbox({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [sandboxOutput, setSandboxOutput] = useState('Running…');
  const runIdRef = useRef(0);
  const normalized = language.toLowerCase();
  const isPython = normalized === 'python' || normalized === 'py';
  const isJs = normalized === 'js' || normalized === 'javascript';
  const runnable = isJs || isPython || normalized === 'html';
  const usesServer = isPython || isJs;

  const srcDoc = useMemo(() => {
    if (isPython || isJs) return '';
    if (normalized === 'html') {
      return `<!doctype html><html><head><meta charset="utf-8"/><style>body{margin:12px;font:14px system-ui;background:#fff;color:#111}</style></head><body>${code}</body></html>`;
    }

    return `<!doctype html><html><body style="margin:0;background:#0b0c0f;color:#e2e8f0;font:12px ui-monospace,monospace;padding:12px"><pre id="out"></pre>
<script>
const out = document.getElementById('out');
const log = console.log;
console.log = (...args) => { out.textContent += args.map(String).join(' ') + '\\n'; log(...args); };
const err = console.error;
console.error = (...args) => { out.textContent += args.map(String).join(' ') + '\\n'; err(...args); };
const timer = setTimeout(() => { out.textContent += '\\nTimed out after 8s'; }, 8000);
try {
  const result = (0, eval)(${JSON.stringify(code)});
  if (result !== undefined) out.textContent += String(result);
} catch (error) {
  out.textContent = String(error);
} finally {
  clearTimeout(timer);
}
</script></body></html>`;
  }, [code, isPython, isJs, normalized]);

  useEffect(() => {
    if (!open || !usesServer) return;
    const runId = ++runIdRef.current;
    setSandboxOutput(isPython ? 'Running Python…' : 'Running JavaScript…');
    const run = isPython
      ? runPython(code)
      : runSandbox('javascript', code).then((result) => {
          if (!result.ok) throw new Error(result.error);
          return result.data.output;
        });
    void run
      .then((output) => {
        if (runIdRef.current === runId) setSandboxOutput(output);
      })
      .catch((error: unknown) => {
        if (runIdRef.current === runId) {
          setSandboxOutput(
            error instanceof Error ? error.message : String(error),
          );
        }
      });
  }, [open, usesServer, isPython, code, reload]);

  if (!runnable) return null;

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setReload((value) => value + 1);
        }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <PlayIcon className="size-3.5" />
        Run
      </button>
      {open && usesServer ? (
        <pre className="h-52 overflow-auto bg-black p-3 font-mono text-xs text-slate-200 whitespace-pre-wrap">
          {sandboxOutput}
        </pre>
      ) : null}
      {open && !usesServer ? (
        <iframe
          key={reload}
          title="Code sandbox"
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          className="block h-52 w-full border-0 bg-black"
        />
      ) : null}
    </div>
  );
}
