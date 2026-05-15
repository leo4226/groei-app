import { useGroeiStore } from '../store/useGroeiStore'

export default function UserSwitcher() {
  const users = useGroeiStore((s) => s.users)
  const activeUserId = useGroeiStore((s) => s.activeUserId)
  const setActiveUser = useGroeiStore((s) => s.setActiveUser)

  const activeUser = users.find((u) => u.id === activeUserId)

  return (
    <div className="flex items-center gap-2">
      {users.map((user) => (
        <button
          key={user.id}
          onClick={() => setActiveUser(user.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all ${
            user.id === activeUserId
              ? 'bg-primary text-white font-semibold'
              : 'bg-surface text-text-muted border border-border hover:border-primary/30'
          }`}
        >
          <span>{user.avatar}</span>
          <span>{user.name}</span>
        </button>
      ))}
    </div>
  )
}
