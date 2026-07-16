// ---------------------------------------------------------------------------
// React Error Boundary — catches render crashes and reports them.
// ---------------------------------------------------------------------------
import { Component } from 'react';
import { reportReactError } from '../lib/errorTracker.js';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Something went wrong',
    };
  }

  componentDidCatch(error, info) {
    reportReactError(error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/25">
            <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">Something went wrong</h1>
            <p className="mt-1 max-w-md text-sm text-[var(--text-muted)]">
              This screen crashed. The error was reported so we can fix it.
            </p>
            {this.state.message && (
              <p className="mt-2 max-w-md truncate font-mono text-[10px] text-red-400/80">
                {this.state.message}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              className="rounded-full bg-[var(--bg-tertiary)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] ring-1 ring-[var(--border-primary)]"
            >
              Go home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
