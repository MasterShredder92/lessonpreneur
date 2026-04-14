import { useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthContext } from '../app/AuthContext'
import { ROLE_DEFAULT_ROUTES } from '../lib/constants'
import { ZW } from '../config/zwBrand'

export default function Login() {
  const { user, role, signIn, isLoading } = useAuthContext()
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!isLoading && user && role) {
    return <Navigate to={ROLE_DEFAULT_ROUTES[role]} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const email = emailRef.current?.value?.trim() ?? ''
    const password = passwordRef.current?.value ?? ''
    setError(null)
    setSubmitting(true)
    // Yield two frames so the browser can paint "Signing in…" before auth + route work (INP).
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })
    try {
      const { error: err } = await signIn(email, password)
      if (err) setError(err)
    } catch (err: any) {
      setError(err.message ?? 'Sign in failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/lp-logo.png?v=2" alt={ZW.productByline} style={{ width: 72, height: 72, borderRadius: 16, display: 'block', margin: '0 auto 8px' }} />
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#64748b', textTransform: 'uppercase' }}>{ZW.parent}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9', marginTop: 4 }}>{ZW.productByline}</div>
        </div>
        <p className="login-subtitle">Sign in to your account</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              ref={emailRef}
              id="email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              defaultValue=""
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              ref={passwordRef}
              id="password"
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              defaultValue=""
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn-primary login-btn" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
