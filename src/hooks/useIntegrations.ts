import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

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
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export function useIntegrations() {
  return useQuery({
    queryKey: ['integration_configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_configs')
        .select('*')
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
    mutationFn: async ({ integrationId, credentials, settings }: {
      integrationId: string
      credentials: Record<string, any>
      settings?: Record<string, any>
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
        }, { onConflict: 'tenant_id,integration_id' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration_configs'] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration_configs'] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration_configs'] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration_configs'] }),
  })
}
