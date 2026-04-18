const NEXT_PUBLIC_SUPABASE_URL =
  (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined)
  ?? import.meta.env.VITE_SUPABASE_URL
const NEXT_PUBLIC_SUPABASE_ANON_KEY =
  (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined)
  ?? import.meta.env.VITE_SUPABASE_ANON_KEY

/** Required on Edge Function `fetch` calls — gateway returns 401 if missing (invoke adds it automatically). */
export const SUPABASE_ANON_KEY = NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined
export const SUPABASE_ANON_BEARER = SUPABASE_ANON_KEY
  ? `Bearer ${SUPABASE_ANON_KEY}`
  : undefined

export const EDGE_FUNCTIONS = {
  aiAssistant: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-assistant`,
  aiScheduleAction: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-schedule-action`,
  aiTeacherMatch: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-teacher-match`,
  generateReviewMessage: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-review-message`,
  generateStudentBio: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-student-bio`,
  teacherHandoff: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/teacher-handoff`,
  sendSms: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-sms`,
  sendEmail: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`,
  squareProxy: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/square-proxy`,
  /** Read-only Square Payments/Refunds → LP facts (reporting layer; not invoice AR). */
  squarePaymentsSync: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/square-payments-sync`,
  w9Handler: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/w9-handler`,
  moderateContent: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/moderate-content`,
  signwellWebhook: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/signwell-webhook`,
  createCheckout: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-checkout`,
  customerPortal: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/customer-portal`,
  stripeConnectOnboard: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/stripe-connect-onboard`,
  createStudentInvoice: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-student-invoice`,
  setupAutopay: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/setup-autopay`,
  createGoogleMeet: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-google-meet`,
  publicLeadSubmit: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/public-lead-submit`,
  publicTeacherMatch: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/public-teacher-match`,
} as const
