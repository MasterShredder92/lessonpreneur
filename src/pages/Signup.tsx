import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

import { PRICING_TIERS, TRIAL_DAYS, type PricingTier } from '../lib/pricing'

type Step = 1 | 2 | 3 | 4

export default function Signup() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTier, setSelectedTier] = useState<PricingTier['key']>('school')

  // Step 1: School info
  const [schoolName, setSchoolName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [locationCount, setLocationCount] = useState('1')
  const [studentCount, setStudentCount] = useState('')

  // Step 2: First location
  const [locName, setLocName] = useState('')
  const [locAddress, setLocAddress] = useState('')
  const [locPhone, setLocPhone] = useState('')
  const [locColor, setLocColor] = useState('#D4226A')

  // Step 3: Account
  const [password, setPassword] = useState('')

  const handleSubmit = async () => {
    if (!email || !password || !schoolName || !ownerName) {
      setError('Please fill in all required fields')
      return
    }
    setLoading(true)
    setError(null)

    try {
      // 1. Create auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: ownerName } },
      })
      if (authErr) throw authErr
      if (!authData.user) throw new Error('Account creation failed')

      const userId = authData.user.id

      // 2. Create tenant
      const slug = schoolName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const { data: tenant, error: tenantErr } = await supabase
        .from('tenants')
        .insert({
          name: schoolName,
          slug,
          plan: 'trial',
          pricing_tier: selectedTier,
          trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(),
        })
        .select('id')
        .single()
      if (tenantErr) throw tenantErr

      // 3. Create owner profile
      const nameParts = ownerName.trim().split(/\s+/)
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          tenant_id: tenant.id,
          first_name: nameParts[0] ?? '',
          last_name: nameParts.slice(1).join(' ') ?? '',
          email,
          phone: phone || null,
          role: 'owner',
        })
      if (profileErr) throw profileErr

      // 4. Create first location
      const { data: location, error: locErr } = await supabase
        .from('locations')
        .insert({
          tenant_id: tenant.id,
          name: locName || `${schoolName} Main`,
          address: locAddress || null,
          phone: locPhone || phone || null,
          is_active: true,
          color: locColor,
        })
        .select('id')
        .single()
      if (locErr) throw locErr

      // 5. Create brand_settings for the location
      await supabase.from('brand_settings').insert({
        tenant_id: tenant.id,
        location_id: location.id,
        studio_name: schoolName,
        primary_color: locColor,
        phone: locPhone || phone || null,
        email,
      })

      // 6. Assign owner to location
      await supabase.from('profile_locations').insert({
        profile_id: userId,
        location_id: location.id,
      })

      // 7. Mark onboarding as pending (store in localStorage)
      localStorage.setItem('lp-onboarding', 'true')

      // Navigate to dashboard
      navigate('/admin/dashboard')
    } catch (err: any) {
      setError(err.message ?? 'Signup failed. Please try again.')
    }
    setLoading(false)
  }

  const canProceed1 = schoolName.trim() && ownerName.trim() && email.includes('@')
  const canProceed2 = true // location is optional
  const canSubmit = email && password.length >= 6 && schoolName && ownerName

  return (
    <div style={{
      minHeight: '100vh', background: '#08080c', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ maxWidth: 480, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
            <img src="/lp-logo.png?v=2" alt="Lessonpreneur" style={{ width: 40, height: 40, borderRadius: 10 }} />
            <span style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4' }}>Lessonpreneur</span>
          </div>
          <div style={{ fontSize: 14, color: '#8080A8' }}>Set up your music school in 2 minutes</div>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {[1, 2, 3, 4].map(s => (
            <div key={s} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: s <= step ? '#f59e0b' : 'rgba(255,255,255,0.08)',
              transition: 'background 200ms',
            }} />
          ))}
        </div>

        {/* Step 1: Choose Plan */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>Choose Your Plan</div>
            <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 4 }}>{TRIAL_DAYS}-day free trial on every plan. No credit card required.</div>
            {PRICING_TIERS.map(tier => (
              <div key={tier.key} onClick={() => setSelectedTier(tier.key)} style={{
                padding: '16px 18px', borderRadius: 12, cursor: 'pointer',
                background: selectedTier === tier.key ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.02)',
                border: `2px solid ${selectedTier === tier.key ? '#f59e0b' : 'rgba(255,255,255,0.06)'}`,
                transition: 'all 150ms',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>{tier.name}</div>
                    <div style={{ fontSize: 11, color: '#8080A8', marginTop: 2 }}>{tier.tagline}</div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: selectedTier === tier.key ? '#f59e0b' : '#A0A0C8' }}>
                    {tier.priceDisplay}<span style={{ fontSize: 12, fontWeight: 600 }}>/mo</span>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => setStep(2)} style={btnStyle(true)}>Next: School Info</button>
          </div>
        )}

        {/* Step 2: School Info */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>About Your School</div>
            <Input value={schoolName} onChange={setSchoolName} placeholder="School name *" />
            <Input value={ownerName} onChange={setOwnerName} placeholder="Your name *" />
            <Input value={email} onChange={setEmail} placeholder="Email *" type="email" />
            <Input value={phone} onChange={setPhone} placeholder="Phone (optional)" />
            <div style={{ display: 'flex', gap: 10 }}>
              <Input value={locationCount} onChange={setLocationCount} placeholder="Locations" type="number" />
              <Input value={studentCount} onChange={setStudentCount} placeholder="Students (approx)" type="number" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep(1)} style={{ ...btnStyle(true), background: 'rgba(255,255,255,0.06)', color: '#8080A8', boxShadow: 'none', flex: 'none', padding: '12px 20px' }}>Back</button>
              <button onClick={() => setStep(3)} disabled={!canProceed1} style={btnStyle(canProceed1)}>
                Next: Your First Location
              </button>
            </div>
          </div>
        )}

        {/* Step 3: First Location */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>Your First Location</div>
            <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 4 }}>You can add more locations later.</div>
            <Input value={locName} onChange={setLocName} placeholder="Location name (e.g. Downtown Studio)" />
            <Input value={locAddress} onChange={setLocAddress} placeholder="Address (optional)" />
            <Input value={locPhone} onChange={setLocPhone} placeholder="Location phone (optional)" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: '#8080A8' }}>Brand Color:</span>
              <input type="color" value={locColor} onChange={e => setLocColor(e.target.value)} style={{ width: 40, height: 40, borderRadius: 8, border: '2px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'none' }} />
              <div style={{ width: 24, height: 24, borderRadius: 6, background: locColor }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep(2)} style={{ ...btnStyle(true), background: 'rgba(255,255,255,0.06)', color: '#8080A8', boxShadow: 'none', flex: 'none', padding: '12px 20px' }}>Back</button>
              <button onClick={() => setStep(4)} style={btnStyle(canProceed2)}>Next: Create Account</button>
            </div>
          </div>
        )}

        {/* Step 4: Create Account */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>Create Your Account</div>
            <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 13, color: '#A0A0C8' }}>
              <strong style={{ color: '#E0E0F4' }}>{schoolName}</strong> &middot; {email}
            </div>
            <Input value={password} onChange={setPassword} placeholder="Password (min 6 characters)" type="password" />
            {error && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', fontSize: 12, color: '#EF4444' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep(3)} style={{ ...btnStyle(true), background: 'rgba(255,255,255,0.06)', color: '#8080A8', boxShadow: 'none', flex: 'none', padding: '12px 20px' }}>Back</button>
              <button onClick={handleSubmit} disabled={!canSubmit || loading} style={btnStyle(canSubmit && !loading)}>
                {loading ? 'Creating...' : 'Launch Your School'}
              </button>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#606088' }}>
          Already have an account? <a href="/login" style={{ color: '#f59e0b', textDecoration: 'none' }}>Sign in</a>
        </div>
      </div>
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder: string; type?: string }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type}
      style={{
        width: '100%', padding: '12px 16px', borderRadius: 10,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        color: '#E0E0F4', fontSize: 14, outline: 'none', boxSizing: 'border-box',
        fontFamily: 'inherit',
      }} />
  )
}

function btnStyle(enabled: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '14px', borderRadius: 10, border: 'none',
    background: enabled ? '#f59e0b' : 'rgba(255,255,255,0.06)',
    color: enabled ? '#000' : '#606088',
    fontSize: 15, fontWeight: 700, cursor: enabled ? 'pointer' : 'default',
    boxShadow: enabled ? '0 4px 16px rgba(245,158,11,0.3)' : 'none',
    transition: 'all 150ms',
    flex: 1,
  }
}
