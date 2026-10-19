import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StoredFile } from '@/lib/api/server';
import { FilesClient } from './FilesClient';

function file(
  id: string,
  filename: string,
  processingStatus: StoredFile['processingStatus'],
  uploadedById: string,
): StoredFile {
  return {
    id,
    filename,
    mimeType: 'text/plain',
    detectedMimeType: 'text/plain',
    sizeBytes: 1200,
    processingStatus,
    scanBypassed: false,
    failureCode: null,
    failureMessage: null,
    uploadedById,
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z',
  };
}

describe('FilesClient lifecycle permissions', () => {
  it('shows an empty library without sample files', () => {
    render(
      <FilesClient currentUserId="user-1" isAdmin={false} initialFiles={[]} />,
    );

    expect(screen.getByRole('heading', { name: 'Files' })).toBeInTheDocument();
    expect(screen.getByText('No files yet')).toBeInTheDocument();
    expect(
      screen.getByText('Upload text, PDF, and DOCX files to use in chats.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('row')).not.toBeInTheDocument();
  });

  it('exposes downloads only when ready and deletes only owned files', () => {
    render(
      <FilesClient
        currentUserId="user-1"
        isAdmin={false}
        initialFiles={[
          file('ready', 'ready.txt', 'READY', 'user-1'),
          file('pending', 'pending.txt', 'PENDING_SCAN', 'user-2'),
          file('unsafe', 'unsafe.txt', 'QUARANTINED', 'user-2'),
        ]}
      />,
    );

    const readyRow = screen.getByText('ready.txt').closest('tr');
    const pendingRow = screen.getByText('pending.txt').closest('tr');
    const unsafeRow = screen.getByText('unsafe.txt').closest('tr');
    expect(readyRow).not.toBeNull();
    expect(pendingRow).not.toBeNull();
    expect(unsafeRow).not.toBeNull();

    expect(
      within(readyRow!).getByRole('link', { name: 'Download ready.txt' }),
    ).toHaveAttribute('href', '/api/files/ready/download');
    expect(
      within(readyRow!).getByRole('button', { name: 'Delete ready.txt' }),
    ).toBeInTheDocument();
    expect(
      within(pendingRow!).getByText('Waiting for scan'),
    ).toBeInTheDocument();
    expect(
      within(pendingRow!).queryByRole('link', { name: /Download/ }),
    ).not.toBeInTheDocument();
    expect(
      within(pendingRow!).queryByRole('button', { name: /Delete/ }),
    ).not.toBeInTheDocument();
    expect(within(unsafeRow!).getByText('Quarantined')).toBeInTheDocument();
  });

  it('allows an admin to delete another member file', () => {
    render(
      <FilesClient
        currentUserId="admin"
        isAdmin
        initialFiles={[file('other', 'other.txt', 'FAILED', 'user-2')]}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Delete other.txt' }),
    ).toBeInTheDocument();
  });
});
