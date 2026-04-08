const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export const EDGE_FUNCTIONS = {
  aiAssistant: `${SUPABASE_URL}/functions/v1/ai-assistant`,
  aiScheduleAction: `${SUPABASE_URL}/functions/v1/ai-schedule-action`,
  sendSms: `${SUPABASE_URL}/functions/v1/send-sms`,
  sendEmail: `${SUPABASE_URL}/functions/v1/send-email`,
  squareProxy: `${SUPABASE_URL}/functions/v1/square-proxy`,
  w9Handler: `${SUPABASE_URL}/functions/v1/w9-handler`,
  moderateContent: `${SUPABASE_URL}/functions/v1/moderate-content`,
  squarePaymentSync: `${SUPABASE_URL}/functions/v1/square-payment-sync`,
  signwellWebhook: `${SUPABASE_URL}/functions/v1/signwell-webhook`,
  createCheckout: `${SUPABASE_URL}/functions/v1/create-checkout`,
  customerPortal: `${SUPABASE_URL}/functions/v1/customer-portal`,
  generateReviewMessage: `${SUPABASE_URL}/functions/v1/generate-review-message`,
  stripeConnectOnboard: `${SUPABASE_URL}/functions/v1/stripe-connect-onboard`,
  createStudentInvoice: `${SUPABASE_URL}/functions/v1/create-student-invoice`,
  setupAutopay: `${SUPABASE_URL}/functions/v1/setup-autopay`,
} as const
