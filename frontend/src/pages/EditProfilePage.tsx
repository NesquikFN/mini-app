import { useState, type FormEvent, type ReactNode } from 'react'
import { AtSign, Cake, Save, UserRoundPen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { InstagramIcon } from '../components/InstagramIcon'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { getErrorMessage } from '../services/api'

interface FormErrors {
  nickname?: string
  instagram?: string
  bio?: string
  age?: string
}

export function EditProfilePage() {
  const navigate = useNavigate()
  const { user, updateProfile } = useCurrentUser()
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const [instagram, setInstagram] = useState(user?.instagram ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [age, setAge] = useState(user?.age ? String(user.age) : '')
  const [errors, setErrors] = useState<FormErrors>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function validate(): FormErrors {
    const next: FormErrors = {}
    const cleanNickname = nickname.trim()
    if (cleanNickname && cleanNickname.length < 2) next.nickname = 'Мінімум 2 символи'
    if (cleanNickname.length > 40) next.nickname = 'Максимум 40 символів'

    const cleanInstagram = normalizeInstagram(instagram)
    if (cleanInstagram && !/^[A-Za-z0-9._]{1,30}$/.test(cleanInstagram)) {
      next.instagram = 'Вкажіть @username або посилання на Instagram'
    }
    if (bio.trim().length > 500) next.bio = 'Максимум 500 символів'

    if (age) {
      const numericAge = Number(age)
      if (!Number.isInteger(numericAge) || numericAge < 13 || numericAge > 120) {
        next.age = 'Вкажіть вік від 13 до 120 років'
      }
    }
    return next
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaving(true)
    setErrorMessage(null)
    try {
      await updateProfile({
        nickname: nickname.trim() || null,
        instagram: normalizeInstagram(instagram) || null,
        bio: bio.trim() || null,
        age: age ? Number(age) : null,
      })
      navigate('/profile', { replace: true, state: { profileSaved: true } })
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col">
      <PageHeader title="Редагувати профіль" showBack />
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-4 py-5">
        {errorMessage && (
          <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {errorMessage}
          </p>
        )}

        <ProfileField icon={<UserRoundPen size={18} />} label="Нікнейм" error={errors.nickname}>
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={40} placeholder="Як тебе називати" className={inputClass(Boolean(errors.nickname))} />
        </ProfileField>

        <ProfileField icon={<InstagramIcon size={18} />} label="Instagram" error={errors.instagram}>
          <div className="relative">
            <AtSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
            <input value={instagram} onChange={(event) => setInstagram(event.target.value)} placeholder="username" className={`${inputClass(Boolean(errors.instagram))} pl-9`} />
          </div>
        </ProfileField>

        <ProfileField icon={<Cake size={18} />} label="Вік" error={errors.age}>
          <input type="number" inputMode="numeric" min={13} max={120} value={age} onChange={(event) => setAge(event.target.value)} placeholder="Наприклад, 19" className={inputClass(Boolean(errors.age))} />
        </ProfileField>

        <ProfileField label="Про себе" error={errors.bio}>
          <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} rows={5} placeholder="Розкажи трохи про себе, інтереси або хобі" className={inputClass(Boolean(errors.bio))} />
          <p className="mt-1 text-right text-xs text-[var(--text-disabled)]">{bio.length}/500</p>
        </ProfileField>

        <Button type="submit" loading={saving} fullWidth>
          <Save size={18} /> Зберегти профіль
        </Button>
      </form>
    </div>
  )
}

function ProfileField({
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
