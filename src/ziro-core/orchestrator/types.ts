export type TaskRunStatus =
  | 'pending'
  | 'skill_matched'
  | 'agent_spawned'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type TaskAgentStatus =
  | 'initializing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retired'

export type RouteType = 'direct' | 'skill' | 'agent' | 'temp_agent'

export interface TaskRunRecord {
  id: string
  tenant_id: string
  profile_id: string
  conversation_id: string | null
  origin_message_id: string | null
  skill_id: string | null
  status: TaskRunStatus
  classification: string
  intent_summary: string | null
  skill_key: string | null
  selected_runtime: string | null
  selected_tools: string[]
  prompt_fragment: string | null
  input_payload: Record<string, unknown>
  output_payload: Record<string, unknown> | null
  error_text: string | null
  idempotency_key: string
  route_chosen: RouteType | null
  agent_used_id: string | null
  created_temp_agent: boolean
  retained_after_task: boolean
  result_summary: string | null
  routing_explanation: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface TaskAgentRecord {
  id: string
  tenant_id: string
  task_run_id: string
  agent_type: string
  status: TaskAgentStatus
  skill_key: string | null
  config: Record<string, unknown>
  result: Record<string, unknown> | null
  error_text: string | null
  spawned_at: string
  heartbeat_at: string | null
  retired_at: string | null
}

export interface AgentRecord {
  id: string
  tenant_id: string
  name: string
  purpose: string | null
  status: 'active' | 'idle' | 'retired'
  owner_type: 'system' | 'user'
  lifecycle_type: 'temporary' | 'persistent'
  invocation_rules: Record<string, unknown>
  created_by: string | null
  created_at: string
  last_used_at: string | null
  retired_at: string | null
}

export interface SkillMatch {
  id: string
  key: string
  name: string
  runtime: string
  allowed_tools: string[]
  system_prompt_fragment: string | null
  risk_tier: string
  cost_tier: string
}

export interface OrchestrationIntent {
  classification: 'quick_answer' | 'actionable_task' | 'skill_proposal'
  intent_summary: string
  suggested_skill_key?: string
  input_payload?: Record<string, unknown>
}

export interface RoutingDecision {
  route: RouteType
  skill: SkillMatch | null
  agent: AgentRecord | null
  explanation: string
  createdTempAgent: boolean
}

export interface CreateTaskRunParams {
  tenantId: string
  profileId: string
  conversationId: string | null
  originMessageId: string | null
  intent: OrchestrationIntent
  idempotencyKey: string
}

export interface TaskRunResult {
  ok: boolean
  taskRun?: TaskRunRecord
  agent?: TaskAgentRecord
  skill?: SkillMatch | null
  routing?: RoutingDecision
  error?: string
  deduplicated?: boolean
}

