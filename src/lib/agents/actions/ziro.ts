import type { AgentAction } from '../agents'
import { fetchDashboardPulse, previewCommandCenter } from '../tools/ziro'

export const ziroActions: AgentAction[] = [
  {
    label: 'Show KPIs',
    description: 'Jump to the dashboard overview.',
    async onClick() {
      window.dispatchEvent(new CustomEvent('admin-surface', { detail: { surface: 'dashboard' } }))
      await fetchDashboardPulse()
    },
  },
  {
    label: 'Open Command Center',
    description: 'Open Ziro Work — agents, skills, and orchestration.',
    async onClick() {
      window.dispatchEvent(new CustomEvent('admin-surface', { detail: { surface: 'zirowork' } }))
      await previewCommandCenter()
    },
  },
]
