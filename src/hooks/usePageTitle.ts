import { useEffect } from 'react'

import { useLocation } from 'react-router-dom'

import { ZW } from '../config/zwBrand'



/**

 * Full document titles (no extra suffix) for public marketing, auth edge, and Adkins enrollment.

 * Uses ZiroWork ↔ Lessonpreneur hierarchy from zwBrand.

 */

function resolveFullPublicTitle(pathname: string): string | null {

  const byPath: Record<string, string> = {

    '/': `${ZW.productByline} — ${ZW.operatingSystem}`,

    '/start': `See how it works — ${ZW.productByline}`,

    '/trial': `Start your trial — ${ZW.productByline}`,

    '/login': `Sign In — ${ZW.parent}`,

    '/get-started': `Get started — ${ZW.productByline}`,

    '/thank-you': "You're in — Adkins Music Lessons",

  }

  if (byPath[pathname]) return byPath[pathname]



  if (pathname.startsWith('/pay/')) return `Pay invoice — ${ZW.productByline}`



  if (/\/(omaha|gretna|bellevue|elkhorn)\/signup$/.test(pathname)) {

    return 'Book a lesson — Adkins Music Lessons'

  }



  return null

}



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

  '/admin/ziro-insights': 'Ziro insights',

  '/admin/settings': 'Settings',

  '/teacher/dashboard': 'Dashboard',

  '/teacher/schedule': 'Schedule',

  '/teacher/students': 'Students on Schedule',

  '/teacher/documents': 'Documents',

  '/parent/dashboard': 'Dashboard',

  '/student/practice': 'Practice Lab',

}



export function usePageTitle() {

  const { pathname } = useLocation()



  useEffect(() => {

    const full = resolveFullPublicTitle(pathname)

    if (full) {

      document.title = full

      return

    }



    let title = ROUTE_TITLES[pathname]

    if (!title) {

      if (pathname.startsWith('/admin/students/')) title = 'Student Detail'

      else if (pathname.startsWith('/admin/teachers/')) title = 'Teacher Detail'

    }



    document.title = title ? `${title} — ${ZW.product}` : ZW.parent

  }, [pathname])

}


