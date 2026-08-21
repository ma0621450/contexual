'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ChatShareDialog({
  open,
  expiry,
  onOpenChange,
  onExpiryChange,
  onCopy,
}: {
  open: boolean;
  expiry: '1h' | '24h' | '7d' | 'never';
  onOpenChange: (open: boolean) => void;
  onExpiryChange: (value: '1h' | '24h' | '7d' | 'never') => void;
  onCopy: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share conversation</DialogTitle>
          <DialogDescription>
            Anyone with the link can view a read-only copy. No login required.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Link expires
          </label>
          <Select
            value={expiry}
            onValueChange={(value) =>
              onExpiryChange(value as '1h' | '24h' | '7d' | 'never')
            }
          >
            <SelectTrigger aria-label="Share expiry">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="never">Never</SelectItem>
              <SelectItem value="1h">In 1 hour</SelectItem>
              <SelectItem value="24h">In 24 hours</SelectItem>
              <SelectItem value="7d">In 7 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onCopy}>
            Copy public link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
