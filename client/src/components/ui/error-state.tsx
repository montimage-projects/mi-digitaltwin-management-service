import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  error?: Error | string | null;
  onRetry?: () => void;
  className?: string;
}

/**
 * Shared error state component — renders an error message with optional retry.
 * Distinct from empty-state: shows an icon and actionable retry button.
 */
export function ErrorState({ error, onRetry, className = '' }: ErrorStateProps) {
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : 'An unexpected error occurred';

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 p-8 text-center ${className}`}
    >
      <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
      <p className="mb-3 text-sm font-medium text-destructive">Something went wrong</p>
      <p className="mb-4 max-w-md text-xs text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}
