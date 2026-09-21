// Top-level React Error Boundary with recovery UI.
//
// Catches an unexpected render failure anywhere in the wrapped application tree
// so it degrades to a recovery-oriented surface instead of leaving the root
// blank/unmounted. It is a presentation/resilience layer, not a security
// primitive: it never mutates persisted state, never clears user data, and never
// exposes raw exception/stack/secret material in its fallback.
//
// Recovery is conservative: a full reload is the primary action, plus a
// best-effort in-place reset for failures that are transient. Neither path
// rewrites the application; a reset simply re-renders the same children, which
// the boundary catches again if the failure is persistent (no automatic loop).
import { Component } from 'react';
import { projectDiagnosticTextStrict } from '../utils/project-diagnostic.js';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this.handleReset = this.handleReset.bind(this);
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // Log only the safely projected diagnostic message, never the raw stack or
    // error object, which may carry untrusted/sensitive material.
    console.error('Unexpected application render error:', projectDiagnosticTextStrict(error));
  }

  handleReset() {
    this.setState({ hasError: false });
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          textAlign: 'center',
          gap: '8px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Unexpected error</h1>
        <p style={{ margin: 0, maxWidth: '520px', opacity: 0.85 }}>
          The application hit an unexpected UI error and could not continue rendering.
        </p>
        <p style={{ margin: '0 0 12px', maxWidth: '520px', opacity: 0.85 }}>
          Reload to recover — your saved data has not been cleared.
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="btn-primary" onClick={this.handleReload}>
            Reload application
          </button>
          <button type="button" className="btn-secondary" onClick={this.handleReset}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
