import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, Clock, Gamepad2, MapPin } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EventForm } from '../components/EventForm'
import { Button } from '../components/Button'
import { useEvents } from '../hooks/useEvents'
import {
  createEventFromAvailableTemplate,
  fetchAvailableEventTemplates,
  getErrorMessage,
} from '../services/api'
import type { CreateEventInput } from '../types/event'
import type { EventTemplate } from '../types/admin'

const WEEKDAYS = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота']

export function CreateEventPage() {
  const { createEvent, reload: reloadEvents } = useEvents()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [templates, setTemplates] = useState<EventTemplate[]>([])
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)

  useEffect(() => {
    fetchAvailableEventTemplates()
      .then(setTemplates)
      .catch((error: unknown) => setTemplatesError(getErrorMessage(error)))
  }, [])

  async function handleSubmit(input: CreateEventInput) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await createEvent(input)
      navigate('/events', {
        state: { successMessage: 'Подію успішно створено!' },
      })
    } catch (error) {
      setSubmitError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handlePublishTemplate = useCallback(async (template: EventTemplate) => {
    setPublishingId(template.id)
    setTemplatesError(null)
    try {
      await createEventFromAvailableTemplate(template.id)
      reloadEvents()
      navigate('/events', {
        state: { successMessage: `Подію «${template.title}» створено!` },
      })
    } catch (error) {
      setTemplatesError(getErrorMessage(error))
    } finally {
      setPublishingId(null)
    }
  }, [navigate, reloadEvents])

  return (
    <div className="flex flex-col">
      <PageHeader title="Створити подію" />
      <div className="flex flex-col gap-5 px-4 py-4">
        {templates.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)]">
              Швидкий старт за шаблоном
            </h2>
            {templatesError && (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {templatesError}
              </p>
            )}
            <div className="flex flex-col gap-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
                    <Gamepad2 size={21} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[var(--text-primary)]">{template.title}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={13} /> {WEEKDAYS[template.weekday]}, {template.time.slice(0, 5)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={13} /> {template.isOnline ? 'Онлайн' : template.location}
                      </span>
                    </div>
                  </div>
                  <Button
                    aria-label={`Створити подію «${template.title}»`}
                    loading={publishingId === template.id}
                    disabled={publishingId !== null}
                    onClick={() => handlePublishTemplate(template)}
                  >
                    <CalendarPlus size={17} />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--text-disabled)]">
              <span className="h-px flex-1 bg-[var(--surface-border)]" />
              або заповніть форму самі
              <span className="h-px flex-1 bg-[var(--surface-border)]" />
            </div>
          </section>
        )}

        {submitError && (
          <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {submitError}
          </p>
        )}
        <EventForm onSubmit={handleSubmit} submitting={submitting} />
      </div>
    </div>
  )
}
