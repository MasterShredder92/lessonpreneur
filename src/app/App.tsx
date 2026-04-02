import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
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
  return null
}

// Suspense fallback
function PageLoader() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}><MusicLoader /></div>
}

// ── Lazy-loaded pages (code-split per route) ──
const MarketingLanding = lazy(() => import('../pages/MarketingLanding'))
const Login = lazy(() => import('../pages/Login'))
const Signup = lazy(() => import('../pages/Signup'))
const Intake = lazy(() => import('../pages/Intake'))
const PayInvoice = lazy(() => import('../pages/PayInvoice'))
const AdkinsLanding = lazy(() => import('../pages/AdkinsLanding'))
const DrumsLanding = lazy(() => import('../pages/DrumsLanding'))
const GuitarLanding = lazy(() => import('../pages/GuitarLanding'))
const VocalsLanding = lazy(() => import('../pages/VocalsLanding'))
const PianoLanding = lazy(() => import('../pages/PianoLanding'))
const LesssonpreneurLanding = lazy(() => import('../pages/LesssonpreneurLanding'))
const MoreLanding = lazy(() => import('../pages/MoreLanding'))
const SignupLanding = lazy(() => import('../pages/SignupLanding'))
const ThankYou = lazy(() => import('../pages/ThankYou'))

// Shells (loaded eagerly — they're the layout)
import AdminShell from '../components/layout/AdminShell'
import TeacherShell from '../components/layout/TeacherShell'
import ParentShell from '../components/layout/ParentShell'
import StudentShell from '../components/layout/StudentShell'
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
const TeacherSchedule = lazy(() => import('../pages/teacher/TeacherSchedule'))
const TeacherStudents = lazy(() => import('../pages/teacher/TeacherStudents'))
const ParentDashboard = lazy(() => import('../pages/parent/ParentDashboard'))
const StudentPractice = lazy(() => import('../pages/student/StudentPractice'))

/** Wraps AdkinsLanding with a specific location context */
function LocationLanding({ loc }: { loc: LocKey }) {
  return (
    <LocationContext.Provider value={loc}>
      <AdkinsLanding />
    </LocationContext.Provider>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3,  // 3 minutes — prevents re-fetches when navigating between pages
      gcTime: 1000 * 60 * 10,    // keep unused data for 10 minutes
      retry: 1,
      refetchOnWindowFocus: false, // don't refetch every time user tabs back
    },
  },
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
            <Route path="/" element={<MarketingLanding />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/intake/:slug" element={<Intake />} />
            <Route path="/pay/:token" element={<PayInvoice />} />
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
            <Route path="/lessonpreneur" element={<LesssonpreneurLanding />} />
            <Route path="/thank-you" element={<ThankYou />} />

            {/* Admin routes — owner + admin */}
            <Route
              path="/admin"
              element={
                <RouteGuard allowedRoles={['owner', 'admin']}>
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
              <Route index element={<Navigate to="schedule" replace />} />
              <Route path="schedule" element={<TeacherSchedule />} />
              <Route path="students" element={<TeacherStudents />} />
            </Route>

            {/* Parent routes */}
            <Route
              path="/parent"
              element={
                <RouteGuard allowedRoles={['parent']}>
                  <ParentShell />
                </RouteGuard>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<ParentDashboard />} />
            </Route>

            {/* Student routes */}
            <Route
              path="/student"
              element={
                <RouteGuard allowedRoles={['student']}>
                  <StudentShell />
                </RouteGuard>
              }
            >
              <Route index element={<Navigate to="practice" replace />} />
              <Route path="practice" element={<StudentPractice />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/login" replace />} />
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
