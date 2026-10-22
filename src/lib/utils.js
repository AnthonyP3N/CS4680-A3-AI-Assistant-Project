import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui's class helper: merges Tailwind classes so later ones win. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
