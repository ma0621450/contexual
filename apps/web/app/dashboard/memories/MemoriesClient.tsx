'use client';

import { useState } from 'react';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import type { MemoryItem } from '@/lib/api/server';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  initialMemories: MemoryItem[];
  isAdmin: boolean;
};

export function MemoriesClient({ initialMemories, isAdmin }: Props) {
  const [memories, setMemories] = useState(initialMemories);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [scope, setScope] = useState<'USER' | 'ORGANIZATION'>('USER');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  function resetForm() {
    setTitle('');
    setContent('');
    setScope('USER');
    setEditingId(null);
  }

  function edit(memory: MemoryItem) {
    setEditingId(memory.id);
    setTitle(memory.title);
    setContent(memory.content);
    setScope(memory.scope);
    setError('');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !title.trim() || !content.trim()) return;
    setPending(true);
    setError('');

    const result = editingId
      ? await apiFetch<MemoryItem>(`/memories/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ title, content }),
        })
      : await apiFetch<MemoryItem>('/memories', {
          method: 'POST',
          body: JSON.stringify({ title, content, scope }),
        });

    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    setMemories((previous) =>
      editingId
        ? previous.map((item) => (item.id === editingId ? result.data : item))
        : [result.data, ...previous],
    );
    resetForm();
    setPending(false);
  }

  async function toggle(memory: MemoryItem) {
    const result = await apiFetch<MemoryItem>(`/memories/${memory.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !memory.enabled }),
    });
    if (result.ok) {
      setMemories((previous) =>
        previous.map((item) => (item.id === memory.id ? result.data : item)),
      );
    } else {
      setError(result.error);
    }
  }

  async function remove(memory: MemoryItem) {
    if (!window.confirm(`Delete “${memory.title}”?`)) return;
    const result = await apiFetch<{ ok: true }>(`/memories/${memory.id}`, {
      method: 'DELETE',
    });
    if (result.ok) {
      setMemories((previous) =>
        previous.filter((item) => item.id !== memory.id),
      );
      if (editingId === memory.id) resetForm();
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[2fr_3fr]">
      <section>
        <h2 className="text-xl font-semibold tracking-tight">Memories</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review exactly what Contexual can include in future chats.
        </p>

        <Card className="mt-6">
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Memory title"
                maxLength={100}
              />
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="What should the assistant remember?"
                maxLength={4000}
                rows={6}
                className="resize-y"
              />
              {!editingId ? (
                <Select
                  value={scope}
                  onValueChange={(value) =>
                    setScope(value as 'USER' | 'ORGANIZATION')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">Only me</SelectItem>
                    {isAdmin ? (
                      <SelectItem value="ORGANIZATION">
                        Everyone in this organization
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              ) : null}
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending
                    ? 'Saving…'
                    : editingId
                      ? 'Save changes'
                      : 'Add memory'}
                </Button>
                {editingId ? (
                  <Button type="button" variant="ghost" onClick={resetForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        {memories.length === 0 ? (
          <Card className="py-0">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No saved memories yet.
            </CardContent>
          </Card>
        ) : (
          memories.map((memory) => (
            <Card key={memory.id} className="gap-0 py-5">
              <CardContent>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{memory.title}</h3>
                      <Badge variant="secondary">
                        {memory.scope === 'USER' ? 'Only me' : 'Organization'}
                      </Badge>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {memory.content}
                    </p>
                  </div>
                  <Switch
                    checked={memory.enabled}
                    onCheckedChange={() => toggle(memory)}
                    aria-label={`Use ${memory.title} in chats`}
                  />
                </div>
                <div className="mt-4 flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => edit(memory)}
                  >
                    <PencilIcon />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => remove(memory)}
                  >
                    <Trash2Icon />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
