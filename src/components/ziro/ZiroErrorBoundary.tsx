import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onReset?: () => void
}

interface State {
  hasError: boolean
}

/**
 * Isolates Ziro UI failures from the rest of the CRM shell.
 */
export class ZiroErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Ziro] Panel error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: 'min(420px, 100vw)',
            height: '100vh',
            zIndex: 9998,
            background: '#0a0a12',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 16,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>Ziro hit a problem</div>
          <p style={{ fontSize: 13, color: '#8080A8', lineHeight: 1.5, margin: 0 }}>
            The assistant panel crashed. Your CRM is fine — close this panel and keep working. You can try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false })
              this.props.onReset?.()
            }}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(212,34,106,0.15)',
              color: '#E0E0F4',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reset Ziro
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
