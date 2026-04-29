import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useGroeiStore } from './store/useGroeiStore'
import BottomNav from './components/BottomNav'
import MapPage from './pages/MapPage'
import Dashboard from './pages/Dashboard'
import Plants from './pages/Plants'
import AddPlant from './pages/AddPlant'
import PlantDetail from './pages/PlantDetail'
import EditPlant from './pages/EditPlant'
import PlantCareDetail from './pages/PlantCareDetail'
import Settings from './pages/Settings'
import PlanningCalendar from './pages/PlanningCalendar'
import MapsListPage from './pages/MapsListPage'
import LayoutEditorPage from './pages/LayoutEditorPage'

export default function App() {
  const load = useGroeiStore((s) => s.load)
  const error = useGroeiStore((s) => s.error)
  const clearError = useGroeiStore((s) => s.clearError)

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex flex-col min-h-dvh bg-bg">
      {error && (
        <div className="bg-overdue/10 text-overdue px-4 py-2 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={clearError} className="font-bold ml-2">✕</button>
        </div>
      )}

      <main className="flex-1 pb-20">
        <Routes>
          <Route path="/" element={<Navigate to="/maps" replace />} />
          <Route path="/maps" element={<MapsListPage />} />
          <Route path="/maps/:id/edit-layout" element={<LayoutEditorPage />} />
          <Route path="/map/:slug" element={<MapPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/plants" element={<Plants />} />
          <Route path="/plants/add" element={<AddPlant />} />
          <Route path="/plants/:id" element={<PlantDetail />} />
          <Route path="/plants/:id/edit" element={<EditPlant />} />
          <Route path="/plants/:id/care" element={<PlantCareDetail />} />
          <Route path="/calendar" element={<PlanningCalendar />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <BottomNav />
    </div>
  )
}
