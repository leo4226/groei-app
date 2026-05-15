     1|import { useFloreren } from '../store/useFloreren'
     2|
     3|export default function UserSwitcher() {
     4|  const users = useFloreren((s) => s.users)
     5|  const activeUserId = useFloreren((s) => s.activeUserId)
     6|  const setActiveUser = useFloreren((s) => s.setActiveUser)
     7|
     8|  const activeUser = users.find((u) => u.id === activeUserId)
     9|
    10|  return (
    11|    <div className="flex items-center gap-2">
    12|      {users.map((user) => (
    13|        <button
    14|          key={user.id}
    15|          onClick={() => setActiveUser(user.id)}
    16|          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all ${
    17|            user.id === activeUserId
    18|              ? 'bg-primary text-white font-semibold'
    19|              : 'bg-surface text-text-muted border border-border hover:border-primary/30'
    20|          }`}
    21|        >
    22|          <span>{user.avatar}</span>
    23|          <span>{user.name}</span>
    24|        </button>
    25|      ))}
    26|    </div>
    27|  )
    28|}
    29|