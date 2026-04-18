import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { toastMutationError } from '../lib/errors'
import { AuthProvider } from './AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import { useLocationSEO } from '../hooks/useLocationSEO'
import { ErrorBoundary } from './ErrorBoundary'
import { ToastProvider } from '../components/shared/Toast'
import { RouteGuard } from './RouteGuard'
import { LocationContext } from '../config/LocationContext'
import type { LocKey } from '../config/locations'
import { PreviewModeProvider } from '../hooks/usePreviewMode'
import { startLeadFailsafeWorker } from '../lib/leadFailsafe'
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  usePageTitle()
  useLocationSEO()
  return null
}

// Suspense fallback — keep paint cost tiny so route chunks don't block first contentful paint
function PageLoader() {
  return (
    <div
      style={{
        minHeight: '55vh',
        background: '#020209',
        padding: '32px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        maxWidth: 720,
        margin: '0 auto',
      }}
      aria-busy
      aria-label="Loading"
    >
      <div style={{ height: 22, width: '42%', borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
      <div style={{ height: 14, width: '70%', borderRadius: 6, background: 'rgba(255,255,255,0.04)' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ height: 64, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }} />
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 120, borderRadius: 14, marginTop: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }} />
    </div>
  )
}

// ── Lazy-loaded pages (code-split per route) ──
// Routes removed — orphaned. Component files preserved for future use.
const LandingPageV2 = lazy(() => import('../pages/LandingPage'))
const Intake = lazy(() => import('../pages/Intake'))
const PayInvoice = lazy(() => import('../pages/PayInvoice'))
const AdkinsLanding = lazy(() => import('../pages/AdkinsLanding'))
const DrumsLanding = lazy(() => import('../pages/DrumsLanding'))
const GuitarLanding = lazy(() => import('../pages/GuitarLanding'))
const VocalsLanding = lazy(() => import('../pages/VocalsLanding'))
const PianoLanding = lazy(() => import('../pages/PianoLanding'))
const MoreLanding = lazy(() => import('../pages/MoreLanding'))
const ViolinLessonsLanding = lazy(() => import('../pages/ViolinLessonsLanding'))
const FluteLessonsLanding = lazy(() => import('../pages/FluteLessonsLanding'))
const SignupLanding = lazy(() => import('../pages/SignupLanding'))
const ThankYou = lazy(() => import('../pages/ThankYou'))
const KidsLessonsPage = lazy(() => import('../pages/KidsLessonsPage'))
const AdultLessonsPage = lazy(() => import('../pages/AdultLessonsPage'))
const BeginnerLessonsPage = lazy(() => import('../pages/BeginnerLessonsPage'))
const PrivateLessonsPage = lazy(() => import('../pages/PrivateLessonsPage'))
const AboutPage = lazy(() => import('../pages/AboutPage'))
const LocationsPage = lazy(() => import('../pages/LocationsPage'))
// FamilyPortal removed — parents use authenticated login

// Public funnel pages
const VSLPage = lazy(() => import('../pages/public/VSLPage'))
const LeadCaptureFormPage = lazy(() => import('../pages/public/LeadCaptureFormPage'))
const CardCapturePage = lazy(() => import('../pages/public/CardCapturePage'))

// Shells (loaded eagerly — they're the layout)
import AdminShell from '../components/layout/AdminShell'
import TeacherShell from '../components/layout/TeacherShell'
import ParentShell from '../components/layout/ParentShell'
// StudentShell removed — students access practice through parent portal
import PreviewBanner from '../components/shared/PreviewBanner'
import InstallPrompt from '../components/shared/InstallPrompt'
import LoginPage from '../pages/Login'

// Admin pages (lazy)

// Teacher/Parent/Student pages (lazy)
const TeacherDashboard = lazy(() => import('../pages/teacher/TeacherDashboard'))
const TeacherSchedule = lazy(() => import('../pages/teacher/TeacherSchedule'))
const TeacherStudents = lazy(() => import('../pages/teacher/TeacherStudents'))
const TeacherDocuments = lazy(() => import('../pages/teacher/TeacherDocuments'))
const ParentDashboard = lazy(() => import('../pages/parent/ParentDashboard'))
const ParentSchedule = lazy(() => import('../pages/parent/ParentSchedule'))
const ParentPractice = lazy(() => import('../pages/parent/ParentPractice'))
const ParentBilling = lazy(() => import('../pages/parent/ParentBilling'))
const ParentAccount = lazy(() => import('../pages/parent/ParentAccount'))

/** Wraps AdkinsLanding with a specific location context */
function LocationLanding({ loc }: { loc: LocKey }) {
  return (
    <LocationContext.Provider value={loc}>
      <AdkinsLanding />
    </LocationContext.Provider>
  )
}

/**
 * Client-side hostname gate for the "/" route.
 * Edge Middleware handles this at the CDN layer, but if it misses
 * (cold start, cache bypass, apex DNS routing), this ensures the
 * correct page renders instead of falling through to the SaaS page.
 */

// Adkins customer-facing domains → redirect to /omaha
const ADKINS_HOSTS_CLIENT = new Set([
  'adkinsmusiclessons.com',
  'www.adkinsmusiclessons.com',
])

// Legacy per-location domains → redirect to location path
const LEGACY_HOST_CLIENT: Record<string, string> = {
  'omahaguitarandmusiclessons.com': '/omaha',
  'www.omahaguitarandmusiclessons.com': '/omaha',
  'musiclessonsbellevue.com': '/bellevue',
  'www.musiclessonsbellevue.com': '/bellevue',
  'elkhornlessons.com': '/elkhorn',
  'www.elkhornlessons.com': '/elkhorn',
  'gretnamusiclessons.com': '/gretna',
  'www.gretnamusiclessons.com': '/gretna',
}

function HomepageRouter() {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : ''

  // Adkins main domain → primary location
  if (ADKINS_HOSTS_CLIENT.has(hostname)) {
    return <Navigate to="/omaha" replace />
  }

  // Legacy per-location domain → location path
  const legacyPath = LEGACY_HOST_CLIENT[hostname]
  if (legacyPath) {
    return <Navigate to={legacyPath} replace />
  }

  // SaaS / marketing host → primary landing
  return <LandingPageV2 />
}

// Detect auth/JWT errors that cause the app to spin indefinitely
function isAuthError(error: unknown): boolean {
  if (!error) return false
  const msg = (error as any)?.message ?? (error as any)?.hint ?? ''
  const code = (error as any)?.code ?? ''
  return (
    code === 'PGRST301' ||
    code === '401' ||
    /jwt|token.*expired|not authenticated|invalid.*claim/i.test(msg)
  )
}

let authRedirectScheduled = false

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,       // 5 minutes — data stays fresh
      gcTime: 10 * 60 * 1000,         // 10 minutes — cache kept alive
      retry: (failureCount, error) => {
        // Never retry auth errors — they just spin until the user refreshes
        if (isAuthError(error)) return false
        return failureCount < 1
      },
      refetchOnWindowFocus: false,    // disabled — realtime + navigation handle freshness; window focus caused refetch storms
      refetchOnReconnect: false,      // disabled — reconnect storms compound with focus storms
      networkMode: 'offlineFirst',
      throwOnError: false,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (isAuthError(error)) return false
        return failureCount < 1
      },
      networkMode: 'offlineFirst',
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // Skip if the mutation has its own onError handler — avoid duplicate toasts
      if (mutation.options.onError) return
      toastMutationError(error)
    },
  }),
  queryCache: new QueryCache({
    onError: (_error) => {
      // If multiple queries hit auth errors simultaneously, only redirect once
      if (isAuthError(_error) && !authRedirectScheduled) {
        authRedirectScheduled = true
        // Brief delay so the user sees the state, then force a fresh session
        setTimeout(() => {
          authRedirectScheduled = false
          // Only redirect if we're on an authenticated route
          if (window.location.pathname.startsWith('/admin') ||
              window.location.pathname.startsWith('/teacher') ||
              window.location.pathname.startsWith('/parent')) {
            window.location.href = '/login'
          }
        }, 1500)
      }
    },
  }),
})

export default function App() {
  useEffect(() => {
    const stop = startLeadFailsafeWorker()
    return () => stop()
  }, [])

  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
        <PreviewModeProvider>
        <PreviewBanner />
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomepageRouter />} />
            {/* Routes removed — orphaned. Component files preserved for future use. */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/intake/:slug" element={<Intake />} />
            <Route path="/pay/:token" element={<PayInvoice />} />
            {/* Public funnel — no auth required */}
            <Route path="/start" element={<VSLPage />} />
            <Route path="/get-started" element={<LeadCaptureFormPage />} />
            <Route path="/trial" element={<CardCapturePage />} />
            <Route path="/lessonpreneur" element={<Navigate to="/" replace />} />
            {/* ── Supporting SEO pages ── */}
            <Route path="/about" element={<AboutPage />} />
            <Route path="/locations" element={<LocationsPage />} />
            <Route path="/kids-music-lessons" element={<KidsLessonsPage />} />
            <Route path="/adult-music-lessons" element={<AdultLessonsPage />} />
            <Route path="/beginner-music-lessons" element={<BeginnerLessonsPage />} />
            <Route path="/private-music-lessons" element={<PrivateLessonsPage />} />

            {/* ── Location-specific nested routes ── */}
            {/* /omaha, /gretna, /bellevue, /elkhorn + instrument sub-routes */}
            {(['omaha', 'gretna', 'bellevue', 'elkhorn'] as LocKey[]).map(loc => (
              <Route key={loc} path={`/${loc}`}>
                <Route index element={<LocationLanding loc={loc} />} />
                <Route path="drums" element={<DrumsLanding />} />
                <Route path="guitar" element={<GuitarLanding />} />
                <Route path="piano" element={<PianoLanding />} />
                <Route path="vocals" element={<VocalsLanding />} />
                <Route path="more" element={<MoreLanding />} />
                {/* -lessons aliases → 301 to canonical instrument pages */}
                <Route path="guitar-lessons" element={<Navigate to={`/${loc}/guitar`} replace />} />
                <Route path="piano-lessons" element={<Navigate to={`/${loc}/piano`} replace />} />
                <Route path="drum-lessons" element={<Navigate to={`/${loc}/drums`} replace />} />
                <Route path="vocal-lessons" element={<Navigate to={`/${loc}/vocals`} replace />} />
                <Route path="bass-guitar-lessons" element={<Navigate to={`/${loc}/more`} replace />} />
                {/* Unique lesson pages — no /violin or /flute base counterpart */}
                <Route path="violin-lessons" element={<ViolinLessonsLanding />} />
                <Route path="flute-lessons" element={<FluteLessonsLanding />} />
                <Route path="signup" element={<SignupLanding />} />
              </Route>
            ))}

            {/* Legacy /site route — defaults to Omaha */}
            <Route path="/site" element={<Navigate to="/omaha" replace />} />

            {/* Flat instrument routes — redirect to /omaha/ equivalents */}
            <Route path="/drums" element={<Navigate to="/omaha/drums" replace />} />
            <Route path="/guitar" element={<Navigate to="/omaha/guitar" replace />} />
            <Route path="/piano" element={<Navigate to="/omaha/piano" replace />} />
            <Route path="/vocals" element={<Navigate to="/omaha/vocals" replace />} />
            <Route path="/thank-you" element={<ThankYou />} />

            <Route path="/admin/*" element={<AdminShell />} />

            {/* Teacher routes */}
            <Route
              path="/teacher"
              element={
                <RouteGuard allowedRoles={['teacher']}>
                  <TeacherShell />
                </RouteGuard>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<TeacherDashboard />} />
              <Route path="schedule" element={<TeacherSchedule />} />
              <Route path="students" element={<TeacherStudents />} />
              <Route path="documents" element={<TeacherDocuments />} />
            </Route>

            {/* Parent routes */}
            <Route
              path="/parent"
              element={
                <RouteGuard allowedRoles={['parent', 'student']}>
                  <ParentShell />
                </RouteGuard>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<ParentDashboard />} />
              <Route path="schedule" element={<ParentSchedule />} />
              <Route path="practice" element={<ParentPractice />} />
              <Route path="billing" element={<ParentBilling />} />
              <Route path="account" element={<ParentAccount />} />
            </Route>

            {/* Legacy student route → redirect to parent */}
            <Route path="/student/*" element={<Navigate to="/parent/dashboard" replace />} />

            {/* Legacy family portal → redirect to login */}
            <Route path="/family/:familyId" element={<Navigate to="/login" replace />} />

            {/* Catch-all — send unknown URLs to landing page, not login */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </PreviewModeProvider>
        </AuthProvider>
      </BrowserRouter>
      <InstallPrompt />
      </ToastProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  )
}
