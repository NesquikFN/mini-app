import { Avatar } from './Avatar'
import { Link } from 'react-router-dom'
import type { PublicUser } from '../types/user'

export function UserRow({ user, size = 40 }: { user: PublicUser; size?: number }) {
  return (
    <Link
      to={`/users/${user.id}`}
      className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <Avatar name={user.firstName} photoUrl={user.photoUrl} size={size} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
          {user.firstName}
        </p>
        {user.username && (
          <p className="truncate text-xs text-[var(--text-secondary)]">@{user.username}</p>
        )}
      </div>
    </Link>
  )
}
