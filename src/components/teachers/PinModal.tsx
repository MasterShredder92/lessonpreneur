import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { X } from 'lucide-react'

interface Props {
  profileId: string
  onSuccess: () => void
  onClose: () => void
}

const LOCKOUT_KEY = 'w9_pin_lockout'
const ATTEMPTS_KEY = 'w9_pin_attempts'
const LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin + 'LP_W9_SALT')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function PinModal({ profileId, onSuccess, onClose }: Props) {
  const [digits, setDigits] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [mode, setMode] = useState<'enter' | 'set' | 'confirm'>('enter')
  const [newPin, setNewPin] = useState('')
  const [checking, setChecking] = useState(true)
  const [lockUntil, setLockUntil] = useState(0)
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]

  // Check lockout
  useEffect(() => {
    const lock = parseInt(localStorage.getItem(LOCKOUT_KEY) ?? '0')
    if (lock > Date.now()) {
      setLockUntil(lock)
      const interval = setInterval(() => {
        if (Date.now() >= lock) { setLockUntil(0); localStorage.removeItem(LOCKOUT_KEY); localStorage.removeItem(ATTEMPTS_KEY); clearInterval(interval) }
        else setLockUntil(lock) // force re-render
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [])

  // Check if PIN exists
  useEffect(() => {
    let cancelled = false
    supabase.from('profiles').select('export_pin').eq('id', profileId).single().then(({ data }) => {
      if (cancelled) return
      setMode(data?.export_pin ? 'enter' : 'set')
      setChecking(false)
    })
    return () => { cancelled = true }
  }, [profileId])

  useEffect(() => { if (!checking) refs[0].current?.focus() }, [checking, mode])

  function handleDigit(index: number, value: string) {
    if (!/^\d?$/.test(value)) return
    const next = [...digits]
    next[index] = value
    setDigits(next)
    setError('')
    if (value && index < 3) refs[index + 1].current?.focus()
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      refs[index - 1].current?.focus()
    }
  }

  const pin = digits.join('')
  const allFilled = pin.length === 4

  async function handleConfirm() {
    if (!allFilled) return

    if (mode === 'set') {
      setNewPin(pin)
      setDigits(['', '', '', ''])
      setMode('confirm')
      setTimeout(() => refs[0].current?.focus(), 50)
      return
    }

    if (mode === 'confirm') {
      if (pin !== newPin) {
        setShake(true); setError('PINs do not match'); setTimeout(() => setShake(false), 500)
        setDigits(['', '', '', '']); setTimeout(() => refs[0].current?.focus(), 50)
        return
      }
      // Save new PIN
      const hashed = await hashPin(pin)
      await supabase.from('profiles').update({ export_pin: hashed }).eq('id', profileId)
      onSuccess()
      return
    }

    // mode === 'enter' — verify PIN
    const attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) ?? '0')
    if (attempts >= 5) {
      const until = Date.now() + LOCKOUT_MS
      localStorage.setItem(LOCKOUT_KEY, String(until))
      setLockUntil(until)
      return
    }

    const hashed = await hashPin(pin)
    const { data } = await supabase.from('profiles').select('export_pin').eq('id', profileId).single()

    if (data?.export_pin === hashed) {
      localStorage.removeItem(ATTEMPTS_KEY)
      onSuccess()
    } else {
      localStorage.setItem(ATTEMPTS_KEY, String(attempts + 1))
      setShake(true); setError(`Incorrect PIN (${4 - attempts} attempts remaining)`)
      setTimeout(() => setShake(false), 500)
      setDigits(['', '', '', ''])
      setTimeout(() => refs[0].current?.focus(), 50)
      if (attempts + 1 >= 5) {
        const until = Date.now() + LOCKOUT_MS
        localStorage.setItem(LOCKOUT_KEY, String(until))
        setLockUntil(until)
      }
    }
  }

  if (checking) return null

  const isLocked = lockUntil > Date.now()
  const remainingSec = isLocked ? Math.ceil((lockUntil - Date.now()) / 1000) : 0
  const remainingMin = Math.ceil(remainingSec / 60)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{
        width: 340, background: 'rgba(20,18,36,0.97)', borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.08)', padding: '28px 24px',
        boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        animation: shake ? 'pinShake 0.4s' : 'w9SlideUp 0.2s ease-out',
        textAlign: 'center',
      }} onClick={e => e.stopPropagation()}>
        <style>{`@keyframes pinShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}} @keyframes w9SlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>

        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8' }}><X size={16} /></button>

        <div style={{ fontSize: 28, marginBottom: 12 }}>{'\u{1F512}'}</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>
          {mode === 'set' ? 'Set Your Export PIN' : mode === 'confirm' ? 'Confirm Your PIN' : 'Confirm Your Identity'}
        </div>
        <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 24, lineHeight: 1.5 }}>
          {mode === 'set' ? 'Create a 4-digit PIN to protect W-9 exports' : mode === 'confirm' ? 'Re-enter your PIN to confirm' : 'Enter your 4-digit export PIN to access W-9 documents'}
        </div>

        {isLocked ? (
          <div style={{ padding: '16px 0' }}>
            <div style={{ fontSize: 14, color: '#EF4444', fontWeight: 700, marginBottom: 4 }}>Too many attempts</div>
            <div style={{ fontSize: 12, color: '#8080A8' }}>Try again in {remainingMin} minute{remainingMin !== 1 ? 's' : ''}</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 16 }}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={refs[i]}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  style={{
                    width: 48, height: 56, textAlign: 'center',
                    fontSize: 24, fontWeight: 800, fontFamily: 'monospace',
                    background: d ? 'rgba(212,34,106,0.08)' : 'rgba(255,255,255,0.04)',
                    border: d ? '2px solid rgba(212,34,106,0.4)' : '2px solid rgba(255,255,255,0.1)',
                    borderRadius: 12, color: '#E0E0F4', outline: 'none',
                  }}
                />
              ))}
            </div>

            {error && <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 12 }}>{error}</div>}

            <button onClick={handleConfirm} disabled={!allFilled} style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
              background: allFilled ? '#D4226A' : '#363656',
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: allFilled ? 'pointer' : 'default',
              boxShadow: allFilled ? '0 4px 16px rgba(212,34,106,0.3)' : 'none',
            }}>
              {mode === 'set' ? 'Set PIN' : mode === 'confirm' ? 'Confirm PIN' : 'Confirm'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
