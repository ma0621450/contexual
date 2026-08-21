import { describe, expect, it } from 'vitest';
import { parseMessageContent } from './parseMessageContent';

describe('parseMessageContent', () => {
  it('extracts thinking, mcq, and canvas blocks', () => {
    const content = [
      '<thinking>',
      'Consider tradeoffs',
      '</thinking>',
      '',
      'Here is a quiz:',
      '',
      '```mcq',
      JSON.stringify({
        question: '2 + 2?',
        options: ['3', '4', '5'],
        answer: 1,
        explanation: 'Basic math',
      }),
      '```',
      '',
      '```canvas title="Card" language="html"',
      '<div>Hello</div>',
      '```',
      '',
      'Done.',
    ].join('\n');

    const segments = parseMessageContent(content);
    expect(segments.map((segment) => segment.type)).toEqual([
      'thinking',
      'markdown',
      'mcq',
      'canvas',
      'markdown',
    ]);

    const thinking = segments.find((segment) => segment.type === 'thinking');
    expect(thinking).toMatchObject({
      type: 'thinking',
      content: 'Consider tradeoffs',
      streaming: false,
    });

    const mcq = segments.find((segment) => segment.type === 'mcq');
    expect(mcq).toMatchObject({
      type: 'mcq',
      data: {
        question: '2 + 2?',
        options: ['3', '4', '5'],
        answer: 1,
      },
    });

    const canvas = segments.find((segment) => segment.type === 'canvas');
    expect(canvas).toMatchObject({
      type: 'canvas',
      artifact: {
        title: 'Card',
        language: 'html',
        content: '<div>Hello</div>',
      },
    });
  });

  it('keeps ordinary code fences in markdown', () => {
    const segments = parseMessageContent(
      ['```ts', 'const total = 10;', '```'].join('\n'),
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]?.type).toBe('markdown');
  });

  it('marks incomplete thinking as streaming', () => {
    const segments = parseMessageContent('<thinking>\nStill working');
    expect(segments).toEqual([
      {
        type: 'thinking',
        content: 'Still working',
        streaming: true,
      },
    ]);
  });

  it('extracts collapse and filetree blocks', () => {
    const segments = parseMessageContent(
      [
        '```collapse title="Notes"',
        'Hidden details',
        '```',
        '',
        '```filetree',
        'src',
        '  app.ts',
        '```',
      ].join('\n'),
    );
    expect(segments.map((segment) => segment.type)).toEqual([
      'collapse',
      'filetree',
    ]);
  });

  it('parses tool steps and citation markers', () => {
    const content = [
      'Reading 【policy.pdf】 now.',
      '',
      '```tool',
      JSON.stringify({
        title: 'Scanning files',
        status: 'done',
        detail: '3 matches',
      }),
      '```',
    ].join('\n');

    const segments = parseMessageContent(content);
    expect(segments.some((segment) => segment.type === 'citation')).toBe(true);
    expect(segments.some((segment) => segment.type === 'tool')).toBe(true);
  });

  it('parses csv download fences', () => {
    const segments = parseMessageContent(
      ['```csv title="tasks.csv"', 'ID,Task', '1,Plan', '```'].join('\n'),
    );
    expect(segments).toEqual([
      {
        type: 'download',
        filename: 'tasks.csv',
        content: 'ID,Task\n1,Plan',
        mimeType: 'text/csv;charset=utf-8',
        label: 'tasks.csv',
      },
    ]);
  });
});
