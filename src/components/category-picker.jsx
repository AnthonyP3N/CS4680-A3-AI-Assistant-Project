// Category combobox (shadcn Popover + Command): pick a built-in category,
// one of your own, or type a new name and create it.

import { useMemo, useState } from 'react';
import {
  BookOpenIcon, BriefcaseIcon, CheckIcon, ChevronsUpDownIcon, DumbbellIcon, HeartPulseIcon,
  HouseIcon, NotebookPenIcon, PiggyBankIcon, PlusIcon, ReceiptIcon, ShoppingBagIcon, TagIcon,
  UserIcon, UsersIcon, CircleEllipsisIcon,
} from 'lucide-react';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/misc';
import { CATEGORY_MAX_CHARS, categoryOptions, cleanCategory } from '@/lib/categories';
import { cn } from '@/lib/utils';
import { useApp } from '@/state/app';

const ICONS = {
  studying: BookOpenIcon,
  homework: NotebookPenIcon,
  work: BriefcaseIcon,
  exercise: DumbbellIcon,
  health: HeartPulseIcon,
  personal: UserIcon,
  errands: ShoppingBagIcon,
  chores: HouseIcon,
  bills: ReceiptIcon,
  finances: PiggyBankIcon,
  social: UsersIcon,
  other: CircleEllipsisIcon,
};

export function CategoryIcon({ name, className }) {
  const Icon = ICONS[String(name || '').toLowerCase()] || TagIcon;
  return <Icon aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground', className)} />;
}

const groupHeading = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:text-muted-foreground';

/**
 * Props: id (for the label), value, onChange(name), className.
 * Shows the built-in list and the user's own categories; typing a name that
 * doesn't exist offers "Create".
 */
export function CategoryPicker({ id, value, onChange, className }) {
  const { boot } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { suggested, custom } = useMemo(() => categoryOptions(boot.categories, boot.tasks), [boot.categories, boot.tasks]);

  // A just-typed category that hasn't been saved yet still shows as chosen.
  const all = [...suggested, ...custom];
  const yours = value && !all.some((c) => c.toLowerCase() === value.toLowerCase()) ? [...custom, value] : custom;

  const typed = cleanCategory(query);
  const exists = typed && [...all, ...yours].some((c) => c.toLowerCase() === typed.toLowerCase());
  const tooLong = query.trim().length > CATEGORY_MAX_CHARS;

  // We filter ourselves (prefix matches first) so "Create" always comes last.
  const q = query.trim().toLowerCase();
  const filter = (list) => {
    if (!q) return list;
    const starts = list.filter((c) => c.toLowerCase().startsWith(q));
    const contains = list.filter((c) => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q));
    return [...starts, ...contains];
  };
  const shownSuggested = filter(suggested);
  const shownYours = filter(yours);
  const showCreate = typed && !exists && !tooLong;

  const choose = (name) => {
    onChange(name);
    setOpen(false);
    setQuery('');
  };

  const item = (name) => {
    const selected = value?.toLowerCase() === name.toLowerCase();
    return (
      <CommandItem key={name} value={name} onSelect={() => choose(name)} aria-selected={selected}>
        <CategoryIcon name={name} />
        <span className="flex-1 truncate">{name}</span>
        <CheckIcon aria-hidden="true" className={cn('size-4 text-act-strong', selected ? 'opacity-100' : 'opacity-0')} />
      </CommandItem>
    );
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }} modal>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            'flex h-10 w-full items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-base shadow-xs outline-none',
            'hover:border-rule-strong focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40',
            className,
          )}
        >
          <CategoryIcon name={value} />
          <span className={cn('flex-1 truncate', !value && 'text-muted-foreground')}>{value || 'Choose a category'}</span>
          <ChevronsUpDownIcon aria-hidden="true" className="size-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(18rem,calc(100vw-2rem))] p-0" align="start">
        <Command className={groupHeading} loop shouldFilter={false}>
          <CommandInput
            placeholder="Search or type a new one"
            value={query}
            onValueChange={setQuery}
            maxLength={CATEGORY_MAX_CHARS + 10}
          />
          <CommandList className="max-h-72">
            {tooLong && <p className="px-3 py-4 text-sm text-destructive">Keep it to {CATEGORY_MAX_CHARS} characters.</p>}
            {shownSuggested.length > 0 && <CommandGroup heading="Categories">{shownSuggested.map(item)}</CommandGroup>}
            {shownYours.length > 0 && <CommandGroup heading="Yours">{shownYours.map(item)}</CommandGroup>}
            {showCreate && (
              <CommandGroup heading="New">
                <CommandItem value={`__create__ ${typed}`} onSelect={() => choose(typed)}>
                  <PlusIcon aria-hidden="true" className="size-4 text-act-strong" />
                  <span>Create “<strong>{typed}</strong>”</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
