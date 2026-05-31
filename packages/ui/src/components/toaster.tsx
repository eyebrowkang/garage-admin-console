import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './toast';

const variantIcon = {
  default: { Icon: Info, className: 'text-primary' },
  success: { Icon: CheckCircle2, className: 'text-[hsl(var(--success))]' },
  warning: { Icon: AlertTriangle, className: 'text-[hsl(var(--warning))]' },
  destructive: { Icon: AlertCircle, className: 'text-destructive' },
} as const;

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const { Icon, className } = variantIcon[variant ?? 'default'] ?? variantIcon.default;
        return (
          <Toast key={id} variant={variant} {...props}>
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} aria-hidden="true" />
            <div className="grid flex-1 gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
