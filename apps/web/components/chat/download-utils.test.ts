import { describe, expect, it } from 'vitest';
import { splitDownloadLinks } from './download-utils';

describe('splitDownloadLinks', () => {
  it('extracts HTML data-uri download links into download cards', () => {
    const csv = 'ID,Task\n1,Plan';
    const href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    const content = `Ready:\n<a download="todo-list.csv" href="${href}">**Download todo-list.csv**</a>`;

    const segments = splitDownloadLinks(content);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ type: 'markdown', content: 'Ready:\n' });
    expect(segments[1]).toMatchObject({
      type: 'download',
      filename: 'todo-list.csv',
      content: csv,
      label: 'Download todo-list.csv',
    });
  });

  it('returns markdown unchanged when no download link is present', () => {
    expect(splitDownloadLinks('Hello **world**')).toEqual([
      { type: 'markdown', content: 'Hello **world**' },
    ]);
  });
});
