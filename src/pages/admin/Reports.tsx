import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'

export default function Reports() {
  return (
    <IssueContextProvider page="Reports">
    <div className="page">
      <div className="page-header">
        <h1>Reports</h1>
        <ReportIssueButton />
      </div>
      <div className="card">
        <p className="text-muted">Reporting dashboard — coming in Feature 1.18</p>
      </div>
    </div>
    </IssueContextProvider>
  )
}
