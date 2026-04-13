import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthContext } from '../app/AuthContext'
import { ROLE_DEFAULT_ROUTES } from '../lib/constants'
import { ZW } from '../config/zwBrand'

export default function Login() {
  const { user, role, signIn, isLoading } = useAuthContext()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!isLoading && user && role) {
    return <Navigate to={ROLE_DEFAULT_ROUTES[role]} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
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
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
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
