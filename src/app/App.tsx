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
import MusicLoader from '../components/shared/MusicLoader'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  usePageTitle()
  useLocationSEO()
  return null
}

// Suspense fallback
function PageLoader() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: '#020209' }}><MusicLoader /></div>
}

// ── Lazy-loaded pages (code-split per route) ──
// Routes removed — orphaned. Component files preserved for future use.
const LandingPageV2 = lazy(() => import('../pages/LandingPage'))
const Login = lazy(() => import('../pages/Login'))
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

// Admin pages (lazy)
const Dashboard = lazy(() => import('../pages/admin/Dashboard'))
const Schedule = lazy(() => import('../pages/admin/Schedule'))
const Students = lazy(() => import('../pages/admin/Students'))
const StudentDetail = lazy(() => import('../pages/admin/StudentDetail'))
const Teachers = lazy(() => import('../pages/admin/Teachers'))
const TeacherDetail = lazy(() => import('../pages/admin/TeacherDetail'))
const Families = lazy(() => import('../pages/admin/Families'))
const Leads = lazy(() => import('../pages/admin/Leads'))
const Billing = lazy(() => import('../pages/admin/Billing'))
const Payroll = lazy(() => import('../pages/admin/Payroll'))
const Retention = lazy(() => import('../pages/admin/Retention'))
const Financials = lazy(() => import('../pages/admin/Financials'))
const Recruitment = lazy(() => import('../pages/admin/Recruitment'))
const Settings = lazy(() => import('../pages/admin/Settings'))
const Platform = lazy(() => import('../pages/admin/Platform'))
const ImportPage = lazy(() => import('../pages/admin/Import'))
const Workflows = lazy(() => import('../pages/admin/Workflows'))
const Analytics = lazy(() => import('../pages/admin/Analytics'))
const IntegrationsPage = lazy(() => import('../pages/admin/Integrations'))

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

  // SaaS domain (lessonpreneur.io, localhost, preview deploys) → SaaS landing
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
            <Route path="/login" element={<Login />} />
            <Route path="/intake/:slug" element={<Intake />} />
            <Route path="/pay/:token" element={<PayInvoice />} />
            {/* Public funnel — no auth required */}
            <Route path="/start" element={<VSLPage />} />
            <Route path="/get-started" element={<LeadCaptureFormPage />} />
            <Route path="/trial" element={<CardCapturePage />} />
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
            <Route path="/lessonpreneur" element={<Navigate to="/" replace />} />
            <Route path="/thank-you" element={<ThankYou />} />

            {/* Admin routes — owner + admin */}
            <Route
              path="/admin"
              element={
                <RouteGuard allowedRoles={['owner', 'admin', 'company_director', 'studio_director']}>
                  <AdminShell />
                </RouteGuard>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="leads" element={<Leads />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="families" element={<Families />} />
              <Route path="students" element={<Students />} />
              <Route path="students/:id" element={<StudentDetail />} />
              <Route path="retention" element={<Retention />} />
              <Route path="teachers" element={<Teachers />} />
              <Route path="teachers/:id" element={<TeacherDetail />} />
              <Route path="billing" element={<Billing />} />
              <Route path="payroll" element={<Payroll />} />
              <Route path="financials" element={<Financials />} />
              <Route path="recruitment" element={<Recruitment />} />
              <Route path="settings" element={<Settings />} />
              <Route path="platform" element={<Platform />} />
              <Route path="import" element={<ImportPage />} />
              <Route path="workflows" element={<Workflows />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="integrations" element={<IntegrationsPage />} />
            </Route>

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
