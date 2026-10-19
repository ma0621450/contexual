'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import {
  CopyIcon,
  DownloadIcon,
  LoaderCircleIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import type { FileProcessingStatus, StoredFile } from '@/lib/api/server';
import { isFileTerminal } from '@/lib/files';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
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

  async function copyFilename(file: StoredFile) {
    try {
      await navigator.clipboard.writeText(file.filename);
      setCopiedId(file.id);
    } catch {
      setRowErrors((current) => ({
        ...current,
        [file.id]: 'Could not copy the file name.',
      }));
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1070px] px-4 pt-8 pb-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-10 font-semibold tracking-[-1.2px] text-white sm:text-[48px] sm:leading-[56px] sm:tracking-[-1.92px]">
            Files
          </h1>
          <p className="mt-0.5 max-w-md text-[16px] leading-7 text-[#a1a1aa]">
            Upload text, PDF, and DOCX files to use in chats.
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
            className="h-[37px] rounded-[10px] bg-white px-4 text-[#111111] hover:bg-white/90 focus-visible:ring-white/50"
          >
            {uploading ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <UploadIcon />
            )}
            {uploading ? 'Uploading…' : 'Upload'}
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
        <div className="mt-8 flex flex-col items-center rounded-[16px] border border-shell-line px-6 py-16 text-center">
          <img src="/brand/nav/files.svg" alt="" width={20} height={20} />
          <p className="mt-3 font-medium text-white">No files yet</p>
          <p className="mt-1 max-w-sm text-sm text-[#a1a1aa]">
            Upload a text, PDF, or DOCX file to use it as chat context.
          </p>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-[16px] border border-shell-line">
          <Table>
            <TableHeader>
              <TableRow className="border-shell-line hover:bg-transparent">
                <TableHead className="h-11 px-4 text-sm text-shell-muted">
                  File
                </TableHead>
                <TableHead className="h-11 text-sm text-shell-muted">
                  Type
                </TableHead>
                <TableHead className="h-11 text-sm text-shell-muted">
                  Size
                </TableHead>
                <TableHead className="h-11 text-sm text-shell-muted">
                  Uploader
                </TableHead>
                <TableHead className="h-11 text-sm text-shell-muted">
                  Created
                </TableHead>
                <TableHead className="h-11 text-sm text-shell-muted">
                  Status
                </TableHead>
                <TableHead className="h-11 text-right text-sm text-shell-muted">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => {
                const status = STATUS_PRESENTATION[file.processingStatus];
                const canDelete =
                  isAdmin || file.uploadedById === currentUserId;
                return (
                  <TableRow
                    key={file.id}
                    className="h-14 border-shell-line hover:bg-shell-hover"
                  >
                    <TableCell className="max-w-64 px-4 whitespace-normal">
                      <div className="flex items-center gap-3">
                        <img
                          src="/brand/nav/files.svg"
                          alt=""
                          width={20}
                          height={20}
                        />
                        <div className="min-w-0 font-medium text-white">
                          {file.filename}
                        </div>
                      </div>
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
                    <TableCell className="text-[#a1a1aa]">
                      {formatType(file)}
                    </TableCell>
                    <TableCell className="text-[#a1a1aa]">
                      {formatBytes(file.sizeBytes)}
                    </TableCell>
                    <TableCell className="text-[#a1a1aa]">
                      {file.uploadedBy?.name ??
                        (file.uploadedById === currentUserId ? 'You' : '—')}
                    </TableCell>
                    <TableCell className="text-[#a1a1aa]">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-shell-muted hover:bg-shell-active hover:text-white"
                          onClick={() => void copyFilename(file)}
                          aria-label={
                            copiedId === file.id
                              ? `Copied ${file.filename}`
                              : `Copy ${file.filename}`
                          }
                        >
                          <CopyIcon />
                        </Button>
                        {file.processingStatus === 'READY' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-shell-muted hover:bg-shell-active hover:text-white"
                            asChild
                          >
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
                            className="text-shell-muted hover:bg-shell-active hover:text-white"
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
        </div>
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
