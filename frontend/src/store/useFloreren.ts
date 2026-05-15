     1|     1|import { create } from 'zustand'
     2|     2|import type { User, Location, Plant, DashboardData, DashboardV2Data, PlantCreateInput, MapInfo, PlantFactOut } from '../types'
     3|     3|import * as api from '../api/client'
     4|     4|
     5|     5|interface FlorerStore {
     6|     6|  users: User[]
     7|     7|  locations: Location[]
     8|     8|  maps: MapInfo[]
     9|     9|  plants: Plant[]
    10|    10|  dashboard: DashboardData | null
    11|    11|  dashboardV2: DashboardV2Data | null
    12|    12|  plantFact: PlantFactOut | null
    13|    13|  activeUserId: number | null
    14|    14|  isLoading: boolean
    15|    15|  error: string | null
    16|    16|  showPlantPicker: boolean
    17|    17|
    18|    18|  load: () => Promise<void>
    19|    19|  loadMaps: () => Promise<void>
    20|    20|  loadDashboard: () => Promise<void>
    21|    21|  loadDashboardV2: () => Promise<void>
    22|    22|  loadPlants: () => Promise<void>
    23|    23|  loadPlantFact: () => Promise<void>
    24|    24|  addPlant: (data: PlantCreateInput) => Promise<Plant>
    25|    25|  updatePlant: (id: number, data: Partial<Plant>) => Promise<void>
    26|    26|  archivePlant: (id: number) => Promise<void>
    27|    27|  uploadPhoto: (plantId: number, file: File) => Promise<void>
    28|    28|  markCareDone: (plantId: number, careType: string, notes?: string) => Promise<void>
    29|    29|  skipCare: (plantId: number, careType: string) => Promise<void>
    30|    30|  createMap: (data: { name: string; map_type?: string; lat?: number; lon?: number; bearing?: number }) => Promise<MapInfo>
    31|    31|  deleteMap: (id: number) => Promise<void>
    32|    32|  setActiveUser: (id: number) => void
    33|    33|  setShowPlantPicker: (show: boolean) => void
    34|    34|  updateUserLanguage: (userId: number, language: 'nl' | 'en') => Promise<void>
    35|    35|  clearError: () => void
    36|    36|}
    37|    37|
    38|    38|const STORAGE_KEY = 'floreren-active-user'
    39|    39|
    40|    40|function getSavedUserId(): number | null {
    41|    41|  const saved = localStorage.getItem(STORAGE_KEY)
    42|    42|  return saved ? parseInt(saved, 10) : null
    43|    43|}
    44|    44|
    45|    45|/** Surgically remove a care task from the dashboard's buckets. */
    46|    46|function _removeDashboardTask(dashboard: DashboardData | null, plantId: number, careType: string): DashboardData | null {
    47|    47|  if (!dashboard) return null
    48|    48|  const remove = (tasks: typeof dashboard.overdue) =>
    49|    49|    tasks.filter(t => !(t.plant_id === plantId && t.care_type === careType))
    50|    50|  return {
    51|    51|    overdue: remove(dashboard.overdue),
    52|    52|    due_today: remove(dashboard.due_today),
    53|    53|    upcoming: remove(dashboard.upcoming),
    54|    54|  }
    55|    55|}
    56|    56|
    57|    57|export const useFloreren = create<FlorerStore>((set, get) => ({
    58|    58|  users: [],
    59|    59|  locations: [],
    60|    60|  maps: [],
    61|    61|  plants: [],
    62|    62|  dashboard: null,
    63|    63|  dashboardV2: null,
    64|    64|  plantFact: null,
    65|    65|  activeUserId: getSavedUserId(),
    66|    66|  isLoading: false,
    67|    67|  error: null,
    68|    68|  showPlantPicker: false,
    69|    69|
    70|    70|  load: async () => {
    71|    71|    set({ isLoading: true, error: null })
    72|    72|    try {
    73|    73|      const [users, locations, maps, plants] = await Promise.all([
    74|    74|        api.fetchUsers(),
    75|    75|        api.fetchLocations(),
    76|    76|        api.fetchMaps(),
    77|    77|        api.fetchPlants(),
    78|    78|      ])
    79|    79|      const state: Partial<FlorerStore> = { users, locations, maps, plants, isLoading: false }
    80|    80|      if (!get().activeUserId && users.length > 0) {
    81|    81|        state.activeUserId = users[0].id
    82|    82|        localStorage.setItem(STORAGE_KEY, String(users[0].id))
    83|    83|      }
    84|    84|      set(state)
    85|    85|    } catch (e) {
    86|    86|      set({ error: (e as Error).message, isLoading: false })
    87|    87|    }
    88|    88|  },
    89|    89|
    90|    90|  loadMaps: async () => {
    91|    91|    try {
    92|    92|      const maps = await api.fetchMaps()
    93|    93|      set({ maps })
    94|    94|    } catch (e) {
    95|    95|      set({ error: (e as Error).message })
    96|    96|    }
    97|    97|  },
    98|    98|
    99|    99|  loadDashboard: async () => {
   100|   100|    try {
   101|   101|      const dashboard = await api.fetchDashboard()
   102|   102|      set({ dashboard })
   103|   103|    } catch (e) {
   104|   104|      set({ error: (e as Error).message })
   105|   105|    }
   106|   106|  },
   107|   107|
   108|   108|  loadDashboardV2: async () => {
   109|   109|    try {
   110|   110|      const dashboardV2 = await api.fetchDashboardV2()
   111|   111|      set({ dashboardV2 })
   112|   112|    } catch (e) {
   113|   113|      set({ error: (e as Error).message })
   114|   114|    }
   115|   115|  },
   116|   116|
   117|   117|  loadPlants: async () => {
   118|   118|    try {
   119|   119|      const plants = await api.fetchPlants()
   120|   120|      set({ plants })
   121|   121|    } catch (e) {
   122|   122|      set({ error: (e as Error).message })
   123|   123|    }
   124|   124|  },
   125|   125|
   126|   126|  addPlant: async (data) => {
   127|   127|    const plant = await api.createPlant(data)
   128|   128|    set((s) => ({ plants: [...s.plants, plant] }))
   129|   129|    return plant
   130|   130|  },
   131|   131|
   132|   132|  updatePlant: async (id, data) => {
   133|   133|    const updated = await api.updatePlant(id, data)
   134|   134|    set((s) => ({ plants: s.plants.map((p) => (p.id === id ? updated : p)) }))
   135|   135|  },
   136|   136|
   137|   137|  archivePlant: async (id) => {
   138|   138|    await api.archivePlant(id)
   139|   139|    set((s) => ({ plants: s.plants.filter((p) => p.id !== id) }))
   140|   140|  },
   141|   141|
   142|   142|  uploadPhoto: async (plantId, file) => {
   143|   143|    const updated = await api.uploadPlantPhoto(plantId, file)
   144|   144|    set((s) => ({ plants: s.plants.map((p) => (p.id === plantId ? updated : p)) }))
   145|   145|  },
   146|   146|
   147|   147|  markCareDone: async (plantId, careType, notes) => {
   148|   148|    const userId = get().activeUserId
   149|   149|    if (!userId) throw new Error('No active user')
   150|   150|    await api.markCareDone(plantId, careType, userId, notes)
   151|   151|    // Surgical update: adjust the plant's care_status and remove task from dashboard
   152|   152|    set((s) => ({
   153|   153|      plants: s.plants.map((p) =>
   154|   154|        p.id === plantId ? { ...p, care_status: 'good' as const, most_urgent: undefined } : p,
   155|   155|      ),
   156|   156|      dashboard: _removeDashboardTask(s.dashboard, plantId, careType),
   157|   157|      dashboardV2: s.dashboardV2 ? {
   158|   158|        ...s.dashboardV2,
   159|   159|        overdue: s.dashboardV2.overdue.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
   160|   160|        due_today: s.dashboardV2.due_today.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
   161|   161|        upcoming: s.dashboardV2.upcoming.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
   162|   162|      } : null,
   163|   163|    }))
   164|   164|    // Refetch to get correct status_counts
   165|   165|    get().loadDashboardV2()
   166|   166|  },
   167|   167|
   168|   168|  skipCare: async (plantId, careType) => {
   169|   169|    const userId = get().activeUserId
   170|   170|    if (!userId) throw new Error('No active user')
   171|   171|    await api.skipCare(plantId, careType, userId)
   172|   172|    set((s) => ({
   173|   173|      dashboard: _removeDashboardTask(s.dashboard, plantId, careType),
   174|   174|      dashboardV2: s.dashboardV2 ? {
   175|   175|        ...s.dashboardV2,
   176|   176|        overdue: s.dashboardV2.overdue.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
   177|   177|        due_today: s.dashboardV2.due_today.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
   178|   178|        upcoming: s.dashboardV2.upcoming.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
   179|   179|      } : null,
   180|   180|    }))
   181|   181|    get().loadDashboardV2()
   182|   182|  },
   183|   183|
   184|   184|  createMap: async (data) => {
   185|   185|    const map = await api.createMap(data)
   186|   186|    set((s) => ({ maps: [...s.maps, map] }))
   187|   187|    return map
   188|   188|  },
   189|   189|
   190|   190|  deleteMap: async (id) => {
   191|   191|    await api.deleteMap(id)
   192|   192|    set((s) => ({ maps: s.maps.filter((m) => m.id !== id) }))
   193|   193|  },
   194|   194|
   195|   195|  loadPlantFact: async () => {
   196|   196|    try {
   197|   197|      const fact = await api.fetchPlantFact()
   198|   198|      set({ plantFact: fact })
   199|   199|    } catch {
   200|   200|      set({ plantFact: null })
   201|   201|    }
   202|   202|  },
   203|   203|
   204|   204|  setActiveUser: (id) => {
   205|   205|    localStorage.setItem(STORAGE_KEY, String(id))
   206|   206|    set({ activeUserId: id })
   207|   207|  },
   208|   208|
   209|   209|  setShowPlantPicker: (show) => set({ showPlantPicker: show }),
   210|   210|
   211|   211|  updateUserLanguage: async (userId, language) => {
   212|   212|    const updated = await api.updateUserLanguage(userId, language)
   213|   213|    set((s) => ({ users: s.users.map((u) => (u.id === userId ? updated : u)) }))
   214|   214|  },
   215|   215|
   216|   216|  clearError: () => set({ error: null }),
   217|   217|}))
   218|   218|