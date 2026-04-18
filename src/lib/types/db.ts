/**
 * Row types for public tables — aligned with db/schema/schema.sql.
 * AUTO-GENERATED — do not edit by hand.
 */

import type { BlockStatusEnum, BlockTypeEnum, DayOfWeekEnum, LeadStageEnum, MessageChannelEnum, MessageDirectionEnum, ReportIntervalEnum, StudentStatusEnum, UserRoleEnum } from "./enums";

export type ActivityLogRow = {
  id: string;
  tenant_id: string;
  user_id?: string | null;
  user_name?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  entity_name?: string | null;
  details?: string | null;
  created_at: string;
  ip_address?: string | null;
  user_agent?: string | null;
  location_id?: string | null;
};

export type AiActionLogsRow = {
  id: string;
  tenant_id: string;
  profile_id: string;
  conversation_id?: string | null;
  action_id: string;
  payload?: unknown | null;
  result?: unknown | null;
  ok: boolean;
  error_code?: string | null;
  error_message?: string | null;
  idempotency_key?: string | null;
  created_at: string;
};

export type AiConversationsRow = {
  id: string;
  tenant_id: string;
  profile_id: string;
  source: string;
  client_route?: string | null;
  page_context: unknown;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type AiFeedbackRow = {
  id: string;
  tenant_id: string;
  profile_id: string;
  conversation_id?: string | null;
  message_id?: string | null;
  rating?: number | null;
  comment?: string | null;
  created_at: string;
};

export type AiLegacyMessageLogRow = {
  id: string;
  tenant_id: string;
  profile_id: string;
  role: string;
  content: string;
  metadata?: unknown | null;
  created_at: string;
};

export type AiMessagesRow = {
  id: string;
  conversation_id: string;
  tenant_id: string;
  profile_id: string;
  role: string;
  content?: string | null;
  error_text?: string | null;
  metadata: unknown;
  model?: string | null;
  usage?: unknown | null;
  seq: number;
  created_at: string;
};

export type AiWorkflowsRow = {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  enabled?: boolean | null;
  trigger_type: string;
  trigger_config: unknown;
  action_type: string;
  action_config: unknown;
  last_run_at?: string | null;
  run_count?: number | null;
  last_result?: unknown | null;
  created_at: string;
  updated_at: string;
};

export type ApiTokensRow = {
  id: string;
  tenant_id: string;
  name: string;
  token_hash: string;
  token_prefix: string;
  scopes: string[];
  last_used_at?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  created_by?: string | null;
};

export type AppointmentNotificationsRow = {
  id: string;
  tenant_id: string;
  block_id: string;
  event_type: string;
  channel: string;
  recipient_type: string;
  recipient_name?: string | null;
  recipient_contact?: string | null;
  message_content: string;
  sent_at: string;
  success: boolean;
  error_message?: string | null;
  created_at: string;
};

export type AuditLogRow = {
  id: string;
  tenant_id: string;
  performed_by?: string | null;
  action: string;
  table_name: string;
  record_id?: string | null;
  old_value?: unknown | null;
  new_value?: unknown | null;
  reason?: string | null;
  created_at?: string | null;
  user_name?: string | null;
  user_role?: string | null;
  location_id?: string | null;
  entity_name?: string | null;
};

export type BillingAdjustmentsRow = {
  id: string;
  tenant_id: string;
  family_id: string;
  student_id: string;
  adjustment_type: string;
  amount_cents?: number | null;
  percent?: number | null;
  reason: string;
  notes?: string | null;
  applies_to_cycle: string;
  applied: boolean;
  applied_at?: string | null;
  applied_to_billing_event_id?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  billing_cycle_id?: string | null;
  status?: string | null;
};

export type BillingCyclesRow = {
  id: string;
  tenant_id: string;
  billing_month: string;
  label: string;
  status: string;
  auto_generated_at?: string | null;
  locked_at?: string | null;
  sent_at?: string | null;
  total_base_cents?: number | null;
  total_adjusted_cents?: number | null;
  total_paid_cents?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type BillingEventsRow = {
  id: string;
  tenant_id: string;
  family_id: string;
  billing_period_id?: string | null;
  amount_cents: number;
  status: string;
  square_payment_id?: string | null;
  failure_reason?: string | null;
  idempotency_key?: string | null;
  attempted_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  student_id?: string | null;
  description?: string | null;
  due_date?: string | null;
  notes?: string | null;
};

export type BillingLineItemsRow = {
  id: string;
  billing_event_id: string;
  student_id: string;
  sessions_count: number;
  rate_per_session_cents: number;
  subtotal_cents: number;
  created_at?: string | null;
};

export type BillingPeriodsRow = {
  id: string;
  tenant_id: string;
  period_label: string;
  billing_date: string;
  status: string;
  total_attempted?: number | null;
  total_succeeded?: number | null;
  total_failed?: number | null;
  total_revenue_cents?: number | null;
  created_at?: string | null;
};

export type BrandSettingsRow = {
  id: string;
  tenant_id: string;
  location_id?: string | null;
  logo_circle_path?: string | null;
  logo_wide_path?: string | null;
  logo_favicon_path?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  background_color?: string | null;
  studio_name?: string | null;
  tagline?: string | null;
  website_domain?: string | null;
  phone?: string | null;
  email?: string | null;
  address_line1?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  google_maps_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
  ga4_id?: string | null;
  meta_pixel_id?: string | null;
  tiktok_pixel_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatConversationsRow = {
  id: string;
  user_id?: string | null;
  title?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ChatMessagesRow = {
  id: string;
  conversation_id?: string | null;
  user_id?: string | null;
  role?: string | null;
  content?: string | null;
  created_at?: string | null;
};

export type CommunicationsRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  family_id: string;
  session_log_id?: string | null;
  created_by?: string | null;
  teacher_id?: string | null;
  type: string;
  subject?: string | null;
  body: string;
  teacher_input_summary?: string | null;
  channel: string;
  status: string;
  sent_at?: string | null;
  read_at?: string | null;
  ai_model?: string | null;
  ai_prompt_tokens?: number | null;
  ai_completion_tokens?: number | null;
  created_at: string;
  updated_at: string;
};

export type ContactChangeRequestsRow = {
  id: string;
  tenant_id: string;
  family_id: string;
  requested_email?: string | null;
  requested_phone?: string | null;
  status?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
};

export type ContentModerationWordsRow = {
  id: number;
  word: string;
  severity?: string | null;
};

export type DashboardAlertsRow = {
  id: string;
  tenant_id: string;
  location_id?: string | null;
  alert_type: string;
  priority: string;
  title: string;
  body?: string | null;
  emoji?: string | null;
  target_role?: string | null;
  target_profile_id?: string | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  related_entity_name?: string | null;
  is_acknowledged?: boolean | null;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  alert_date: string;
  created_by?: string | null;
  created_at?: string | null;
};

export type DirectorCloseoutsRow = {
  id: string;
  tenant_id: string;
  profile_id: string;
  location_id?: string | null;
  closeout_date: string;
  closed_at?: string | null;
  callouts_acknowledged?: boolean | null;
  teacher_nonclosures_followed_up?: boolean | null;
  manual_tasks_completed?: boolean | null;
  is_complete?: boolean | null;
  override_requested?: boolean | null;
  override_request_reason?: string | null;
  override_approved?: boolean | null;
  override_approved_by?: string | null;
  override_approved_at?: string | null;
  created_at?: string | null;
};

export type ExpensesRow = {
  id: string;
  tenant_id: string;
  location_id?: string | null;
  category: string;
  description?: string | null;
  amount_cents: number;
  is_recurring?: boolean | null;
  frequency?: string | null;
  effective_date?: string | null;
  end_date?: string | null;
  created_at: string;
  updated_at: string;
};

export type FamiliesRow = {
  id: string;
  tenant_id: string;
  name: string;
  primary_contact_name?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
  billing_notes?: string | null;
  is_military: boolean;
  profile_id?: string | null;
  created_at: string;
  updated_at: string;
  card_last_four?: string | null;
  card_brand?: string | null;
  square_customer_id?: string | null;
  square_card_id?: string | null;
  card_exp_month?: number | null;
  card_exp_year?: number | null;
  billing_day?: number | null;
  billing_status: string;
  balance: number;
  parent_name?: string | null;
  rate_tier: number;
  rate_tier_override: boolean;
  rate_tier_override_by?: string | null;
  rate_tier_override_at?: string | null;
  rate_tier_reason?: string | null;
  primary_location_id?: string | null;
  parent_first_name?: string | null;
  parent_last_name?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  scheduling_notes?: string | null;
  lifetime_paid_cents: number;
  overdue_balance_cents: number;
  stripe_customer_id_connect?: string | null;
  autopay_enabled?: boolean | null;
  default_payment_method_id?: string | null;
  notify_via_sms: boolean;
  notify_via_email: boolean;
  reminder_4hr: boolean;
  reminder_1hr: boolean;
  sms_opted_out?: boolean | null;
  referral_code?: string | null;
  referred_by_family_id?: string | null;
  referral_count?: number | null;
};

export type FamilyFilesRow = {
  id: string;
  tenant_id: string;
  family_id: string;
  file_type: string;
  file_name: string;
  file_url: string;
  file_size_bytes?: number | null;
  uploaded_by?: string | null;
  notes?: string | null;
  created_at?: string | null;
  signwell_document_id?: string | null;
  signwell_status?: string | null;
  source?: string | null;
};

export type FilesRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  file_type?: string | null;
  file_size?: number | null;
  description?: string | null;
  is_visible_to_parent: boolean;
  created_at: string;
};

export type FinanceAccountsRow = {
  id: string;
  plaid_item_id: string;
  plaid_account_id: string;
  location_id?: string | null;
  account_name: string;
  official_name?: string | null;
  mask?: string | null;
  account_type?: string | null;
  account_subtype?: string | null;
  institution_name?: string | null;
  is_active: boolean;
  is_liquidity_account: boolean;
  include_in_financials: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  tenant_id: string;
};

export type FinanceBalanceSnapshotsRow = {
  id: string;
  account_id: string;
  snapshot_at: string;
  available_balance?: number | null;
  current_balance?: number | null;
  iso_currency_code?: string | null;
  source: string;
  created_at: string;
  tenant_id: string;
};

export type FinanceCategoriesRow = {
  id: string;
  group_id?: string | null;
  key: string;
  name: string;
  description?: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  tenant_id: string;
};

export type FinanceCategoryGroupsRow = {
  id: string;
  key: string;
  name: string;
  direction?: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  tenant_id: string;
};

export type FinanceCategoryRulesRow = {
  id: string;
  category_id: string;
  location_id?: string | null;
  account_id?: string | null;
  rule_type: string;
  match_value?: string | null;
  match_value_2?: string | null;
  priority: number;
  applies_to_direction?: string | null;
  is_active: boolean;
  created_at: string;
  tenant_id: string;
};

export type FinanceExportsRow = {
  id: string;
  requested_by?: string | null;
  location_id?: string | null;
  from_month?: string | null;
  to_month?: string | null;
  export_type: string;
  status: string;
  file_url?: string | null;
  created_at: string;
  completed_at?: string | null;
  tenant_id: string;
};

export type FinanceLocationsRow = {
  id: string;
  code: string;
  name: string;
  location_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  core_location_id?: string | null;
};

export type FinancePlaidItemsRow = {
  id: string;
  plaid_item_id: string;
  institution_id?: string | null;
  institution_name?: string | null;
  status: string;
  transactions_cursor?: string | null;
  last_transactions_sync_at?: string | null;
  last_balances_sync_at?: string | null;
  last_webhook_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  access_token?: string | null;
};

export type FinanceRecurringRulesRow = {
  id: string;
  location_id?: string | null;
  account_id?: string | null;
  category_id?: string | null;
  name: string;
  merchant_match?: string | null;
  transaction_name_match?: string | null;
  amount_hint?: number | null;
  cadence?: string | null;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  tenant_id: string;
};

export type FinanceSyncRunsRow = {
  id: string;
  plaid_item_id?: string | null;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at?: string | null;
  added_count: number;
  modified_count: number;
  removed_count: number;
  error_message?: string | null;
  metadata: unknown;
  tenant_id: string;
};

export type FinanceTransactionCategoryAssignmentsRow = {
  id: string;
  transaction_id: string;
  category_id?: string | null;
  assignment_source: string;
  assigned_by?: string | null;
  confidence?: number | null;
  created_at: string;
  updated_at: string;
  tenant_id: string;
};

export type FinanceTransactionsRow = {
  id: string;
  account_id: string;
  location_id?: string | null;
  plaid_transaction_id?: string | null;
  pending_plaid_transaction_id?: string | null;
  external_reference?: string | null;
  posted_date?: string | null;
  authorized_date?: string | null;
  month_bucket?: string | null;
  transaction_name: string;
  merchant_name?: string | null;
  amount: number;
  iso_currency_code?: string | null;
  unofficial_currency_code?: string | null;
  plaid_primary_category?: string | null;
  plaid_detailed_category?: string | null;
  payment_channel?: string | null;
  is_pending: boolean;
  is_recurring: boolean;
  is_transfer: boolean;
  is_excluded: boolean;
  notes?: string | null;
  raw_payload: unknown;
  created_at: string;
  updated_at: string;
  tenant_id: string;
};

export type GoogleOauthTokensRow = {
  id: string;
  tenant_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  connected_email?: string | null;
  created_at: string;
  updated_at: string;
};

export type IntakeSubmissionsRow = {
  id: string;
  tenant_id: string;
  location_id?: string | null;
  source: string;
  form_version: string;
  raw_payload: unknown;
  lead_ids: string[];
  converted_student_id?: string | null;
  created_at: string;
};

export type IntegrationConfigsRow = {
  id: string;
  tenant_id: string;
  integration_id: string;
  status: string;
  enabled: boolean;
  credentials?: unknown | null;
  settings: unknown;
  connected_at?: string | null;
  connected_by?: string | null;
  updated_at: string;
  last_health_check?: string | null;
  health_status?: string | null;
  health_message?: string | null;
  last_activity_at?: string | null;
  webhook_url?: string | null;
  credentials_encrypted?: string | null;
};

export type IntegrationEventsRow = {
  id: string;
  tenant_id: string;
  source: string;
  event_type: string;
  payload: unknown;
  matched?: boolean | null;
  matched_entity?: string | null;
  matched_entity_id?: string | null;
  error?: string | null;
  created_at?: string | null;
};

export type InvoiceFlagsRow = {
  id: string;
  tenant_id: string;
  invoice_token_id: string;
  family_id: string;
  reason: string;
  flagged_at?: string | null;
  status: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  resolution_notes?: string | null;
};

export type InvoiceTokensRow = {
  id: string;
  tenant_id: string;
  family_id: string;
  token: string;
  billing_period_label?: string | null;
  amount_cents: number;
  status: string;
  expires_at: string;
  viewed_at?: string | null;
  paid_at?: string | null;
  square_payment_id?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  location_id?: string | null;
  due_date?: string | null;
  billing_day?: number | null;
  invoice_snapshot?: unknown | null;
  sent_via?: string | null;
  sent_at?: string | null;
  reminder_count?: number | null;
  last_reminder_at?: string | null;
  billing_cycle_id?: string | null;
  base_amount_cents?: number | null;
  adjustment_total_cents?: number | null;
  is_prorated?: boolean | null;
};

export type IssueReportsRow = {
  id: string;
  tenant_id: string;
  submitted_by: string;
  page_area: string;
  description: string;
  status?: string | null;
  created_at?: string | null;
};

export type IssuesRow = {
  id: string;
  tenant_id: string;
  reported_by: string;
  reported_by_role: string;
  page: string;
  section: string;
  element_description: string;
  title: string;
  description: string;
  screenshot_path?: string | null;
  category: string;
  severity: string;
  status: string;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  related_issue_id?: string | null;
  pipeline_prompt?: string | null;
  pipeline_started_at?: string | null;
  pipeline_completed_at?: string | null;
  deploy_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  platform?: string | null;
  reported_from_url?: string | null;
  reported_screen_width?: number | null;
  reported_screen_height?: number | null;
  subsection?: string | null;
  steps_to_reproduce?: string | null;
  user_friendly_category?: string | null;
};

export type IssuesSafeRow = {
  id?: string | null;
  tenant_id?: string | null;
  reported_by?: string | null;
  reported_by_role?: string | null;
  page?: string | null;
  section?: string | null;
  element_description?: string | null;
  title?: string | null;
  description?: string | null;
  screenshot_path?: string | null;
  category?: string | null;
  severity?: string | null;
  status?: string | null;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  related_issue_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  platform?: string | null;
  reported_from_url?: string | null;
  reported_screen_width?: number | null;
  reported_screen_height?: number | null;
  pipeline_prompt?: string | null;
  pipeline_started_at?: string | null;
  pipeline_completed_at?: string | null;
  deploy_status?: string | null;
  resolved_by?: string | null;
};

export type LeadsRow = {
  id: string;
  tenant_id: string;
  location_id?: string | null;
  first_name: string;
  last_name?: string | null;
  parent_name?: string | null;
  email?: string | null;
  phone?: string | null;
  instrument?: string | null;
  age?: string | null;
  goals?: string | null;
  preferred_days?: string[] | null;
  preferred_times?: string | null;
  stage: LeadStageEnum;
  source?: string | null;
  how_heard?: string | null;
  is_military: boolean;
  assigned_teacher_id?: string | null;
  matched_block_id?: string | null;
  converted_student_id?: string | null;
  follow_up_count: number;
  last_contact_at?: string | null;
  next_follow_up_at?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  ai_context?: unknown | null;
  created_at: string;
  updated_at: string;
  next_action?: string | null;
  assigned_to?: string | null;
  age_range?: string | null;
  experience?: string | null;
  has_instrument?: string | null;
  preferred_locations?: string[] | null;
  personality_notes?: string | null;
  student_name?: string | null;
  compatibility_score?: number | null;
  source_page?: string | null;
  matched_teacher_id?: string | null;
  secondary_location_ids?: string[] | null;
  family_id?: string | null;
  lost_reason?: string | null;
  lost_category?: string | null;
  submission_id?: string | null;
  referral_code_used?: string | null;
  referred_by_family_id?: string | null;
  intake_submission_id?: string | null;
};

export type LocationHoursRow = {
  id: string;
  location_id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed?: boolean | null;
};

export type LocationsRow = {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  google_review_url?: string | null;
  hours_json?: unknown | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  logo_url?: string | null;
  color?: string | null;
  state_rank?: number | null;
  students_enrolled?: number | null;
  students_taught_total?: number | null;
  floorplan_cols?: number | null;
  floorplan_rows?: number | null;
  min_floors?: number | null;
  square_location_id?: string | null;
};

export type LpProspectsRow = {
  id: string;
  first_name: string;
  last_name?: string | null;
  email: string;
  phone?: string | null;
  studio_name?: string | null;
  location_count?: number | null;
  teacher_count?: number | null;
  student_count?: number | null;
  current_software?: string | null;
  biggest_pain_point?: string | null;
  plan_selected?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  converted_tenant_id?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type MakeupSessionsRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  family_id: string;
  location_id: string;
  original_callout_id?: string | null;
  scheduled_date: string;
  day_of_week: number;
  schedule_block_id?: string | null;
  status: string;
  is_payroll_event?: boolean | null;
  year: number;
  expired_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type MessagesRow = {
  id: string;
  tenant_id: string;
  location_id: string;
  direction: MessageDirectionEnum;
  channel: MessageChannelEnum;
  from_phone?: string | null;
  to_phone?: string | null;
  body: string;
  student_id?: string | null;
  lead_id?: string | null;
  family_id?: string | null;
  sent_by?: string | null;
  automation_id?: string | null;
  external_id?: string | null;
  is_automated: boolean;
  ai_drafted: boolean;
  created_at: string;
};

export type NotificationsRow = {
  id: string;
  tenant_id: string;
  profile_id: string;
  type: string;
  title: string;
  body?: string | null;
  route?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
  read?: boolean | null;
  read_at?: string | null;
  created_at: string;
};

export type OauthStateRow = {
  id: string;
  tenant_id: string;
  integration_id: string;
  state_token: string;
  redirect_uri?: string | null;
  scopes?: string[] | null;
  created_by?: string | null;
  created_at: string;
  expires_at: string;
  consumed_at?: string | null;
};

export type OauthStatesRow = {
  id: string;
  state: string;
  tenant_id: string;
  integration_id: string;
  user_id: string;
  client_id: string;
  client_secret_encrypted: string;
  redirect_uri: string;
  extra_params?: unknown | null;
  created_at: string;
  expires_at: string;
  used: boolean;
};

export type OnboardingSequencesRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  family_id?: string | null;
  location_id?: string | null;
  enrollment_date: string;
  day_7_due?: string | null;
  day_7_completed_at?: string | null;
  day_7_type?: string | null;
  day_14_due?: string | null;
  day_14_completed_at?: string | null;
  day_14_type?: string | null;
  day_30_due?: string | null;
  day_30_completed_at?: string | null;
  day_30_type?: string | null;
  day_60_due?: string | null;
  day_60_completed_at?: string | null;
  day_60_type?: string | null;
  day_90_due?: string | null;
  day_90_completed_at?: string | null;
  day_90_type?: string | null;
  status: string;
  risk_flag?: boolean | null;
  risk_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentHistoryRow = {
  id: string;
  tenant_id: string;
  family_id: string;
  square_payment_id?: string | null;
  amount_cents: number;
  status: string;
  card_last_four?: string | null;
  card_brand?: string | null;
  billing_period_id?: string | null;
  session_breakdown?: unknown | null;
  created_at?: string | null;
};

export type PayrollEntriesRow = {
  id: string;
  tenant_id: string;
  period_id: string;
  teacher_id: string;
  sessions_taught: number;
  pay_rate: number;
  session_total?: number | null;
  bonus_amount: number;
  bonus_overridden: boolean;
  bonus_overridden_by?: string | null;
  bonus_overridden_at?: string | null;
  tips: number;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  director_pay?: number | null;
  total_pay?: number | null;
};

export type PayrollPeriodsRow = {
  id: string;
  tenant_id: string;
  period_label: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PendingRemindersRow = {
  id: string;
  block_id: string;
  reminder_type: string;
  fire_at: string;
  fired: boolean;
  cancelled: boolean;
  created_at: string;
};

export type PerformanceAlertsRow = {
  id: string;
  tenant_id: string;
  alert_type: string;
  severity: string;
  message: string;
  details?: unknown | null;
  resolved?: boolean | null;
  resolved_at?: string | null;
  created_at: string;
  dedupe_key: string;
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  worst_metric?: number | null;
  latest_metric?: number | null;
  resolution_reason?: string | null;
  regressed_at?: string | null;
  muted_until?: string | null;
};

export type PerformanceMetricsRow = {
  id: string;
  tenant_id: string;
  session_id: string;
  page_route: string;
  load_time_ms?: number | null;
  fcp_ms?: number | null;
  lcp_ms?: number | null;
  cls_score?: number | null;
  inp_ms?: number | null;
  ttfb_ms?: number | null;
  created_at: string;
};

export type PermissionDefinitionsRow = {
  id: string;
  tenant_id: string;
  category: string;
  key: string;
  label: string;
  description?: string | null;
  owner_default?: boolean | null;
  company_director_default?: boolean | null;
  studio_director_default?: boolean | null;
  teacher_default?: boolean | null;
  parent_default?: boolean | null;
  sort_order?: number | null;
  created_at?: string | null;
};

export type PermissionRequestsRow = {
  id: string;
  tenant_id: string;
  requested_by?: string | null;
  action_description: string;
  table_name?: string | null;
  record_id?: string | null;
  status?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
};

export type PermissionSetGrantsRow = {
  id: string;
  tenant_id: string;
  role: string;
  permission_key: string;
  is_granted: boolean;
  updated_by?: string | null;
  updated_at?: string | null;
};

export type PracticeSessionsRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  instrument?: string | null;
  tool_used?: string | null;
  duration_seconds?: number | null;
  created_at: string;
  family_id?: string | null;
  logged_by?: string | null;
  practice_date: string;
  duration_minutes?: number | null;
  notes?: string | null;
  is_manual_entry: boolean;
};

export type ProfileEditRequestsRow = {
  id: string;
  tenant_id: string;
  student_id?: string | null;
  family_id?: string | null;
  requested_by: string;
  field_name: string;
  current_value?: string | null;
  requested_value?: string | null;
  reason?: string | null;
  status: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  created_at: string;
};

export type ProfileLocationsRow = {
  id: string;
  profile_id: string;
  location_id: string;
  created_at: string;
};

export type ProfilePermissionOverridesRow = {
  id: string;
  tenant_id: string;
  profile_id: string;
  permission_key: string;
  is_granted: boolean;
  granted_by?: string | null;
  reason?: string | null;
  created_at?: string | null;
};

export type ProfilesRow = {
  id: string;
  tenant_id: string;
  role: UserRoleEnum;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  export_pin?: string | null;
  is_platform_admin?: boolean | null;
  onboarding_completed_at?: string | null;
  onboarding_skipped?: boolean | null;
};

export type ProgressReportsRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  family_id: string;
  report_type: ReportIntervalEnum;
  period_start: string;
  period_end: string;
  sessions_scheduled: number;
  sessions_attended: number;
  attendance_rate?: number | null;
  total_sessions_lifetime: number;
  months_enrolled: number;
  ai_summary?: string | null;
  ai_highlights?: string[] | null;
  ai_areas_of_growth?: string[] | null;
  ai_encouragement?: string | null;
  percentile_attendance?: number | null;
  percentile_sessions?: number | null;
  ranking_label?: string | null;
  snapshot_html?: string | null;
  snapshot_shared_url?: string | null;
  is_sent: boolean;
  sent_at?: string | null;
  sent_via?: string | null;
  retention_offer_type?: string | null;
  retention_offer_details?: unknown | null;
  created_at: string;
  updated_at: string;
};

export type QueryPerformanceRow = {
  id: string;
  tenant_id: string;
  query_label: string;
  table_name?: string | null;
  execution_time_ms: number;
  row_count?: number | null;
  is_slow?: boolean | null;
  created_at: string;
};

export type QuizScoresRow = {
  id: string;
  user_id?: string | null;
  category?: string | null;
  score?: number | null;
  total?: number | null;
  percent?: number | null;
  created_at?: string | null;
};

export type RecruitmentProspectsRow = {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  instruments?: string[] | null;
  source?: string | null;
  source_detail?: string | null;
  status: string;
  location_id?: string | null;
  notes?: string | null;
  resume_url?: string | null;
  created_at: string;
  updated_at: string;
};

export type RefundsRow = {
  id: string;
  tenant_id: string;
  family_id: string;
  payment_history_id: string;
  square_refund_id?: string | null;
  amount_cents: number;
  reason: string;
  status: string;
  initiated_by?: string | null;
  created_at?: string | null;
};

export type RetentionCampaignsRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  family_id?: string | null;
  location_id?: string | null;
  campaign_type: string;
  wave_number: number;
  subject?: string | null;
  body?: string | null;
  ai_context?: unknown | null;
  channel?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  sent_at?: string | null;
  read_at?: string | null;
  student_status?: string | null;
  risk_score?: number | null;
  communication_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type RetentionOutreachRow = {
  id: string;
  tenant_id: string;
  student_id?: string | null;
  lead_id?: string | null;
  family_id?: string | null;
  location_id: string;
  outreach_type: string;
  outreach_date: string;
  message_content?: string | null;
  response_received: boolean;
  response_date?: string | null;
  response_content?: string | null;
  outcome?: string | null;
  sent_by?: string | null;
  ai_generated: boolean;
  campaign_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewRequestsRow = {
  id: string;
  tenant_id: string;
  location_id: string;
  student_id?: string | null;
  family_id?: string | null;
  sent_at: string;
  trigger_reason?: string | null;
  message_id?: string | null;
  review_received: boolean;
  review_date?: string | null;
  notes?: string | null;
  created_at: string;
  message_text?: string | null;
  google_review_url?: string | null;
  requested_by?: string | null;
};

export type ReviewsRow = {
  id: string;
  reviewer_name: string;
  location_name: string;
  text_cleaned: string;
  instrument_tag: string;
  is_active?: boolean | null;
  created_at?: string | null;
  tenant_id?: string | null;
  family_id?: string | null;
  student_id?: string | null;
  location_id?: string | null;
  rating?: number | null;
  body?: string | null;
  parent_name?: string | null;
  student_name?: string | null;
  approved?: boolean | null;
  featured?: boolean | null;
  shareable?: boolean | null;
  prompted_by?: string | null;
  review_token?: string | null;
};

export type RolePermissionsRow = {
  id: number;
  role: string;
  permission_key: string;
  allowed: boolean;
  scope?: string | null;
};

export type RoomInventoryRow = {
  id: string;
  room_id?: string | null;
  tenant_id?: string | null;
  item_name: string;
  quantity?: number | null;
  is_flagged?: boolean | null;
  flag_note?: string | null;
  flagged_by?: string | null;
  flagged_at?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolve_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  condition: string;
};

export type RoomsRow = {
  id: string;
  tenant_id?: string | null;
  location_id?: string | null;
  name: string;
  display_order?: number | null;
  layout_x?: number | null;
  layout_y?: number | null;
  layout_w?: number | null;
  layout_h?: number | null;
  primary_instruments?: string[] | null;
  status?: string | null;
  notes?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  floor?: number | null;
  room_type?: string | null;
  color?: string | null;
};

export type ScheduleBlocksRow = {
  id: string;
  tenant_id: string;
  location_id: string;
  teacher_id: string;
  student_id?: string | null;
  block_date: string;
  start_time: string;
  end_time: string;
  status: BlockStatusEnum;
  is_recurring: boolean;
  notes?: string | null;
  ai_context?: unknown | null;
  created_at: string;
  updated_at: string;
  block_type: BlockTypeEnum;
  room?: string | null;
  fifth_week: boolean;
  checked_in: boolean;
  checked_in_at?: string | null;
  checked_in_by?: string | null;
  callout_reason?: string | null;
  room_id?: string | null;
  teacher_tally?: boolean | null;
  generated_from_availability?: boolean | null;
  original_teacher_id?: string | null;
  original_teacher_name?: string | null;
  reminder_sent?: boolean | null;
  is_virtual: boolean;
  meet_link?: string | null;
  meet_event_id?: string | null;
  converted_to_virtual_at?: string | null;
  converted_by?: string | null;
  is_family_callout?: boolean | null;
  callout_id?: string | null;
  is_makeup_session?: boolean | null;
  makeup_session_id?: string | null;
};

export type SchedulingGridRow = {
  block_id?: string | null;
  tenant_id?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  teacher_id?: string | null;
  teacher_name?: string | null;
  student_id?: string | null;
  student_name?: string | null;
  instrument?: string | null;
  block_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: BlockStatusEnum | null;
  is_recurring?: boolean | null;
  notes?: string | null;
  ai_context?: unknown | null;
};

export type SessionLogRow = {
  id: string;
  tenant_id: string;
  schedule_block_id: string;
  location_id: string;
  teacher_id: string;
  student_id: string;
  block_date: string;
  status: string;
  teacher_rate: number;
  student_rate: number;
  lesson_notes?: string | null;
  ai_summary?: string | null;
  ai_context?: unknown | null;
  created_at: string;
  worked_on?: string[] | null;
  engagement_level?: number | null;
  progress_indicator?: string | null;
  voice_note_url?: string | null;
  teacher_note?: string | null;
  communication_id?: string | null;
  instrument?: string | null;
  parent_update_status?: string | null;
  payment_gated: boolean;
};

export type SquareInvoicesRow = {
  id: string;
  tenant_id: string;
  family_id?: string | null;
  square_invoice_id: string;
  square_customer_id?: string | null;
  square_location_id?: string | null;
  status?: string | null;
  amount_cents?: number | null;
  invoice_number?: string | null;
  title?: string | null;
  scheduled_at?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
  square_created_at?: string | null;
  synced_at?: string | null;
  raw_data?: unknown | null;
  requested_amount?: number | null;
  amount_paid?: number | null;
  invoice_date?: string | null;
  location_id?: string | null;
  recurring_series_id?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
};

export type SquarePaymentsFactRow = {
  id: string;
  tenant_id: string;
  square_payment_id: string;
  square_location_id?: string | null;
  location_id?: string | null;
  status: string;
  source_type?: string | null;
  tender_bucket: string;
  amount_money_cents?: number | null;
  tip_money_cents?: number | null;
  total_money_cents?: number | null;
  application_fee_money_cents?: number | null;
  processing_fee_total_cents: number;
  refunded_money_cents?: number | null;
  net_total_cents?: number | null;
  reporting_date: string;
  created_at_square?: string | null;
  updated_at_square?: string | null;
  raw_json: unknown;
  synced_at: string;
};

export type SquareRefundsFactRow = {
  id: string;
  tenant_id: string;
  square_refund_id: string;
  square_payment_id: string;
  square_location_id?: string | null;
  location_id?: string | null;
  status?: string | null;
  amount_money_cents: number;
  reporting_date: string;
  created_at_square?: string | null;
  updated_at_square?: string | null;
  raw_json: unknown;
  synced_at: string;
};

export type StudentAchievementsRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  achievement_key: string;
  achievement_name: string;
  achievement_emoji: string;
  category: string;
  earned_at: string;
};

export type StudentCalloutsRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  family_id: string;
  location_id: string;
  schedule_block_id?: string | null;
  callout_date: string;
  callout_scope: string;
  confirmed_by_parent?: boolean | null;
  confirmed_at?: string | null;
  makeup_session_id?: string | null;
  previous_session_note?: string | null;
  initiated_by_user_id?: string | null;
  is_within_one_hour?: boolean | null;
  no_fifth_week_available?: boolean | null;
  created_at?: string | null;
};

export type StudentDirectorNotesRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  author_id: string;
  author_name: string;
  note_text: string;
  created_at: string;
};

export type StudentDuplicateReviewsRow = {
  id: string;
  tenant_id: string;
  family_id: string;
  lead_id?: string | null;
  new_student_id: string;
  candidate_existing_student_id: string;
  reason: string;
  status: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  created_at: string;
};

export type StudentEffectiveRateRow = {
  student_id?: string | null;
  tenant_id?: string | null;
  family_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  instrument?: string | null;
  status?: StudentStatusEnum | null;
  sessions_per_month?: number | null;
  location_id?: string | null;
  family_name?: string | null;
  billing_status?: string | null;
  billing_day?: number | null;
  rate_tier?: number | null;
  rate_per_session?: number | null;
  monthly_cents?: number | null;
};

export type StudentFilesRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  file_name: string;
  file_url: string;
  file_size?: number | null;
  uploaded_by?: string | null;
  uploaded_by_role?: string | null;
  created_at: string;
  folder: string;
  flagged_for_deletion?: boolean | null;
  flagged_by?: string | null;
  flagged_at?: string | null;
};

export type StudentFollowupsRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  family_id: string;
  followup_date: string;
  reason?: string | null;
  notes?: string | null;
  status: string;
  ai_draft?: string | null;
  sent_at?: string | null;
  sent_by?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type StudentInstrumentsRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  instrument: string;
  teacher_id?: string | null;
  rate_per_session: number;
  sessions_per_month: number;
  is_primary: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

export type StudentMilestonesRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  milestone_type: string;
  milestone_label: string;
  milestone_value?: number | null;
  achieved_at: string;
  report_id?: string | null;
  celebrated: boolean;
  celebrated_at?: string | null;
  created_at: string;
};

export type StudentsRow = {
  id: string;
  tenant_id: string;
  family_id?: string | null;
  location_id?: string | null;
  teacher_id?: string | null;
  profile_id?: string | null;
  first_name: string;
  last_name: string;
  instrument?: string | null;
  status: StudentStatusEnum;
  date_of_birth?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  blocks_per_week: number;
  rate_per_session: number;
  notes?: string | null;
  tags?: string[] | null;
  ai_context?: unknown | null;
  created_at: string;
  updated_at: string;
  total_fifth_weeks: number;
  total_callouts: number;
  exit_reason?: string | null;
  exit_notes?: string | null;
  may_return?: string | null;
  reactivation_date?: string | null;
  overdue_amount?: number | null;
  age?: string | null;
  bio?: string | null;
  first_lesson_date?: string | null;
  card_last_four?: string | null;
  card_brand?: string | null;
  total_lessons_taken?: number | null;
  total_paid?: number | null;
  teacher_notes?: string | null;
  sessions_per_month: number;
  experience?: string | null;
  has_instrument?: string | null;
  preferred_days?: string[] | null;
  source?: string | null;
  is_military?: boolean | null;
  pause_reason?: string | null;
  pause_reason_detail?: string | null;
  coming_back?: boolean | null;
  expected_return_date?: string | null;
  followup_date?: string | null;
  followup_sent?: boolean | null;
  followup_sent_at?: string | null;
  deactivated_at?: string | null;
  deactivated_by?: string | null;
  first_teacher_id?: string | null;
  first_teacher_name?: string | null;
  last_teacher_id?: string | null;
  last_teacher_name?: string | null;
  exit_category?: string | null;
  transferred_to_location_id?: string | null;
  goals?: string | null;
  learning_style?: string | null;
  previous_teacher_id?: string | null;
  teacher_changed_at?: string | null;
  student_display_id?: string | null;
  square_customer_id?: string | null;
  lesson_day_of_week?: number | null;
  fifth_weeks_used?: number | null;
  intake_submission_id?: string | null;
  counts_toward_family_tier: boolean;
  enrollment_type?: string | null;
};

export type StudioClosuresRow = {
  id: string;
  tenant_id: string;
  location_id?: string | null;
  closure_date: string;
  label: string;
  emoji?: string | null;
  affects_billing?: boolean | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type StudioMessagesRow = {
  id: string;
  tenant_id: string;
  family_id: string;
  student_id?: string | null;
  location_id?: string | null;
  message_text: string;
  direction: string;
  sent_via: string;
  quo_queued?: boolean | null;
  quo_delivered_at?: string | null;
  to_phone?: string | null;
  from_phone?: string | null;
  sent_by_profile_id?: string | null;
  read?: boolean | null;
  read_at?: string | null;
  read_by?: string | null;
  created_at?: string | null;
};

export type TasksRow = {
  id: string;
  tenant_id: string;
  task_type: string;
  title: string;
  description?: string | null;
  priority: string;
  assigned_role?: string | null;
  assigned_to?: string | null;
  location_id?: string | null;
  created_by?: string | null;
  created_by_role?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  entity_name?: string | null;
  status: string;
  completed_at?: string | null;
  completed_by?: string | null;
  completion_note?: string | null;
  dedup_key?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  file_verified?: boolean | null;
  escalated?: boolean | null;
  escalated_task_id?: string | null;
  snoozed_until?: string | null;
  recurring?: string | null;
  due_date?: string | null;
};

export type TeacherAvailabilityRow = {
  id: string;
  tenant_id: string;
  teacher_id: string;
  location_id: string;
  day_of_week: DayOfWeekEnum;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TeacherCalloutTallyRow = {
  teacher_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  location_id?: string | null;
  total_callouts?: number | null;
  total_blocks_affected?: number | null;
  last_callout_date?: string | null;
  callouts_this_month?: number | null;
  callouts_last_60_days?: number | null;
};

export type TeacherCalloutsRow = {
  id: string;
  tenant_id: string;
  teacher_id: string;
  location_id: string;
  callout_date: string;
  reason?: string | null;
  blocks_affected: number;
  initiated_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type TeacherCloseoutsRow = {
  id: string;
  tenant_id: string;
  teacher_id: string;
  location_id: string;
  closeout_date: string;
  closed_at?: string | null;
  sessions_requiring_recap?: number | null;
  sessions_with_recap?: number | null;
  is_complete?: boolean | null;
  override_requested?: boolean | null;
  override_request_reason?: string | null;
  override_approved?: boolean | null;
  override_approved_by?: string | null;
  override_approved_at?: string | null;
  created_at?: string | null;
};

export type TeacherDocumentsRow = {
  id: string;
  teacher_id: string;
  file_url: string;
  file_name: string;
  category?: string | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  tenant_id: string;
};

export type TeacherLocationsRow = {
  id: string;
  teacher_id: string;
  location_id: string;
  created_at?: string | null;
};

export type TeacherNotesRow = {
  id: string;
  teacher_id: string;
  note_text: string;
  created_by?: string | null;
  created_at?: string | null;
  tenant_id: string;
};

export type TeacherPayrollSummaryRow = {
  tenant_id?: string | null;
  teacher_id?: string | null;
  profile_id?: string | null;
  teacher_name?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  pay_month?: string | null;
  blocks_taught?: number | null;
  gross_pay?: number | null;
  rate_per_block?: number | null;
};

export type TeacherRoomAssignmentsRow = {
  id: string;
  tenant_id?: string | null;
  teacher_id?: string | null;
  room_id?: string | null;
  location_id?: string | null;
  assignment_date: string;
  created_by?: string | null;
  created_at?: string | null;
};

export type TeacherSessionNotesRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  teacher_id: string;
  schedule_block_id?: string | null;
  note_date: string;
  raw_note: string;
  ai_enhanced_note?: string | null;
  topics_covered?: string[] | null;
  skills_progressing?: string[] | null;
  mood?: string | null;
  is_visible_to_parent: boolean;
  ai_enhanced_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type TeacherStudentNotesRow = {
  id: string;
  tenant_id: string;
  teacher_id: string;
  student_id: string;
  note_text: string;
  moderation_status?: string | null;
  moderation_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type TeacherUploadsRow = {
  id: string;
  tenant_id: string;
  teacher_id: string;
  student_id: string;
  location_id?: string | null;
  file_name: string;
  file_name_original: string;
  storage_path: string;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  moderation_status: string;
  moderation_reason?: string | null;
  visible_to_parent?: boolean | null;
  download_requires_approval?: boolean | null;
  download_approved_by?: string | null;
  download_approved_at?: string | null;
  description?: string | null;
  uploaded_at: string;
  downloadable?: boolean | null;
};

export type TeacherW9Row = {
  id: string;
  tenant_id: string;
  teacher_id: string;
  legal_name: string;
  business_name?: string | null;
  tax_classification: string;
  tax_classification_other?: string | null;
  exempt_payee_code?: string | null;
  fatca_exemption_code?: string | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  tin_type: string;
  tin_encrypted: string;
  tin_last_four: string;
  signature_name: string;
  signed_at: string;
  signed_by_ip?: string | null;
  pdf_url?: string | null;
  pdf_generated_at?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TeachersRow = {
  id: string;
  tenant_id: string;
  profile_id?: string | null;
  instruments: string[];
  bio?: string | null;
  rate_per_block: number;
  is_active: boolean;
  hire_date?: string | null;
  termination_date?: string | null;
  ai_context?: unknown | null;
  created_at: string;
  updated_at: string;
  is_sub_available: boolean;
  sub_available?: boolean | null;
  square_team_member_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  display_name?: string | null;
  teacher_role?: string | null;
  photo_url?: string | null;
  status?: string | null;
  pay_rate_per_half_hour?: number | null;
  internal_match_notes?: string | null;
  personality?: string | null;
  lesson_style?: string | null;
  best_age_range?: string | null;
  needs_1099: boolean;
  documents_locked: boolean;
  w9_status?: string | null;
  w9_completed_at?: string | null;
  contract_status?: string | null;
  contract_signed_at?: string | null;
  contract_pdf_url?: string | null;
  primary_instruments?: string | null;
  secondary_instruments?: string | null;
  style_genre_strengths?: string | null;
  preferred_age_range?: string | null;
  acceptable_age_range?: string | null;
  skill_levels_by_instrument?: string | null;
  teaching_strengths?: string | null;
  musical_strengths_background?: string | null;
  best_first_lesson_fit?: string | null;
  best_match_students?: string | null;
  use_caution_internal_placement_notes?: string | null;
  meet_and_greet_fit?: string | null;
  substitute_coverage?: string | null;
  customer_facing_match_summary?: string | null;
  internal_matching_tags?: string | null;
  director_notes?: string | null;
};

export type TeachersSafeRow = {
  id?: string | null;
  tenant_id?: string | null;
  profile_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  instruments?: string[] | null;
  bio?: string | null;
  photo_url?: string | null;
  teacher_role?: string | null;
  status?: string | null;
  is_active?: boolean | null;
  sub_available?: boolean | null;
  is_sub_available?: boolean | null;
  hire_date?: string | null;
  termination_date?: string | null;
  ai_context?: unknown | null;
  personality?: string | null;
  lesson_style?: string | null;
  best_age_range?: string | null;
  square_team_member_id?: string | null;
  created_at?: string | null;
  pay_rate_per_half_hour?: number | null;
  rate_per_block?: number | null;
  needs_1099?: boolean | null;
  w9_status?: string | null;
  w9_completed_at?: string | null;
  contract_status?: string | null;
  contract_signed_at?: string | null;
  contract_pdf_url?: string | null;
};

export type TenantsRow = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  plan?: string | null;
  trial_ends_at?: string | null;
  billing_email?: string | null;
  location_count_billed?: number | null;
  onboarding_emails_sent?: unknown | null;
  pricing_tier?: string | null;
  onboarding_progress?: unknown | null;
  stripe_connect_account_id?: string | null;
  stripe_connect_status?: string | null;
};

export type TipAttributionsRow = {
  id: string;
  tip_id: string;
  teacher_id: string;
  amount: number;
};

export type TipsRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  period_id: string;
  amount: number;
  split_type?: string | null;
  attribution_confirmed: boolean;
  created_at?: string | null;
};

export type UserProfilesRow = {
  id: string;
  user_id?: string | null;
  name?: string | null;
  email?: string | null;
  created_at?: string | null;
};

export type VFinanceMonthlySummaryRow = {
  month_bucket?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  total_income?: number | null;
  total_expense?: number | null;
  total_transfers?: number | null;
  transaction_count?: number | null;
};

export type VFinanceUncategorizedTransactionsRow = {
  id?: string | null;
  posted_date?: string | null;
  month_bucket?: string | null;
  location_name?: string | null;
  account_name?: string | null;
  transaction_name?: string | null;
  merchant_name?: string | null;
  amount?: number | null;
  is_pending?: boolean | null;
};

export type ValueCardsRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  family_id?: string | null;
  location_id: string;
  period_start: string;
  period_end: string;
  attendance_rate?: number | null;
  total_sessions_period: number;
  attended_sessions_period: number;
  total_sessions_lifetime: number;
  months_enrolled: number;
  percentile_rank?: number | null;
  teacher_highlights?: unknown | null;
  skills_worked_on?: unknown | null;
  milestones?: unknown | null;
  ai_summary?: string | null;
  instrument?: string | null;
  teacher_name?: string | null;
  sent_at?: string | null;
  sent_via?: string | null;
  created_at: string;
};

export type WebhookEventsRow = {
  id: string;
  tenant_id: string;
  integration_id: string;
  direction: string;
  event_type: string;
  payload: unknown;
  status: string;
  response_code?: number | null;
  response_body?: string | null;
  error_message?: string | null;
  attempt_count: number;
  created_at: string;
  latency_ms?: number | null;
  delivery_id?: string | null;
  next_retry_at?: string | null;
  target_url?: string | null;
};

export type ZiroAgentSkillsRow = {
  id: string;
  tenant_id: string;
  agent_id: string;
  skill_id: string;
  is_primary: boolean;
  attached_at: string;
};

export type ZiroAgentsRow = {
  id: string;
  tenant_id: string;
  name: string;
  purpose?: string | null;
  status: string;
  owner_type: string;
  lifecycle_type: string;
  invocation_rules: unknown;
  created_by?: string | null;
  created_at: string;
  last_used_at?: string | null;
  retired_at?: string | null;
  role?: string | null;
  instructions?: string | null;
  usage_triggers: unknown;
  auto_use_by_ziro: boolean;
  profile_summary?: string | null;
  updated_at: string;
  is_visible_in_ui: boolean;
  is_archived: boolean;
  business_context: string;
};

export type ZiroConfigRow = {
  id: string;
  tenant_id: string;
  instructions?: string | null;
  routing_rules: unknown;
  default_skill_ids: string[];
  delegation_rules: unknown;
  created_at: string;
  updated_at: string;
};

export type ZiroIdempotencyKeysRow = {
  tenant_id: string;
  action_type: string;
  idempotency_key: string;
  profile_id: string;
  result: unknown;
  created_at: string;
};

export type ZiroPageIntelligenceBindingsRow = {
  id: string;
  tenant_id: string;
  page_key: string;
  primary_agent_id?: string | null;
  updated_at: string;
  supporting_agent_ids: string[];
};

export type ZiroSkillAssignmentsRow = {
  id: string;
  tenant_id: string;
  skill_id: string;
  workflow_id: string;
  assigned_at: string;
  assigned_by?: string | null;
};

export type ZiroSkillProposalsRow = {
  id: string;
  tenant_id: string;
  proposed_key: string;
  proposed_name: string;
  proposed_description?: string | null;
  proposed_business_context?: string | null;
  proposed_runtime: string;
  proposed_allowed_tools: string[];
  proposed_system_prompt_fragment?: string | null;
  proposed_risk_tier: string;
  proposed_cost_tier: string;
  reason?: string | null;
  status: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  promoted_skill_id?: string | null;
  created_at: string;
};

export type ZiroSkillsRow = {
  id: string;
  tenant_id: string;
  key: string;
  name: string;
  description?: string | null;
  business_context?: string | null;
  runtime: string;
  allowed_tools: string[];
  system_prompt_fragment?: string | null;
  risk_tier: string;
  cost_tier: string;
  is_active: boolean;
  is_system: boolean;
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  last_used_at?: string | null;
  use_count: number;
  created_at: string;
  updated_at: string;
};

export type ZiroTaskAgentsRow = {
  id: string;
  tenant_id: string;
  task_run_id: string;
  agent_type: string;
  status: string;
  skill_key?: string | null;
  config: unknown;
  result?: unknown | null;
  error_text?: string | null;
  spawned_at: string;
  heartbeat_at?: string | null;
  retired_at?: string | null;
};

export type ZiroTaskRunsRow = {
  id: string;
  tenant_id: string;
  profile_id: string;
  conversation_id?: string | null;
  origin_message_id?: string | null;
  skill_id?: string | null;
  status: string;
  classification: string;
  intent_summary?: string | null;
  skill_key?: string | null;
  selected_runtime?: string | null;
  selected_tools: string[];
  prompt_fragment?: string | null;
  input_payload: unknown;
  output_payload?: unknown | null;
  error_text?: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  route_chosen?: string | null;
  agent_used_id?: string | null;
  created_temp_agent: boolean;
  retained_after_task: boolean;
  result_summary?: string | null;
  routing_explanation?: string | null;
};
