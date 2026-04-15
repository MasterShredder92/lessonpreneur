import { memo, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthContext } from '../app/AuthContext'
import { ROLE_DEFAULT_ROUTES } from '../lib/constants'
import { ZW } from '../config/zwBrand'

/** Static chrome — skips reconcile when auth/session state updates above. */
const LoginBranding = memo(function LoginBranding() {
  return (
    <>
      <img
        className="login-brand-logo"
        src="/lp-logo.png?v=2"
        alt={ZW.productByline}
      />
      <div className="login-brand-stack">
        <div className="login-brand-kicker">{ZW.parent}</div>
        <div className="login-brand-title">{ZW.productByline}</div>
      </div>
    </>
  )
})

type SignInFn = (email: string, password: string) => Promise<{ error: string | null }>

const LoginForm = memo(function LoginForm({ signIn }: { signIn: SignInFn }) {
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign in failed. Please try again.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
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

        {error ? <div className="form-error">{error}</div> : null}

        <button type="submit" className="btn-primary login-btn" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </>
  )
})

export default function Login() {
  const { user, role, signIn, isLoading } = useAuthContext()

  if (!isLoading && user && role) {
    return <Navigate to={ROLE_DEFAULT_ROUTES[role]} replace />
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <LoginBranding />
        <LoginForm signIn={signIn} />
      </div>
    </div>
  )
}
