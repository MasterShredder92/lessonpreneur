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

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, error?.message, error?.stack)
    console.error('[ErrorBoundary] Component stack:', info.componentStack)
    console.error('[ErrorBoundary] URL:', window.location.pathname + window.location.search)
  }

  render() {
    if (this.state.hasError) {
      const err = this.state.error
      const message = err?.message?.trim() || 'Unknown error'
      const stack = err?.stack ?? ''

      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#08080c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          <div style={{ textAlign: 'center', padding: 40, maxWidth: 520 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#9888;&#65039;</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4', margin: '0 0 8px' }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: '#8080A8', lineHeight: 1.6, marginBottom: 16 }}>
              An unexpected error occurred. Your data is safe — reload the page to continue.
            </p>
            <p
              style={{
                fontSize: 12,
                color: '#FCA5A5',
                lineHeight: 1.5,
                marginBottom: 20,
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.22)',
                textAlign: 'left',
                fontFamily: 'ui-monospace, monospace',
                wordBreak: 'break-word',
              }}
            >
              {message}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  background: '#f59e0b',
                  color: '#000',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 12px rgba(245,158,11,0.3)',
                }}
              >
                Reload Page
              </button>
            </div>
            {stack ? (
              <pre
                style={{
                  marginTop: 8,
                  padding: 16,
                  borderRadius: 8,
                  textAlign: 'left',
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  fontSize: 11,
                  color: '#EF4444',
                  overflow: 'auto',
                  maxHeight: 240,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {stack}
              </pre>
            ) : null}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
