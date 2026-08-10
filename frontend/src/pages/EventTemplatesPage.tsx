import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Bell, BellOff, CalendarPlus, ExternalLink, Gamepad2, ImagePlus, Link2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useDormitories } from '../hooks/useDormitories'
import { useEvents } from '../hooks/useEvents'
import {
  createEventFromTemplate,
  createEventTemplate,
  deleteEventTemplate,
  fetchEventTemplates,
  fetchTemplateManagerStatus,
  getErrorMessage,
  updateEventTemplate,
  updateMyNotifyNewEvents,
} from '../services/api'
import { formatEventDate, todayISODate } from '../utils/date'
import type { EventTemplate, EventTemplateInput } from '../types/admin'

type Status = 'loading' | 'success' | 'error'

/** "Ігри" — доступна будь-якому автентифікованому юзеру: переглядати й
 * запускати шаблони може кожен, а редагувати/створювати/видаляти —
 * лише адміни та хости (backend гейтить requireTemplateManager,
 * canManage тут визначає, чи показувати відповідні кнопки). */
export function EventTemplatesPage() {
  const { getDormitoryName } = useDormitories()
  const { reload: reloadEvents } = useEvents()
  const { user, reload: reloadUser } = useCurrentUser()
  const [templates, setTemplates] = useState<EventTemplate[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState<EventTemplate | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<EventTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [notifyToggling, setNotifyToggling] = useState(false)
  const [publishing, setPublishing] = useState<EventTemplate | null>(null)
  const [publishDate, setPublishDate] = useState('')
  const [publishTime, setPublishTime] = useState('')
  const [publishGameUrl, setPublishGameUrl] = useState('')
  const [publishSaving, setPublishSaving] = useState(false)

  const load = useCallback(() => {
    fetchEventTemplates()
      .then((data) => {
        setTemplates(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error))
        setStatus('error')
      })
  }, [])

  useEffect(() => load(), [load])

  useEffect(() => {
    fetchTemplateManagerStatus()
      .then(setCanManage)
      .catch(() => setCanManage(false))
  }, [])

  async function handleToggleNotify() {
    if (!user) return
    setNotifyToggling(true)
    try {
      await updateMyNotifyNewEvents(!user.notifyNewEvents)
      reloadUser()
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setNotifyToggling(false)
    }
  }

  async function handleSave(input: EventTemplateInput) {
    setSaving(true)
    setErrorMessage(null)
    try {
      if (editing && editing !== 'new') {
        const updated = await updateEventTemplate(editing.id, input)
        setTemplates((current) => current.map((item) => item.id === updated.id ? updated : item))
        setSuccessMessage('Шаблон оновлено.')
      } else {
        const created = await createEventTemplate(input)
        setTemplates((current) => [...current, created])
        setSuccessMessage('Шаблон створено.')
      }
      setEditing(null)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function openPublishDialog(template: EventTemplate) {
    setPublishing(template)
    setPublishDate('')
    setPublishTime('')
    setPublishGameUrl(template.gameUrl ?? '')
    setErrorMessage(null)
  }

  async function handleConfirmPublish() {
    if (!publishing) return
    setPublishSaving(true)
    setErrorMessage(null)
    try {
      const event = await createEventFromTemplate(
        publishing.id,
        publishDate,
        publishTime,
        publishGameUrl.trim() || null,
      )
      reloadEvents()
      setSuccessMessage(`Подію «${event.title}» створено на ${formatEventDate(event.date)} о ${publishTime}.`)
      setPublishing(null)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setPublishSaving(false)
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deleteEventTemplate(pendingDelete.id)
      setTemplates((current) => current.filter((item) => item.id !== pendingDelete.id))
      setPendingDelete(null)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col">
      <PageHeader title="Ігри" />
      <div className="flex flex-col gap-4 px-4 py-4">
        <a
          href="https://pidval-bgames.com.ua"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            const openLink = window.Telegram?.WebApp?.openLink
            if (!openLink) return
            event.preventDefault()
            openLink.call(window.Telegram?.WebApp, 'https://pidval-bgames.com.ua')
          }}
          className="flex items-center gap-3 rounded-2xl border border-orange-500/30 bg-gradient-to-r from-orange-500/15 to-[var(--surface-card)] px-4 py-3.5 transition-transform active:scale-[0.98]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
            <Gamepad2 size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-[var(--text-secondary)]">
              Сайт, де проходять ігри
            </span>
            <span className="block truncate text-[15px] font-semibold text-[var(--text-primary)]">
              pidval-bgames.com.ua
            </span>
          </span>
          <ExternalLink size={19} className="shrink-0 text-[var(--accent)]" />
        </a>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-secondary)]">Регулярні події в один клік — доступно всім.</p>
          {canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus size={17} /> Новий шаблон
            </Button>
          )}
        </div>

        {user && (
          <button
            type="button"
            onClick={handleToggleNotify}
            disabled={notifyToggling}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-4 py-3 text-left disabled:opacity-60"
          >
            <span className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              {user.notifyNewEvents ? <Bell size={17} className="text-[var(--accent)]" /> : <BellOff size={17} className="text-[var(--text-secondary)]" />}
              Сповіщення про нові події від бота
            </span>
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                user.notifyNewEvents ? 'bg-[var(--accent)]' : 'bg-[var(--surface-card-alt)]'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  user.notifyNewEvents ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        )}

        {successMessage && (
          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {successMessage}
          </p>
        )}
        {errorMessage && (
          <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {errorMessage}
          </p>
        )}

        {editing && canManage && (
          <TemplateForm
            key={editing === 'new' ? 'new' : editing.id}
            template={editing === 'new' ? undefined : editing}
            saving={saving}
            onSubmit={handleSave}
            onCancel={() => setEditing(null)}
          />
        )}

        {status === 'loading' && <LoadingState label="Завантажуємо шаблони…" />}
        {status === 'error' && (
          <EmptyState title="Не вдалося завантажити шаблони" actionLabel="Повторити" onAction={load} />
        )}
        {status === 'success' && templates.length === 0 && !editing && (
          <EmptyState
            icon={<Gamepad2 size={34} />}
            title="Шаблонів ще немає"
            description="Створіть першу регулярну гру."
          />
        )}

        <div className="flex flex-col gap-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)]"
            >
              {template.imageUrl && (
                <img src={template.imageUrl} alt={template.title} className="h-36 w-full object-cover" />
              )}
              <div className="flex items-start gap-3 p-4 pb-0">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
                  <Gamepad2 size={21} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold text-[var(--text-primary)]">{template.title}</h2>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-1"><MapPin size={13} /> {template.isOnline ? 'Онлайн' : template.location}</span>
                    {(template.gameUrl || template.gameUrlRequired) && (
                      <span className="inline-flex items-center gap-1">
                        <Link2 size={13} />
                        {template.gameUrlRequired ? 'Посилання обовʼязкове' : 'Посилання задано'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-disabled)]">
                    {template.isOnline ? 'Доступно всім гуртожиткам' : getDormitoryName(template.dormitoryId)}
                  </p>
                </div>
              </div>
              <div className={`m-4 grid gap-2 ${canManage ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-1'}`}>
                <Button onClick={() => openPublishDialog(template)}>
                  <CalendarPlus size={17} /> Створити найближчу
                </Button>
                {canManage && (
                  <>
                    <Button variant="outline" aria-label="Редагувати шаблон" onClick={() => setEditing(template)}>
                      <Pencil size={16} />
                    </Button>
                    <Button variant="danger" aria-label="Видалити шаблон" onClick={() => setPendingDelete(template)}>
                      <Trash2 size={16} />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {pendingDelete && (
          <ConfirmDialog
            title="Видалити шаблон?"
            description={`«${pendingDelete.title}» більше не буде доступний для швидкого створення.`}
            confirmLabel="Видалити"
            loading={deleting}
            onConfirm={handleDelete}
            onCancel={() => setPendingDelete(null)}
          />
        )}

        {publishing && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 animate-[dormhub-fade-in_0.15s_ease]"
            onClick={() => setPublishing(null)}
          >
            <form
              className="w-full max-w-sm rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-5 animate-[dormhub-slide-up_0.2s_ease]"
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault()
                void handleConfirmPublish()
              }}
            >
              <p className="text-base font-semibold text-[var(--text-primary)]">
                Коли провести «{publishing.title}»?
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Оберіть дату та час для нової події.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <input
                  required
                  type="date"
                  min={todayISODate()}
                  autoFocus
                  value={publishDate}
                  onChange={(event) => setPublishDate(event.target.value)}
                  className={inputClass}
                />
                <input
                  required
                  type="time"
                  value={publishTime}
                  onChange={(event) => setPublishTime(event.target.value)}
                  className={inputClass}
                />
              </div>
              <label className="mt-4 flex flex-col gap-1.5 text-sm text-[var(--text-primary)]">
                Посилання на гру {publishing.gameUrlRequired ? '(обовʼязково)' : '(необовʼязково)'}
                <input
                  required={publishing.gameUrlRequired}
                  type="url"
                  value={publishGameUrl}
                  onChange={(event) => setPublishGameUrl(event.target.value)}
                  placeholder="https://game.example/join"
                  className={inputClass}
                />
              </label>
              <div className="mt-5 flex gap-3">
                <Button variant="outline" fullWidth onClick={() => setPublishing(null)} disabled={publishSaving}>
                  Скасувати
                </Button>
                <Button
                  type="submit"
                  fullWidth
                  loading={publishSaving}
                  disabled={!publishDate || !publishTime || (publishing.gameUrlRequired && !publishGameUrl.trim())}
                >
                  Створити
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateForm({
  template,
  saving,
  onSubmit,
  onCancel,
}: {
  template?: EventTemplate
  saving: boolean
  onSubmit: (input: EventTemplateInput) => void
  onCancel: () => void
}) {
  const { dormitories } = useDormitories()
  const [title, setTitle] = useState(template?.title ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [isOnline, setIsOnline] = useState(template?.isOnline ?? false)
  const [location, setLocation] = useState(template?.isOnline ? '' : template?.location ?? '')
  const [maxParticipants, setMaxParticipants] = useState(String(template?.maxParticipants ?? 12))
  const [groupUrl, setGroupUrl] = useState(template?.groupUrl ?? '')
  const [gameUrl, setGameUrl] = useState(template?.gameUrl ?? '')
  const [gameUrlRequired, setGameUrlRequired] = useState(template?.gameUrlRequired ?? false)
  const [dormitoryId, setDormitoryId] = useState(template?.dormitoryId ?? dormitories[0]?.id ?? '')
  const [imageFile, setImageFile] = useState<File | undefined>()
  const [imagePreview, setImagePreview] = useState<string | undefined>(template?.imageUrl)
  const [imageError, setImageError] = useState<string | undefined>()

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError('Оберіть JPG, PNG або WebP')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Фото має бути менше 5 МБ')
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setImageError(undefined)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      isOnline,
      location: isOnline ? 'Онлайн' : location.trim(),
      maxParticipants: Number(maxParticipants),
      groupUrl: groupUrl.trim() || undefined,
      gameUrl: gameUrl.trim() || undefined,
      gameUrlRequired,
      imageFile,
      dormitoryId: isOnline ? undefined : dormitoryId,
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-[var(--accent)]/40 bg-[var(--surface-card)] p-4">
      <h2 className="font-semibold text-[var(--text-primary)]">{template ? 'Редагувати шаблон' : 'Новий шаблон'}</h2>
      <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Назва гри" className={inputClass} />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Опис" rows={2} className={inputClass} />
      <label className="cursor-pointer overflow-hidden rounded-xl border border-dashed border-[var(--surface-border)] bg-[var(--surface-card-alt)]">
        {imagePreview ? (
          <div className="relative">
            <img src={imagePreview} alt="Попередній перегляд" className="h-40 w-full object-cover" />
            <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">Замінити</span>
          </div>
        ) : (
          <span className="flex items-center justify-center gap-2 px-4 py-7 text-sm text-[var(--text-secondary)]">
            <ImagePlus size={21} className="text-[var(--accent)]" /> Додати фотографію
          </span>
        )}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} className="sr-only" />
      </label>
      {imageError && <p className="-mt-2 text-xs text-red-400">{imageError}</p>}
      <label className="flex items-center justify-between rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-3 py-3 text-sm text-[var(--text-primary)]">
        Онлайн-подія
        <input type="checkbox" checked={isOnline} onChange={(event) => setIsOnline(event.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
      </label>
      {!isOnline && (
        <>
          <select required value={dormitoryId} onChange={(event) => setDormitoryId(event.target.value)} className={inputClass}>
            {dormitories.map((dormitory) => <option key={dormitory.id} value={dormitory.id}>{dormitory.name}</option>)}
          </select>
          <input required value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Місце" className={inputClass} />
        </>
      )}
      <input required min={1} type="number" value={maxParticipants} onChange={(event) => setMaxParticipants(event.target.value)} placeholder="Максимум учасників" className={inputClass} />
      <input value={groupUrl} onChange={(event) => setGroupUrl(event.target.value)} placeholder="@group або https://t.me/group" className={inputClass} />
      <input type="url" value={gameUrl} onChange={(event) => setGameUrl(event.target.value)} placeholder="Посилання на гру (необовʼязково)" className={inputClass} />
      <label className="flex items-center justify-between rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-3 py-3 text-sm text-[var(--text-primary)]">
        Вимагати посилання під час запуску
        <input type="checkbox" checked={gameUrlRequired} onChange={(event) => setGameUrlRequired(event.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={saving} onClick={onCancel}>Скасувати</Button>
        <Button type="submit" loading={saving}>{template ? 'Зберегти' : 'Створити шаблон'}</Button>
      </div>
    </form>
  )
}

const inputClass = 'w-full rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card-alt)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-disabled)] focus:border-[var(--accent)]'
