import { useEffect, useRef, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { PollCard } from './PollCard'
import { usePoll } from '../hooks/usePoll'
import { consumePendingPollId } from '../services/pollDeepLink'

/**
 * Компактний блок опитування на HomePage — не окрема сторінка. Мовчки
 * зникає, коли активного опитування немає (щойно завершене чи ще не
 * опубліковане), замість порожньої секції чи стану помилки: опитування
 * — необов'язковий блок, і зайвий скелетон/помилка тут не потрібні.
 */
export function PollSection() {
  const { poll, status, voting, voteError, vote } = usePoll()
  const [pendingId] = useState(() => consumePendingPollId())
  const [dismissed, setDismissed] = useState(false)
  const scrolledRef = useRef(false)

  // Deep link на неіснуюче, чуже чи вже завершене опитування просто не
  // збігається з жодним завантаженим опитуванням — нічого не підсвічує,
  // не ламає HomePage.
  const highlighted = Boolean(poll && pendingId && poll.id === pendingId && !dismissed)

  useEffect(() => {
    if (!highlighted || scrolledRef.current) return
    scrolledRef.current = true
    document.getElementById(`poll-${poll?.id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    const timer = window.setTimeout(() => setDismissed(true), 2500)
    return () => window.clearTimeout(timer)
  }, [highlighted, poll])

  if (status !== 'success' || !poll) return null

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--surface-border)] pt-5">
      <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
        <BarChart3 size={18} className="text-[var(--accent)]" /> Що організувати наступним?
      </h2>
      <PollCard poll={poll} voting={voting} highlighted={highlighted} onVote={vote} />
      {voteError && <p className="text-sm text-red-400">{voteError}</p>}
    </section>
  )
}
