import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './AuthContext'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}
import { ErrorBoundary } from './ErrorBoundary'
import { ToastProvider } from '../components/shared/Toast'
import { RouteGuard } from './RouteGuard'
import { LocationContext } from '../config/LocationContext'
import type { LocKey } from '../config/locations'
import Login from '../pages/Login'
import Intake from '../pages/Intake'
import PayInvoice from '../pages/PayInvoice'
import AdkinsLanding from '../pages/AdkinsLanding'
import DrumsLanding from '../pages/DrumsLanding'
import GuitarLanding from '../pages/GuitarLanding'
import VocalsLanding from '../pages/VocalsLanding'
import PianoLanding from '../pages/PianoLanding'
import LesssonpreneurLanding from '../pages/LesssonpreneurLanding'

/** Wraps AdkinsLanding with a specific location context */
function LocationLanding({ loc }: { loc: LocKey }) {
  return (
    <LocationContext.Provider value={loc}>
      <AdkinsLanding />
    </LocationContext.Provider>
  )
}
import AdminShell from '../components/layout/AdminShell'
import TeacherShell from '../components/layout/TeacherShell'
import ParentShell from '../components/layout/ParentShell'
import StudentShell from '../components/layout/StudentShell'
import Dashboard from '../pages/admin/Dashboard'
import Schedule from '../pages/admin/Schedule'
import Students from '../pages/admin/Students'
import StudentDetail from '../pages/admin/StudentDetail'
import Teachers from '../pages/admin/Teachers'
import TeacherDetail from '../pages/admin/TeacherDetail'
import Families from '../pages/admin/Families'
import Leads from '../pages/admin/Leads'
import Billing from '../pages/admin/Billing'
import Payroll from '../pages/admin/Payroll'
import Settings from '../pages/admin/Settings'
import TeacherSchedule from '../pages/teacher/TeacherSchedule'
import TeacherStudents from '../pages/teacher/TeacherStudents'
import ParentDashboard from '../pages/parent/ParentDashboard'
import StudentPractice from '../pages/student/StudentPractice'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
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
          <Routes>
            <Route path="/login" element={<Login />} />
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
                <Route path="signup" element={<Navigate to={`/intake/adkins-music-lessons`} replace />} />
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
              <Route path="teachers" element={<Teachers />} />
              <Route path="teachers/:id" element={<TeacherDetail />} />
              <Route path="billing" element={<Billing />} />
              <Route path="payroll" element={<Payroll />} />
              <Route path="settings" element={<Settings />} />
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
        </AuthProvider>
      </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  )
}
