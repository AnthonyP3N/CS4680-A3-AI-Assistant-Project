import { cn } from '@/lib/utils';

function Card({ className, ...props }) {
  return <div data-slot="card" className={cn('flex flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs', className)} {...props} />;
}

function CardHeader({ className, ...props }) {
  return <div data-slot="card-header" className={cn('flex flex-wrap items-center justify-between gap-2', className)} {...props} />;
}

function CardTitle({ className, as: Tag = 'h2', ...props }) {
  return <Tag data-slot="card-title" className={cn('text-lg font-bold leading-tight', className)} {...props} />;
}

function CardDescription({ className, ...props }) {
  return <p data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

function CardContent({ className, ...props }) {
  return <div data-slot="card-content" className={cn('flex flex-col gap-3', className)} {...props} />;
}

function CardFooter({ className, ...props }) {
  return <div data-slot="card-footer" className={cn('flex flex-wrap items-center gap-2', className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
