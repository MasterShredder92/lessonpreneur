interface CircuitState {
  failures: number
  lastFailure: number
  state: 'closed' | 'open' | 'half-open'
}

const circuits = new Map<string, CircuitState>()

const FAILURE_THRESHOLD = 5
const RESET_TIMEOUT_MS = 30_000

export function checkCircuit(key: string): boolean {
  const circuit = circuits.get(key)
  if (!circuit || circuit.state === 'closed') return true

  if (circuit.state === 'open') {
    if (Date.now() - circuit.lastFailure > RESET_TIMEOUT_MS) {
      circuit.state = 'half-open'
      return true
    }
    return false
  }

  return true
}

export function recordSuccess(key: string): void {
  const circuit = circuits.get(key)
  if (circuit) {
    circuit.failures = 0
    circuit.state = 'closed'
  }
}

export function recordFailure(key: string): void {
  let circuit = circuits.get(key)
  if (!circuit) {
    circuit = { failures: 0, lastFailure: 0, state: 'closed' }
    circuits.set(key, circuit)
  }

  circuit.failures++
  circuit.lastFailure = Date.now()
  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.state = 'open'
  }

  console.warn('[ZiroTelemetry:circuit]', {
    key,
    state: circuit.state,
    failures: circuit.failures,
    timestamp: Date.now(),
  })
}

