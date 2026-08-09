import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Crown, ImagePlus, MonitorPlay, X } from 'lucide-react'
import { Button } from './Button'
import type { CreateEventInput, DormEvent } from '../types/event'
import { todayISODate } from '../utils/date'

interface EventFormProps {
  onSubmit: (input: CreateEventInput) => Promise<void> | void
  submitting: boolean
  initialValues?: DormEvent
  submitLabel?: string
  submittingLabel?: string
  canCreateVipOnly?: boolean
}

interface FormErrors {
  title?: string
  date?: string
  time?: string
  location?: string
  maxParticipants?: string
  image?: string
  groupUrl?: string
  gameUrl?: string
}

export function EventForm({
  onSubmit,
  submitting,
  initialValues,
  submitLabel = 'Створити подію',
  submittingLabel = 'Створюємо…',
  canCreateVipOnly = false,
}: EventFormProps) {
  const [title, setTitle] = useState(initialValues?.title ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [date, setDate] = useState(initialValues?.date ?? '')
  const [time, setTime] = useState(initialValues?.time?.slice(0, 5) ?? '')
  const [location, setLocation] = useState(initialValues?.isOnline ? '' : initialValues?.location ?? '')
  const [maxParticipants, setMaxParticipants] = useState(
    initialValues ? String(initialValues.maxParticipants) : '',
  )
  const [groupUrl, setGroupUrl] = useState(initialValues?.groupUrl ?? '')
  const [gameUrl, setGameUrl] = useState(initialValues?.gameUrl ?? '')
  const [isOnline, setIsOnline] = useState(initialValues?.isOnline ?? false)
  const [vipOnly, setVipOnly] = useState(initialValues?.vipOnly ?? false)
  const [imageFile, setImageFile] = useState<File | undefined>()
  const [imagePreview, setImagePreview] = useState<string | undefined>(initialValues?.imageUrl)
  const [errors, setErrors] = useState<FormErrors>({})

  function validate(): FormErrors {
    const nextErrors: FormErrors = {}
    if (!title.trim()) nextErrors.title = 'Вкажіть назву події'
    if (!date) {
      nextErrors.date = 'Вкажіть дату'
    } else if (date < todayISODate()) {
      nextErrors.date = 'Дата не може бути в минулому'
    }
    if (!time) nextErrors.time = 'Вкажіть час'
    if (!isOnline && !location.trim()) nextErrors.location = 'Вкажіть місце'
    const maxNum = Number(maxParticipants)
    if (!maxParticipants || Number.isNaN(maxNum) || maxNum <= 0) {
      nextErrors.maxParticipants = 'Має бути більше 0'
    }
    if (groupUrl.trim()) {
      const value = groupUrl.trim()
      if (!/^@[A-Za-z0-9_]+$/.test(value)) {
        try {
          const url = new URL(value)
          if (!['t.me', 'telegram.me'].includes(url.hostname)) {
            nextErrors.groupUrl = 'Вкажіть @name або посилання на Telegram-групу'
          }
        } catch {
          nextErrors.groupUrl = 'Вкажіть @name або коректне посилання'
        }
      }
    }
    if (gameUrl.trim()) {
      try {
        const url = new URL(gameUrl.trim())
        if (!['http:', 'https:'].includes(url.protocol)) {
          nextErrors.gameUrl = 'Вкажіть коректне посилання на гру'
        }
      } catch {
        nextErrors.gameUrl = 'Вкажіть коректне посилання на гру'
      }
    }
    return nextErrors
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrors((current) => ({ ...current, image: 'Оберіть JPG, PNG або WebP' }))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((current) => ({ ...current, image: 'Фото має бути менше 5 МБ' }))
      return
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setErrors((current) => ({ ...current, image: undefined }))
  }

  function removeImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(undefined)
    setImagePreview(initialValues?.imageUrl)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      date,
      time,
      location: isOnline ? 'Онлайн' : location.trim(),
      maxParticipants: Number(maxParticipants),
      groupUrl: groupUrl.trim() || undefined,
      gameUrl: gameUrl.trim() || undefined,
      isOnline,
      vipOnly: canCreateVipOnly ? vipOnly : false,
      imageFile,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Назва" error={errors.title}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Наприклад, Кіновечір"
          className={inputClass(!!errors.title)}
        />
      </Field>

      <Field label="Опис">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Коротко опишіть подію"
          rows={3}
          className={inputClass(false)}
        />
      </Field>

      <Field label="Фотографія події" error={errors.image}>
        {imagePreview ? (
          <div className="relative overflow-hidden rounded-2xl">
            <img src={imagePreview} alt="Попередній перегляд" className="h-44 w-full object-cover" />
            {imageFile && (
              <button
                type="button"
                onClick={removeImage}
                className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white"
                aria-label="Скасувати нову фотографію"
              >
                <X size={18} />
              </button>
            )}
            <label className="absolute bottom-2 right-2 cursor-pointer rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">
              Замінити
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                className="sr-only"
              />
            </label>
          </div>
        ) : (
          <span className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-4 py-7 text-sm text-[var(--text-secondary)]">
            <ImagePlus size={22} className="text-[var(--accent)]" />
            Додати фотографію
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              className="sr-only"
            />
          </span>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата" error={errors.date}>
          <input
            type="date"
            value={date}
            min={todayISODate()}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass(!!errors.date)}
          />
        </Field>
        <Field label="Час" error={errors.time}>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputClass(!!errors.time)}
          />
        </Field>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] p-4">
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
            <MonitorPlay size={20} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-[var(--text-primary)]">Онлайн-подія</span>
            <span className="block text-xs text-[var(--text-secondary)]">Без фізичного місця проведення</span>
          </span>
        </span>
        <input
          type="checkbox"
          checked={isOnline}
          onChange={(event) => setIsOnline(event.target.checked)}
          className="h-5 w-5 accent-[var(--accent)]"
        />
      </label>

      {canCreateVipOnly && (
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-400">
              <Crown size={20} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[var(--text-primary)]">Тільки для VIP</span>
              <span className="block text-xs text-[var(--text-secondary)]">Інші користувачі не побачать цю подію</span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={vipOnly}
            onChange={(event) => setVipOnly(event.target.checked)}
            className="h-5 w-5 accent-amber-400"
          />
        </label>
      )}

      {!isOnline && (
        <Field label="Місце" error={errors.location}>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Наприклад, Кімната відпочинку"
            className={inputClass(!!errors.location)}
          />
        </Field>
      )}

      <Field label="Посилання на Telegram-групу" error={errors.groupUrl}>
        <input
          type="text"
          inputMode="url"
          value={groupUrl}
          onChange={(e) => setGroupUrl(e.target.value)}
          placeholder="@name або https://t.me/name"
          className={inputClass(!!errors.groupUrl)}
        />
      </Field>

      <Field label="Посилання на гру" error={errors.gameUrl}>
        <input
          type="url"
          value={gameUrl}
          onChange={(event) => setGameUrl(event.target.value)}
          placeholder="https://game.example/join"
          className={inputClass(!!errors.gameUrl)}
        />
      </Field>


      <Field
        label="Максимальна кількість учасників"
        error={errors.maxParticipants}
      >
        <input
          type="number"
          min={1}
          value={maxParticipants}
          onChange={(e) => setMaxParticipants(e.target.value)}
          placeholder="Наприклад, 20"
          className={inputClass(!!errors.maxParticipants)}
        />
      </Field>

      <Button
        type="submit"
        fullWidth
        loading={submitting}
        disabled={submitting}
      >
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </form>
  )
}

function inputClass(hasError: boolean): string {
  return `w-full rounded-xl border bg-[var(--surface-card-alt)] px-4 py-3 text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-light)] ${
    hasError ? 'border-red-400' : 'border-[var(--surface-border)]'
  }`
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  )
}
