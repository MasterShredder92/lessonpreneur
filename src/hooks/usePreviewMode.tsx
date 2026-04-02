import { createContext, useContext, useState, type ReactNode } from 'react'

export interface PreviewState {
  active: boolean
  role: string | null
  locationId: string | null
  locationName: string | null
  studentId: string | null
  studentName: string | null
}

interface PreviewContextType {
  preview: PreviewState
  startPreview: (role: string, opts?: { locationId?: string; locationName?: string; studentId?: string; studentName?: string }) => void
  stopPreview: () => void
}

const defaultState: PreviewState = { active: false, role: null, locationId: null, locationName: null, studentId: null, studentName: null }

const PreviewContext = createContext<PreviewContextType>({
  preview: defaultState,
  startPreview: () => {},
  stopPreview: () => {},
})

export function PreviewModeProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<PreviewState>(defaultState)

  const startPreview = (role: string, opts?: { locationId?: string; locationName?: string; studentId?: string; studentName?: string }) => {
    setPreview({
      active: true,
      role,
      locationId: opts?.locationId ?? null,
      locationName: opts?.locationName ?? null,
      studentId: opts?.studentId ?? null,
      studentName: opts?.studentName ?? null,
    })
  }

  const stopPreview = () => setPreview(defaultState)

  return (
    <PreviewContext.Provider value={{ preview, startPreview, stopPreview }}>
      {children}
    </PreviewContext.Provider>
  )
}

export function usePreviewMode() {
  return useContext(PreviewContext)
}
