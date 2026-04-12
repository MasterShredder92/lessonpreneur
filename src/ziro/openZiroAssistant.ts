/** Options for opening the global Ziro panel from anywhere in the admin shell. */
export type OpenZiroAssistantOptions = {
  /** If set, sent as the first user message once the assistant is ready (business or schedule mode). */
  seedMessage?: string
}

/**
 * Opens the app-shell Ziro panel. Prefer this over dispatching events directly so options stay typed.
 */
export function openZiroAssistant(opts?: OpenZiroAssistantOptions) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<OpenZiroAssistantOptions>('open-ziro-panel', { detail: opts ?? {} }))
}
