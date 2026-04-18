/** Mock tool stubs for Ziro — replace with real integrations later. */

export type DashboardPulseMock = {
  kpiSummary: string
  riskFlags: string[]
  wins: string[]
}

export async function fetchDashboardPulse(): Promise<DashboardPulseMock> {
  await delay(120)
  return {
    kpiSummary: 'Trials +3% WoW; attendance flat; collections ahead of plan.',
    riskFlags: ['Tuesday evening coverage'],
    wins: ['Referrals up at Bellevue'],
  }
}

export async function previewCommandCenter(): Promise<{ status: string; queuedJobs: number }> {
  await delay(90)
  return { status: 'ready', queuedJobs: 2 }
}

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}
