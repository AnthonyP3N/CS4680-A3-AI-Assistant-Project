import { Command as CommandPrimitive } from 'cmdk';
import { SearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';

function Command({ className, ...props }) {
  return <CommandPrimitive data-slot="command" className={cn('flex h-full w-full flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground', className)} {...props} />;
}

function CommandDialog({ title = 'Command palette', description = 'Search for a task or an action', children, ...props }) {
  return (
    <Dialog {...props}>
      <DialogContent className="top-[20%] translate-y-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Command className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:text-muted-foreground">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({ className, ...props }) {
  return (
    <div data-slot="command-input-wrapper" className="flex h-12 items-center gap-2 border-b border-border px-3">
      <SearchIcon className="size-4 shrink-0 opacity-60" />
      <CommandPrimitive.Input data-slot="command-input" className={cn('flex h-10 w-full bg-transparent py-3 text-base outline-hidden placeholder:text-muted-foreground', className)} {...props} />
    </div>
  );
}

function CommandList({ className, ...props }) {
  return <CommandPrimitive.List data-slot="command-list" className={cn('max-h-[360px] scroll-py-1 overflow-y-auto overflow-x-hidden p-1', className)} {...props} />;
}
function CommandEmpty(props) {
  return <CommandPrimitive.Empty data-slot="command-empty" className="py-6 text-center text-sm text-muted-foreground" {...props} />;
}
function CommandGroup({ className, ...props }) {
  return <CommandPrimitive.Group data-slot="command-group" className={cn('overflow-hidden', className)} {...props} />;
}
function CommandItem({ className, ...props }) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn("relative flex min-h-10 cursor-default select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-hidden data-[selected=true]:bg-accent data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    />
  );
}
function CommandShortcut({ className, ...props }) {
  return <span data-slot="command-shortcut" className={cn('ml-auto text-xs text-muted-foreground', className)} {...props} />;
}

export { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut };
