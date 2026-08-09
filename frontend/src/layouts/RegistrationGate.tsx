import { useState, type FormEvent, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { AtSign, Cake, Camera, GraduationCap, Hourglass, Send, ShieldAlert } from 'lucide-react'
import { Button } from '../components/Button'
import { LoadingState } from '../components/LoadingState'
import { EmptyState } from '../components/EmptyState'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { getErrorMessage } from '../services/api'

interface FormErrors {
  age?: string
  faculty?: string
  instagram?: string
  bio?: string
}

/**
 * Ручна модерація реєстрації — стоїть ПЕРЕД DormitoryGate: поки заявку не
 * схвалено, людина не бачить навіть вибір гуртожитку, не кажучи вже про
 * основний застосунок. Джерело правди — user.registrationStatus з backend
 * (useCurrentUser), не локальний стан: після reload сторінки статус
 * лишається коректним, бо приходить разом із рештою профілю.
 */
export function RegistrationGate() {
  const { user, status, errorMessage, reload } = useCurrentUser()

  if (status === 'loading') {
    return (
      <FullScreenCenter>
        <LoadingState label="Завантажуємо профіль…" />
      </FullScreenCenter>
    )
  }

  if (status === 'error' || !user) {
    return (
      <FullScreenCenter>
        <EmptyState
          title="Не вдалося завантажити профіль"
          description={errorMessage ?? undefined}
          actionLabel="Спробувати ще раз"
          onAction={reload}
        />
      </FullScreenCenter>
    )
  }

  if (user.registrationStatus === 'pending') {
    return (
      <FullScreenCenter>
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
            <Hourglass size={26} />
          </span>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Заявку надіслано
          </h1>
          <p className="max-w-xs text-sm text-[var(--text-secondary)]">
            Очікуйте підтвердження адміністратора.
          </p>
        </div>
      </FullScreenCenter>
    )
  }

  if (user.registrationStatus === 'not_submitted' || user.registrationStatus === 'rejected') {
    return (
      <div className="theme-dorm flex min-h-screen w-full flex-col items-center bg-[var(--surface-bg)] px-6 py-12">
        <div className="flex w-full max-w-[420px] flex-1 flex-col justify-center gap-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft-bg)] text-[var(--accent)]">
              <GraduationCap size={26} />
            </span>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              Заявка на реєстрацію
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Розкажи трохи про себе — адміністратор підтвердить доступ.
            </p>
          </div>

          {user.registrationStatus === 'rejected' && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <ShieldAlert size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Заявку відхилено</p>
                <p className="mt-0.5 text-red-300/90">
                  {user.registrationRejectionReason || 'Причину не вказано.'} Виправ дані й надішли ще раз.
                </p>
              </div>
            </div>
          )}

          <RegistrationForm />
        </div>
      </div>
    )
  }

  return <Outlet />
}

function RegistrationForm() {
  const { user, submitRegistration } = useCurrentUser()
  const [age, setAge] = useState(user?.age ? String(user.age) : '')
  const [faculty, setFaculty] = useState(user?.faculty ?? '')
  const [instagram, setInstagram] = useState(user?.instagram ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [errors, setErrors] = useState<FormErrors>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function validate(): FormErrors {
    const next: FormErrors = {}

    if (!age) {
      next.age = 'Вкажи вік'
    } else {
      const numericAge = Number(age)
      if (!Number.isInteger(numericAge) || numericAge < 13 || numericAge > 120) {
        next.age = 'Вік від 13 до 120 років'
      }
    }

    const cleanFaculty = faculty.trim()
    if (!cleanFaculty) next.faculty = 'Вкажи факультет'
    else if (cleanFaculty.length < 2) next.faculty = 'Мінімум 2 символи'
    else if (cleanFaculty.length > 100) next.faculty = 'Максимум 100 символів'

    const cleanInstagram = normalizeInstagram(instagram)
    if (cleanInstagram && !/^[A-Za-z0-9._]{1,30}$/.test(cleanInstagram)) {
      next.instagram = 'Вкажи @username або посилання на Instagram'
    }

    if (bio.trim().length > 500) next.bio = 'Максимум 500 символів'

    return next
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    setErrorMessage(null)
    try {
      await submitRegistration({
        age: Number(age),
        faculty: faculty.trim(),
        instagram: normalizeInstagram(instagram) || undefined,
        bio: bio.trim() || undefined,
      })
      // Успіх повністю відображається зміною user.registrationStatus на
      // 'pending' у контексті — RegistrationGate сам покаже екран
      // очікування, окремий редірект тут не потрібен.
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {errorMessage && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {errorMessage}
        </p>
      )}

      <RegistrationField icon={<Cake size={18} />} label="Вік" error={errors.age}>
        <input
          type="number"
          inputMode="numeric"
          min={13}
          max={120}
          value={age}
          onChange={(event) => setAge(event.target.value)}
          placeholder="Наприклад, 19"
          className={inputClass(Boolean(errors.age))}
        />
      </RegistrationField>

      <RegistrationField icon={<GraduationCap size={18} />} label="Факультет" error={errors.faculty}>
        <input
          value={faculty}
          onChange={(event) => setFaculty(event.target.value)}
          maxLength={100}
          placeholder="Наприклад, Факультет інформатики"
          className={inputClass(Boolean(errors.faculty))}
        />
      </RegistrationField>

      <RegistrationField icon={<Camera size={18} />} label="Instagram (необов'язково)" error={errors.instagram}>
        <div className="relative">
          <AtSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
          <input
            value={instagram}
            onChange={(event) => setInstagram(event.target.value)}
            placeholder="username"
            className={`${inputClass(Boolean(errors.instagram))} pl-9`}
          />
        </div>
      </RegistrationField>

      <RegistrationField label="Про себе (необов'язково)" error={errors.bio}>
        <textarea
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={500}
          rows={4}
          placeholder="Кілька слів про себе, інтереси або хобі"
          className={inputClass(Boolean(errors.bio))}
        />
        <p className="mt-1 text-right text-xs text-[var(--text-disabled)]">{bio.length}/500</p>
      </RegistrationField>

      <Button type="submit" loading={submitting} fullWidth>
        <Send size={18} /> Надіслати заявку
      </Button>
    </form>
  )
}

function RegistrationField({
  icon,
  label,
  error,
  children,
}: {
  icon?: ReactNode
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
        {icon && <span className="text-[var(--accent)]">{icon}</span>}
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
    </label>
  )
}

function inputClass(hasError: boolean): string {
  return `w-full rounded-2xl border bg-[var(--surface-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-disabled)] ${hasError ? 'border-red-500' : 'border-[var(--surface-border)] focus:border-[var(--accent)]'}`
}

function normalizeInstagram(value: string): string {
  const clean = value.trim().replace(/^@/, '')
  const match = clean.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?$/i)
  return match?.[1] ?? clean
}

function FullScreenCenter({ children }: { children: ReactNode }) {
  return (
    <div className="theme-dorm mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center bg-[var(--surface-bg)] px-4">
      {children}
    </div>
  )
}
