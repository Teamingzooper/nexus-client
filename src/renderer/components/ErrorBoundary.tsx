import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[nexus] renderer error boundary caught', error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="error-panel">
            <h2>Something went wrong</h2>
            <pre>{this.state.error.message}</pre>
            <button onClick={this.reset}>Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
