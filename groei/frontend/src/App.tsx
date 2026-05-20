import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useFloreren } from './store/useFloreren'
import { LanguageProvider } from './context/LanguageContext'
import BottomNav from './components/BottomNav'
import PlantPickerSheet from './components/sheets/PlantPickerSheet'
import type { LocalPlant } from './data/plants-dataset'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import { getToken } from './api/auth'
import MapPage from './pages/MapPage'
// MapsListPage import removed — /maps now redirects to default indoor map
import Dashboard from './pages/Dashboard'
import Plants from './pages/Plants'
import AddPlant from './pages/AddPlant'
import PlantDetail from './pages/PlantDetail'
import EditPlant from './pages/EditPlant'
import PlantCareDetail from './pages/PlantCareDetail'
import { IdentifyPlantPage } from './pages/IdentifyPlant'
import Settings from './pages/Settings'
import PlanningCalendarPage from './pages/calendar/PlanningCalendarPage'
import LayoutEditorPage from './pages/LayoutEditorPage'
import MapSettingsPage from './pages/MapSettingsPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Redirect /maps to the first indoor map's /map/:slug page. */
function MapRedirect() {
  const maps = useFloreren((s) => s.maps)
  const loadMaps = useFloreren((s) => s.loadMaps)
  const isLoading = useFloreren((s) => s.isLoading)
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (maps.length > 0) {
      const indoor = maps.find((m) => m.map_type === 'indoor')
      if (indoor) {
        navigate(`/map/${indoor.slug}`, { replace: true })
      } else if (maps[0]) {
        navigate(`/map/${maps[0].slug}`, { replace: true })
      }
      setReady(true)
    } else if (!isLoading) {
      loadMaps().then(() => setReady(true))
    }
  }, [maps, isLoading, loadMaps, navigate])

  if (!ready) {
    return <div className="p-6 text-text-muted text-center">Loading maps…</div>
  }

  return <div className="p-6 text-text-muted text-center">No maps found.</div>
}

export default function App() {
  const load = useFloreren((s) => s.load)
  const error = useFloreren((s) => s.error)
  const clearError = useFloreren((s) => s.clearError)
  const showPlantPicker = useFloreren((s) => s.showPlantPicker)
  const setShowPlantPicker = useFloreren((s) => s.setShowPlantPicker)
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
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/maps"
            element={
              <RequireAuth>
                <MapRedirect />
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
            path="/identify"
            element={
              <RequireAuth>
                <IdentifyPlantPage />
              </RequireAuth>
            }
          />
          <Route
            path="/calendar"
            element={
              <RequireAuth>
                <PlanningCalendarPage />
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
