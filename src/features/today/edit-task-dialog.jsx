import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/data/api';
import { useApp } from '@/state/app';

export function EditTaskDialog({ task, onClose }) {
  const { boot, mutate } = useApp();
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (task) setForm({ title: task.title, category: task.category || '', priority: task.priority, dueDate: task.dueDate || '', estimateMinutes: task.estimateMinutes ?? '', notes: task.notes || '' });
  }, [task]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    const body = { ...form, dueDate: form.dueDate || null, estimateMinutes: form.estimateMinutes === '' ? null : Number(form.estimateMinutes) };
    const ok = await mutate(() => api(`/api/tasks/${task.id}`, { method: 'PATCH', body }), { undo: true, success: 'Changes saved' });
    if (ok) onClose();
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>Time you already tracked stays with the task.</DialogDescription>
        </DialogHeader>
        {form && (
          <form onSubmit={save} className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5"><Label htmlFor="et-title">Title</Label><Input id="et-title" required maxLength={120} value={form.title} onChange={set('title')} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="et-est">Estimate (min)</Label><Input id="et-est" type="number" min={5} max={1440} step={5} value={form.estimateMinutes} onChange={set('estimateMinutes')} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="et-due">Due</Label><Input id="et-due" type="date" value={form.dueDate} onChange={set('dueDate')} /></div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="et-prio">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger id="et-prio"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="medium">Normal</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="et-cat">Category</Label><Input id="et-cat" list="et-cats" maxLength={30} value={form.category} onChange={set('category')} /><datalist id="et-cats">{boot.categories.map((c) => <option key={c} value={c} />)}</datalist></div>
            <div className="col-span-2 flex flex-col gap-1.5"><Label htmlFor="et-notes">Notes</Label><Input id="et-notes" maxLength={1000} value={form.notes} onChange={set('notes')} /></div>
            <DialogFooter className="col-span-2 mt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
