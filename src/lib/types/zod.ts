/**
 * Zod schemas mirroring db/schema/schema.sql (nullability; defaults where expressible as static literals).
 * AUTO-GENERATED — do not edit by hand.
 */

import { z } from "zod";

import { BlockStatusEnum, BlockTypeEnum, LeadStageEnum, MessageChannelEnum, StudentStatusEnum } from "./enums";

export const blockStatusEnumSchema = z.nativeEnum(BlockStatusEnum);
export const blockTypeEnumSchema = z.nativeEnum(BlockTypeEnum);
export const dayOfWeekEnumSchema = z.string();
export const leadStageEnumSchema = z.nativeEnum(LeadStageEnum);
export const messageChannelEnumSchema = z.nativeEnum(MessageChannelEnum);
export const messageDirectionEnumSchema = z.string();
export const reportIntervalEnumSchema = z.string();
export const studentStatusEnumSchema = z.nativeEnum(StudentStatusEnum);
export const userRoleEnumSchema = z.string();

export const activityLogRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  user_name: z.string().nullable(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string().uuid().nullable(),
  entity_name: z.string().nullable(),
  details: z.string().nullable(),
  created_at: z.string(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  location_id: z.string().uuid().nullable(),
});
export type ActivityLogRowParsed = z.infer<typeof activityLogRowSchema>;

export const aiActionLogsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable(),
  action_id: z.string(),
  payload: z.unknown().nullable(),
  result: z.unknown().nullable(),
  ok: z.boolean(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  idempotency_key: z.string().nullable(),
  created_at: z.string(),
});
export type AiActionLogsRowParsed = z.infer<typeof aiActionLogsRowSchema>;

export const aiConversationsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  source: z.string().default("ziro_unknown"),
  client_route: z.string().nullable(),
  page_context: z.unknown().default({}),
  metadata: z.unknown().default({}),
  created_at: z.string(),
  updated_at: z.string(),
});
export type AiConversationsRowParsed = z.infer<typeof aiConversationsRowSchema>;

export const aiFeedbackRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable(),
  message_id: z.string().uuid().nullable(),
  rating: z.number().int().nullable(),
  comment: z.string().nullable(),
  created_at: z.string(),
});
export type AiFeedbackRowParsed = z.infer<typeof aiFeedbackRowSchema>;

export const aiLegacyMessageLogRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  role: z.string(),
  content: z.string(),
  metadata: z.unknown().nullable(),
  created_at: z.string(),
});
export type AiLegacyMessageLogRowParsed = z.infer<typeof aiLegacyMessageLogRowSchema>;

export const aiMessagesRowSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  role: z.string(),
  content: z.string().nullable(),
  error_text: z.string().nullable(),
  metadata: z.unknown().default({}),
  model: z.string().nullable(),
  usage: z.unknown().nullable(),
  seq: z.number().int().default(0),
  created_at: z.string(),
});
export type AiMessagesRowParsed = z.infer<typeof aiMessagesRowSchema>;

export const aiWorkflowsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  enabled: z.boolean().nullable(),
  trigger_type: z.string(),
  trigger_config: z.unknown(),
  action_type: z.string(),
  action_config: z.unknown(),
  last_run_at: z.string().nullable(),
  run_count: z.number().int().nullable(),
  last_result: z.unknown().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type AiWorkflowsRowParsed = z.infer<typeof aiWorkflowsRowSchema>;

export const apiTokensRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
  name: z.string(),
  token_hash: z.string(),
  token_prefix: z.string(),
  scopes: z.array(z.string()),
  last_used_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  created_at: z.string(),
  created_by: z.string().uuid().nullable(),
});
export type ApiTokensRowParsed = z.infer<typeof apiTokensRowSchema>;

export const appointmentNotificationsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  block_id: z.string().uuid(),
  event_type: z.string(),
  channel: z.string(),
  recipient_type: z.string(),
  recipient_name: z.string().nullable(),
  recipient_contact: z.string().nullable(),
  message_content: z.string(),
  sent_at: z.string(),
  success: z.boolean().default(true),
  error_message: z.string().nullable(),
  created_at: z.string(),
});
export type AppointmentNotificationsRowParsed = z.infer<typeof appointmentNotificationsRowSchema>;

export const auditLogRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  performed_by: z.string().uuid().nullable(),
  action: z.string(),
  table_name: z.string(),
  record_id: z.string().uuid().nullable(),
  old_value: z.unknown().nullable(),
  new_value: z.unknown().nullable(),
  reason: z.string().nullable(),
  created_at: z.string().nullable(),
  user_name: z.string().nullable(),
  user_role: z.string().nullable(),
  location_id: z.string().uuid().nullable(),
  entity_name: z.string().nullable(),
});
export type AuditLogRowParsed = z.infer<typeof auditLogRowSchema>;

export const billingAdjustmentsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  family_id: z.string().uuid(),
  student_id: z.string().uuid(),
  adjustment_type: z.string(),
  amount_cents: z.number().int().nullable(),
  percent: z.number().nullable(),
  reason: z.string(),
  notes: z.string().nullable(),
  applies_to_cycle: z.string(),
  applied: z.boolean().default(false),
  applied_at: z.string().nullable(),
  applied_to_billing_event_id: z.string().uuid().nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string().nullable(),
  billing_cycle_id: z.string().uuid().nullable(),
  status: z.string().nullable(),
});
export type BillingAdjustmentsRowParsed = z.infer<typeof billingAdjustmentsRowSchema>;

export const billingCyclesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  billing_month: z.string(),
  label: z.string(),
  status: z.string().default("open"),
  auto_generated_at: z.string().nullable(),
  locked_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  total_base_cents: z.number().int().nullable(),
  total_adjusted_cents: z.number().int().nullable(),
  total_paid_cents: z.number().int().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type BillingCyclesRowParsed = z.infer<typeof billingCyclesRowSchema>;

export const billingEventsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  family_id: z.string().uuid(),
  billing_period_id: z.string().uuid().nullable(),
  amount_cents: z.number().int(),
  status: z.string().default("pending"),
  square_payment_id: z.string().nullable(),
  failure_reason: z.string().nullable(),
  idempotency_key: z.string().nullable(),
  attempted_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string().nullable(),
  student_id: z.string().uuid().nullable(),
  description: z.string().nullable(),
  due_date: z.string().nullable(),
  notes: z.string().nullable(),
});
export type BillingEventsRowParsed = z.infer<typeof billingEventsRowSchema>;

export const billingLineItemsRowSchema = z.object({
  id: z.string().uuid(),
  billing_event_id: z.string().uuid(),
  student_id: z.string().uuid(),
  sessions_count: z.number().int(),
  rate_per_session_cents: z.number().int(),
  subtotal_cents: z.number().int(),
  created_at: z.string().nullable(),
});
export type BillingLineItemsRowParsed = z.infer<typeof billingLineItemsRowSchema>;

export const billingPeriodsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  period_label: z.string(),
  billing_date: z.string(),
  status: z.string().default("pending"),
  total_attempted: z.number().int().nullable(),
  total_succeeded: z.number().int().nullable(),
  total_failed: z.number().int().nullable(),
  total_revenue_cents: z.number().int().nullable(),
  created_at: z.string().nullable(),
});
export type BillingPeriodsRowParsed = z.infer<typeof billingPeriodsRowSchema>;

export const brandSettingsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  logo_circle_path: z.string().nullable(),
  logo_wide_path: z.string().nullable(),
  logo_favicon_path: z.string().nullable(),
  primary_color: z.string().nullable(),
  secondary_color: z.string().nullable(),
  background_color: z.string().nullable(),
  studio_name: z.string().nullable(),
  tagline: z.string().nullable(),
  website_domain: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address_line1: z.string().nullable(),
  address_city: z.string().nullable(),
  address_state: z.string().nullable(),
  address_zip: z.string().nullable(),
  google_maps_url: z.string().nullable(),
  facebook_url: z.string().nullable(),
  instagram_url: z.string().nullable(),
  tiktok_url: z.string().nullable(),
  youtube_url: z.string().nullable(),
  ga4_id: z.string().nullable(),
  meta_pixel_id: z.string().nullable(),
  tiktok_pixel_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type BrandSettingsRowParsed = z.infer<typeof brandSettingsRowSchema>;

export const chatConversationsRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  title: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type ChatConversationsRowParsed = z.infer<typeof chatConversationsRowSchema>;

export const chatMessagesRowSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable(),
  user_id: z.string().uuid().nullable(),
  role: z.string().nullable(),
  content: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type ChatMessagesRowParsed = z.infer<typeof chatMessagesRowSchema>;

export const communicationsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  family_id: z.string().uuid(),
  session_log_id: z.string().uuid().nullable(),
  created_by: z.string().uuid().nullable(),
  teacher_id: z.string().uuid().nullable(),
  type: z.string().default("progress_update"),
  subject: z.string().nullable(),
  body: z.string(),
  teacher_input_summary: z.string().nullable(),
  channel: z.string().default("in_app"),
  status: z.string().default("draft"),
  sent_at: z.string().nullable(),
  read_at: z.string().nullable(),
  ai_model: z.string().nullable(),
  ai_prompt_tokens: z.number().int().nullable(),
  ai_completion_tokens: z.number().int().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type CommunicationsRowParsed = z.infer<typeof communicationsRowSchema>;

export const contactChangeRequestsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  family_id: z.string().uuid(),
  requested_email: z.string().nullable(),
  requested_phone: z.string().nullable(),
  status: z.string().nullable(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type ContactChangeRequestsRowParsed = z.infer<typeof contactChangeRequestsRowSchema>;

export const contentModerationWordsRowSchema = z.object({
  id: z.number().int(),
  word: z.string(),
  severity: z.string().nullable(),
});
export type ContentModerationWordsRowParsed = z.infer<typeof contentModerationWordsRowSchema>;

export const dashboardAlertsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  alert_type: z.string(),
  priority: z.string().default("normal"),
  title: z.string(),
  body: z.string().nullable(),
  emoji: z.string().nullable(),
  target_role: z.string().nullable(),
  target_profile_id: z.string().uuid().nullable(),
  related_entity_type: z.string().nullable(),
  related_entity_id: z.string().uuid().nullable(),
  related_entity_name: z.string().nullable(),
  is_acknowledged: z.boolean().nullable(),
  acknowledged_by: z.string().uuid().nullable(),
  acknowledged_at: z.string().nullable(),
  alert_date: z.string(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string().nullable(),
});
export type DashboardAlertsRowParsed = z.infer<typeof dashboardAlertsRowSchema>;

export const directorCloseoutsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  closeout_date: z.string(),
  closed_at: z.string().nullable(),
  callouts_acknowledged: z.boolean().nullable(),
  teacher_nonclosures_followed_up: z.boolean().nullable(),
  manual_tasks_completed: z.boolean().nullable(),
  is_complete: z.boolean().nullable(),
  override_requested: z.boolean().nullable(),
  override_request_reason: z.string().nullable(),
  override_approved: z.boolean().nullable(),
  override_approved_by: z.string().uuid().nullable(),
  override_approved_at: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type DirectorCloseoutsRowParsed = z.infer<typeof directorCloseoutsRowSchema>;

export const expensesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  category: z.string(),
  description: z.string().nullable(),
  amount_cents: z.number().int(),
  is_recurring: z.boolean().nullable(),
  frequency: z.string().nullable(),
  effective_date: z.string().nullable(),
  end_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ExpensesRowParsed = z.infer<typeof expensesRowSchema>;

export const familiesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  primary_contact_name: z.string().nullable(),
  primary_email: z.string().nullable(),
  primary_phone: z.string().nullable(),
  billing_notes: z.string().nullable(),
  is_military: z.boolean().default(false),
  profile_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  card_last_four: z.string().nullable(),
  card_brand: z.string().nullable(),
  square_customer_id: z.string().nullable(),
  square_card_id: z.string().nullable(),
  card_exp_month: z.number().int().nullable(),
  card_exp_year: z.number().int().nullable(),
  billing_day: z.number().int().nullable(),
  billing_status: z.string().default("active"),
  balance: z.number().int().default(0),
  parent_name: z.string().nullable(),
  rate_tier: z.number().int().default(4500),
  rate_tier_override: z.boolean().default(false),
  rate_tier_override_by: z.string().uuid().nullable(),
  rate_tier_override_at: z.string().nullable(),
  rate_tier_reason: z.string().nullable(),
  primary_location_id: z.string().uuid().nullable(),
  parent_first_name: z.string().nullable(),
  parent_last_name: z.string().nullable(),
  emergency_contact_name: z.string().nullable(),
  emergency_contact_phone: z.string().nullable(),
  emergency_contact_relationship: z.string().nullable(),
  scheduling_notes: z.string().nullable(),
  lifetime_paid_cents: z.number().int().default(0),
  overdue_balance_cents: z.number().int().default(0),
  stripe_customer_id_connect: z.string().nullable(),
  autopay_enabled: z.boolean().nullable(),
  default_payment_method_id: z.string().nullable(),
  notify_via_sms: z.boolean().default(true),
  notify_via_email: z.boolean().default(true),
  reminder_4hr: z.boolean().default(true),
  reminder_1hr: z.boolean().default(false),
  sms_opted_out: z.boolean().nullable(),
  referral_code: z.string().nullable(),
  referred_by_family_id: z.string().uuid().nullable(),
  referral_count: z.number().int().nullable(),
});
export type FamiliesRowParsed = z.infer<typeof familiesRowSchema>;

export const familyFilesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  family_id: z.string().uuid(),
  file_type: z.string(),
  file_name: z.string(),
  file_url: z.string(),
  file_size_bytes: z.number().int().nullable(),
  uploaded_by: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  created_at: z.string().nullable(),
  signwell_document_id: z.string().nullable(),
  signwell_status: z.string().nullable(),
  source: z.string().nullable(),
});
export type FamilyFilesRowParsed = z.infer<typeof familyFilesRowSchema>;

export const filesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  uploaded_by: z.string().uuid(),
  file_name: z.string(),
  file_path: z.string(),
  file_type: z.string().nullable(),
  file_size: z.number().int().nullable(),
  description: z.string().nullable(),
  is_visible_to_parent: z.boolean().default(true),
  created_at: z.string(),
});
export type FilesRowParsed = z.infer<typeof filesRowSchema>;

export const financeAccountsRowSchema = z.object({
  id: z.string().uuid(),
  plaid_item_id: z.string().uuid(),
  plaid_account_id: z.string(),
  location_id: z.string().uuid().nullable(),
  account_name: z.string(),
  official_name: z.string().nullable(),
  mask: z.string().nullable(),
  account_type: z.string().nullable(),
  account_subtype: z.string().nullable(),
  institution_name: z.string().nullable(),
  is_active: z.boolean().default(true),
  is_liquidity_account: z.boolean().default(true),
  include_in_financials: z.boolean().default(true),
  display_order: z.number().int().default(100),
  created_at: z.string(),
  updated_at: z.string(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
});
export type FinanceAccountsRowParsed = z.infer<typeof financeAccountsRowSchema>;

export const financeBalanceSnapshotsRowSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  snapshot_at: z.string(),
  available_balance: z.number().nullable(),
  current_balance: z.number().nullable(),
  iso_currency_code: z.string().nullable(),
  source: z.string().default("plaid"),
  created_at: z.string(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
});
export type FinanceBalanceSnapshotsRowParsed = z.infer<typeof financeBalanceSnapshotsRowSchema>;

export const financeCategoriesRowSchema = z.object({
  id: z.string().uuid(),
  group_id: z.string().uuid().nullable(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  is_system: z.boolean().default(false),
  is_active: z.boolean().default(true),
  created_at: z.string(),
  updated_at: z.string(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
});
export type FinanceCategoriesRowParsed = z.infer<typeof financeCategoriesRowSchema>;

export const financeCategoryGroupsRowSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  direction: z.string().nullable(),
  display_order: z.number().int().default(100),
  is_active: z.boolean().default(true),
  created_at: z.string(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
});
export type FinanceCategoryGroupsRowParsed = z.infer<typeof financeCategoryGroupsRowSchema>;

export const financeCategoryRulesRowSchema = z.object({
  id: z.string().uuid(),
  category_id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  account_id: z.string().uuid().nullable(),
  rule_type: z.string(),
  match_value: z.string().nullable(),
  match_value_2: z.string().nullable(),
  priority: z.number().int().default(100),
  applies_to_direction: z.string().nullable(),
  is_active: z.boolean().default(true),
  created_at: z.string(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
});
export type FinanceCategoryRulesRowParsed = z.infer<typeof financeCategoryRulesRowSchema>;

export const financeExportsRowSchema = z.object({
  id: z.string().uuid(),
  requested_by: z.string().nullable(),
  location_id: z.string().uuid().nullable(),
  from_month: z.string().nullable(),
  to_month: z.string().nullable(),
  export_type: z.string(),
  status: z.string().default("pending"),
  file_url: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
});
export type FinanceExportsRowParsed = z.infer<typeof financeExportsRowSchema>;

export const financeLocationsRowSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  location_type: z.string(),
  is_active: z.boolean().default(true),
  created_at: z.string(),
  updated_at: z.string(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
  core_location_id: z.string().uuid().nullable(),
});
export type FinanceLocationsRowParsed = z.infer<typeof financeLocationsRowSchema>;

export const financePlaidItemsRowSchema = z.object({
  id: z.string().uuid(),
  plaid_item_id: z.string(),
  institution_id: z.string().nullable(),
  institution_name: z.string().nullable(),
  status: z.string().default("active"),
  transactions_cursor: z.string().nullable(),
  last_transactions_sync_at: z.string().nullable(),
  last_balances_sync_at: z.string().nullable(),
  last_webhook_at: z.string().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
  access_token: z.string().nullable(),
});
export type FinancePlaidItemsRowParsed = z.infer<typeof financePlaidItemsRowSchema>;

export const financeRecurringRulesRowSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  account_id: z.string().uuid().nullable(),
  category_id: z.string().uuid().nullable(),
  name: z.string(),
  merchant_match: z.string().nullable(),
  transaction_name_match: z.string().nullable(),
  amount_hint: z.number().nullable(),
  cadence: z.string().nullable(),
  is_active: z.boolean().default(true),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
});
export type FinanceRecurringRulesRowParsed = z.infer<typeof financeRecurringRulesRowSchema>;

export const financeSyncRunsRowSchema = z.object({
  id: z.string().uuid(),
  plaid_item_id: z.string().uuid().nullable(),
  sync_type: z.string(),
  status: z.string(),
  started_at: z.string(),
  completed_at: z.string().nullable(),
  added_count: z.number().int().default(0),
  modified_count: z.number().int().default(0),
  removed_count: z.number().int().default(0),
  error_message: z.string().nullable(),
  metadata: z.unknown().default({}),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
});
export type FinanceSyncRunsRowParsed = z.infer<typeof financeSyncRunsRowSchema>;

export const financeTransactionCategoryAssignmentsRowSchema = z.object({
  id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  category_id: z.string().uuid().nullable(),
  assignment_source: z.string(),
  assigned_by: z.string().nullable(),
  confidence: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
});
export type FinanceTransactionCategoryAssignmentsRowParsed = z.infer<typeof financeTransactionCategoryAssignmentsRowSchema>;

export const financeTransactionsRowSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  plaid_transaction_id: z.string().nullable(),
  pending_plaid_transaction_id: z.string().nullable(),
  external_reference: z.string().nullable(),
  posted_date: z.string().nullable(),
  authorized_date: z.string().nullable(),
  month_bucket: z.string().nullable(),
  transaction_name: z.string(),
  merchant_name: z.string().nullable(),
  amount: z.number(),
  iso_currency_code: z.string().nullable(),
  unofficial_currency_code: z.string().nullable(),
  plaid_primary_category: z.string().nullable(),
  plaid_detailed_category: z.string().nullable(),
  payment_channel: z.string().nullable(),
  is_pending: z.boolean().default(false),
  is_recurring: z.boolean().default(false),
  is_transfer: z.boolean().default(false),
  is_excluded: z.boolean().default(false),
  notes: z.string().nullable(),
  raw_payload: z.unknown().default({}),
  created_at: z.string(),
  updated_at: z.string(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
});
export type FinanceTransactionsRowParsed = z.infer<typeof financeTransactionsRowSchema>;

export const googleOauthTokensRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.string(),
  connected_email: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type GoogleOauthTokensRowParsed = z.infer<typeof googleOauthTokensRowSchema>;

export const intakeSubmissionsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  source: z.string().default("website_form"),
  form_version: z.string().default("1"),
  raw_payload: z.unknown(),
  lead_ids: z.array(z.string().uuid()),
  converted_student_id: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type IntakeSubmissionsRowParsed = z.infer<typeof intakeSubmissionsRowSchema>;

export const integrationConfigsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
  integration_id: z.string(),
  status: z.string().default("connected"),
  enabled: z.boolean().default(true),
  credentials: z.unknown().nullable(),
  settings: z.unknown().default({}),
  connected_at: z.string().nullable(),
  connected_by: z.string().uuid().nullable(),
  updated_at: z.string(),
  last_health_check: z.string().nullable(),
  health_status: z.string().nullable(),
  health_message: z.string().nullable(),
  last_activity_at: z.string().nullable(),
  webhook_url: z.string().nullable(),
  credentials_encrypted: z.string().nullable(),
});
export type IntegrationConfigsRowParsed = z.infer<typeof integrationConfigsRowSchema>;

export const integrationEventsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  source: z.string(),
  event_type: z.string(),
  payload: z.unknown().default({}),
  matched: z.boolean().nullable(),
  matched_entity: z.string().nullable(),
  matched_entity_id: z.string().uuid().nullable(),
  error: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type IntegrationEventsRowParsed = z.infer<typeof integrationEventsRowSchema>;

export const invoiceFlagsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  invoice_token_id: z.string().uuid(),
  family_id: z.string().uuid(),
  reason: z.string(),
  flagged_at: z.string().nullable(),
  status: z.string().default("open"),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.string().nullable(),
  resolution_notes: z.string().nullable(),
});
export type InvoiceFlagsRowParsed = z.infer<typeof invoiceFlagsRowSchema>;

export const invoiceTokensRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  family_id: z.string().uuid(),
  token: z.string(),
  billing_period_label: z.string().nullable(),
  amount_cents: z.number().int(),
  status: z.string().default("pending"),
  expires_at: z.string(),
  viewed_at: z.string().nullable(),
  paid_at: z.string().nullable(),
  square_payment_id: z.string().nullable(),
  created_at: z.string().nullable(),
  created_by: z.string().uuid().nullable(),
  location_id: z.string().uuid().nullable(),
  due_date: z.string().nullable(),
  billing_day: z.number().int().nullable(),
  invoice_snapshot: z.unknown().nullable(),
  sent_via: z.string().nullable(),
  sent_at: z.string().nullable(),
  reminder_count: z.number().int().nullable(),
  last_reminder_at: z.string().nullable(),
  billing_cycle_id: z.string().uuid().nullable(),
  base_amount_cents: z.number().int().nullable(),
  adjustment_total_cents: z.number().int().nullable(),
  is_prorated: z.boolean().nullable(),
});
export type InvoiceTokensRowParsed = z.infer<typeof invoiceTokensRowSchema>;

export const issueReportsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  submitted_by: z.string().uuid(),
  page_area: z.string(),
  description: z.string(),
  status: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type IssueReportsRowParsed = z.infer<typeof issueReportsRowSchema>;

export const issuesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  reported_by: z.string().uuid(),
  reported_by_role: z.string(),
  page: z.string(),
  section: z.string(),
  element_description: z.string(),
  title: z.string(),
  description: z.string(),
  screenshot_path: z.string().nullable(),
  category: z.string().default("bug"),
  severity: z.string().default("normal"),
  status: z.string().default("reported"),
  resolution_notes: z.string().nullable(),
  resolved_at: z.string().nullable(),
  resolved_by: z.string().nullable(),
  related_issue_id: z.string().uuid().nullable(),
  pipeline_prompt: z.string().nullable(),
  pipeline_started_at: z.string().nullable(),
  pipeline_completed_at: z.string().nullable(),
  deploy_status: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  platform: z.string().nullable(),
  reported_from_url: z.string().nullable(),
  reported_screen_width: z.number().int().nullable(),
  reported_screen_height: z.number().int().nullable(),
  subsection: z.string().nullable(),
  steps_to_reproduce: z.string().nullable(),
  user_friendly_category: z.string().nullable(),
});
export type IssuesRowParsed = z.infer<typeof issuesRowSchema>;

export const issuesSafeRowSchema = z.object({
  id: z.string().uuid().nullable(),
  tenant_id: z.string().uuid().nullable(),
  reported_by: z.string().uuid().nullable(),
  reported_by_role: z.string().nullable(),
  page: z.string().nullable(),
  section: z.string().nullable(),
  element_description: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  screenshot_path: z.string().nullable(),
  category: z.string().nullable(),
  severity: z.string().nullable(),
  status: z.string().nullable(),
  resolution_notes: z.string().nullable(),
  resolved_at: z.string().nullable(),
  related_issue_id: z.string().uuid().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  platform: z.string().nullable(),
  reported_from_url: z.string().nullable(),
  reported_screen_width: z.number().int().nullable(),
  reported_screen_height: z.number().int().nullable(),
  pipeline_prompt: z.string().nullable(),
  pipeline_started_at: z.string().nullable(),
  pipeline_completed_at: z.string().nullable(),
  deploy_status: z.string().nullable(),
  resolved_by: z.string().nullable(),
});
export type IssuesSafeRowParsed = z.infer<typeof issuesSafeRowSchema>;

export const leadsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  first_name: z.string(),
  last_name: z.string().nullable(),
  parent_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  instrument: z.string().nullable(),
  age: z.string().nullable(),
  goals: z.string().nullable(),
  preferred_days: z.array(z.string()).nullable(),
  preferred_times: z.string().nullable(),
  stage: leadStageEnumSchema.default("inquiry"),
  source: z.string().nullable(),
  how_heard: z.string().nullable(),
  is_military: z.boolean().default(false),
  assigned_teacher_id: z.string().uuid().nullable(),
  matched_block_id: z.string().uuid().nullable(),
  converted_student_id: z.string().uuid().nullable(),
  follow_up_count: z.number().int().default(0),
  last_contact_at: z.string().nullable(),
  next_follow_up_at: z.string().nullable(),
  notes: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  ai_context: z.unknown().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  next_action: z.string().nullable(),
  assigned_to: z.string().uuid().nullable(),
  age_range: z.string().nullable(),
  experience: z.string().nullable(),
  has_instrument: z.string().nullable(),
  preferred_locations: z.array(z.string()).nullable(),
  personality_notes: z.string().nullable(),
  student_name: z.string().nullable(),
  compatibility_score: z.number().int().nullable(),
  source_page: z.string().nullable(),
  matched_teacher_id: z.string().uuid().nullable(),
  secondary_location_ids: z.array(z.string().uuid()).nullable(),
  family_id: z.string().uuid().nullable(),
  lost_reason: z.string().nullable(),
  lost_category: z.string().nullable(),
  submission_id: z.string().uuid().nullable(),
  referral_code_used: z.string().nullable(),
  referred_by_family_id: z.string().uuid().nullable(),
  intake_submission_id: z.string().uuid().nullable(),
});
export type LeadsRowParsed = z.infer<typeof leadsRowSchema>;

export const locationHoursRowSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid(),
  day_of_week: z.number().int(),
  open_time: z.string(),
  close_time: z.string(),
  is_closed: z.boolean().nullable(),
});
export type LocationHoursRowParsed = z.infer<typeof locationHoursRowSchema>;

export const locationsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string().default("NE"),
  zip: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  google_review_url: z.string().nullable(),
  hours_json: z.unknown().nullable(),
  is_active: z.boolean().default(true),
  created_at: z.string(),
  updated_at: z.string(),
  logo_url: z.string().nullable(),
  color: z.string().nullable(),
  state_rank: z.number().int().nullable(),
  students_enrolled: z.number().int().nullable(),
  students_taught_total: z.number().int().nullable(),
  floorplan_cols: z.number().int().nullable(),
  floorplan_rows: z.number().int().nullable(),
  min_floors: z.number().int().nullable(),
  square_location_id: z.string().nullable(),
});
export type LocationsRowParsed = z.infer<typeof locationsRowSchema>;

export const lpProspectsRowSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string(),
  last_name: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  studio_name: z.string().nullable(),
  location_count: z.number().int().nullable(),
  teacher_count: z.number().int().nullable(),
  student_count: z.number().int().nullable(),
  current_software: z.string().nullable(),
  biggest_pain_point: z.string().nullable(),
  plan_selected: z.string().nullable(),
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  utm_campaign: z.string().nullable(),
  converted_tenant_id: z.string().uuid().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type LpProspectsRowParsed = z.infer<typeof lpProspectsRowSchema>;

export const makeupSessionsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  family_id: z.string().uuid(),
  location_id: z.string().uuid(),
  original_callout_id: z.string().uuid().nullable(),
  scheduled_date: z.string(),
  day_of_week: z.number().int(),
  schedule_block_id: z.string().uuid().nullable(),
  status: z.string().default("banked"),
  is_payroll_event: z.boolean().nullable(),
  year: z.number().int(),
  expired_at: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type MakeupSessionsRowParsed = z.infer<typeof makeupSessionsRowSchema>;

export const messagesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  direction: messageDirectionEnumSchema,
  channel: messageChannelEnumSchema.default("sms"),
  from_phone: z.string().nullable(),
  to_phone: z.string().nullable(),
  body: z.string(),
  student_id: z.string().uuid().nullable(),
  lead_id: z.string().uuid().nullable(),
  family_id: z.string().uuid().nullable(),
  sent_by: z.string().uuid().nullable(),
  automation_id: z.string().nullable(),
  external_id: z.string().nullable(),
  is_automated: z.boolean().default(false),
  ai_drafted: z.boolean().default(false),
  created_at: z.string(),
});
export type MessagesRowParsed = z.infer<typeof messagesRowSchema>;

export const notificationsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  route: z.string().nullable(),
  reference_id: z.string().uuid().nullable(),
  reference_type: z.string().nullable(),
  read: z.boolean().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
export type NotificationsRowParsed = z.infer<typeof notificationsRowSchema>;

export const oauthStateRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
  integration_id: z.string(),
  state_token: z.string(),
  redirect_uri: z.string().nullable(),
  scopes: z.array(z.string()).nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
  expires_at: z.string(),
  consumed_at: z.string().nullable(),
});
export type OauthStateRowParsed = z.infer<typeof oauthStateRowSchema>;

export const oauthStatesRowSchema = z.object({
  id: z.string().uuid(),
  state: z.string(),
  tenant_id: z.string().uuid(),
  integration_id: z.string(),
  user_id: z.string().uuid(),
  client_id: z.string(),
  client_secret_encrypted: z.string(),
  redirect_uri: z.string(),
  extra_params: z.unknown().nullable(),
  created_at: z.string(),
  expires_at: z.string(),
  used: z.boolean().default(false),
});
export type OauthStatesRowParsed = z.infer<typeof oauthStatesRowSchema>;

export const onboardingSequencesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  family_id: z.string().uuid().nullable(),
  location_id: z.string().uuid().nullable(),
  enrollment_date: z.string(),
  day_7_due: z.string().nullable(),
  day_7_completed_at: z.string().nullable(),
  day_7_type: z.string().nullable(),
  day_14_due: z.string().nullable(),
  day_14_completed_at: z.string().nullable(),
  day_14_type: z.string().nullable(),
  day_30_due: z.string().nullable(),
  day_30_completed_at: z.string().nullable(),
  day_30_type: z.string().nullable(),
  day_60_due: z.string().nullable(),
  day_60_completed_at: z.string().nullable(),
  day_60_type: z.string().nullable(),
  day_90_due: z.string().nullable(),
  day_90_completed_at: z.string().nullable(),
  day_90_type: z.string().nullable(),
  status: z.string().default("active"),
  risk_flag: z.boolean().nullable(),
  risk_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type OnboardingSequencesRowParsed = z.infer<typeof onboardingSequencesRowSchema>;

export const paymentHistoryRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  family_id: z.string().uuid(),
  square_payment_id: z.string().nullable(),
  amount_cents: z.number().int(),
  status: z.string(),
  card_last_four: z.string().nullable(),
  card_brand: z.string().nullable(),
  billing_period_id: z.string().uuid().nullable(),
  session_breakdown: z.unknown().nullable(),
  created_at: z.string().nullable(),
});
export type PaymentHistoryRowParsed = z.infer<typeof paymentHistoryRowSchema>;

export const payrollEntriesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  period_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  sessions_taught: z.number().int().default(0),
  pay_rate: z.number(),
  session_total: z.number().nullable(),
  bonus_amount: z.number().default(0),
  bonus_overridden: z.boolean().default(false),
  bonus_overridden_by: z.string().uuid().nullable(),
  bonus_overridden_at: z.string().nullable(),
  tips: z.number().default(0),
  notes: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  director_pay: z.number().nullable(),
  total_pay: z.number().nullable(),
});
export type PayrollEntriesRowParsed = z.infer<typeof payrollEntriesRowSchema>;

export const payrollPeriodsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  period_label: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  is_closed: z.boolean().default(false),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type PayrollPeriodsRowParsed = z.infer<typeof payrollPeriodsRowSchema>;

export const pendingRemindersRowSchema = z.object({
  id: z.string().uuid(),
  block_id: z.string().uuid(),
  reminder_type: z.string(),
  fire_at: z.string(),
  fired: z.boolean().default(false),
  cancelled: z.boolean().default(false),
  created_at: z.string(),
});
export type PendingRemindersRowParsed = z.infer<typeof pendingRemindersRowSchema>;

export const performanceAlertsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  alert_type: z.string(),
  severity: z.string(),
  message: z.string(),
  details: z.unknown().nullable(),
  resolved: z.boolean().nullable(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
  dedupe_key: z.string(),
  first_seen_at: z.string(),
  last_seen_at: z.string(),
  occurrence_count: z.number().int().default(1),
  worst_metric: z.number().nullable(),
  latest_metric: z.number().nullable(),
  resolution_reason: z.string().nullable(),
  regressed_at: z.string().nullable(),
  muted_until: z.string().nullable(),
});
export type PerformanceAlertsRowParsed = z.infer<typeof performanceAlertsRowSchema>;

export const performanceMetricsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  session_id: z.string(),
  page_route: z.string(),
  load_time_ms: z.number().int().nullable(),
  fcp_ms: z.number().int().nullable(),
  lcp_ms: z.number().int().nullable(),
  cls_score: z.number().nullable(),
  inp_ms: z.number().int().nullable(),
  ttfb_ms: z.number().int().nullable(),
  created_at: z.string(),
});
export type PerformanceMetricsRowParsed = z.infer<typeof performanceMetricsRowSchema>;

export const permissionDefinitionsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  category: z.string(),
  key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  owner_default: z.boolean().nullable(),
  company_director_default: z.boolean().nullable(),
  studio_director_default: z.boolean().nullable(),
  teacher_default: z.boolean().nullable(),
  parent_default: z.boolean().nullable(),
  sort_order: z.number().int().nullable(),
  created_at: z.string().nullable(),
});
export type PermissionDefinitionsRowParsed = z.infer<typeof permissionDefinitionsRowSchema>;

export const permissionRequestsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  requested_by: z.string().uuid().nullable(),
  action_description: z.string(),
  table_name: z.string().nullable(),
  record_id: z.string().uuid().nullable(),
  status: z.string().nullable(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type PermissionRequestsRowParsed = z.infer<typeof permissionRequestsRowSchema>;

export const permissionSetGrantsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  role: z.string(),
  permission_key: z.string(),
  is_granted: z.boolean().default(true),
  updated_by: z.string().uuid().nullable(),
  updated_at: z.string().nullable(),
});
export type PermissionSetGrantsRowParsed = z.infer<typeof permissionSetGrantsRowSchema>;

export const practiceSessionsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  instrument: z.string().nullable(),
  tool_used: z.string().nullable(),
  duration_seconds: z.number().int().nullable(),
  created_at: z.string(),
  family_id: z.string().uuid().nullable(),
  logged_by: z.string().uuid().nullable(),
  practice_date: z.string(),
  duration_minutes: z.number().int().nullable(),
  notes: z.string().nullable(),
  is_manual_entry: z.boolean().default(false),
});
export type PracticeSessionsRowParsed = z.infer<typeof practiceSessionsRowSchema>;

export const profileEditRequestsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid().nullable(),
  family_id: z.string().uuid().nullable(),
  requested_by: z.string().uuid(),
  field_name: z.string(),
  current_value: z.string().nullable(),
  requested_value: z.string().nullable(),
  reason: z.string().nullable(),
  status: z.string().default("pending"),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.string().nullable(),
  review_note: z.string().nullable(),
  created_at: z.string(),
});
export type ProfileEditRequestsRowParsed = z.infer<typeof profileEditRequestsRowSchema>;

export const profileLocationsRowSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  location_id: z.string().uuid(),
  created_at: z.string(),
});
export type ProfileLocationsRowParsed = z.infer<typeof profileLocationsRowSchema>;

export const profilePermissionOverridesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  permission_key: z.string(),
  is_granted: z.boolean(),
  granted_by: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type ProfilePermissionOverridesRowParsed = z.infer<typeof profilePermissionOverridesRowSchema>;

export const profilesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  role: userRoleEnumSchema,
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  avatar_url: z.string().nullable(),
  is_active: z.boolean().default(true),
  created_at: z.string(),
  updated_at: z.string(),
  export_pin: z.string().nullable(),
  is_platform_admin: z.boolean().nullable(),
  onboarding_completed_at: z.string().nullable(),
  onboarding_skipped: z.boolean().nullable(),
});
export type ProfilesRowParsed = z.infer<typeof profilesRowSchema>;

export const progressReportsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  family_id: z.string().uuid(),
  report_type: reportIntervalEnumSchema,
  period_start: z.string(),
  period_end: z.string(),
  sessions_scheduled: z.number().int().default(0),
  sessions_attended: z.number().int().default(0),
  attendance_rate: z.number().nullable(),
  total_sessions_lifetime: z.number().int().default(0),
  months_enrolled: z.number().int().default(0),
  ai_summary: z.string().nullable(),
  ai_highlights: z.array(z.string()).nullable(),
  ai_areas_of_growth: z.array(z.string()).nullable(),
  ai_encouragement: z.string().nullable(),
  percentile_attendance: z.number().nullable(),
  percentile_sessions: z.number().nullable(),
  ranking_label: z.string().nullable(),
  snapshot_html: z.string().nullable(),
  snapshot_shared_url: z.string().nullable(),
  is_sent: z.boolean().default(false),
  sent_at: z.string().nullable(),
  sent_via: z.string().nullable(),
  retention_offer_type: z.string().nullable(),
  retention_offer_details: z.unknown().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProgressReportsRowParsed = z.infer<typeof progressReportsRowSchema>;

export const queryPerformanceRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  query_label: z.string(),
  table_name: z.string().nullable(),
  execution_time_ms: z.number().int(),
  row_count: z.number().int().nullable(),
  is_slow: z.boolean().nullable(),
  created_at: z.string(),
});
export type QueryPerformanceRowParsed = z.infer<typeof queryPerformanceRowSchema>;

export const quizScoresRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  category: z.string().nullable(),
  score: z.number().int().nullable(),
  total: z.number().int().nullable(),
  percent: z.number().nullable(),
  created_at: z.string().nullable(),
});
export type QuizScoresRowParsed = z.infer<typeof quizScoresRowSchema>;

export const recruitmentProspectsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  instruments: z.array(z.string()).nullable(),
  source: z.string().nullable(),
  source_detail: z.string().nullable(),
  status: z.string().default("new"),
  location_id: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  resume_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type RecruitmentProspectsRowParsed = z.infer<typeof recruitmentProspectsRowSchema>;

export const refundsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  family_id: z.string().uuid(),
  payment_history_id: z.string().uuid(),
  square_refund_id: z.string().nullable(),
  amount_cents: z.number().int(),
  reason: z.string(),
  status: z.string().default("pending"),
  initiated_by: z.string().uuid().nullable(),
  created_at: z.string().nullable(),
});
export type RefundsRowParsed = z.infer<typeof refundsRowSchema>;

export const retentionCampaignsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  family_id: z.string().uuid().nullable(),
  location_id: z.string().uuid().nullable(),
  campaign_type: z.string(),
  wave_number: z.number().int(),
  subject: z.string().nullable(),
  body: z.string().nullable(),
  ai_context: z.unknown().nullable(),
  channel: z.string().nullable(),
  status: z.string().nullable(),
  scheduled_date: z.string().nullable(),
  sent_at: z.string().nullable(),
  read_at: z.string().nullable(),
  student_status: z.string().nullable(),
  risk_score: z.number().int().nullable(),
  communication_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type RetentionCampaignsRowParsed = z.infer<typeof retentionCampaignsRowSchema>;

export const retentionOutreachRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid().nullable(),
  lead_id: z.string().uuid().nullable(),
  family_id: z.string().uuid().nullable(),
  location_id: z.string().uuid(),
  outreach_type: z.string().default("sms"),
  outreach_date: z.string(),
  message_content: z.string().nullable(),
  response_received: z.boolean().default(false),
  response_date: z.string().nullable(),
  response_content: z.string().nullable(),
  outcome: z.string().nullable(),
  sent_by: z.string().uuid().nullable(),
  ai_generated: z.boolean().default(false),
  campaign_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type RetentionOutreachRowParsed = z.infer<typeof retentionOutreachRowSchema>;

export const reviewRequestsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  student_id: z.string().uuid().nullable(),
  family_id: z.string().uuid().nullable(),
  sent_at: z.string(),
  trigger_reason: z.string().nullable(),
  message_id: z.string().uuid().nullable(),
  review_received: z.boolean().default(false),
  review_date: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  message_text: z.string().nullable(),
  google_review_url: z.string().nullable(),
  requested_by: z.string().uuid().nullable(),
});
export type ReviewRequestsRowParsed = z.infer<typeof reviewRequestsRowSchema>;

export const reviewsRowSchema = z.object({
  id: z.string().uuid(),
  reviewer_name: z.string(),
  location_name: z.string(),
  text_cleaned: z.string(),
  instrument_tag: z.string().default("general"),
  is_active: z.boolean().nullable(),
  created_at: z.string().nullable(),
  tenant_id: z.string().uuid().nullable(),
  family_id: z.string().uuid().nullable(),
  student_id: z.string().uuid().nullable(),
  location_id: z.string().uuid().nullable(),
  rating: z.number().int().nullable(),
  body: z.string().nullable(),
  parent_name: z.string().nullable(),
  student_name: z.string().nullable(),
  approved: z.boolean().nullable(),
  featured: z.boolean().nullable(),
  shareable: z.boolean().nullable(),
  prompted_by: z.string().nullable(),
  review_token: z.string().nullable(),
});
export type ReviewsRowParsed = z.infer<typeof reviewsRowSchema>;

export const rolePermissionsRowSchema = z.object({
  id: z.number().int(),
  role: z.string(),
  permission_key: z.string(),
  allowed: z.boolean().default(true),
  scope: z.string().nullable(),
});
export type RolePermissionsRowParsed = z.infer<typeof rolePermissionsRowSchema>;

export const roomInventoryRowSchema = z.object({
  id: z.string().uuid(),
  room_id: z.string().uuid().nullable(),
  tenant_id: z.string().uuid().nullable(),
  item_name: z.string(),
  quantity: z.number().int().nullable(),
  is_flagged: z.boolean().nullable(),
  flag_note: z.string().nullable(),
  flagged_by: z.string().uuid().nullable(),
  flagged_at: z.string().nullable(),
  resolved_by: z.string().uuid().nullable(),
  resolved_at: z.string().nullable(),
  resolve_reason: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  condition: z.string().default("Good"),
});
export type RoomInventoryRowParsed = z.infer<typeof roomInventoryRowSchema>;

export const roomsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid().nullable(),
  location_id: z.string().uuid().nullable(),
  name: z.string(),
  display_order: z.number().int().nullable(),
  layout_x: z.number().int().nullable(),
  layout_y: z.number().int().nullable(),
  layout_w: z.number().int().nullable(),
  layout_h: z.number().int().nullable(),
  primary_instruments: z.array(z.string()).nullable(),
  status: z.string().nullable(),
  notes: z.string().nullable(),
  is_active: z.boolean().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  floor: z.number().int().nullable(),
  room_type: z.string().nullable(),
  color: z.string().nullable(),
});
export type RoomsRowParsed = z.infer<typeof roomsRowSchema>;

export const scheduleBlocksRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  student_id: z.string().uuid().nullable(),
  block_date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  status: blockStatusEnumSchema.default("available"),
  is_recurring: z.boolean().default(false),
  notes: z.string().nullable(),
  ai_context: z.unknown().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  block_type: blockTypeEnumSchema.default("open_time"),
  room: z.string().nullable(),
  fifth_week: z.boolean().default(false),
  checked_in: z.boolean().default(false),
  checked_in_at: z.string().nullable(),
  checked_in_by: z.string().uuid().nullable(),
  callout_reason: z.string().nullable(),
  room_id: z.string().uuid().nullable(),
  teacher_tally: z.boolean().nullable(),
  generated_from_availability: z.boolean().nullable(),
  original_teacher_id: z.string().uuid().nullable(),
  original_teacher_name: z.string().nullable(),
  reminder_sent: z.boolean().nullable(),
  is_virtual: z.boolean().default(false),
  meet_link: z.string().nullable(),
  meet_event_id: z.string().nullable(),
  converted_to_virtual_at: z.string().nullable(),
  converted_by: z.string().uuid().nullable(),
  is_family_callout: z.boolean().nullable(),
  callout_id: z.string().uuid().nullable(),
  is_makeup_session: z.boolean().nullable(),
  makeup_session_id: z.string().uuid().nullable(),
});
export type ScheduleBlocksRowParsed = z.infer<typeof scheduleBlocksRowSchema>;

export const schedulingGridRowSchema = z.object({
  block_id: z.string().uuid().nullable(),
  tenant_id: z.string().uuid().nullable(),
  location_id: z.string().uuid().nullable(),
  location_name: z.string().nullable(),
  teacher_id: z.string().uuid().nullable(),
  teacher_name: z.string().nullable(),
  student_id: z.string().uuid().nullable(),
  student_name: z.string().nullable(),
  instrument: z.string().nullable(),
  block_date: z.string().nullable(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  status: blockStatusEnumSchema.nullable(),
  is_recurring: z.boolean().nullable(),
  notes: z.string().nullable(),
  ai_context: z.unknown().nullable(),
});
export type SchedulingGridRowParsed = z.infer<typeof schedulingGridRowSchema>;

export const sessionLogRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  schedule_block_id: z.string().uuid(),
  location_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  student_id: z.string().uuid(),
  block_date: z.string(),
  status: z.string().default("completed"),
  teacher_rate: z.number(),
  student_rate: z.number(),
  lesson_notes: z.string().nullable(),
  ai_summary: z.string().nullable(),
  ai_context: z.unknown().nullable(),
  created_at: z.string(),
  worked_on: z.array(z.string()).nullable(),
  engagement_level: z.number().int().nullable(),
  progress_indicator: z.string().nullable(),
  voice_note_url: z.string().nullable(),
  teacher_note: z.string().nullable(),
  communication_id: z.string().uuid().nullable(),
  instrument: z.string().nullable(),
  parent_update_status: z.string().nullable(),
  payment_gated: z.boolean().default(false),
});
export type SessionLogRowParsed = z.infer<typeof sessionLogRowSchema>;

export const squareInvoicesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  family_id: z.string().uuid().nullable(),
  square_invoice_id: z.string(),
  square_customer_id: z.string().nullable(),
  square_location_id: z.string().nullable(),
  status: z.string().nullable(),
  amount_cents: z.number().int().nullable(),
  invoice_number: z.string().nullable(),
  title: z.string().nullable(),
  scheduled_at: z.string().nullable(),
  due_date: z.string().nullable(),
  paid_at: z.string().nullable(),
  square_created_at: z.string().nullable(),
  synced_at: z.string().nullable(),
  raw_data: z.unknown().nullable(),
  requested_amount: z.number().int().nullable(),
  amount_paid: z.number().int().nullable(),
  invoice_date: z.string().nullable(),
  location_id: z.string().uuid().nullable(),
  recurring_series_id: z.string().nullable(),
  customer_email: z.string().nullable(),
  customer_name: z.string().nullable(),
});
export type SquareInvoicesRowParsed = z.infer<typeof squareInvoicesRowSchema>;

export const squarePaymentsFactRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  square_payment_id: z.string(),
  square_location_id: z.string().nullable(),
  location_id: z.string().uuid().nullable(),
  status: z.string(),
  source_type: z.string().nullable(),
  tender_bucket: z.string(),
  amount_money_cents: z.number().int().nullable(),
  tip_money_cents: z.number().int().nullable(),
  total_money_cents: z.number().int().nullable(),
  application_fee_money_cents: z.number().int().nullable(),
  processing_fee_total_cents: z.number().int().default(0),
  refunded_money_cents: z.number().int().nullable(),
  net_total_cents: z.number().int().nullable(),
  reporting_date: z.string(),
  created_at_square: z.string().nullable(),
  updated_at_square: z.string().nullable(),
  raw_json: z.unknown().default({}),
  synced_at: z.string(),
});
export type SquarePaymentsFactRowParsed = z.infer<typeof squarePaymentsFactRowSchema>;

export const squareRefundsFactRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  square_refund_id: z.string(),
  square_payment_id: z.string(),
  square_location_id: z.string().nullable(),
  location_id: z.string().uuid().nullable(),
  status: z.string().nullable(),
  amount_money_cents: z.number().int(),
  reporting_date: z.string(),
  created_at_square: z.string().nullable(),
  updated_at_square: z.string().nullable(),
  raw_json: z.unknown().default({}),
  synced_at: z.string(),
});
export type SquareRefundsFactRowParsed = z.infer<typeof squareRefundsFactRowSchema>;

export const studentAchievementsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  achievement_key: z.string(),
  achievement_name: z.string(),
  achievement_emoji: z.string(),
  category: z.string(),
  earned_at: z.string(),
});
export type StudentAchievementsRowParsed = z.infer<typeof studentAchievementsRowSchema>;

export const studentCalloutsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  family_id: z.string().uuid(),
  location_id: z.string().uuid(),
  schedule_block_id: z.string().uuid().nullable(),
  callout_date: z.string(),
  callout_scope: z.string(),
  confirmed_by_parent: z.boolean().nullable(),
  confirmed_at: z.string().nullable(),
  makeup_session_id: z.string().uuid().nullable(),
  previous_session_note: z.string().nullable(),
  initiated_by_user_id: z.string().uuid().nullable(),
  is_within_one_hour: z.boolean().nullable(),
  no_fifth_week_available: z.boolean().nullable(),
  created_at: z.string().nullable(),
});
export type StudentCalloutsRowParsed = z.infer<typeof studentCalloutsRowSchema>;

export const studentDirectorNotesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  author_id: z.string().uuid(),
  author_name: z.string(),
  note_text: z.string(),
  created_at: z.string(),
});
export type StudentDirectorNotesRowParsed = z.infer<typeof studentDirectorNotesRowSchema>;

export const studentDuplicateReviewsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  family_id: z.string().uuid(),
  lead_id: z.string().uuid().nullable(),
  new_student_id: z.string().uuid(),
  candidate_existing_student_id: z.string().uuid(),
  reason: z.string().default("same_family_same_normalized_name"),
  status: z.string().default("pending"),
  resolved_at: z.string().nullable(),
  resolved_by: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type StudentDuplicateReviewsRowParsed = z.infer<typeof studentDuplicateReviewsRowSchema>;

export const studentEffectiveRateRowSchema = z.object({
  student_id: z.string().uuid().nullable(),
  tenant_id: z.string().uuid().nullable(),
  family_id: z.string().uuid().nullable(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  instrument: z.string().nullable(),
  status: studentStatusEnumSchema.nullable(),
  sessions_per_month: z.number().int().nullable(),
  location_id: z.string().uuid().nullable(),
  family_name: z.string().nullable(),
  billing_status: z.string().nullable(),
  billing_day: z.number().int().nullable(),
  rate_tier: z.number().int().nullable(),
  rate_per_session: z.number().nullable(),
  monthly_cents: z.number().int().nullable(),
});
export type StudentEffectiveRateRowParsed = z.infer<typeof studentEffectiveRateRowSchema>;

export const studentFilesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  file_name: z.string(),
  file_url: z.string(),
  file_size: z.number().int().nullable(),
  uploaded_by: z.string().nullable(),
  uploaded_by_role: z.string().nullable(),
  created_at: z.string(),
  folder: z.string().default("materials"),
  flagged_for_deletion: z.boolean().nullable(),
  flagged_by: z.string().uuid().nullable(),
  flagged_at: z.string().nullable(),
});
export type StudentFilesRowParsed = z.infer<typeof studentFilesRowSchema>;

export const studentFollowupsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  family_id: z.string().uuid(),
  followup_date: z.string(),
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.string().default("pending"),
  ai_draft: z.string().nullable(),
  sent_at: z.string().nullable(),
  sent_by: z.string().uuid().nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type StudentFollowupsRowParsed = z.infer<typeof studentFollowupsRowSchema>;

export const studentInstrumentsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  instrument: z.string(),
  teacher_id: z.string().uuid().nullable(),
  rate_per_session: z.number().default(0),
  sessions_per_month: z.number().int().default(4),
  is_primary: z.boolean().default(false),
  status: z.string().default("active"),
  created_at: z.string(),
  updated_at: z.string(),
});
export type StudentInstrumentsRowParsed = z.infer<typeof studentInstrumentsRowSchema>;

export const studentMilestonesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  milestone_type: z.string(),
  milestone_label: z.string(),
  milestone_value: z.number().int().nullable(),
  achieved_at: z.string(),
  report_id: z.string().uuid().nullable(),
  celebrated: z.boolean().default(false),
  celebrated_at: z.string().nullable(),
  created_at: z.string(),
});
export type StudentMilestonesRowParsed = z.infer<typeof studentMilestonesRowSchema>;

export const studentsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  family_id: z.string().uuid().nullable(),
  location_id: z.string().uuid().nullable(),
  teacher_id: z.string().uuid().nullable(),
  profile_id: z.string().uuid().nullable(),
  first_name: z.string(),
  last_name: z.string(),
  instrument: z.string().nullable(),
  status: studentStatusEnumSchema.default("active"),
  date_of_birth: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  blocks_per_week: z.number().int().default(1),
  rate_per_session: z.number().default(45.00),
  notes: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  ai_context: z.unknown().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  total_fifth_weeks: z.number().int().default(0),
  total_callouts: z.number().int().default(0),
  exit_reason: z.string().nullable(),
  exit_notes: z.string().nullable(),
  may_return: z.string().nullable(),
  reactivation_date: z.string().nullable(),
  overdue_amount: z.number().nullable(),
  age: z.string().nullable(),
  bio: z.string().nullable(),
  first_lesson_date: z.string().nullable(),
  card_last_four: z.string().nullable(),
  card_brand: z.string().nullable(),
  total_lessons_taken: z.number().int().nullable(),
  total_paid: z.number().nullable(),
  teacher_notes: z.string().nullable(),
  sessions_per_month: z.number().int().default(4),
  experience: z.string().nullable(),
  has_instrument: z.string().nullable(),
  preferred_days: z.array(z.string()).nullable(),
  source: z.string().nullable(),
  is_military: z.boolean().nullable(),
  pause_reason: z.string().nullable(),
  pause_reason_detail: z.string().nullable(),
  coming_back: z.boolean().nullable(),
  expected_return_date: z.string().nullable(),
  followup_date: z.string().nullable(),
  followup_sent: z.boolean().nullable(),
  followup_sent_at: z.string().nullable(),
  deactivated_at: z.string().nullable(),
  deactivated_by: z.string().uuid().nullable(),
  first_teacher_id: z.string().uuid().nullable(),
  first_teacher_name: z.string().nullable(),
  last_teacher_id: z.string().uuid().nullable(),
  last_teacher_name: z.string().nullable(),
  exit_category: z.string().nullable(),
  transferred_to_location_id: z.string().uuid().nullable(),
  goals: z.string().nullable(),
  learning_style: z.string().nullable(),
  previous_teacher_id: z.string().uuid().nullable(),
  teacher_changed_at: z.string().nullable(),
  student_display_id: z.string().nullable(),
  square_customer_id: z.string().nullable(),
  lesson_day_of_week: z.number().int().nullable(),
  fifth_weeks_used: z.number().int().nullable(),
  intake_submission_id: z.string().uuid().nullable(),
  counts_toward_family_tier: z.boolean().default(true),
  enrollment_type: z.string().nullable(),
});
export type StudentsRowParsed = z.infer<typeof studentsRowSchema>;

export const studioClosuresRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  closure_date: z.string(),
  label: z.string(),
  emoji: z.string().nullable(),
  affects_billing: z.boolean().nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type StudioClosuresRowParsed = z.infer<typeof studioClosuresRowSchema>;

export const studioMessagesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  family_id: z.string().uuid(),
  student_id: z.string().uuid().nullable(),
  location_id: z.string().uuid().nullable(),
  message_text: z.string(),
  direction: z.string(),
  sent_via: z.string().default("quo"),
  quo_queued: z.boolean().nullable(),
  quo_delivered_at: z.string().nullable(),
  to_phone: z.string().nullable(),
  from_phone: z.string().nullable(),
  sent_by_profile_id: z.string().uuid().nullable(),
  read: z.boolean().nullable(),
  read_at: z.string().nullable(),
  read_by: z.string().uuid().nullable(),
  created_at: z.string().nullable(),
});
export type StudioMessagesRowParsed = z.infer<typeof studioMessagesRowSchema>;

export const tasksRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  task_type: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priority: z.string().default("normal"),
  assigned_role: z.string().nullable(),
  assigned_to: z.string().uuid().nullable(),
  location_id: z.string().uuid().nullable(),
  created_by: z.string().uuid().nullable(),
  created_by_role: z.string().nullable(),
  entity_type: z.string().nullable(),
  entity_id: z.string().uuid().nullable(),
  entity_name: z.string().nullable(),
  status: z.string().default("pending"),
  completed_at: z.string().nullable(),
  completed_by: z.string().uuid().nullable(),
  completion_note: z.string().nullable(),
  dedup_key: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  file_verified: z.boolean().nullable(),
  escalated: z.boolean().nullable(),
  escalated_task_id: z.string().uuid().nullable(),
  snoozed_until: z.string().nullable(),
  recurring: z.string().nullable(),
  due_date: z.string().nullable(),
});
export type TasksRowParsed = z.infer<typeof tasksRowSchema>;

export const teacherAvailabilityRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  location_id: z.string().uuid(),
  day_of_week: dayOfWeekEnumSchema,
  start_time: z.string(),
  end_time: z.string(),
  is_active: z.boolean().default(true),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TeacherAvailabilityRowParsed = z.infer<typeof teacherAvailabilityRowSchema>;

export const teacherCalloutTallyRowSchema = z.object({
  teacher_id: z.string().uuid().nullable(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  location_id: z.string().uuid().nullable(),
  total_callouts: z.number().int().nullable(),
  total_blocks_affected: z.number().int().nullable(),
  last_callout_date: z.string().nullable(),
  callouts_this_month: z.number().int().nullable(),
  callouts_last_60_days: z.number().int().nullable(),
});
export type TeacherCalloutTallyRowParsed = z.infer<typeof teacherCalloutTallyRowSchema>;

export const teacherCalloutsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
  teacher_id: z.string().uuid(),
  location_id: z.string().uuid(),
  callout_date: z.string(),
  reason: z.string().nullable(),
  blocks_affected: z.number().int().default(0),
  initiated_by: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TeacherCalloutsRowParsed = z.infer<typeof teacherCalloutsRowSchema>;

export const teacherCloseoutsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  location_id: z.string().uuid(),
  closeout_date: z.string(),
  closed_at: z.string().nullable(),
  sessions_requiring_recap: z.number().int().nullable(),
  sessions_with_recap: z.number().int().nullable(),
  is_complete: z.boolean().nullable(),
  override_requested: z.boolean().nullable(),
  override_request_reason: z.string().nullable(),
  override_approved: z.boolean().nullable(),
  override_approved_by: z.string().uuid().nullable(),
  override_approved_at: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type TeacherCloseoutsRowParsed = z.infer<typeof teacherCloseoutsRowSchema>;

export const teacherDocumentsRowSchema = z.object({
  id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  file_url: z.string(),
  file_name: z.string(),
  category: z.string().nullable(),
  uploaded_by: z.string().nullable(),
  uploaded_at: z.string().nullable(),
  tenant_id: z.string().uuid(),
});
export type TeacherDocumentsRowParsed = z.infer<typeof teacherDocumentsRowSchema>;

export const teacherLocationsRowSchema = z.object({
  id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  location_id: z.string().uuid(),
  created_at: z.string().nullable(),
});
export type TeacherLocationsRowParsed = z.infer<typeof teacherLocationsRowSchema>;

export const teacherNotesRowSchema = z.object({
  id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  note_text: z.string(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string().nullable(),
  tenant_id: z.string().uuid(),
});
export type TeacherNotesRowParsed = z.infer<typeof teacherNotesRowSchema>;

export const teacherPayrollSummaryRowSchema = z.object({
  tenant_id: z.string().uuid().nullable(),
  teacher_id: z.string().uuid().nullable(),
  profile_id: z.string().uuid().nullable(),
  teacher_name: z.string().nullable(),
  location_id: z.string().uuid().nullable(),
  location_name: z.string().nullable(),
  pay_month: z.string().nullable(),
  blocks_taught: z.number().int().nullable(),
  gross_pay: z.number().nullable(),
  rate_per_block: z.number().nullable(),
});
export type TeacherPayrollSummaryRowParsed = z.infer<typeof teacherPayrollSummaryRowSchema>;

export const teacherRoomAssignmentsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid().nullable(),
  teacher_id: z.string().uuid().nullable(),
  room_id: z.string().uuid().nullable(),
  location_id: z.string().uuid().nullable(),
  assignment_date: z.string(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string().nullable(),
});
export type TeacherRoomAssignmentsRowParsed = z.infer<typeof teacherRoomAssignmentsRowSchema>;

export const teacherSessionNotesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  schedule_block_id: z.string().uuid().nullable(),
  note_date: z.string(),
  raw_note: z.string(),
  ai_enhanced_note: z.string().nullable(),
  topics_covered: z.array(z.string()).nullable(),
  skills_progressing: z.array(z.string()).nullable(),
  mood: z.string().nullable(),
  is_visible_to_parent: z.boolean().default(true),
  ai_enhanced_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TeacherSessionNotesRowParsed = z.infer<typeof teacherSessionNotesRowSchema>;

export const teacherStudentNotesRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  student_id: z.string().uuid(),
  note_text: z.string(),
  moderation_status: z.string().nullable(),
  moderation_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TeacherStudentNotesRowParsed = z.infer<typeof teacherStudentNotesRowSchema>;

export const teacherUploadsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  student_id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  file_name: z.string(),
  file_name_original: z.string(),
  storage_path: z.string(),
  file_size_bytes: z.number().int().nullable(),
  mime_type: z.string().nullable(),
  moderation_status: z.string().default("approved"),
  moderation_reason: z.string().nullable(),
  visible_to_parent: z.boolean().nullable(),
  download_requires_approval: z.boolean().nullable(),
  download_approved_by: z.string().uuid().nullable(),
  download_approved_at: z.string().nullable(),
  description: z.string().nullable(),
  uploaded_at: z.string(),
  downloadable: z.boolean().nullable(),
});
export type TeacherUploadsRowParsed = z.infer<typeof teacherUploadsRowSchema>;

export const teacherW9RowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  legal_name: z.string(),
  business_name: z.string().nullable(),
  tax_classification: z.string(),
  tax_classification_other: z.string().nullable(),
  exempt_payee_code: z.string().nullable(),
  fatca_exemption_code: z.string().nullable(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  tin_type: z.string(),
  tin_encrypted: z.string(),
  tin_last_four: z.string(),
  signature_name: z.string(),
  signed_at: z.string(),
  signed_by_ip: z.string().nullable(),
  pdf_url: z.string().nullable(),
  pdf_generated_at: z.string().nullable(),
  status: z.string().default("complete"),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type TeacherW9RowParsed = z.infer<typeof teacherW9RowSchema>;

export const teachersRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  profile_id: z.string().uuid().nullable(),
  instruments: z.array(z.string()),
  bio: z.string().nullable(),
  rate_per_block: z.number().default(15.00),
  is_active: z.boolean().default(true),
  hire_date: z.string().nullable(),
  termination_date: z.string().nullable(),
  ai_context: z.unknown().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  is_sub_available: z.boolean().default(false),
  sub_available: z.boolean().nullable(),
  square_team_member_id: z.string().nullable(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  display_name: z.string().nullable(),
  teacher_role: z.string().nullable(),
  photo_url: z.string().nullable(),
  status: z.string().nullable(),
  pay_rate_per_half_hour: z.number().nullable(),
  internal_match_notes: z.string().nullable(),
  personality: z.string().nullable(),
  lesson_style: z.string().nullable(),
  best_age_range: z.string().nullable(),
  needs_1099: z.boolean().default(false),
  documents_locked: z.boolean().default(true),
  w9_status: z.string().nullable(),
  w9_completed_at: z.string().nullable(),
  contract_status: z.string().nullable(),
  contract_signed_at: z.string().nullable(),
  contract_pdf_url: z.string().nullable(),
  primary_instruments: z.string().nullable(),
  secondary_instruments: z.string().nullable(),
  style_genre_strengths: z.string().nullable(),
  preferred_age_range: z.string().nullable(),
  acceptable_age_range: z.string().nullable(),
  skill_levels_by_instrument: z.string().nullable(),
  teaching_strengths: z.string().nullable(),
  musical_strengths_background: z.string().nullable(),
  best_first_lesson_fit: z.string().nullable(),
  best_match_students: z.string().nullable(),
  use_caution_internal_placement_notes: z.string().nullable(),
  meet_and_greet_fit: z.string().nullable(),
  substitute_coverage: z.string().nullable(),
  customer_facing_match_summary: z.string().nullable(),
  internal_matching_tags: z.string().nullable(),
  director_notes: z.string().nullable(),
});
export type TeachersRowParsed = z.infer<typeof teachersRowSchema>;

export const teachersSafeRowSchema = z.object({
  id: z.string().uuid().nullable(),
  tenant_id: z.string().uuid().nullable(),
  profile_id: z.string().uuid().nullable(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  instruments: z.array(z.string()).nullable(),
  bio: z.string().nullable(),
  photo_url: z.string().nullable(),
  teacher_role: z.string().nullable(),
  status: z.string().nullable(),
  is_active: z.boolean().nullable(),
  sub_available: z.boolean().nullable(),
  is_sub_available: z.boolean().nullable(),
  hire_date: z.string().nullable(),
  termination_date: z.string().nullable(),
  ai_context: z.unknown().nullable(),
  personality: z.string().nullable(),
  lesson_style: z.string().nullable(),
  best_age_range: z.string().nullable(),
  square_team_member_id: z.string().nullable(),
  created_at: z.string().nullable(),
  pay_rate_per_half_hour: z.number().nullable(),
  rate_per_block: z.number().nullable(),
  needs_1099: z.boolean().nullable(),
  w9_status: z.string().nullable(),
  w9_completed_at: z.string().nullable(),
  contract_status: z.string().nullable(),
  contract_signed_at: z.string().nullable(),
  contract_pdf_url: z.string().nullable(),
});
export type TeachersSafeRowParsed = z.infer<typeof teachersSafeRowSchema>;

export const tenantsRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  logo_url: z.string().nullable(),
  primary_color: z.string().nullable(),
  accent_color: z.string().nullable(),
  timezone: z.string().default("America/Chicago"),
  created_at: z.string(),
  updated_at: z.string(),
  stripe_customer_id: z.string().nullable(),
  stripe_subscription_id: z.string().nullable(),
  plan: z.string().nullable(),
  trial_ends_at: z.string().nullable(),
  billing_email: z.string().nullable(),
  location_count_billed: z.number().int().nullable(),
  onboarding_emails_sent: z.unknown().nullable(),
  pricing_tier: z.string().nullable(),
  onboarding_progress: z.unknown().nullable(),
  stripe_connect_account_id: z.string().nullable(),
  stripe_connect_status: z.string().nullable(),
});
export type TenantsRowParsed = z.infer<typeof tenantsRowSchema>;

export const tipAttributionsRowSchema = z.object({
  id: z.string().uuid(),
  tip_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  amount: z.number(),
});
export type TipAttributionsRowParsed = z.infer<typeof tipAttributionsRowSchema>;

export const tipsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  period_id: z.string().uuid(),
  amount: z.number(),
  split_type: z.string().nullable(),
  attribution_confirmed: z.boolean().default(false),
  created_at: z.string().nullable(),
});
export type TipsRowParsed = z.infer<typeof tipsRowSchema>;

export const userProfilesRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type UserProfilesRowParsed = z.infer<typeof userProfilesRowSchema>;

export const vFinanceMonthlySummaryRowSchema = z.object({
  month_bucket: z.string().nullable(),
  location_code: z.string().nullable(),
  location_name: z.string().nullable(),
  total_income: z.number().nullable(),
  total_expense: z.number().nullable(),
  total_transfers: z.number().nullable(),
  transaction_count: z.number().int().nullable(),
});
export type VFinanceMonthlySummaryRowParsed = z.infer<typeof vFinanceMonthlySummaryRowSchema>;

export const vFinanceUncategorizedTransactionsRowSchema = z.object({
  id: z.string().uuid().nullable(),
  posted_date: z.string().nullable(),
  month_bucket: z.string().nullable(),
  location_name: z.string().nullable(),
  account_name: z.string().nullable(),
  transaction_name: z.string().nullable(),
  merchant_name: z.string().nullable(),
  amount: z.number().nullable(),
  is_pending: z.boolean().nullable(),
});
export type VFinanceUncategorizedTransactionsRowParsed = z.infer<typeof vFinanceUncategorizedTransactionsRowSchema>;

export const valueCardsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  family_id: z.string().uuid().nullable(),
  location_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
  attendance_rate: z.number().nullable(),
  total_sessions_period: z.number().int().default(0),
  attended_sessions_period: z.number().int().default(0),
  total_sessions_lifetime: z.number().int().default(0),
  months_enrolled: z.number().int().default(0),
  percentile_rank: z.number().int().nullable(),
  teacher_highlights: z.unknown().nullable(),
  skills_worked_on: z.unknown().nullable(),
  milestones: z.unknown().nullable(),
  ai_summary: z.string().nullable(),
  instrument: z.string().nullable(),
  teacher_name: z.string().nullable(),
  sent_at: z.string().nullable(),
  sent_via: z.string().nullable(),
  created_at: z.string(),
});
export type ValueCardsRowParsed = z.infer<typeof valueCardsRowSchema>;

export const webhookEventsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
  integration_id: z.string(),
  direction: z.string(),
  event_type: z.string(),
  payload: z.unknown().default({}),
  status: z.string().default("pending"),
  response_code: z.number().int().nullable(),
  response_body: z.string().nullable(),
  error_message: z.string().nullable(),
  attempt_count: z.number().int().default(0),
  created_at: z.string(),
  latency_ms: z.number().int().nullable(),
  delivery_id: z.string().nullable(),
  next_retry_at: z.string().nullable(),
  target_url: z.string().nullable(),
});
export type WebhookEventsRowParsed = z.infer<typeof webhookEventsRowSchema>;

export const ziroAgentSkillsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  skill_id: z.string().uuid(),
  is_primary: z.boolean().default(false),
  attached_at: z.string(),
});
export type ZiroAgentSkillsRowParsed = z.infer<typeof ziroAgentSkillsRowSchema>;

export const ziroAgentsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  purpose: z.string().nullable(),
  status: z.string().default("active"),
  owner_type: z.string().default("system"),
  lifecycle_type: z.string().default("temporary"),
  invocation_rules: z.unknown().default({}),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  retired_at: z.string().nullable(),
  role: z.string().nullable(),
  instructions: z.string().nullable(),
  usage_triggers: z.unknown().default([]),
  auto_use_by_ziro: z.boolean().default(true),
  profile_summary: z.string().nullable(),
  updated_at: z.string(),
  is_visible_in_ui: z.boolean().default(true),
  is_archived: z.boolean().default(false),
  business_context: z.string().default("music_school"),
});
export type ZiroAgentsRowParsed = z.infer<typeof ziroAgentsRowSchema>;

export const ziroConfigRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  instructions: z.string().nullable(),
  routing_rules: z.unknown().default({}),
  default_skill_ids: z.array(z.string().uuid()),
  delegation_rules: z.unknown().default([]),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ZiroConfigRowParsed = z.infer<typeof ziroConfigRowSchema>;

export const ziroIdempotencyKeysRowSchema = z.object({
  tenant_id: z.string().uuid(),
  action_type: z.string(),
  idempotency_key: z.string(),
  profile_id: z.string().uuid(),
  result: z.unknown(),
  created_at: z.string(),
});
export type ZiroIdempotencyKeysRowParsed = z.infer<typeof ziroIdempotencyKeysRowSchema>;

export const ziroPageIntelligenceBindingsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  page_key: z.string(),
  primary_agent_id: z.string().uuid().nullable(),
  updated_at: z.string(),
  supporting_agent_ids: z.array(z.string().uuid()),
});
export type ZiroPageIntelligenceBindingsRowParsed = z.infer<typeof ziroPageIntelligenceBindingsRowSchema>;

export const ziroSkillAssignmentsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  skill_id: z.string().uuid(),
  workflow_id: z.string().uuid(),
  assigned_at: z.string(),
  assigned_by: z.string().uuid().nullable(),
});
export type ZiroSkillAssignmentsRowParsed = z.infer<typeof ziroSkillAssignmentsRowSchema>;

export const ziroSkillProposalsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  proposed_key: z.string(),
  proposed_name: z.string(),
  proposed_description: z.string().nullable(),
  proposed_business_context: z.string().nullable(),
  proposed_runtime: z.string().default("edge_function"),
  proposed_allowed_tools: z.array(z.string()),
  proposed_system_prompt_fragment: z.string().nullable(),
  proposed_risk_tier: z.string().default("low"),
  proposed_cost_tier: z.string().default("free"),
  reason: z.string().nullable(),
  status: z.string().default("pending"),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.string().nullable(),
  promoted_skill_id: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type ZiroSkillProposalsRowParsed = z.infer<typeof ziroSkillProposalsRowSchema>;

export const ziroSkillsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  business_context: z.string().nullable(),
  runtime: z.string().default("edge_function"),
  allowed_tools: z.array(z.string()),
  system_prompt_fragment: z.string().nullable(),
  risk_tier: z.string().default("low"),
  cost_tier: z.string().default("free"),
  is_active: z.boolean().default(false),
  is_system: z.boolean().default(false),
  created_by: z.string().uuid().nullable(),
  approved_by: z.string().uuid().nullable(),
  approved_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
  use_count: z.number().int().default(0),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ZiroSkillsRowParsed = z.infer<typeof ziroSkillsRowSchema>;

export const ziroTaskAgentsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  task_run_id: z.string().uuid(),
  agent_type: z.string().default("ephemeral"),
  status: z.string().default("initializing"),
  skill_key: z.string().nullable(),
  config: z.unknown().default({}),
  result: z.unknown().nullable(),
  error_text: z.string().nullable(),
  spawned_at: z.string(),
  heartbeat_at: z.string().nullable(),
  retired_at: z.string().nullable(),
});
export type ZiroTaskAgentsRowParsed = z.infer<typeof ziroTaskAgentsRowSchema>;

export const ziroTaskRunsRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable(),
  origin_message_id: z.string().uuid().nullable(),
  skill_id: z.string().uuid().nullable(),
  status: z.string().default("pending"),
  classification: z.string().default("general"),
  intent_summary: z.string().nullable(),
  skill_key: z.string().nullable(),
  selected_runtime: z.string().nullable(),
  selected_tools: z.array(z.string()),
  prompt_fragment: z.string().nullable(),
  input_payload: z.unknown().default({}),
  output_payload: z.unknown().nullable(),
  error_text: z.string().nullable(),
  idempotency_key: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  route_chosen: z.string().nullable(),
  agent_used_id: z.string().uuid().nullable(),
  created_temp_agent: z.boolean().default(false),
  retained_after_task: z.boolean().default(false),
  result_summary: z.string().nullable(),
  routing_explanation: z.string().nullable(),
});
export type ZiroTaskRunsRowParsed = z.infer<typeof ziroTaskRunsRowSchema>;
