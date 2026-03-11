import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@garage-admin/ui';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  resetKey?: string | number | boolean | null;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary for Module Federation remote components.
 * Shows a user-friendly message when the S3 Browser remote is unavailable
 * (e.g. standalone admin deployment without S3 Browser).
 */
export class MFErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('Module Federation component failed to load:', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <Alert>
            <AlertTitle>S3 Browser not available</AlertTitle>
            <AlertDescription>
              The S3 Browser module could not be loaded. Bucket management still works here, and
              embedded object browsing requires a reachable S3 Browser deployment.
            </AlertDescription>
          </Alert>
        )
      );
    }
    return this.props.children;
  }
}
