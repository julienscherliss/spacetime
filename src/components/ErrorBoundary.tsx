import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * App-level error boundary. Prevents white-screen crashes by rendering a
 * minimal, on-brand fallback that lets the user reload without losing the
 * tab. Errors are logged to the console (and can be shipped to a future
 * crash-reporting endpoint from the same hook).
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Centralized logging hook — wire to crash-reporting edge fn later.
    // Keep it console-only for now to avoid feedback loops if the reporter
    // itself is what crashed.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  private handleReload = () => {
    this.setState({ error: null });
    // Hard reload as a last resort so any wedged state is cleared.
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm w-full border border-border/50 rounded-sm bg-card/40 p-6">
          <div className="text-[10px] font-mono tracking-[0.18em] text-muted-foreground/60 mb-2">
            UNEXPECTED ERROR
          </div>
          <div className="text-[14px] font-display text-foreground mb-4">
            Something went wrong. Your data is safe.
          </div>
          <div className="text-[11px] font-mono text-muted-foreground/60 mb-5 break-words">
            {this.state.error.message || 'An unexpected error occurred.'}
          </div>
          <button
            onClick={this.handleReload}
            className="w-full px-3 py-2 rounded-sm bg-primary text-primary-foreground text-[11px] font-mono tracking-[0.15em] hover:bg-primary/90 transition-colors"
          >
            RELOAD
          </button>
        </div>
      </div>
    );
  }
}