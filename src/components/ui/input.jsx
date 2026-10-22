import { cn } from '@/lib/utils';

function Input({ className, type = 'text', ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base text-foreground shadow-xs transition-[border-color] placeholder:text-muted-foreground hover:border-rule-strong disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
