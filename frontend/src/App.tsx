import { useEffect, useState, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useFloreren } from './store/useFloreren'
import { LanguageProvider } from './context/LanguageContext'
import BottomNav from './components/BottomNav'
import HelpAssistant from './components/HelpAssistant'
import PlantPickerSheet from './components/sheets/PlantPickerSheet'
import type { LocalPlant } from './data/plants-dataset'
import { getToken } from './api/auth'
import { icons } from './api/client'
import { Analytics } from '@vercel/analytics/react'
import { ErrorBoundary } from './components/ErrorBoundary'

// Route-level code splitting
const LoginPage = lazy(() => import('./pages/LoginPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const MapPage = lazy(() => import('./pages/MapPage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Plants = lazy(() => import('./pages/Plants'))
const AddPlant = lazy(() => import('./pages/AddPlant'))
const PlantDetail = lazy(() => import('./pages/PlantDetail'))
const EditPlant = lazy(() => import('./pages/EditPlant'))
const PlantCareDetail = lazy(() => import('./pages/PlantCareDetail'))
const IdentifyPlantPage = lazy(() => import('./pages/IdentifyPlant').then(m => ({ default: m.IdentifyPlantPage })))
const Settings = lazy(() => import('./pages/Settings'))
const PlanningCalendarPage = lazy(() => import('./pages/calendar/PlanningCalendarPage'))
const LayoutEditorPage = lazy(() => import('./pages/LayoutEditorPage'))
const MapSettingsPage = lazy(() => import('./pages/MapSettingsPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const LogboekPage = lazy(() => import('./pages/LogboekPage'))
const GameJoinPage = lazy(() => import('./pages/GameJoinPage'))
const GameHostPage = lazy(() => import('./pages/GameHostPage'))
const GamePlayerPage = lazy(() => import('./pages/GamePlayerPage'))
const DiscoveryCard = lazy(() => import('./pages/DiscoveryCard'))

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="p-6 text-text-muted text-center">Laden…</div>}>
      {children}
    </Suspense>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Redirect /maps to the first indoor map's /map/:slug page. */
function MapRedirect() {
  const maps = useFloreren((s) => s.maps)
  const loadMaps = useFloreren((s) => s.loadMaps)
  const isLoading = useFloreren((s) => s.isLoading)
  const [ready, setReady] = useState(maps.length > 0)

  // Load maps on mount if not already loaded
  useEffect(() => {
    if (maps.length === 0 && !isLoading) {
      loadMaps().then(() => setReady(true))
    }
  }, [isLoading, loadMaps, maps.length])

  // If maps are already loaded, redirect synchronously in render —
  // no flash of a loading state.
  if (maps.length > 0) {
    const indoor = maps.find((m) => m.map_type === 'indoor')
    const target = indoor || maps[0]
    return <Navigate to={`/map/${target.slug}`} replace />
  }

  if (!ready) {
    return <div className="p-6 text-text-muted text-center">Loading maps…</div>
  }

  return <div className="p-6 text-text-muted text-center">No maps found.</div>
}

export default function App() {
  const load = useFloreren((s) => s.load)
  const maps = useFloreren((s) => s.maps)
  const isLoading = useFloreren((s) => s.isLoading)
  const error = useFloreren((s) => s.error)
  const clearError = useFloreren((s) => s.clearError)
  const showPlantPicker = useFloreren((s) => s.showPlantPicker)
  const setShowPlantPicker = useFloreren((s) => s.setShowPlantPicker)
  const navigate = useNavigate()
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'
  const isAdminPage = location.pathname.startsWith('/admin')
  // Hide Stekkie during the identify flow — it overlaps the full-screen camera.
  const isIdentifyPage = location.pathname.startsWith('/identify')
  // The layout editor is a focused full-screen tool (its own back button) — hide app chrome.
  const isEditorPage = location.pathname.includes('/edit-layout')
  // On map pages, BottomNav hides in landscape-mobile so the map can fill the viewport.
  // Outside map pages we always show it (otherwise users couldn't navigate after rotating).
  const isMapPage = location.pathname.startsWith('/map')

  // Load initial data: on mount (token from previous session) AND after login
  // (navigate from /login → protected route). Skip if already loading or loaded.
  useEffect(() => {
    if (getToken() && !isLoginPage && maps.length === 0 && !isLoading) {
      load()
    }
  }, [load, isLoginPage, maps.length, isLoading])

  // Prime the icon URL index once so generated (R2) icons resolve app-wide.
  useEffect(() => { icons.catalog().catch(() => {}) }, [])

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
      <div className="flex flex-col h-dvh bg-bg overflow-hidden">
      {error && (
        <div className="bg-overdue/10 text-overdue px-4 py-2 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={clearError} className="font-bold ml-2">✕</button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto overscroll-contain">
        <ErrorBoundary>
          <SuspenseWrapper>
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
                path="/plants/discovery"
                element={
                  <RequireAuth>
                    <DiscoveryCard />
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
                path="/log"
                element={
                  <RequireAuth>
                    <SuspenseWrapper><LogboekPage /></SuspenseWrapper>
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
              <Route
                path="/admin"
                element={
                  <RequireAuth>
                    <AdminPage />
                  </RequireAuth>
                }
              />
              <Route path="/game" element={<GameJoinPage />} />
              <Route
                path="/game/:code/host"
                element={
                  <RequireAuth>
                    <GameHostPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/game/:code"
                element={
                  <RequireAuth>
                    <GamePlayerPage />
                  </RequireAuth>
                }
              />
            </Routes>
          </SuspenseWrapper>
        </ErrorBoundary>
      </main>

      {!isLoginPage && !isAdminPage && !isEditorPage && (
        <div className={`relative z-[70] ${isMapPage ? 'landscape-mobile-hide' : ''}`}>
          <BottomNav />
        </div>
      )}

      {!isLoginPage && !isAdminPage && !isIdentifyPage && !isEditorPage && <HelpAssistant />}

      {showPlantPicker && (
        <PlantPickerSheet
          onClose={() => setShowPlantPicker(false)}
          onSelectPlant={handleSelectPlant}
          onCustomName={handleCustomName}
        />
      )}
      <Analytics />
      </div>
    </LanguageProvider>
  )
}
