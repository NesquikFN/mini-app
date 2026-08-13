import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Star } from 'lucide-react'
import { fetchMyEventRating, getErrorMessage, submitEventRating } from '../services/api'
import {
  EVENT_RATING_LABELS,
  EVENT_RATING_TAGS,
  EVENT_RATING_TAG_LABELS,
  type EventRatingSelf,
  type EventRatingTag,
} from '../types/eventRating'

/**
 * Компактний блок «Як пройшла подія?» на завершеній EventDetailPage.
 * Сам вирішує, чи є йому що показати: якщо backend каже canRate=false і
 * власного голосу немає (не учасник, організатор, вікно ще не
 * відкрилось або вже закрилось без жодного голосу) — рендерить null.
 * Право оцінювати завжди перевіряє сервер (GET/PUT /events/:id/rating),
 * тут лише відображення того, що він повернув.
 */
export function EventRatingSection({ eventId }: { eventId: string }) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [myRating, setMyRating] = useState<EventRatingSelf | null>(null)
  const [canRate, setCanRate] = useState(false)
  const [pendingRating, setPendingRating] = useState<number | null>(null)
  const [pendingTag, setPendingTag] = useState<EventRatingTag | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMyEventRating(eventId)
      .then((res) => {
        if (cancelled) return
        setMyRating(res.myRating)
        setCanRate(res.canRate)
        setStatus('success')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  const submit = useCallback(async (rating: number, tags: EventRatingTag[]) => {
    setError(null)
    const res = await submitEventRating(eventId, rating, tags)
    setMyRating(res.myRating)
    setCanRate(res.canRate)
  }, [eventId])

  async function handleRate(rating: number) {
    setPendingRating(rating)
    try {
      await submit(rating, myRating?.tags ?? [])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPendingRating(null)
    }
  }

  async function handleToggleTag(tag: EventRatingTag) {
    if (!myRating) return
    const nextTags = myRating.tags.includes(tag)
      ? myRating.tags.filter((item) => item !== tag)
      : [...myRating.tags, tag]
    setPendingTag(tag)
    try {
      await submit(myRating.rating, nextTags)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPendingTag(null)
    }
  }

  // Нічого не показуємо ні поки вантажиться, ні коли завантажити не
  // вдалось (тихий збій — блок необов'язковий, не варто ним ламати
  // решту сторінки), ні коли оцінювати нема сенсу й нема що показати.
  if (status !== 'success') return null
  if (!canRate && !myRating) return null

  const readOnly = !canRate
  const busy = pendingRating !== null || pendingTag !== null

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
      <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
        <Star size={18} className="text-[var(--accent)]" /> Як пройшла подія?
      </h2>

      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((value) => {
          const selected = myRating?.rating === value
          return (
            <button
              key={value}
              type="button"
              disabled={readOnly || busy}
              onClick={() => handleRate(value)}
              className={`flex flex-col items-center gap-0.5 rounded-2xl border py-2.5 text-[11px] font-semibold transition-colors disabled:opacity-70 ${
                selected
                  ? 'border-[var(--accent)] bg-[var(--accent-soft-bg)] text-[var(--accent)]'
                  : 'border-[var(--surface-border)] text-[var(--text-secondary)]'
              } ${readOnly ? '' : 'active:scale-[0.96]'}`}
            >
              <span className="text-lg font-bold leading-none">{value}</span>
              <span className="text-center leading-tight">{EVENT_RATING_LABELS[value]}</span>
            </button>
          )
        })}
      </div>

      {myRating && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            Що сподобалося? (необов&apos;язково)
          </p>
          <div className="flex flex-wrap gap-2">
            {EVENT_RATING_TAGS.map((tag) => {
              const selected = myRating.tags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  disabled={readOnly || busy}
                  onClick={() => handleToggleTag(tag)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-70 ${
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft-bg)] text-[var(--accent)]'
                      : 'border-[var(--surface-border)] text-[var(--text-secondary)]'
                  }`}
                >
                  {EVENT_RATING_TAG_LABELS[tag]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {myRating && (
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
          <CheckCircle2 size={16} /> Дякуємо за відгук
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </section>
  )
}
