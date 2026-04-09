import { toast } from '../components/shared/Toast'

/**
 * Normalize any error into a user-friendly message.
 * Handles Error objects, Supabase errors, fetch errors, unknown values.
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return 'An unexpected error occurred'

  // Standard Error
  if (error instanceof Error) {
    // Auth errors
    if (/jwt|token.*expired|not authenticated/i.test(error.message)) {
      return 'Your session has expired. Please sign in again.'
    }
    // Network errors
    if (error.message === 'Failed to fetch' || error.message === 'Load failed' || error.message === 'NetworkError') {
      return 'Network error — please check your connection and try again.'
    }
    // Permission errors
    if (/permission|denied|forbidden|unauthorized|not allowed/i.test(error.message)) {
      return 'You don\'t have permission to do that.'
    }
    // RLS / Postgres errors
    if (/violates row|row-level security/i.test(error.message)) {
      return 'Permission denied — this action is restricted.'
    }
    // Unique constraint
    if (/duplicate key|unique constraint|already exists/i.test(error.message)) {
      return 'This record already exists.'
    }
    return error.message
  }

  // Supabase error shape { message, code, details, hint }
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>
    if (typeof e.message === 'string') return getErrorMessage(new Error(e.message))
    if (typeof e.error === 'string') return e.error
    if (typeof e.error_description === 'string') return e.error_description
  }

  // String
  if (typeof error === 'string') return error

  return 'Something went wrong. Please try again.'
}

/**
 * Show a toast for a mutation error. Used by the global mutation cache
 * and can be called directly for custom error handling.
 */
export function toastMutationError(error: unknown) {
  toast(getErrorMessage(error), 'error')
}
