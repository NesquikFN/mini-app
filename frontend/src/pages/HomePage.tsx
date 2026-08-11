import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, CalendarX, GraduationCap, MessageCircle, MonitorPlay } from 'lucide-react'
import { useEvents } from '../hooks/useEvents'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { EventCard } from '../components/EventCard'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { DormitorySelector } from '../components/DormitorySelector'
import { SocialLinks } from '../components/SocialLinks'
import { fetchAppSettings, type SocialLinks as SocialLinksType } from '../services/api'
import { isEventPast } from '../utils/date'
import { NO_DORMITORY_ID } from '../types/dormitory'

const GPU_BOT_URL = 'https://t.me/gpubsmu_bot'

export function HomePage() {
  const { events, status, errorMessage, reload } = useEvents()
  const { user } = useCurrentUser()
  const [socialLinks, setSocialLinks] = useState<SocialLinksType>()

  useEffect(() => {
    fetchAppSettings()
      .then(setSocialLinks)
      .catch(() => setSocialLinks(undefined))
  }, [])

  // Backend повертає фізичні події свого гуртожитку плюс глобальні
  // онлайн-події. На головній розділяємо їх на окремі секції.
  const upcoming = [...events]
    .filter((event) => !event.isOnline && !isEventPast(event.date, event.time))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 3)
  const onlineEvents = [...events]
    .filter((event) => event.isOnline && !isEventPast(event.date, event.time))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 3)
  const onlineOnly = user?.dormitoryId === NO_DORMITORY_ID
  const offlineCollapsed = status === 'success' && upcoming.length === 0

  return (
    <div className="flex flex-col gap-6 px-4 pt-6 pb-8">
      <div className="relative rounded-[28px] border border-orange-500/20 bg-[linear-gradient(135deg,rgba(255,122,0,0.13),rgba(255,122,0,0.035)_48%,rgba(255,255,255,0.025))] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
        <div className="pointer-events-none absolute -left-8 -top-12 h-28 w-28 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 pt-0.5">
            <p className="flex items-center text-xl font-black tracking-[-0.04em] text-[var(--text-primary)]">
              <span className="lowercase">dorm</span>
              <span className="ml-1 rounded-lg bg-[var(--accent)] px-1.5 py-0.5 lowercase text-black">
                hub
              </span>
            </p>
            <p className="mt-1 truncate text-[11px] font-medium tracking-wide text-[var(--text-secondary)]">
              Збирайся · грай · знайомся
            </p>
          </div>
          <SocialLinks links={socialLinks} />
        </div>
        <div className="relative mt-4">
          <DormitorySelector />
        </div>
      </div>

      {!onlineOnly && !offlineCollapsed && <section className="flex flex-col gap-3 border-t border-[var(--surface-border)] pt-5">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
            <CalendarDays size={18} className="text-[var(--accent)]" /> Найближчі події
          </h2>
          <Link to="/events" className="text-sm font-medium text-[var(--accent)]">
            Переглянути всі
          </Link>
        </div>

        {status === 'loading' && <LoadingState label="Завантажуємо події…" />}

        {status === 'error' && (
          <EmptyState
            icon={<CalendarX size={40} />}
            title="Не вдалося завантажити події"
            description={errorMessage ?? undefined}
            actionLabel="Спробувати ще раз"
            onAction={reload}
          />
        )}

        {status === 'success' && upcoming.length > 0 && (
          <div className="flex flex-col gap-3">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>}

      <section className="flex flex-col gap-3 border-t border-[var(--surface-border)] pt-5">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
            <MonitorPlay size={18} className="text-[var(--accent)]" /> Онлайн-події
          </h2>
          <Link to="/events" className="text-sm font-medium text-[var(--accent)]">
            Переглянути всі
          </Link>
        </div>

        {status === 'success' && onlineEvents.length === 0 && (
          <EmptyState
            icon={<MonitorPlay size={36} />}
            title="Поки немає онлайн-подій"
            description="Вони доступні всім гуртожиткам."
          />
        )}

        {status === 'success' && onlineEvents.length > 0 && (
          <div className="flex flex-col gap-3">
            {onlineEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      <a
        href={GPU_BOT_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          const openTelegramLink = window.Telegram?.WebApp?.openTelegramLink
          if (!openTelegramLink) return
          event.preventDefault()
          openTelegramLink.call(window.Telegram?.WebApp, GPU_BOT_URL)
        }}
        className="group relative overflow-hidden rounded-[26px] border border-blue-400/30 bg-[linear-gradient(135deg,rgba(37,99,235,0.3),rgba(29,78,216,0.13)_55%,rgba(59,130,246,0.06))] p-4 shadow-[0_18px_45px_rgba(37,99,235,0.14)] transition-transform active:scale-[0.985]"
      >
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="relative flex items-center gap-3.5">
          <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl border border-blue-300/25 bg-blue-500/20 text-blue-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <GraduationCap size={27} strokeWidth={2} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-base font-extrabold tracking-tight text-white">ГПУ</span>
              <span className="rounded-full bg-blue-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-300">
                Для навчання
              </span>
            </span>
            <span className="mt-1 block text-sm leading-snug text-blue-100/75">
              Допомога з навчанням і доступ до чату спільноти
            </span>
          </span>

          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-300/20 bg-blue-400/15 text-blue-200 transition-transform group-active:translate-x-0.5">
            <ArrowUpRight size={20} />
          </span>
        </div>

        <span className="relative mt-3 flex items-center gap-2 border-t border-blue-300/15 pt-3 text-xs font-semibold text-blue-200">
          <MessageCircle size={15} /> Відкрити @gpubsmu_bot
        </span>
      </a>
    </div>
  )
}
