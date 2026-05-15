     1|import { useEffect } from 'react'
     2|import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
     3|import { useFloreren } from './store/useFloreren'
     4|import { LanguageProvider } from './context/LanguageContext'
     5|import BottomNav from './components/BottomNav'
     6|import PlantPickerSheet from './components/sheets/PlantPickerSheet'
     7|import type { LocalPlant } from './data/plants-dataset'
     8|import LoginPage from './pages/LoginPage'
     9|import { getToken } from './api/auth'
    10|import MapPage from './pages/MapPage'
    11|import Dashboard from './pages/Dashboard'
    12|import Plants from './pages/Plants'
    13|import AddPlant from './pages/AddPlant'
    14|import PlantDetail from './pages/PlantDetail'
    15|import EditPlant from './pages/EditPlant'
    16|import PlantCareDetail from './pages/PlantCareDetail'
    17|import Settings from './pages/Settings'
    18|import PlanningCalendar from './pages/PlanningCalendar'
    19|import LayoutEditorPage from './pages/LayoutEditorPage'
    20|import MapSettingsPage from './pages/MapSettingsPage'
    21|
    22|function RequireAuth({ children }: { children: React.ReactNode }) {
    23|  if (!getToken()) return <Navigate to="/login" replace />
    24|  return <>{children}</>
    25|}
    26|
    27|export default function App() {
    28|  const load = useFloreren((s) => s.load)
    29|  const error = useFloreren((s) => s.error)
    30|  const clearError = useFloreren((s) => s.clearError)
    31|  const showPlantPicker = useFloreren((s) => s.showPlantPicker)
    32|  const setShowPlantPicker = useFloreren((s) => s.setShowPlantPicker)
    33|  const navigate = useNavigate()
    34|  const location = useLocation()
    35|  const isLoginPage = location.pathname === '/login'
    36|
    37|  useEffect(() => {
    38|    if (getToken()) load()
    39|  }, [load])
    40|
    41|  const handleSelectPlant = (plant: LocalPlant) => {
    42|    setShowPlantPicker(false)
    43|    navigate('/plants/add', { state: { prefill: plant } })
    44|  }
    45|
    46|  const handleCustomName = (name?: string) => {
    47|    setShowPlantPicker(false)
    48|    navigate('/plants/add', { state: name ? { prefill: { name } } : undefined })
    49|  }
    50|
    51|  return (
    52|    <LanguageProvider>
    53|      <div className="flex flex-col min-h-dvh bg-bg">
    54|      {error && (
    55|        <div className="bg-overdue/10 text-overdue px-4 py-2 text-sm flex justify-between items-center">
    56|          <span>{error}</span>
    57|          <button onClick={clearError} className="font-bold ml-2">✕</button>
    58|        </div>
    59|      )}
    60|
    61|      <main className={`flex-1 ${!isLoginPage ? 'pb-20' : ''}`}>
    62|        <Routes>
    63|          <Route
    64|            path="/"
    65|            element={
    66|              <Navigate to={getToken() ? '/dashboard' : '/login'} replace />
    67|            }
    68|          />
    69|          <Route path="/login" element={<LoginPage />} />
    70|          <Route
    71|            path="/maps/:id/edit-layout"
    72|            element={
    73|              <RequireAuth>
    74|                <LayoutEditorPage />
    75|              </RequireAuth>
    76|            }
    77|          />
    78|          <Route
    79|            path="/maps/:id/settings"
    80|            element={
    81|              <RequireAuth>
    82|                <MapSettingsPage />
    83|              </RequireAuth>
    84|            }
    85|          />
    86|          <Route
    87|            path="/map/:slug"
    88|            element={
    89|              <RequireAuth>
    90|                <MapPage />
    91|              </RequireAuth>
    92|            }
    93|          />
    94|          <Route
    95|            path="/dashboard"
    96|            element={
    97|              <RequireAuth>
    98|                <Dashboard />
    99|              </RequireAuth>
   100|            }
   101|          />
   102|          <Route
   103|            path="/plants"
   104|            element={
   105|              <RequireAuth>
   106|                <Plants />
   107|              </RequireAuth>
   108|            }
   109|          />
   110|          <Route
   111|            path="/plants/add"
   112|            element={
   113|              <RequireAuth>
   114|                <AddPlant />
   115|              </RequireAuth>
   116|            }
   117|          />
   118|          <Route
   119|            path="/plants/:id"
   120|            element={
   121|              <RequireAuth>
   122|                <PlantDetail />
   123|              </RequireAuth>
   124|            }
   125|          />
   126|          <Route
   127|            path="/plants/:id/edit"
   128|            element={
   129|              <RequireAuth>
   130|                <EditPlant />
   131|              </RequireAuth>
   132|            }
   133|          />
   134|          <Route
   135|            path="/plants/:id/care"
   136|            element={
   137|              <RequireAuth>
   138|                <PlantCareDetail />
   139|              </RequireAuth>
   140|            }
   141|          />
   142|          <Route
   143|            path="/calendar"
   144|            element={
   145|              <RequireAuth>
   146|                <PlanningCalendar />
   147|              </RequireAuth>
   148|            }
   149|          />
   150|          <Route
   151|            path="/settings"
   152|            element={
   153|              <RequireAuth>
   154|                <Settings />
   155|              </RequireAuth>
   156|            }
   157|          />
   158|        </Routes>
   159|      </main>
   160|
   161|      {!isLoginPage && <BottomNav />}
   162|
   163|      {showPlantPicker && (
   164|        <PlantPickerSheet
   165|          onClose={() => setShowPlantPicker(false)}
   166|          onSelectPlant={handleSelectPlant}
   167|          onCustomName={handleCustomName}
   168|        />
   169|      )}
   170|      </div>
   171|    </LanguageProvider>
   172|  )
   173|}
   174|