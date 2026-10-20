'use client';

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from 'react';
import {
  ExternalLinkIcon,
  FileTextIcon,
  LoaderCircleIcon,
  SparklesIcon,
  UploadCloudIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import type { MemoryItem } from '@/lib/api/server';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
  initialMemories: MemoryItem[];
  isAdmin: boolean;
};

type Scope = MemoryItem['scope'];

const TEXT_IMPORT = '.txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json';

function formatTableDate(value: string) {
  return new Date(value).toLocaleDateString('en-US');
}

function formatLongDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function linesOf(content: string) {
  return content
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

export function MemoriesClient({ initialMemories, isAdmin }: Props) {
  const [memories, setMemories] = useState(initialMemories);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [scope, setScope] = useState<Scope>('USER');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');
  const [preferenceNote, setPreferenceNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemoryItem | null>(null);
  const [openMemory, setOpenMemory] = useState<MemoryItem | null>(null);
  const [changeText, setChangeText] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const profiles = memories.filter((memory) => memory.scope === 'USER');
  const topics = memories.filter((memory) => memory.scope === 'ORGANIZATION');

  function openCreate(nextScope: Scope) {
    setEditing(null);
    setTitle('');
    setContent('');
    setScope(nextScope);
    setFormError('');
    setDialogOpen(true);
  }

  function openEditor(memory: MemoryItem) {
    setEditing(memory);
    setTitle(memory.title);
    setContent(memory.content);
    setScope(memory.scope);
    setFormError('');
    setDialogOpen(true);
  }

  async function saveMemory() {
    const nextTitle = title.trim();
    const nextContent = content.trim();
    if (!nextTitle || !nextContent) {
      setFormError('Add a title and the fact you want remembered.');
      return;
    }

    setSaving(true);
    setFormError('');
    const result = editing
      ? await apiFetch<MemoryItem>(`/memories/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: nextTitle, content: nextContent }),
        })
      : await apiFetch<MemoryItem>('/memories', {
          method: 'POST',
          body: JSON.stringify({
            title: nextTitle,
            content: nextContent,
            scope,
          }),
        });

    if (!result.ok) {
      setFormError(result.error);
      setSaving(false);
      return;
    }

    setMemories((current) =>
      editing
        ? current.map((item) => (item.id === result.data.id ? result.data : item))
        : [result.data, ...current],
    );
    if (openMemory?.id === result.data.id) setOpenMemory(result.data);
    setSaving(false);
    setDialogOpen(false);
  }

  async function toggleEnabled(memory: MemoryItem, enabled: boolean) {
    setBusyId(memory.id);
    setPageError('');
    const result = await apiFetch<MemoryItem>(`/memories/${memory.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
    if (result.ok) {
      setMemories((current) =>
        current.map((item) => (item.id === memory.id ? result.data : item)),
      );
      setOpenMemory(result.data);
    } else {
      setPageError(result.error);
    }
    setBusyId(null);
  }

  async function applyChange(memory: MemoryItem) {
    const nextContent = changeText.trim();
    if (!nextContent) return;
    setBusyId(memory.id);
    setPageError('');
    const result = await apiFetch<MemoryItem>(`/memories/${memory.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: nextContent }),
    });
    if (result.ok) {
      setMemories((current) =>
        current.map((item) => (item.id === memory.id ? result.data : item)),
      );
      setOpenMemory(result.data);
      setChangeText('');
    } else {
      setPageError(result.error);
    }
    setBusyId(null);
  }

  async function deleteMemory(memory: MemoryItem) {
    setBusyId(memory.id);
    setPageError('');
    const result = await apiFetch<{ ok: true }>(`/memories/${memory.id}`, {
      method: 'DELETE',
    });
    if (result.ok) {
      setMemories((current) => current.filter((item) => item.id !== memory.id));
      setDeleteTarget(null);
      setOpenMemory(null);
    } else {
      setPageError(result.error);
    }
    setBusyId(null);
  }

  async function importFile(file: File) {
    const allowed = /\.(txt|md|csv|json)$/i.test(file.name);
    if (!allowed) {
      setPageError('Upload a text, Markdown, CSV, or JSON export.');
      return;
    }
    if (file.size > 200_000) {
      setPageError('That file is too large to save as a memory.');
      return;
    }
    const text = (await file.text()).trim();
    if (!text) {
      setPageError('That file has no text to remember.');
      return;
    }
    const importedTitle = file.name.replace(/\.[^.]+$/, '').slice(0, 100);
    setPageError('');
    setSaving(true);
    const result = await apiFetch<MemoryItem>('/memories', {
      method: 'POST',
      body: JSON.stringify({
        title: importedTitle || 'Imported memory',
        content: text.slice(0, 4000),
        scope: 'USER',
      }),
    });
    if (result.ok) {
      setMemories((current) => [result.data, ...current]);
    } else {
      setPageError(result.error);
    }
    setSaving(false);
  }

  function unavailablePreference() {
    setPreferenceNote(
      'This preference is not saved. Promplex does not store it yet.',
    );
  }

  const canEditOpen =
    openMemory !== null &&
    (openMemory.scope === 'USER' || isAdmin);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1118px] px-4 pt-8 pb-10 sm:px-6">
      <div>
        <h1 className="text-[32px] leading-10 font-semibold tracking-[-1.2px] text-white sm:text-[48px] sm:leading-[56px] sm:tracking-[-1.92px]">
          Memories
        </h1>
        <p className="mt-1 text-[15px] leading-6 text-[#a1a1aa]">
          Upload documents, images, and PDFs to use in chats
        </p>
      </div>

      <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
        <div className="flex items-center justify-between gap-6 py-5">
          <div className="min-w-0">
            <h2 className="text-[16px] font-medium text-white">
              Generate memory from chats
            </h2>
            <p className="mt-1 text-sm leading-5 text-[#a1a1aa]">
              Allow Promplex to generate memory from your chats. Learn more
            </p>
          </div>
          <Switch
            checked={false}
            onCheckedChange={unavailablePreference}
            aria-label="Generate memory from chats"
          />
        </div>
        <div className="flex items-center justify-between gap-6 py-5">
          <div className="min-w-0">
            <h2 className="text-[16px] font-medium text-white">
              Include sensitive topics in memory
            </h2>
            <p className="mt-1 text-sm leading-5 text-[#a1a1aa]">
              Allow Claude to save details about sensitive topics like health
              conditions or religious beliefs to memory. Learn more
            </p>
          </div>
          <Switch
            checked={false}
            onCheckedChange={unavailablePreference}
            aria-label="Include sensitive topics in memory"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div className="min-w-0 max-w-xl">
            <h2 className="text-[16px] font-medium text-white">
              Import memory from other AI providers
            </h2>
            <p className="mt-1 text-sm leading-5 text-[#a1a1aa]">
              Bring relevant context and data from another AI provider to
              Claude. We&apos;ll provide a prompt you can use to fetch the
              memory from your other account.
            </p>
          </div>
          <div>
            <input
              ref={importRef}
              type="file"
              accept={TEXT_IMPORT}
              className="sr-only"
              aria-label="Upload a memory export"
              disabled={saving}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
                event.target.value = '';
              }}
            />
            <Button
              type="button"
              onClick={() => importRef.current?.click()}
              disabled={saving}
              className="h-9 min-w-[108px] rounded-lg border border-white/15 bg-[#1f1f1f] px-5 text-white hover:bg-[#2a2a2a]"
            >
              Upload
              {saving ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <UploadCloudIcon />
              )}
            </Button>
          </div>
        </div>
      </div>

      {preferenceNote ? (
        <p role="status" className="mt-4 text-sm text-[#a1a1aa]">
          {preferenceNote}
        </p>
      ) : null}
      {pageError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {pageError}
        </p>
      ) : null}

      <MemorySection
        heading="Profile"
        memories={profiles}
        canAdd
        onAdd={() => openCreate('USER')}
        onOpen={(memory) => {
          setChangeText('');
          setOpenMemory(memory);
        }}
      />
      <MemorySection
        heading="Topic"
        memories={topics}
        canAdd={isAdmin}
        onAdd={() => openCreate('ORGANIZATION')}
        onOpen={(memory) => {
          setChangeText('');
          setOpenMemory(memory);
        }}
      />

      <Dialog open={openMemory !== null} onOpenChange={(open) => !open && setOpenMemory(null)}>
        <DialogContent className="gap-0 overflow-hidden rounded-2xl border-white/10 bg-[#161616] p-0 text-white shadow-2xl sm:max-w-[560px]">
          {openMemory ? (
            <div className="bg-[#161616] px-6 pt-6 pb-4">
              <DialogHeader>
                <DialogTitle className="text-[28px] font-semibold text-white">
                  {openMemory.scope === 'USER' ? 'Profile' : 'Topic'}
                </DialogTitle>
              </DialogHeader>
              <p className="mt-6 text-sm text-[#8b8b93]">Last updated</p>
              <p className="mt-1 text-[16px] text-white">
                {formatLongDate(openMemory.updatedAt)}
              </p>
              <p className="mt-5 text-sm text-[#8b8b93]">Summary</p>
              <p className="mt-1 text-[16px] leading-6 text-white">
                {linesOf(openMemory.content)[0]}
              </p>
              {linesOf(openMemory.content).length > 1 ? (
                <>
                  <p className="mt-5 text-sm text-[#8b8b93]">Details</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-6 text-[#d4d4d8]">
                    {linesOf(openMemory.content).slice(1).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="text-sm text-[#a1a1aa]">{openMemory.title}</span>
                {canEditOpen ? (
                  <Switch
                    checked={openMemory.enabled}
                    disabled={busyId === openMemory.id}
                    onCheckedChange={(checked) =>
                      void toggleEnabled(openMemory, checked)
                    }
                    aria-label={`Use ${openMemory.title} in chats`}
                  />
                ) : null}
              </div>
              {canEditOpen ? (
                <form
                  className="mt-5 flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void applyChange(openMemory);
                  }}
                >
                  <input
                    value={changeText}
                    onChange={(event) => setChangeText(event.target.value)}
                    placeholder="Describe what you want to change"
                    aria-label="Describe what you want to change"
                    maxLength={4000}
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#6b6b73]"
                  />
                  <button
                    type="submit"
                    aria-label="Save change"
                    disabled={busyId === openMemory.id || changeText.trim() === ''}
                    className="text-[#a1a1aa] hover:text-white disabled:opacity-40"
                  >
                    <SparklesIcon className="size-4" />
                  </button>
                </form>
              ) : null}
              {canEditOpen ? (
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    className="text-[#a1a1aa] hover:bg-white/5 hover:text-white"
                    onClick={() => openEditor(openMemory)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteTarget(openMemory)}
                  >
                    Delete
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saving) setDialogOpen(open);
        }}
      >
        <DialogContent className="border-shell-line bg-[#161616] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit memory' : 'Add memory'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="memory-title">Title</Label>
              <Input
                id="memory-title"
                value={title}
                maxLength={100}
                onChange={(event) => setTitle(event.target.value)}
                className="border-white/10 bg-white/[0.03]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="memory-content">What to remember</Label>
              <Textarea
                id="memory-content"
                value={content}
                maxLength={4000}
                rows={5}
                onChange={(event) => setContent(event.target.value)}
                className="border-white/10 bg-white/[0.03]"
              />
            </div>
            {isAdmin && !editing ? (
              <div className="grid gap-2">
                <Label htmlFor="memory-scope">Who can use it</Label>
                <Select
                  value={scope}
                  onValueChange={(value) => setScope(value as Scope)}
                >
                  <SelectTrigger id="memory-scope" className="border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">Only me</SelectItem>
                    <SelectItem value="ORGANIZATION">
                      Everyone in the organization
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-[#a1a1aa] hover:bg-white/5 hover:text-white"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void saveMemory()}
              disabled={saving}
              className="bg-white text-[#111111] hover:bg-white/90"
            >
              {saving ? 'Saving…' : 'Save memory'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && busyId === null) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete memory?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.title}” will be permanently removed and will no longer be used in chats.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyId !== null || !deleteTarget}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) void deleteMemory(deleteTarget);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MemorySection({
  heading,
  memories,
  canAdd,
  onAdd,
  onOpen,
}: {
  heading: string;
  memories: MemoryItem[];
  canAdd: boolean;
  onAdd: () => void;
  onOpen: (memory: MemoryItem) => void;
}) {
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-2">
        <h2 className="text-[20px] font-medium text-white">{heading}</h2>
        {canAdd ? (
          <Button
            variant="ghost"
            className="text-[#a1a1aa] hover:bg-white/5 hover:text-white"
            onClick={onAdd}
          >
            Add memory
          </Button>
        ) : null}
      </div>
      <div className="max-w-full overflow-x-auto rounded-xl bg-white/[0.04]">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="text-[#8b8b93]">
            <tr>
              <th className="px-4 py-3 font-medium">Profile Name</th>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Updated date</th>
              <th className="px-4 py-3">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {memories.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-[#a1a1aa]">
                  No memories yet
                </td>
              </tr>
            ) : (
              memories.map((memory) => (
                <tr key={memory.id} className="border-t border-white/10">
                  <td className="overflow-hidden px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2 text-white">
                      <FileTextIcon className="size-4 shrink-0 text-[#a1a1aa]" />
                      <span className="truncate">{memory.title}</span>
                    </div>
                  </td>
                  <td className="overflow-hidden px-4 py-3 text-[#d4d4d8]">
                    <span className="block truncate">{linesOf(memory.content)[0]}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#d4d4d8]">
                    <time dateTime={memory.updatedAt}>
                      {formatTableDate(memory.updatedAt)}
                    </time>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      aria-label={`Open ${memory.title}`}
                      onClick={() => onOpen(memory)}
                      className="text-[#a1a1aa] hover:text-white"
                    >
                      <ExternalLinkIcon className="size-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
