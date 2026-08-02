import { describe, expect, it } from 'vitest';
import {
  isMermaidSourceReady,
  sanitizeMermaidSource,
} from './mermaid-utils';

describe('sanitizeMermaidSource', () => {
  it('quotes square labels that contain parentheses', () => {
    const input = [
      'flowchart TD',
      '  A[factorial(3)] --> B[factorial(2)]',
      '  B --> C[factorial(1)]',
    ].join('\n');

    const output = sanitizeMermaidSource(input);
    expect(output).toContain('A["factorial(3)"]');
    expect(output).toContain('B["factorial(2)"]');
    expect(output).toContain('C["factorial(1)"]');
  });

  it('leaves already-quoted labels alone', () => {
    const input = 'flowchart TD\n  A["factorial(3)"] --> B[ok]';
    const output = sanitizeMermaidSource(input);
    expect(output).toContain('A["factorial(3)"]');
    expect(output).toContain('B[ok]');
  });
});

describe('isMermaidSourceReady', () => {
  it('accepts a complete flowchart with arrows', () => {
    const input = [
      'flowchart TD',
      '  A["factorial(3)"] --> B["factorial(2)"]',
      '  B --> C["factorial(1)"]',
    ].join('\n');
    expect(isMermaidSourceReady(sanitizeMermaidSource(input))).toBe(true);
  });

  it('rejects incomplete labels and trailing arrows', () => {
    expect(isMermaidSourceReady('flowchart TD\n  A[factorial')).toBe(false);
    expect(isMermaidSourceReady('flowchart TD\n  A[ok] -->')).toBe(false);
  });
});
