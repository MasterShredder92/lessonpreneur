/** Brand accent hex per Supabase `locations.id` — shared by Families, Students, schedule views. */
export const LOCATION_BRAND_COLORS: Record<string, string> = {
  'd48229c1-b70a-4d29-893e-5079887dab76': '#D41113', // Omaha
  'f7b52dd5-12ee-437f-9c60-f8adf454ac31': '#A333FF', // Bellevue
  'cebd97d4-c241-4de2-8ade-49e5cc0070d5': '#00A5E8', // Elkhorn
  '40c67ffc-91b5-46a9-94bd-6ddffdfb7638': '#00A651', // Gretna
}

const LOCATION_COLORS = LOCATION_BRAND_COLORS

export function getLocationColor(locationId: string): string {
  return LOCATION_COLORS[locationId] ?? '#D4226A'
}

export function abbreviateRoom(room: string): string {
  const match = room.match(/^Room\s+(\d+)$/i)
  if (match) return `R${match[1]}`
  const numMatch = room.match(/^(.+?)(\d+)$/)
  if (numMatch) return `${numMatch[1].charAt(0)}${numMatch[2]}`
  return room.slice(0, 3)
}
