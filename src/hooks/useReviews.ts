import { useEffect, useState } from 'react'
import { supabase as anon } from '../lib/supabase'

export interface Review {
  id: string
  reviewer_name: string
  location_name: string
  text_cleaned: string
  instrument_tag: string
}

/** Fisher-Yates shuffle (in-place) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Fetches active reviews from Supabase.
 *  - If instrumentTag is provided, fetches that tag first, backfills with
 *    'general' if fewer than 6 results.
 *  - If no tag, fetches a random mix from all tags.
 *  - Shuffles results and returns at most 6.
 */
export function useReviews(instrumentTag?: string) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      setLoading(true)

      if (instrumentTag) {
        // Fetch tagged reviews
        const { data: tagged } = await anon
          .from('reviews')
          .select('id, reviewer_name, location_name, text_cleaned, instrument_tag')
          .eq('instrument_tag', instrumentTag)
          .eq('is_active', true)

        let pool: Review[] = tagged ?? []

        // Backfill with general if not enough
        if (pool.length < 6) {
          const { data: general } = await anon
            .from('reviews')
            .select('id, reviewer_name, location_name, text_cleaned, instrument_tag')
            .eq('instrument_tag', 'general')
            .eq('is_active', true)

          const existingIds = new Set(pool.map(r => r.id))
          const extras = (general ?? []).filter(r => !existingIds.has(r.id))
          pool = [...pool, ...extras]
        }

        if (!cancelled) setReviews(shuffle(pool).slice(0, 6))
      } else {
        // No tag — random mix from all
        const { data } = await anon
          .from('reviews')
          .select('id, reviewer_name, location_name, text_cleaned, instrument_tag')
          .eq('is_active', true)

        if (!cancelled) setReviews(shuffle(data ?? []).slice(0, 6))
      }

      if (!cancelled) setLoading(false)
    }

    fetch()
    return () => { cancelled = true }
  }, [instrumentTag])

  return { reviews, loading }
}
