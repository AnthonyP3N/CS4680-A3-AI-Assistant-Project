import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLinkIcon, LockIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator, Switch } from '@/components/ui/misc';
import { api } from '@/data/api';
import { clearAiSettings, getAiSettings, saveAiSettings, testConnection } from '@/data/backend';
import { PROVIDERS } from '@/lib/providers';
import { showError, useApp } from '@/state/app';
import { navigate } from '@/hooks/use-hash-route';
import { useConfirm } from '@/components/confirm';

export function downloadBackup(data, today) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `focusflow-backup-${today}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportData(today) {
  try {
    downloadBackup(await api('/api/export'), today);
    toast('Backup downloaded', { duration: 3500 });
  } catch (err) {
    showError(err.message);
  }
}

function Section({ id, title, description, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex flex-col gap-3 scroll-mt-4">
      <div>
        <h3 id={`${id}-h`} className="text-base font-bold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function SettingsDialog({ open, section, onOpenChange }) {
  const { boot, mutate, refresh } = useApp();
  const confirm = useConfirm();
  const [ai, setAi] = useState(getAiSettings);
  const [showKey, setShowKey] = useState(false);
  const [aiStatus, setAiStatus] = useState({ tone: '', text: '' });
  const [testing, setTesting] = useState(false);
  const [prefs, setPrefs] = useState(boot.preferences);
  const fileRef = useRef(null);
  const contentRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setAi(getAiSettings());
    setPrefs(boot.preferences);
    setAiStatus({ tone: '', text: '' });
    setShowKey(false);
    if (section) setTimeout(() => contentRef.current?.querySelector(`#settings-${section}`)?.scrollIntoView({ block: 'start' }), 60);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const provider = PROVIDERS[ai.provider] || PROVIDERS.gemini;
  const savedKey = getAiSettings().key;

  const onTest = async () => {
    if (!ai.key.trim()) { setAiStatus({ tone: 'error', text: 'Paste an API key first.' }); return; }
    setTesting(true);
    setAiStatus({ tone: '', text: 'Testing…' });
    try {
      const r = await testConnection(ai);
      setAiStatus({ tone: 'ok', text: `Connected to ${r.label} (${r.model}). Save to use it.` });
    } catch (err) {
      setAiStatus({ tone: 'error', text: err.message });
    } finally {
      setTesting(false);
    }
  };

  const onRemoveKey = async () => {
    const ok = await confirm({ title: 'Remove your API key?', description: 'It is deleted from this browser. The coach switches to demo mode until you add a key again.', confirmLabel: 'Remove key', destructive: true });
    if (!ok) return;
    clearAiSettings();
    setAi(getAiSettings());
    await refresh();
    toast('API key removed from this browser', { duration: 3500 });
  };

  const onSave = async (e) => {
    e.preventDefault();
    try {
      if (ai.key.trim()) saveAiSettings(ai);
      else if (savedKey) clearAiSettings();
    } catch (err) {
      setAiStatus({ tone: 'error', text: err.message });
      contentRef.current?.querySelector('#settings-ai')?.scrollIntoView({ block: 'start' });
      return;
    }
    const body = {
      dayStart: prefs.dayStart,
      availableMinutes: Number(prefs.availableMinutes),
      breakEveryMinutes: Number(prefs.breakEveryMinutes),
      breakMinutes: Number(prefs.breakMinutes),
      reflectAfterSession: !!prefs.reflectAfterSession,
    };
    const ok = await mutate(() => api('/api/preferences', { method: 'PUT', body }), {
      success: ai.key.trim() ? `Settings saved. The coach uses ${provider.label}.` : 'Settings saved',
    });
    if (ok) onOpenChange(false);
  };

  const onImportFile = async (file) => {
    if (!file) return;
    let data;
    try {
      if (file.size > 4_000_000) throw new Error('That file is too large to be a FocusFlow backup.');
      data = JSON.parse(await file.text());
    } catch (err) {
      showError(err instanceof SyntaxError ? 'That file isn’t valid JSON. Choose a file made with “Export my data”.' : err.message);
      return;
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
    const ok = await confirm({ title: 'Replace everything with this backup?', description: 'Your current tasks, sessions and journal will be replaced. You can undo this right after.', confirmLabel: 'Replace with backup', destructive: true });
    if (!ok) return;
    const r = await mutate(() => api('/api/import', { method: 'POST', body: { data } }), {
      undo: true,
      success: (x) => `Imported ${x.tasks} tasks, ${x.sessions} sessions and ${x.journal} journal entries`,
    });
    if (r) onOpenChange(false);
  };

  const replaceData = async (kind) => {
    const sample = kind === 'sample';
    const ok = await confirm({
      title: sample ? 'Replace your data with a sample week?' : 'Delete all your data?',
      description: sample ? 'Two weeks of example tasks, sessions and journal entries replace what you have now.' : 'All tasks, sessions, journal entries and AI history are deleted from this browser. Your API key is kept.',
      confirmLabel: sample ? 'Replace with sample' : 'Delete everything',
      destructive: true,
    });
    if (!ok) return;
    const r = await mutate(() => api(sample ? '/api/demo/seed' : '/api/demo/reset', { method: 'POST' }), { undo: true, success: sample ? 'Sample week loaded' : 'All data deleted' });
    if (r) onOpenChange(false);
  };

  const setP = (k) => (e) => setPrefs((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={contentRef} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Everything here is saved in this browser only.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSave} className="flex flex-col gap-6">
          <Section id="settings-ai" title="AI coach" description="FocusFlow uses your own API key. Without one, the coach runs in demo mode with simple offline rules.">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ai-provider">Provider</Label>
              <Select value={ai.provider} onValueChange={(v) => { setAi((a) => ({ ...a, provider: v, key: v === getAiSettings().provider ? getAiSettings().key : '', model: '' })); setAiStatus({ tone: '', text: '' }); }}>
                <SelectTrigger id="ai-provider"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDERS).map(([id, p]) => <SelectItem key={id} value={id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ai-key">API key</Label>
              <div className="flex gap-2">
                <Input id="ai-key" type={showKey ? 'text' : 'password'} value={ai.key} onChange={(e) => setAi((a) => ({ ...a, key: e.target.value }))} autoComplete="off" spellCheck={false} placeholder="Paste your key" className="font-mono text-sm" aria-describedby="ai-key-help ai-status" />
                <Button type="button" variant="outline" onClick={() => setShowKey((s) => !s)} aria-pressed={showKey}>{showKey ? 'Hide' : 'Show'}</Button>
              </div>
              <p id="ai-key-help" className="text-sm">
                <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold underline underline-offset-2">Get a {provider.label} key<ExternalLinkIcon className="size-3.5" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a>
                <span className="text-muted-foreground"> {provider.keyHint}</span>
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ai-model">Model (optional)</Label>
              <Input id="ai-model" value={ai.model} onChange={(e) => setAi((a) => ({ ...a, model: e.target.value }))} placeholder={provider.defaultModel} autoComplete="off" spellCheck={false} />
            </div>
            <div className="flex gap-2.5 rounded-md bg-muted p-3 text-sm text-ink-2">
              <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>Your key is saved only in this browser and sent directly to the provider you chose. FocusFlow has no server, so nobody else can see it, and it is never included when you export your data. Usage is billed to your own account, so a free-tier key or one with a spending limit is a good idea. Don’t save a key on a shared computer.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={onTest} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</Button>
              {savedKey && <Button type="button" variant="outline" className="text-destructive" onClick={onRemoveKey}>Remove key</Button>}
              <Button type="button" variant="link" onClick={() => { onOpenChange(false); navigate('setup'); }}>Guided setup</Button>
            </div>
            <p id="ai-status" role="status" aria-live="polite" className={aiStatus.tone === 'ok' ? 'text-sm font-bold text-act-strong' : aiStatus.tone === 'error' ? 'text-sm font-bold text-destructive' : 'text-sm text-muted-foreground'}>{aiStatus.text}</p>
          </Section>

          <Separator />

          <Section id="settings-planning" title="Planning defaults" description="Used when the coach plans your day.">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2"><Label htmlFor="p-start">Usual start time</Label><Input id="p-start" type="time" required value={prefs.dayStart} onChange={setP('dayStart')} /></div>
              <div className="flex flex-col gap-2"><Label htmlFor="p-avail">Time per day (min)</Label><Input id="p-avail" type="number" min={15} max={960} step={15} required value={prefs.availableMinutes} onChange={setP('availableMinutes')} /></div>
              <div className="flex flex-col gap-2"><Label htmlFor="p-every">Break every (min)</Label><Input id="p-every" type="number" min={15} max={180} step={5} required value={prefs.breakEveryMinutes} onChange={setP('breakEveryMinutes')} /></div>
              <div className="flex flex-col gap-2"><Label htmlFor="p-break">Break length (min)</Label><Input id="p-break" type="number" min={0} max={60} step={5} required value={prefs.breakMinutes} onChange={setP('breakMinutes')} /></div>
            </div>
            <p className="text-sm text-muted-foreground">Time zone: {prefs.timezone}</p>
          </Section>

          <Separator />

          <Section id="settings-reflect" title="Reflection">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block font-bold">Ask me to reflect after every session</span>
                <span className="block text-sm text-muted-foreground">A quick energy check and an optional note when you stop the timer.</span>
              </span>
              <Switch checked={!!prefs.reflectAfterSession} onCheckedChange={(v) => setPrefs((p) => ({ ...p, reflectAfterSession: v }))} aria-label="Ask me to reflect after every session" />
            </label>
          </Section>

          <Separator />

          <Section id="settings-data" title="Your data" description={boot.persistent ? 'Everything is saved in this browser only. Export a backup now and then, and import it to move to another browser or computer.' : 'Your browser is blocking site storage, so data will be lost when you close this tab. Export a backup before you leave.'}>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => exportData(boot.today)}>Export my data</Button>
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>Import a backup</Button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImportFile(e.target.files?.[0])} />
            </div>
          </Section>

          <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4">
            <div>
              <h3 className="text-base font-bold">Start over</h3>
              <p className="text-sm text-muted-foreground">These replace everything. You can undo right after.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => replaceData('sample')}>Replace with sample week</Button>
              <Button type="button" variant="outline" className="text-destructive" onClick={() => replaceData('reset')}>Delete all data</Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Save settings</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
