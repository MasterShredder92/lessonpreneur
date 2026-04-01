import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '32px',
          background: '#050508',
          color: '#fff',
          fontFamily: 'monospace',
          minHeight: '100vh',
        }}>
          <h1 style={{ color: '#ef4444', marginBottom: '16px' }}>React Error</h1>
          <pre style={{
            background: '#1a1a2e',
            padding: '16px',
            borderRadius: '8px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            fontSize: '13px',
            color: '#f0f0f0',
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/login'; }}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#D4226A',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Go to Login
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
