import { CheckCircle2, Users } from 'lucide-react'
import type { Poll } from '../types/poll'

interface PollCardProps {
  poll: Poll
  voting: boolean
  highlighted?: boolean
  onVote: (optionId: string) => void
}

function formatEndsAt(endsAt: string): string {
  return new Date(endsAt).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * До власного голосу картка показує лише варіанти для вибору (без
 * відсотків і кількості) — самі результати з'являються, щойно людина
 * проголосувала, або одразу для завершеного опитування (яке більше не
 * приймає голосів). Той самий "спочатку відповідь, потім чужі відповіді"
 * принцип, що й у звичайних Telegram-опитуваннях.
 */
export function PollCard({ poll, voting, highlighted = false, onVote }: PollCardProps) {
  const isFinished = poll.status === 'finished'
  const hasVoted = Boolean(poll.myOptionId)
  const showResults = hasVoted || isFinished

  return (
    <div
      id={`poll-${poll.id}`}
      className={`flex flex-col gap-3 rounded-3xl border p-4 transition-colors duration-500 ${
        highlighted
          ? 'border-[var(--accent)] bg-[var(--accent-soft-bg)]'
          : 'border-[var(--surface-border)] bg-[var(--surface-card)]'
      }`}
    >
      {/* Запитання й варіанти пише адмін, рендеряться як звичайний
          текстовий вузол React — без dangerouslySetInnerHTML, тож жоден
          HTML/скрипт із тексту не виконується. */}
      <p className="text-[15px] font-semibold leading-snug text-[var(--text-primary)]">
        {poll.question}
      </p>

      <div className="flex flex-col gap-2">
        {poll.options.map((option) => {
          const isMine = poll.myOptionId === option.id
          const canClick = !isFinished

          if (!showResults) {
            return (
              <button
                key={option.id}
                type="button"
                disabled={voting || !canClick}
                onClick={() => onVote(option.id)}
                className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-3.5 py-2.5 text-left text-sm font-medium text-[var(--text-primary)] transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {option.text}
              </button>
            )
          }

          return (
            <button
              key={option.id}
              type="button"
              disabled={voting || !canClick}
              onClick={() => onVote(option.id)}
              className={`relative overflow-hidden rounded-2xl border px-3.5 py-2.5 text-left text-sm transition-colors disabled:opacity-90 ${
                isMine
                  ? 'border-[var(--accent)] bg-[var(--accent-soft-bg)]'
                  : 'border-[var(--surface-border)] bg-[var(--surface-card-alt)]'
              }`}
            >
              <span
                className="pointer-events-none absolute inset-y-0 left-0 bg-[var(--accent)]/12"
                style={{ width: `${option.percentage}%` }}
              />
              <span className="relative flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-medium text-[var(--text-primary)]">
                  {isMine && <CheckCircle2 size={15} className="shrink-0 text-[var(--accent)]" />}
                  <span className="truncate">{option.text}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-[var(--text-secondary)]">
                  {option.percentage}% · {option.votes}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1">
          <Users size={13} /> {poll.totalVotes} {poll.totalVotes === 1 ? 'голос' : 'голосів'}
        </span>
        <span className="flex items-center gap-2">
          {isFinished && (
            <span className="rounded-full bg-[var(--surface-card-alt)] px-2 py-0.5 font-medium">
              Завершено
            </span>
          )}
          {!isFinished && poll.endsAt && <span>До {formatEndsAt(poll.endsAt)}</span>}
        </span>
      </div>
    </div>
  )
}
