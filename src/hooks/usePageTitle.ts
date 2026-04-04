import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const ROUTE_TITLES: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/leads': 'Leads',
  '/admin/schedule': 'Schedule',
  '/admin/students': 'Students',
  '/admin/families': 'Families',
  '/admin/teachers': 'Teachers',
  '/admin/billing': 'Billing',
  '/admin/payroll': 'Payroll',
  '/admin/financials': 'Financials',
  '/admin/recruitment': 'Recruitment',
  '/admin/retention': 'Retention',
  '/admin/settings': 'Settings',
  '/teacher/dashboard': 'Dashboard',
  '/teacher/schedule': 'Schedule',
  '/teacher/students': 'Students on Schedule',
  '/teacher/documents': 'Documents',
  '/parent/dashboard': 'Dashboard',
  '/student/practice': 'Practice Lab',
  '/login': 'Sign In',
  '/signup': 'Sign Up',
}

export function usePageTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    // Check exact match first, then prefix match for detail pages
    let title = ROUTE_TITLES[pathname]
    if (!title) {
      if (pathname.startsWith('/admin/students/')) title = 'Student Detail'
      else if (pathname.startsWith('/admin/teachers/')) title = 'Teacher Detail'
    }

    document.title = title
      ? `${title} — Lessonpreneur`
      : 'Lessonpreneur'
  }, [pathname])
}
