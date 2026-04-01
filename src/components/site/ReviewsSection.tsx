import { useState, useEffect, useCallback, useRef } from 'react'
import { useReviews } from '../../hooks/useReviews'
import './reviews.css'

interface ReviewsSectionProps {
  instrumentTag?: string
}

export default function ReviewsSection({ instrumentTag }: ReviewsSectionProps) {
  const { reviews, loading } = useReviews(instrumentTag)
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(3)
  const [fading, setFading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const onResize = () => setPerPage(window.innerWidth < 768 ? 1 : 3)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const totalPages = Math.max(1, Math.ceil(reviews.length / perPage))

  useEffect(() => { setPage(0) }, [reviews, perPage])

  const startAutoRotate = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setPage(prev => (prev + 1) % totalPages)
        setFading(false)
      }, 250)
    }, 5000)
  }, [totalPages])

  useEffect(() => {
    if (totalPages <= 1) return
    startAutoRotate()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [totalPages, startAutoRotate])

  const handleDot = useCallback((p: number) => {
    setFading(true)
    setTimeout(() => { setPage(p); setFading(false) }, 250)
    startAutoRotate()
  }, [startAutoRotate])

  if (loading || reviews.length === 0) return null

  const visible = reviews.slice(page * perPage, page * perPage + perPage)

  return (
    <section className="rv-sec">
      <div className="rv-header">
        <span className="rv-label">REAL STUDENTS. REAL RESULTS.</span>
        <h2 className="rv-title">WHAT FAMILIES ARE SAYING</h2>
      </div>

      <div className={`rv-cards${fading ? ' rv-fade' : ''}`}>
        {visible.map(r => (
          <div className="rv-card" key={r.id}>
            <p className="rv-text">&ldquo;{r.text_cleaned}&rdquo;</p>
            <div className="rv-author">
              <div className="rv-author-left">
                <div className="rv-avatar">{r.reviewer_name[0]}</div>
                <div>
                  <span className="rv-name">{r.reviewer_name}</span>
                  <span className="rv-loc">{r.location_name}</span>
                </div>
              </div>
              <div className="rv-badge">
                <span className="rv-badge-rating">5.0 ★</span>
                <span className="rv-badge-src">Google Review</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <>
          <div className="rv-dots">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                className={`rv-dot${page === i ? ' rv-dot--on' : ''}`}
                onClick={() => handleDot(i)}
                aria-label={`Page ${i + 1}`}
              />
            ))}
          </div>
          <div className="rv-swipe">&larr; swipe to see more &rarr;</div>
        </>
      )}
    </section>
  )
}
