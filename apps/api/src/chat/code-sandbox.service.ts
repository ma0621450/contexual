import { BadRequestException, Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createContext, runInContext } from 'vm';

const execFileAsync = promisify(execFile);
const JS_TIMEOUT_MS = 5000;
const PYTHON_TIMEOUT_MS = 8000;
const MAX_OUTPUT = 50_000;

@Injectable()
export class CodeSandboxService {
  async run(language: string, code: string) {
    const normalized = language.toLowerCase();
    const source = code.slice(0, 20_000);
    if (normalized === 'js' || normalized === 'javascript') {
      return { language: 'javascript', output: this.runJavaScript(source) };
    }
    if (normalized === 'python' || normalized === 'py') {
      return { language: 'python', output: await this.runPython(source) };
    }
    throw new BadRequestException('Sandbox supports JavaScript and Python only');
  }

  private runJavaScript(code: string) {
    const logs: string[] = [];
    const sandbox = {
      console: {
        log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
        error: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
        warn: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      },
    };
    try {
      const context = createContext(sandbox);
      const result = runInContext(code, context, {
        timeout: JS_TIMEOUT_MS,
        displayErrors: true,
      });
      if (result !== undefined) logs.push(String(result));
      return this.clip(logs.join('\n') || '(no output)');
    } catch (error) {
      return this.clip(error instanceof Error ? error.message : String(error));
    }
  }

  private async runPython(code: string) {
    const candidates = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python'];
    let lastError = 'Python is not installed on the API host.';
    for (const bin of candidates) {
      try {
        const args =
          bin === 'py' ? ['-3', '-I', '-c', code] : ['-I', '-c', code];
        const { stdout, stderr } = await execFileAsync(bin, args, {
          timeout: PYTHON_TIMEOUT_MS,
          windowsHide: true,
          env: { PATH: process.env.PATH ?? '' },
          maxBuffer: MAX_OUTPUT,
        });
        return this.clip((stdout + stderr).trim() || '(no output)');
      } catch (error) {
        const err = error as {
          code?: string | number;
          stdout?: string;
          stderr?: string;
          message?: string;
          killed?: boolean;
        };
        if (err.killed) return 'Timed out after 8s';
        if (err.stdout || err.stderr) {
          return this.clip(`${err.stdout ?? ''}${err.stderr ?? ''}`.trim());
        }
        if (err.code !== 'ENOENT') {
          lastError = err.message ?? lastError;
        }
      }
    }
    return lastError;
  }

  private clip(value: string) {
    return value.length > MAX_OUTPUT
      ? `${value.slice(0, MAX_OUTPUT)}\n…truncated`
      : value;
  }
}
