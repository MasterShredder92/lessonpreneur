export type UserRole = 'owner' | 'admin' | 'company_director' | 'studio_director' | 'teacher' | 'parent' | 'student'

export interface Profile {
  id: string
  tenant_id: string
  role: UserRole
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  onboarding_completed_at: string | null
  onboarding_skipped: boolean
}

export interface Location {
  id: string
  tenant_id: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  phone: string | null
  email: string | null
  website: string | null
  google_review_url: string | null
  hours_json: Record<string, { open: string; close: string }> | null
  is_active: boolean
}

export interface Teacher {
  id: string
  tenant_id: string
  profile_id: string
  instruments: string[]
  bio: string | null
  rate_per_block: number
  is_active: boolean
  hire_date: string | null
  termination_date: string | null
  ai_context: Record<string, any>
  created_at: string
  updated_at: string
  // Joined from profiles
  profile?: Profile
  // Joined from profile_locations
  location_ids?: string[]
  locations?: Location[]
  // Computed
  student_count?: number
  blocks_this_week?: number
}

export interface TeacherAvailability {
  id: string
  tenant_id: string
  teacher_id: string
  location_id: string
  day_of_week: string
  start_time: string
  end_time: string
  is_active: boolean
}

export interface Student {
  id: string
  tenant_id: string
  family_id: string
  location_id: string
  teacher_id: string | null
  profile_id: string | null
  first_name: string
  last_name: string
  instrument: string
  status: 'active' | 'inactive' | 'former'
  blocks_per_week: number
  rate_per_session: number
}

export interface AuthState {
  user: { id: string; email: string } | null
  profile: Profile | null
  teacherRecord: Teacher | null
  locationIds: string[]
  isLoading: boolean
}
