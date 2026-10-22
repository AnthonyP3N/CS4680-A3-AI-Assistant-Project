// The quick check-in after a focus session: one tap for energy, optional
// tags and one line. Takes under 10 seconds, and can be skipped or turned off.

import { useEffect, useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch, ToggleGroup, ToggleGroupItem } from '@/components/ui/misc';
import { api } from '@/data/api';
import { fmtMinutes } from '@/lib/format';
import { ENERGY_OPTIONS, TAG_OPTIONS } from '@/lib/journal-meta';
import { taskById, useApp } from '@/state/app';

export function ReflectSheet({ session, onClose }) {
  const { boot, mutate } = useApp();
  const [energy, setEnergy] = useState('');
  const [tags, setTags] = useState([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (session) { setEnergy(''); setTags([]); setNote(''); }
  }, [session]);

  const task = session ? taskById(boot, session.taskId) : null;
  const minutes = session ? session.durationSeconds / 60 : 0;
  const canSave = !!(energy || tags.length || note.trim());

  const save = async () => {
    const ok = await mutate(() => api('/api/journal', {
      method: 'POST',
      body: { body: note, energy: energy || null, tags, taskId: session.taskId, sessionId: session.id },
    }), { success: 'Reflection saved', undo: true });
    if (ok) onClose();
  };

  const setAsk = (v) => mutate(() => api('/api/preferences', { method: 'PUT', body: { reflectAfterSession: v } }), {
    success: v ? 'FocusFlow will ask after each session' : 'Turned off. Turn it back on in Settings.',
  });

  return (
    <Sheet open={!!session} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="gap-5">
        {session && (
          <>
            <SheetHeader className="flex-row items-center gap-3">
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-act-soft text-act-strong"><CheckIcon className="size-5" strokeWidth={3} /></span>
              <div>
                <SheetTitle>Saved {fmtMinutes(minutes)}</SheetTitle>
                <SheetDescription>
                  {session.taskTitleSnapshot}
                  {task?.estimateMinutes ? `: ${fmtMinutes(task.actualMinutes)} of ${fmtMinutes(task.estimateMinutes)} tracked so far` : ''}
                </SheetDescription>
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-2">
              <span id="rs-energy" className="font-bold">How was your energy?</span>
              <ToggleGroup type="single" value={energy} onValueChange={setEnergy} aria-labelledby="rs-energy" className="grid w-full grid-cols-3">
                {ENERGY_OPTIONS.map(([v, l]) => <ToggleGroupItem key={v} value={v} className="h-11">{l}</ToggleGroupItem>)}
              </ToggleGroup>
            </div>

            <div className="flex flex-col gap-2">
              <span id="rs-tags" className="font-bold">Anything happen? <span className="font-normal text-muted-foreground">Optional</span></span>
              <ToggleGroup type="multiple" value={tags} onValueChange={setTags} aria-labelledby="rs-tags" className="border-0 bg-transparent p-0 gap-2">
                {TAG_OPTIONS.map(([v, l]) => (
                  <ToggleGroupItem key={v} value={v} className="h-11 rounded-full border border-border bg-card px-4 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{l}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="rs-note" className="text-base text-foreground">One line about it <span className="font-normal text-muted-foreground">Optional</span></Label>
              <Input id="rs-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="What took longer than expected?" className="h-12" onKeyDown={(e) => { if (e.key === 'Enter' && canSave) save(); }} />
            </div>

            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <Button variant="outline" size="lg" className="h-12" onClick={onClose}>Skip</Button>
              <Button size="lg" className="h-12" onClick={save} disabled={!canSave}>Save reflection</Button>
            </div>

            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-2">
              <Switch checked={boot.preferences.reflectAfterSession !== false} onCheckedChange={setAsk} />
              Ask me after every session
            </label>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
