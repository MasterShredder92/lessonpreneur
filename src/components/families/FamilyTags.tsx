import DuplicateStudentReviewBanner from '../admin/DuplicateStudentReviewBanner'

export function FamilyTags({ canView }: { canView: boolean }) {
  return <>{canView && <DuplicateStudentReviewBanner />}</>
}

