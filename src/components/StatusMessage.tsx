interface StatusMessageProps {
  loading: boolean;
  error: string;
  hasTranslation: boolean;
  onRetry: () => void;
}

export function StatusMessage({ loading, error, hasTranslation, onRetry }: StatusMessageProps) {
  if (error) {
    return (
      <div className="status-message status-error" role="alert">
        <span aria-hidden="true">!</span>
        <span>{error}</span>
        <button type="button" onClick={onRetry}>Retry</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="status-message status-loading" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span>Translating…</span>
      </div>
    );
  }

  if (hasTranslation) {
    return (
      <div className="status-message status-ready" role="status" aria-live="polite">
        <span aria-hidden="true">✓</span>
        <span>Translation ready</span>
      </div>
    );
  }

  return <div className="status-placeholder" aria-hidden="true" />;
}
