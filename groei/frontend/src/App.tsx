import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useGroeiStore } from './store/useGroeiStore'
import { LanguageProvider } from './context/LanguageContext'
import BottomNav from './components/BottomNav'
import PlantPickerSheet from './components/sheets/PlantPickerSheet'
import type { LocalPlant } from './data/plants-dataset'
import LoginPage from './pages/LoginPage'
import { getToken } from './api/auth'
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
import MapSettingsPage from './pages/MapSettingsPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const load = useGroeiStore((s) => s.load)
  const error = useGroeiStore((s) => s.error)
  const clearError = useGroeiStore((s) => s.clearError)
  const showPlantPicker = useGroeiStore((s) => s.showPlantPicker)
  const setShowPlantPicker = useGroeiStore((s) => s.setShowPlantPicker)
  const navigate = useNavigate()
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'

  useEffect(() => {
    if (getToken()) load()
  }, [load])

  const handleSelectPlant = (plant: LocalPlant) => {
    setShowPlantPicker(false)
    navigate('/plants/add', { state: { prefill: plant } })
  }

  const handleCustomName = (name?: string) => {
    setShowPlantPicker(false)
    navigate('/plants/add', { state: name ? { prefill: { name } } : undefined })
  }

  return (
    <LanguageProvider>
    <div className="flex flex-col min-h-dvh bg-bg">
      {error && (
        <div className="bg-overdue/10 text-overdue px-4 py-2 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={clearError} className="font-bold ml-2">✕</button>
        </div>
      )}

      <main className={`flex-1 ${!isLoginPage ? 'pb-20' : ''}`}>
        <Routes>
          <Route
            path="/"
            element={
              <Navigate to={getToken() ? '/dashboard' : '/login'} replace />
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/maps"
            element={
              <RequireAuth>
                <MapsListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/maps/:id/edit-layout"
            element={
              <RequireAuth>
                <LayoutEditorPage />
              </RequireAuth>
            }
          />
          <Route
            path="/maps/:id/settings"
            element={
              <RequireAuth>
                <MapSettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/map/:slug"
            element={
              <RequireAuth>
                <MapPage />
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/plants"
            element={
              <RequireAuth>
                <Plants />
              </RequireAuth>
            }
          />
          <Route
            path="/plants/add"
            element={
              <RequireAuth>
                <AddPlant />
              </RequireAuth>
            }
          />
          <Route
            path="/plants/:id"
            element={
              <RequireAuth>
                <PlantDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/plants/:id/edit"
            element={
              <RequireAuth>
                <EditPlant />
              </RequireAuth>
            }
          />
          <Route
            path="/plants/:id/care"
            element={
              <RequireAuth>
                <PlantCareDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/calendar"
            element={
              <RequireAuth>
                <PlanningCalendar />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Settings />
              </RequireAuth>
            }
          />
        </Routes>
      </main>

      {!isLoginPage && <BottomNav />}

      {showPlantPicker && (
        <PlantPickerSheet
          onClose={() => setShowPlantPicker(false)}
          onSelectPlant={handleSelectPlant}
          onCustomName={handleCustomName}
        />
      )}
    </div>
    </LanguageProvider>
  )
}
