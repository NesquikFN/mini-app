import { useState } from 'react'

interface AvatarProps {
  name: string
  photoUrl?: string
  size?: number
}

const COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
]

function colorForName(name: string): string {
  const index = name.charCodeAt(0) % COLORS.length
  return COLORS[index]
}

export function Avatar({ name, photoUrl, size = 36 }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const initial = name.trim().charAt(0).toUpperCase()

  if (photoUrl && !imageFailed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        onError={() => setImageFailed(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${colorForName(name)}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  )
}
