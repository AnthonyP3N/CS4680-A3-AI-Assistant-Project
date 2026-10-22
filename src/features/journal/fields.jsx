// Pieces shared by the journal list, the reader and the composer.

import { BatteryFullIcon, BatteryLowIcon, BatteryMediumIcon, CheckIcon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/misc';
import { localDateOf } from '@/lib/format';
import { ENERGY_OPTIONS, TAG_OPTIONS, energyLabel, tagLabel } from '@/lib/journal-meta';
import { cn } from '@/lib/utils';

const ENERGY_ICONS = { low: BatteryLowIcon, ok: BatteryMediumIcon, high: BatteryFullIcon };

export function EnergyChip({ energy, className }) {
  if (!energy) return null;
  const Icon = ENERGY_ICONS[energy];
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
      <Icon aria-hidden="true" className="size-3.5" />{energyLabel(energy)}
    </span>
  );
}

export function TagChip({ tag, className }) {
  const win = tag === 'win';
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs font-bold', win ? 'border-transparent bg-act-soft text-act-strong' : 'border-border bg-muted text-ink-2', className)}>
      {win && <CheckIcon aria-hidden="true" className="size-3" strokeWidth={3} />}{tagLabel(tag)}
    </span>
  );
}

/** Segmented Low / OK / High. Click the chosen one again to clear it. */
export function EnergyField({ id, value, onChange, className }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span id={id} className="text-sm font-bold text-ink-2">Energy</span>
      <ToggleGroup type="single" value={value || ''} onValueChange={(v) => onChange(v || '')} aria-labelledby={id} className="grid w-full grid-cols-3">
        {ENERGY_OPTIONS.map(([v, l]) => <ToggleGroupItem key={v} value={v}>{l}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  );
}

export function TagsField({ id, value, onChange, className }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span id={id} className="text-sm font-bold text-ink-2">Tags <span className="font-normal text-muted-foreground">(optional)</span></span>
      <ToggleGroup type="multiple" value={value} onValueChange={onChange} aria-labelledby={id} className="flex-wrap gap-1.5 border-0 bg-transparent p-0">
        {TAG_OPTIONS.map(([v, l]) => (
          <ToggleGroupItem key={v} value={v} className="h-8 rounded-md border border-border bg-card px-2.5 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-none">{l}</ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export function Highlighted({ text, query }) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const out = [];
  let last = 0;
  let i = lower.indexOf(q);
  while (i !== -1) {
    if (i > last) out.push(text.slice(last, i));
    out.push(<mark key={i} className="rounded-sm bg-hl px-px text-[#1d2b3a]">{text.slice(i, i + q.length)}</mark>);
    last = i + q.length;
    i = lower.indexOf(q, last);
  }
  out.push(text.slice(last));
  return out;
}

/** A short excerpt around the first match, instead of the start of a long entry. */
export function excerptAround(body, query, radius = 70) {
  const i = query ? body.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return body.replace(/\s*\n+\s*/g, ' ');
  let a = Math.max(0, i - radius);
  if (a > 0) a = body.indexOf(' ', a) + 1 || a;
  return `${a > 0 ? '…' : ''}${body.slice(a).replace(/\s*\n+\s*/g, ' ')}`;
}

/** Focus sessions on the entry's task, on the day it was written. */
export function sessionsFor(entry, boot) {
  if (!entry.taskId) return null;
  const tz = boot.preferences.timezone;
  const day = localDateOf(entry.createdAt, tz);
  const list = boot.recentSessions.filter((s) => s.taskId === entry.taskId && s.endedAt && localDateOf(s.endedAt, tz) === day);
  if (!list.length) return null;
  return { count: list.length, minutes: Math.round(list.reduce((a, s) => a + (s.durationSeconds || 0), 0) / 60) };
}
