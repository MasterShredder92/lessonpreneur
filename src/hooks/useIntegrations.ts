import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { safeFetch } from '../lib/safeFetch'
import { useAuth } from './useAuth'
import { qk } from '../lib/queryKeys'

export interface IntegrationConfig {
  id: string
  tenant_id: string
  integration_id: string
  status: 'connected' | 'disconnected'
  enabled: boolean
  credentials: Record<string, any>
  settings: Record<string, any>
  connected_at: string
  connected_by: string | null
  updated_at: string
  // Health tracking
  last_health_check: string | null
  health_status: 'healthy' | 'degraded' | 'error' | 'unknown'
  health_message: string | null
  last_activity_at: string | null
  webhook_url: string | null
}

export interface ApiToken {
  id: string
  name: string
  token_prefix: string
  scopes: string[]
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface WebhookEvent {
  id: string
  integration_id: string
  direction: 'inbound' | 'outbound'
  event_type: string
  status: string
  created_at: string
  // Outbound dispatch columns
  response_code: number | null
  response_body: string | null
  error_message: string | null
  latency_ms: number | null
  attempt_count: number
  delivery_id: string | null
  target_url: string | null
  next_retry_at: string | null
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const FUNCTIONS_URL = `https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1`

/** Generate a deterministic webhook URL for an integration */
export function getWebhookUrl(integrationId: string): string {
  return `${FUNCTIONS_URL}/integration-webhook?tenant=${TENANT_ID}&integration=${integrationId}`
}

export function useIntegrations() {
  return useQuery({
    queryKey: qk.integrations.configs,
    queryFn: async () => {
      // Never fetch credentials_encrypted to the client
      const { data, error } = await supabase
        .from('integration_configs')
        .select('id, tenant_id, integration_id, status, enabled, credentials, settings, connected_at, connected_by, updated_at, last_health_check, health_status, health_message, last_activity_at, webhook_url')
        .eq('tenant_id', TENANT_ID)
      if (error) throw error
      return (data ?? []) as IntegrationConfig[]
    },
  })
}

export function useConnectIntegration() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ integrationId, credentials, settings, webhookUrl }: {
      integrationId: string
      credentials: Record<string, any>
      settings?: Record<string, any>
      webhookUrl?: string
    }) => {
      const { data, error } = await supabase
        .from('integration_configs')
        .upsert({
          tenant_id: TENANT_ID,
          integration_id: integrationId,
          status: 'connected',
          enabled: true,
          credentials,
          settings: settings ?? {},
          connected_by: user?.id ?? null,
          connected_at: new Date().toISOString(),
          webhook_url: webhookUrl ?? null,
          health_status: 'unknown',
        }, { onConflict: 'tenant_id,integration_id' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.integrations.configs }),
  })
}

export function useDisconnectIntegration() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (integrationId: string) => {
      const { error } = await supabase
        .from('integration_configs')
        .delete()
        .eq('tenant_id', TENANT_ID)
        .eq('integration_id', integrationId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.integrations.configs }),
  })
}

export function useToggleIntegration() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ integrationId, enabled }: { integrationId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('integration_configs')
        .update({ enabled })
        .eq('tenant_id', TENANT_ID)
        .eq('integration_id', integrationId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.integrations.configs }),
  })
}

export function useUpdateIntegrationSettings() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ integrationId, settings, credentials }: {
      integrationId: string
      settings?: Record<string, any>
      credentials?: Record<string, any>
    }) => {
      const update: Record<string, any> = {}
      if (settings !== undefined) update.settings = settings
      if (credentials !== undefined) update.credentials = credentials
      const { error } = await supabase
        .from('integration_configs')
        .update(update)
        .eq('tenant_id', TENANT_ID)
        .eq('integration_id', integrationId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.integrations.configs }),
  })
}

/** Test an integration's credentials via edge function */
export function useTestConnection() {
  return useMutation({
    mutationFn: async ({ integrationId, credentials }: {
      integrationId: string
      credentials: Record<string, string>
    }): Promise<{ ok: boolean; message: string }> => {
      try {
        return await safeFetch<{ ok: boolean; message: string }>(
          `${FUNCTIONS_URL}/integration-test`,
          { body: { integration_id: integrationId, credentials } as Record<string, unknown> },
        )
      } catch (err: any) {
        return { ok: false, message: err?.message || 'Connection test failed' }
      }
    },
  })
}

/** Recent webhook events for an integration */
export function useWebhookEvents(integrationId: string | null) {
  return useQuery({
    queryKey: qk.integrations.webhookEvents(integrationId),
    queryFn: async () => {
      if (!integrationId) return []
      const { data, error } = await supabase
        .from('webhook_events')
        .select('id, integration_id, direction, event_type, status, created_at, response_code, response_body, error_message, latency_ms, attempt_count, delivery_id, target_url, next_retry_at')
        .eq('tenant_id', TENANT_ID)
        .eq('integration_id', integrationId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as WebhookEvent[]
    },
    enabled: !!integrationId,
  })
}

/** Recent outbound webhook deliveries across all integrations (for the delivery log panel) */
export function useOutboundDeliveries() {
  return useQuery({
    queryKey: qk.integrations.outboundLog,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_events')
        .select('id, integration_id, direction, event_type, status, created_at, response_code, response_body, error_message, latency_ms, attempt_count, delivery_id, target_url, next_retry_at')
        .eq('tenant_id', TENANT_ID)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as WebhookEvent[]
    },
    refetchInterval: 30_000, // Auto-refresh every 30s
  })
}

/** LP API Token management */
export function useApiTokens() {
  return useQuery({
    queryKey: ['api_tokens'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_tokens')
        .select('id, name, token_prefix, scopes, last_used_at, expires_at, revoked_at, created_at')
        .eq('tenant_id', TENANT_ID)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as ApiToken[]
    },
  })
}

export function useCreateApiToken() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, scopes, expiresInDays }: {
      name: string
      scopes: string[]
      expiresInDays?: number
    }): Promise<ApiToken & { token: string; warning: string }> => {
      return safeFetch<ApiToken & { token: string; warning: string }>(
        `${FUNCTIONS_URL}/api-token`,
        {
          body: {
            action: 'create',
            name,
            scopes,
            expires_in_days: expiresInDays,
          } as Record<string, unknown>,
        },
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api_tokens'] }),
  })
}

export function useRevokeApiToken() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (tokenId: string) => {
      await safeFetch(`${FUNCTIONS_URL}/api-token`, {
        body: { action: 'revoke', token_id: tokenId } as Record<string, unknown>,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api_tokens'] }),
  })
}
