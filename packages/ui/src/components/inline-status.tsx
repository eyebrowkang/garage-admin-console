import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils.js';

const inlineStatusVariants = cva('inline-flex items-center text-xs font-medium leading-none', {
  variants: {
    tone: {
      default: 'text-muted-foreground',
      success: 'text-success',
      warning: 'text-warning',
      destructive: 'text-destructive',
    },
  },
  defaultVariants: {
    tone: 'default',
  },
});

export interface InlineStatusProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof inlineStatusVariants> {}

const InlineStatus = React.forwardRef<HTMLSpanElement, InlineStatusProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(inlineStatusVariants({ tone }), className)} {...props} />
  ),
);
InlineStatus.displayName = 'InlineStatus';

export { InlineStatus, inlineStatusVariants };
