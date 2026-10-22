import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

function Label({ className, ...props }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn('flex select-none items-center gap-2 text-sm font-bold leading-none text-ink-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50', className)}
      {...props}
    />
  );
}

export { Label };
