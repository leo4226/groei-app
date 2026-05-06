import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useGroeiStore } from '../store/useGroeiStore'
import { CARE_TYPE_INFO } from '../types'
import type { CareTask } from '../types'
import UserSwitcher from '../components/UserSwitcher'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'Goedenacht'
  if (hour < 12) return 'Goedemorgen'
  if (hour < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

export default function Dashboard() {
  const { dashboard, activeUserId, users, loadDashboard, isLoading } = useGroeiStore()
  const activeUser = users.find((u) => u.id === activeUserId)

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const totalTasks = (dashboard?.overdue.length ?? 0) + (dashboard?.due_today.length ?? 0)

  return (
    <div className="px-4 pt-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-text leading-tight">
            {getGreeting()} {activeUser?.name} <span className="inline-block animate-[wave_2s_ease-in-out_infinite]">🌱</span>
          </h1>
          {totalTasks > 0 ? (
            <p className="text-text-muted mt-1 text-sm">
              {totalTasks} plant{totalTasks !== 1 ? 's' : ''} need{totalTasks === 1 ? 's' : ''} your attention
            </p>
          ) : !isLoading && dashboard ? (
            <p className="text-good mt-1 text-sm font-medium">All plants are happy!</p>
          ) : null}
        </div>
        <UserSwitcher />
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 flex items-center gap-3">
              <div className="skeleton w-12 h-12 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-3 w-24" />
              </div>
              <div className="skeleton h-10 w-16 rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && dashboard && totalTasks === 0 && dashboard.upcoming.length === 0 && (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🌿</div>
          <p className="text-text-muted mb-1">No tasks right now</p>
          <p className="text-text-muted text-sm">
            <Link to="/plants/add" className="text-primary font-semibold hover:underline">
              Add your first plant
            </Link>
            {' '}to get started
          </p>
        </div>
      )}

      {/* Task sections */}
      {!isLoading && dashboard && (
        <div className="space-y-6">
          {dashboard.overdue.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-overdue" />
                <h2 className="text-base font-bold text-overdue">
                  Overdue ({dashboard.overdue.length})
                </h2>
              </div>
              <div className="space-y-2">
                {dashboard.overdue.map((task) => (
                  <CareTaskCard key={`${task.schedule_id}`} task={task} variant="overdue" />
                ))}
              </div>
            </section>
          )}

          {dashboard.due_today.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-due" />
                <h2 className="text-base font-bold text-due">
                  Due Today ({dashboard.due_today.length})
                </h2>
              </div>
              <div className="space-y-2">
                {dashboard.due_today.map((task) => (
                  <CareTaskCard key={`${task.schedule_id}`} task={task} variant="due" />
                ))}
              </div>
            </section>
          )}

          {dashboard.upcoming.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-border" />
                <h2 className="text-base font-bold text-text-muted">
                  Upcoming
                </h2>
              </div>
              <div className="space-y-2">
                {dashboard.upcoming.map((task) => (
                  <CareTaskCard key={`${task.schedule_id}`} task={task} variant="upcoming" />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function CareTaskCard({ task, variant }: { task: CareTask; variant: 'overdue' | 'due' | 'upcoming' }) {
  const markCareDone = useGroeiStore((s) => s.markCareDone)
  const info = CARE_TYPE_INFO[task.care_type as keyof typeof CARE_TYPE_INFO]

  const borderColor =
    variant === 'overdue' ? 'border-l-overdue' :
    variant === 'due' ? 'border-l-due' :
    'border-l-border'

  return (
    <div className={`card p-4 border-l-4 ${borderColor} flex items-center gap-3`}>
      {task.plant_photo ? (
        <img src={task.plant_photo} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-primary/8 flex items-center justify-center text-xl flex-shrink-0">🌱</div>
      )}

      <Link to={`/plants/${task.plant_id}`} className="flex-1 min-w-0 no-underline">
        <p className="font-semibold text-text truncate text-[15px]">{task.plant_name}</p>
        <p className="text-sm text-text-muted flex items-center gap-1">
          <span>{info?.icon ?? '🌿'}</span>
          <span>{info?.label ?? task.care_type}</span>
          {task.location && <span className="text-border">·</span>}
          {task.location && <span>{task.location}</span>}
        </p>
        {variant === 'overdue' && (
          <p className="text-xs text-overdue font-medium mt-0.5">
            {task.days_overdue} day{task.days_overdue !== 1 ? 's' : ''} overdue
          </p>
        )}
        {variant === 'upcoming' && task.days_overdue < 0 && (
          <p className="text-xs text-text-muted mt-0.5">
            in {-task.days_overdue} day{-task.days_overdue !== 1 ? 's' : ''}
          </p>
        )}
      </Link>

      {variant !== 'upcoming' && (
        <button
          onClick={() => markCareDone(task.plant_id, task.care_type)}
          className="bg-primary text-white px-4 py-2.5 rounded-full font-semibold text-sm active:scale-95 transition-transform whitespace-nowrap flex-shrink-0"
        >
          Done ✓
        </button>
      )}
    </div>
  )
}
