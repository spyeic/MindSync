import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Adapted from the shadcn/ui Button. All usages are native buttons or anchors.
export const buttonVariants = cva('button inline-flex items-center justify-center gap-2 font-semibold', {
  variants: {
    variant: { default: 'button-primary', outline: 'button-outline', ghost: 'button-ghost', subtle: 'button-subtle' },
    size: { default: 'button-normal', icon: 'button-icon', small: 'button-small' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export function Button({ className, variant, size, type = 'button', ...props }:
ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button data-slot="button" type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
