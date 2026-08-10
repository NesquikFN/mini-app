import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Crown, Eraser, ImagePlus, MonitorPlay, X } from 'lucide-react'
import { Button } from './Button'
import type { CreateEventInput, DormEvent } from '../types/event'
import { todayISODate } from '../utils/date'

interface EventFormProps {
  onSubmit: (input: CreateEventInput) => Promise<boolean | void> | boolean | void
  submitting: boolean
  initialValues?: DormEvent
  submitLabel?: string
  submittingLabel?: string
  canCreateVipOnly?: boolean
  onlineOnly?: boolean
  draftStorageKey?: string
}

interface EventFormDraft {
  title: string
  description: string
  date: string
  time: string
  location: string
  maxParticipants: string
  groupUrl: string
  gameUrl: string
  isOnline: boolean
  vipOnly: boolean
}

const draftImages = new Map<string, { file: File; previewUrl: string }>()

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
  onlineOnly = false,
  draftStorageKey,
}: EventFormProps) {
  const [savedDraft] = useState<EventFormDraft | null>(() =>
    initialValues ? null : readDraft(draftStorageKey),
  )
  const savedImage = draftStorageKey ? draftImages.get(draftStorageKey) : undefined
  const [title, setTitle] = useState(initialValues?.title ?? savedDraft?.title ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? savedDraft?.description ?? '')
  const [date, setDate] = useState(initialValues?.date ?? savedDraft?.date ?? '')
  const [time, setTime] = useState(initialValues?.time?.slice(0, 5) ?? savedDraft?.time ?? '')
  const [location, setLocation] = useState(
    initialValues?.isOnline ? '' : initialValues?.location ?? savedDraft?.location ?? '',
  )
  const [maxParticipants, setMaxParticipants] = useState(
    initialValues ? String(initialValues.maxParticipants) : savedDraft?.maxParticipants ?? '',
  )
  const [groupUrl, setGroupUrl] = useState(initialValues?.groupUrl ?? savedDraft?.groupUrl ?? '')
  const [gameUrl, setGameUrl] = useState(initialValues?.gameUrl ?? savedDraft?.gameUrl ?? '')
  const [isOnline, setIsOnline] = useState(
    onlineOnly || initialValues?.isOnline || savedDraft?.isOnline || false,
  )
  const [vipOnly, setVipOnly] = useState(initialValues?.vipOnly ?? savedDraft?.vipOnly ?? false)
  const [imageFile, setImageFile] = useState<File | undefined>(savedImage?.file)
  const [imagePreview, setImagePreview] = useState<string | undefined>(
    initialValues?.imageUrl ?? savedImage?.previewUrl,
  )
  const [errors, setErrors] = useState<FormErrors>({})

  useEffect(() => {
    if (!draftStorageKey || initialValues) return
    writeDraft(draftStorageKey, {
      title,
      description,
      date,
      time,
      location,
      maxParticipants,
      groupUrl,
      gameUrl,
      isOnline,
      vipOnly,
    })
  }, [
    date,
    description,
    draftStorageKey,
    gameUrl,
    groupUrl,
    initialValues,
    isOnline,
    location,
    maxParticipants,
    time,
    title,
    vipOnly,
  ])

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
    const previewUrl = URL.createObjectURL(file)
    setImageFile(file)
    setImagePreview(previewUrl)
    if (draftStorageKey && !initialValues) {
      draftImages.set(draftStorageKey, { file, previewUrl })
    }
    setErrors((current) => ({ ...current, image: undefined }))
  }

  function removeImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(undefined)
    setImagePreview(initialValues?.imageUrl)
    if (draftStorageKey) draftImages.delete(draftStorageKey)
  }

  function clearForm() {
    if (imagePreview && imageFile) URL.revokeObjectURL(imagePreview)
    setTitle('')
    setDescription('')
    setDate('')
    setTime('')
    setLocation('')
    setMaxParticipants('')
    setGroupUrl('')
    setGameUrl('')
    setIsOnline(onlineOnly)
    setVipOnly(false)
    setImageFile(undefined)
    setImagePreview(initialValues?.imageUrl)
    setErrors({})
    if (draftStorageKey) {
      draftImages.delete(draftStorageKey)
      removeDraft(draftStorageKey)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const submitted = await onSubmit({
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
    if (draftStorageKey && submitted !== false) clearForm()
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

      <label className={`flex items-center justify-between gap-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] p-4 ${onlineOnly ? 'cursor-default' : 'cursor-pointer'}`}>
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
          disabled={onlineOnly}
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

      <div className={`grid gap-3 ${draftStorageKey ? 'grid-cols-[auto_1fr]' : 'grid-cols-1'}`}>
        {draftStorageKey && (
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={clearForm}
            className="px-4"
          >
            <Eraser size={18} /> Очистити
          </Button>
        )}
        <Button
          type="submit"
          fullWidth
          loading={submitting}
          disabled={submitting}
        >
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </form>
  )
}

function readDraft(key?: string): EventFormDraft | null {
  if (!key) return null
  try {
    const value = window.sessionStorage.getItem(key)
    return value ? JSON.parse(value) as EventFormDraft : null
  } catch {
    return null
  }
}

function writeDraft(key: string, draft: EventFormDraft) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // The form remains usable even when storage is unavailable.
  }
}

function removeDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // Nothing else to clear when storage is unavailable.
  }
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
