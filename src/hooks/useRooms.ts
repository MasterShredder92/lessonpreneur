import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'

export interface Room {
  id: string
  tenant_id: string
  location_id: string
  name: string
  display_order: number
  layout_x: number
  layout_y: number
  layout_w: number
  layout_h: number
  floor: number
  primary_instruments: string[] | null
  status: string
  room_type: string | null
  notes: string | null
  color: string | null
  is_active: boolean
  inventory?: InventoryItem[]
  flagged_count?: number
}

export interface InventoryItem {
  id: string
  room_id: string
  tenant_id: string
  item_name: string
  quantity: number
  condition: string
  is_flagged: boolean
  flag_note: string | null
  flagged_at: string | null
}

export function useRooms(locationId: string | undefined) {
  return useQuery({
    queryKey: [...qk.rooms.all, locationId],
    enabled: !!locationId,
    queryFn: async () => {
      const { data: rooms, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('location_id', locationId!)
        .order('display_order')
      if (error) throw error

      // Get inventory + flag counts
      const roomIds = rooms.map((r: any) => r.id)
      const { data: inventory } = await supabase
        .from('room_inventory')
        .select('*')
        .in('room_id', roomIds)
        .order('item_name')

      return rooms.map((r: any) => {
        const items = inventory?.filter((i: any) => i.room_id === r.id) ?? []
        return {
          ...r,
          inventory: items,
          flagged_count: items.filter((i: any) => i.is_flagged).length,
        }
      }) as Room[]
    },
  })
}

export function useRoomsForLocation(locationId: string | undefined) {
  return useQuery({
    queryKey: ['rooms-simple', locationId],
    enabled: !!locationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name, primary_instruments, status')
        .eq('location_id', locationId!)
        .eq('is_active', true)
        .order('display_order')
      if (error) throw error
      return data as { id: string; name: string; primary_instruments: string[] | null; status: string }[]
    },
  })
}

export function useCreateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { tenant_id: string; location_id: string; name: string; primary_instruments: string[]; notes: string }) => {
      const { data, error } = await supabase.from('rooms').insert(params).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.rooms.all }),
  })
}

export function useUpdateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Room> & { id: string }) => {
      const { error } = await supabase.from('rooms').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.rooms.all }),
  })
}

export function useAddInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { room_id: string; tenant_id: string; item_name: string; quantity: number }) => {
      const { error } = await supabase.from('room_inventory').insert(params)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.rooms.all }),
  })
}

export function useFlagInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, flag_note, flagged_by }: { id: string; flag_note: string; flagged_by: string }) => {
      const { error } = await supabase.from('room_inventory').update({
        is_flagged: true, flag_note, flagged_by, flagged_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.rooms.all }); qc.invalidateQueries({ queryKey: qk.dashboard.all }); },
  })
}

export function useResolveInventoryFlag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, resolve_reason, resolved_by }: { id: string; resolve_reason: string; resolved_by: string }) => {
      const { error } = await supabase.from('room_inventory').update({
        is_flagged: false, resolve_reason, resolved_by, resolved_at: new Date().toISOString(),
        flag_note: null, flagged_by: null, flagged_at: null,
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.rooms.all }); qc.invalidateQueries({ queryKey: qk.dashboard.all }); },
  })
}

export function useDeleteInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('room_inventory').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.rooms.all }),
  })
}

export function useFlaggedInventory() {
  return useQuery({
    queryKey: qk.flagged.inventory,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_inventory')
        .select('id, item_name, flag_note, flagged_at, room_id')
        .eq('is_flagged', true)
        .order('flagged_at', { ascending: false })
      if (error) throw error
      if (!data || data.length === 0) return []

      const roomIds = [...new Set(data.map((i: any) => i.room_id))]
      const { data: rooms } = await supabase.from('rooms').select('id, name, location_id').in('id', roomIds)
      const { data: locations } = await supabase.from('locations').select('id, name')

      const roomMap = new Map(rooms?.map((r: any) => [r.id, r]) ?? [])
      const locMap = new Map(locations?.map((l: any) => [l.id, l.name?.replace(' Music Lessons', '')]) ?? [])

      return data.map((i: any) => {
        const room = roomMap.get(i.room_id) as any
        return { ...i, room_name: room?.name, location_name: locMap.get(room?.location_id) }
      })
    },
  })
}
