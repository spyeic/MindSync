import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Adapted from the shadcn/ui Input.
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn('input w-full min-w-0', className)} {...props} />;
}
