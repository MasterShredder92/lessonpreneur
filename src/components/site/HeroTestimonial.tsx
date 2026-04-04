import { useEffect, useState } from 'react'
import { supabase as anon } from '../../lib/supabase'

interface SeedReview {
  text: string
  name: string
}

interface Props {
  instrumentTag: 'guitar' | 'piano' | 'vocals' | 'drums'
  seed: SeedReview
}

interface ReviewRow {
  id: string
  reviewer_name: string
  text_cleaned: string
}

/**
 * Compact hero testimonial card.
 * Pulls a random active review matching instrument_tag; falls back to the
 * provided seed if the query returns empty. Uses .ak-hreview styling.
 */
export default function HeroTestimonial({ instrumentTag, seed }: Props) {
  const [review, setReview] = useState<{ text: string; name: string }>(seed)

  useEffect(() => {
    let cancelled = false
    async function fetchOne() {
      const { data } = await anon
        .from('reviews')
        .select('id, reviewer_name, text_cleaned')
        .eq('instrument_tag', instrumentTag)
        .eq('is_active', true)
      if (cancelled) return
      const rows = (data ?? []) as ReviewRow[]
      if (rows.length === 0) return // keep seed
      const pick = rows[Math.floor(Math.random() * rows.length)]
      setReview({ text: pick.text_cleaned, name: pick.reviewer_name })
    }
    fetchOne()
    return () => { cancelled = true }
  }, [instrumentTag])

  return (
    <div className="ak-hreview ak-hreview--hero">
      <p className="ak-hreview-text">&ldquo;{review.text}&rdquo;</p>
      <div className="ak-hreview-name">— {review.name}</div>
    </div>
  )
}
