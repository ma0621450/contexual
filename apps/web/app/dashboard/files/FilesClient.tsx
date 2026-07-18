'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DownloadIcon,
  FileIcon,
  LoaderCircleIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import type { FileProcessingStatus, StoredFile } from '@/lib/api/server';
import { isFileTerminal } from '@/lib/files';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Props = {
  initialFiles: StoredFile[];
  currentUserId: string;
  isAdmin: boolean;
};

const STATUS_PRESENTATION: Record<
  FileProcessingStatus,
  {
    label: string;
    variant: 'success' | 'warning' | 'destructive' | 'secondary';
  }
> = {
  PENDING_SCAN: { label: 'Waiting for scan', variant: 'warning' },
  SCANNING: { label: 'Scanning', variant: 'warning' },
  EXTRACTING: { label: 'Processing', variant: 'warning' },
  READY: { label: 'Ready', variant: 'success' },
  QUARANTINED: { label: 'Quarantined', variant: 'destructive' },
  FAILED: { label: 'Failed', variant: 'destructive' },
};

export function FilesClient({
  initialFiles,
  currentUserId,
  isAdmin,
}: Props) {
  const [files, setFiles] = useState(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [pollError, setPollError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StoredFile | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const hasPending = files.some((file) => !isFileTerminal(file));

  useEffect(() => {
    if (!hasPending) return;

    const refresh = async () => {
      const result = await apiFetch<StoredFile[]>('/files');
      if (result.ok) {
        setFiles(result.data);
        setPollError('');
      } else {
        setPollError(`Status update failed: ${result.error}`);
      }
    };

    const interval = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(interval);
  }, [hasPending]);

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadError('');
    const form = new FormData();
    form.append('file', file);
    const result = await apiFetch<StoredFile>('/files/upload', {
      method: 'POST',
      body: form,
    });

    if (result.ok) {
      setFiles((current) => [
        result.data,
        ...current.filter((item) => item.id !== result.data.id),
      ]);
    } else {
      setUploadError(result.error);
    }
    setUploading(false);
  }

  async function deleteFile(file: StoredFile) {
    setDeletingId(file.id);
    setRowErrors((current) => ({ ...current, [file.id]: '' }));
    const result = await apiFetch<{ ok: true }>(`/files/${file.id}`, {
      method: 'DELETE',
    });

    if (result.ok) {
      setFiles((current) => current.filter((item) => item.id !== file.id));
    } else {
      setRowErrors((current) => ({
        ...current,
        [file.id]: result.error,
      }));
    }
    setDeletingId(null);
    setDeleteTarget(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Files</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload secure context files and track scanning and processing.
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".txt,.md,.csv,.json,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            aria-label="Choose a file to upload"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadFile(file);
              event.target.value = '';
            }}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            aria-busy={uploading}
          >
            {uploading ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <UploadIcon />
            )}
            {uploading ? 'Uploading…' : 'Upload file'}
          </Button>
        </div>
      </div>

      {uploadError ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive"
        >
          {uploadError}
        </p>
      ) : null}
      {pollError ? (
        <p role="status" className="mb-4 text-sm text-warning">
          {pollError}
        </p>
      ) : null}

      {files.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <FileIcon className="mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">No files yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a text, PDF, or DOCX file to use it as chat context.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploader</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => {
                const status = STATUS_PRESENTATION[file.processingStatus];
                const canDelete =
                  isAdmin || file.uploadedById === currentUserId;
                return (
                  <TableRow key={file.id}>
                    <TableCell className="max-w-64 whitespace-normal">
                      <div className="font-medium">{file.filename}</div>
                      {file.failureMessage ? (
                        <p className="mt-1 text-xs text-destructive">
                          {file.failureMessage}
                        </p>
                      ) : null}
                      {rowErrors[file.id] ? (
                        <p role="alert" className="mt-1 text-xs text-destructive">
                          {rowErrors[file.id]}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>{formatType(file)}</TableCell>
                    <TableCell>{formatBytes(file.sizeBytes)}</TableCell>
                    <TableCell>
                      {file.uploadedBy?.name ??
                        (file.uploadedById === currentUserId ? 'You' : '—')}
                    </TableCell>
                    <TableCell>
                      <time dateTime={file.createdAt}>
                        {new Date(file.createdAt).toLocaleDateString()}
                      </time>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>
                        {!isFileTerminal(file) ? (
                          <LoaderCircleIcon
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        ) : null}
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {file.processingStatus === 'READY' ? (
                          <Button variant="ghost" size="icon" asChild>
                            <a
                              href={`/api/files/${file.id}/download`}
                              aria-label={`Download ${file.filename}`}
                            >
                              <DownloadIcon />
                            </a>
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(file)}
                            disabled={deletingId === file.id}
                            aria-label={`Delete ${file.filename}`}
                          >
                            {deletingId === file.id ? (
                              <LoaderCircleIcon className="animate-spin" />
                            ) : (
                              <Trash2Icon />
                            )}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletingId) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.filename}” will be permanently removed and can no longer be used in chats.`
                : 'This file will be permanently removed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingId)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteTarget || Boolean(deletingId)}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) void deleteFile(deleteTarget);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatType(file: StoredFile): string {
  const type = file.detectedMimeType ?? file.mimeType;
  const labels: Record<string, string> = {
    'text/plain': 'Text',
    'text/markdown': 'Markdown',
    'text/csv': 'CSV',
    'application/json': 'JSON',
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      'DOCX',
  };
  return labels[type] ?? type;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
