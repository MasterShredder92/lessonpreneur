import { createContext, useContext, type ReactNode } from 'react'

interface IssueLocation {
  page: string
  section: string | null
  subsection: string | null
}

const IssueContext = createContext<IssueLocation>({
  page: 'Unknown',
  section: null,
  subsection: null,
})

export function IssueContextProvider({
  page,
  section,
  subsection,
  children,
}: {
  page?: string
  section?: string
  subsection?: string
  children: ReactNode
}) {
  const parent = useContext(IssueContext)

  const value: IssueLocation = {
    page: page ?? parent.page,
    section: section ?? parent.section,
    subsection: subsection ?? parent.subsection,
  }

  return <IssueContext.Provider value={value}>{children}</IssueContext.Provider>
}

export function useIssueContext(): IssueLocation {
  return useContext(IssueContext)
}
