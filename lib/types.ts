// Shared domain types — mirrors supabase/migrations/001_initial_schema.sql

export type TextSize = 'normal' | 'large' | 'extra_large'
export type Appearance = 'system' | 'light' | 'blue' | 'dark' | 'high_contrast'

export interface Profile {
  id: string
  name: string | null
  age: number | null
  conditions: string[]
  sodium_target: number
  step_target: number
  text_size: TextSize
  appearance: Appearance
  reduce_motion: boolean
  notifications: boolean
  ai_history: boolean
  guide_permissions: string[]
  onboarding_state: { status: 'not_started' | 'in_progress' | 'done'; step?: number }
  created_at: string
}

export interface BpReading {
  id: string
  user_id: string
  systolic: number
  diastolic: number
  pulse: number | null
  measured_at: string
  period: 'morning' | 'evening'
  source: string
  notes: string | null
  feeling: string | null
}

export interface Medication {
  id: string
  user_id: string
  name: string
  dose: string | null
  frequency: string
  time: string
  instructions: string | null
  instruction_source: 'prescription' | 'clinician' | 'pharmacist' | 'user'
  prescriber: string | null
  pharmacy: string | null
  pharmacy_phone: string | null
  refill_date: string | null
  refills_remaining: number | null
  active: boolean
}

export interface MedicationLog {
  id: string
  medication_id: string
  status: 'taken' | 'skipped' | 'snoozed' | 'not_taken' | 'unknown'
  logged_at: string
  scheduled_for: string | null
}

export interface Appointment {
  id: string
  title: string
  date_time: string
  location: string | null
  doctor: string | null
  notes: string | null
  status: 'upcoming' | 'done' | 'cancelled'
}

export interface EvidenceSource {
  id: string
  topic: string
  claim: string
  source_name: string
  source_title: string | null
  source_url: string
  evidence_type: string | null
  published_date: string | null
  last_verified: string | null
}

export interface CaregiverPermission {
  id: string
  name: string
  relationship: string | null
  permissions: string[]
  active: boolean
}

// Next Best Action decision
export type NextActionKind =
  | 'bp_morning'
  | 'bp_evening'
  | 'medication'
  | 'appointment_prep'
  | 'craving_support'
  | 'activity'
  | 'check_in'
  | 'caught_up'
  | 'safety_review'

export interface NextAction {
  kind: NextActionKind
  title: string
  detail: string
  cta_label: string
  cta_href: string
  why?: string
  medication_ids?: string[]
}
