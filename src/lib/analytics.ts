declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

function ga4(event: string, params?: Record<string, string>) {
  window.gtag?.('event', event, params)
}

export function trackChatStarted(instrument: string, location: string) {
  ga4('chat_started', { instrument, location })
}

export function trackChatCompleted(instrument: string, location: string) {
  ga4('chat_completed', { instrument, location })
}

export function trackLocationSwitched(location: string) {
  ga4('location_switched', { location })
}

export function trackInstrumentSelected(instrument: string) {
  ga4('instrument_selected', { instrument })
}
