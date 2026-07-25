import { create } from 'zustand'
import type { User, Location, Plant, RecentLogEntry, PlantCreateInput, MapInfo, PlantFactOut, WarningSummaryOut } from '../types'
import { users as usersApi, plants as plantsApi, care as careApi, maps as mapsApi, icons as iconsApi } from '../api/client'
import type { PageContext } from '../api/chat'

interface FlorerStore {
  users: User[]
  locations: Location[]
  maps: MapInfo[]
  plants: Plant[]
  recentLog: RecentLogEntry[]
  warningSummary: WarningSummaryOut | null
  plantFact: PlantFactOut | null
  assistantPageContext: Partial<PageContext> | null
  activeUserId: number | null
  isLoading: boolean
  hasLoaded: boolean
  error: string | null
  showPlantPicker: boolean
  careVersions: Record<number, number>
  profileVersions: Record<number, number>
  /** Bumped by refreshAll() — pages that own their data (field journal,
   * calendar, logbook) include this in their fetch-effect deps so a
   * pull-to-refresh / foreground refresh reaches them too. */
  refreshTick: number
  lastRefreshAt: number

  load: () => Promise<void>
  refreshAll: () => Promise<void>
  loadMaps: () => Promise<void>
  resetForNewSession: () => void
  loadRecentLog: () => Promise<void>
  loadWarningSummary: (env?: string) => Promise<void>
  loadPlants: () => Promise<void>
  loadPlantFact: () => Promise<void>
  addPlant: (data: PlantCreateInput) => Promise<Plant>
  updatePlant: (id: number, data: Partial<Plant>) => Promise<void>
  archivePlant: (id: number) => Promise<void>
  bulkArchivePlants: (ids: number[]) => Promise<void>
  uploadPhoto: (plantId: number, file: File) => Promise<void>
  markCareDone: (plantId: number, careType: string, notes?: string, water_amount?: number) => Promise<{ care_log_id: number; previous_next_due: string | null; previous_last_done: string | null; previous_last_done_by: number | null } | undefined>
  skipCare: (plantId: number, careType: string) => Promise<void>
  createMap: (data: { name: string; map_type?: string; lat?: number; lon?: number; bearing?: number }) => Promise<MapInfo>
  deleteMap: (id: number) => Promise<void>
  patchCareProfile: (plantId: number, data: Record<string, { active: boolean }>) => Promise<void>
  setActiveUser: (id: number) => void
  setShowPlantPicker: (show: boolean) => void
  setAssistantPageContext: (context: Partial<PageContext> | null) => void
  updateUserLanguage: (userId: number, language: 'nl' | 'en') => Promise<void>
  clearError: () => void
}

const STORAGE_KEY = 'floreren-active-user'

function getSavedUserId(): number | null {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved ? parseInt(saved, 10) : null
}


export const useFloreren = create<FlorerStore>((set, get) => ({
  users: [],
  locations: [],
  maps: [],
  plants: [],
  recentLog: [],
  warningSummary: null,
  plantFact: null,
  assistantPageContext: null,
  activeUserId: getSavedUserId(),
  isLoading: false,
  hasLoaded: false,
  error: null,
  showPlantPicker: false,
  careVersions: {},
  profileVersions: {},
  refreshTick: 0,
  lastRefreshAt: 0,

  /** Called after login/register to force a fresh data load for the new account. */
  resetForNewSession: () => set({
    hasLoaded: false, isLoading: false, error: null,
    plants: [], maps: [], users: [], locations: [],
    recentLog: [], warningSummary: null, plantFact: null,
  }),

  load: async () => {
    set({ isLoading: true, error: null })
    try {
      const [users, locations, maps, plants] = await Promise.all([
        usersApi.list(),
        usersApi.locations(),
        mapsApi.list(),
        plantsApi.list(),
      ])
      const state: Partial<FlorerStore> = { users, locations, maps, plants, isLoading: false, hasLoaded: true, lastRefreshAt: Date.now() }
      // Validate stored active user against loaded data — a stale
      // localStorage entry from a different account/household causes
      // every PATCH /users/:id/… to 404.
      const savedId = get().activeUserId
      const validId = savedId && users.some((u) => u.id === savedId) ? savedId : null
      if (!validId && users.length > 0) {
        state.activeUserId = users[0].id
        localStorage.setItem(STORAGE_KEY, String(users[0].id))
      }
      set(state)
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false, hasLoaded: true })
    }
  },

  /** Quiet re-fetch of the shared data (pull-to-refresh / app foregrounded).
   * Deliberately does NOT toggle isLoading, so pages keep showing their
   * current content while fresh data streams in. */
  refreshAll: async () => {
    set((s) => ({ refreshTick: s.refreshTick + 1, lastRefreshAt: Date.now() }))
    await Promise.allSettled([
      get().loadPlants(),
      get().loadMaps(),
      get().loadRecentLog(),
      get().loadWarningSummary(),
    ])
  },

  loadMaps: async () => {
    set({ error: null })
    try {
      const maps = await mapsApi.list()
      set({ maps })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  loadRecentLog: async () => {
    try {
      const recentLog = await careApi.householdLog(5)
      set({ recentLog })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  loadWarningSummary: async (env = 'all') => {
    try {
      const warningSummary = await plantsApi.warningSummary(env)
      set({ warningSummary })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  loadPlants: async () => {
    try {
      const plants = await plantsApi.list()
      set({ plants })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  addPlant: async (data) => {
    const plant = await plantsApi.create(data)
    set((s) => ({ plants: [...s.plants, plant] }))
    // Auto-assign icon — fire-and-forget, don't block the UI
    iconsApi.sync().catch(() => {})
    return plant
  },

  updatePlant: async (id, data) => {
    const updated = await plantsApi.update(id, data)
    set((s) => ({ plants: s.plants.map((p) => (p.id === id ? updated : p)) }))
  },

  archivePlant: async (id) => {
    await plantsApi.archive(id)
    set((s) => ({ plants: s.plants.filter((p) => p.id !== id) }))
  },

  bulkArchivePlants: async (ids) => {
    if (ids.length === 0) return
    await plantsApi.bulkArchive(ids)
    const idSet = new Set(ids)
    set((s) => ({ plants: s.plants.filter((p) => !idSet.has(p.id)) }))
  },

  uploadPhoto: async (plantId, file) => {
    const updated = await plantsApi.uploadPhoto(plantId, file)
    set((s) => ({ plants: s.plants.map((p) => (p.id === plantId ? updated : p)) }))
  },

  markCareDone: async (plantId, careType, notes, water_amount) => {
    const userId = get().activeUserId
    if (!userId) throw new Error('No active user')
    const result = await careApi.done(plantId, careType, userId, notes, water_amount)
    // Surgical update: adjust the plant's care_status and remove task from dashboard
    set((s) => ({
      plants: s.plants.map((p) =>
        p.id === plantId ? { ...p, care_status: 'good' as const, most_urgent: undefined } : p,
      ),

      careVersions: { ...s.careVersions, [plantId]: (s.careVersions[plantId] ?? 0) + 1 },
    }))
    // Refetch to get correct status_counts and warning summary
    get().loadRecentLog()
    get().loadWarningSummary()
    return {
      care_log_id: result.care_log_id,
      previous_next_due: result.previous_next_due,
      previous_last_done: result.previous_last_done,
      previous_last_done_by: result.previous_last_done_by,
    }
  },

  skipCare: async (plantId, careType) => {
    const userId = get().activeUserId
    if (!userId) throw new Error('No active user')
    await careApi.skip(plantId, careType, userId)
    set((s) => ({

      careVersions: { ...s.careVersions, [plantId]: (s.careVersions[plantId] ?? 0) + 1 },
    }))
    get().loadRecentLog()
    get().loadWarningSummary()
  },

  patchCareProfile: async (plantId, data) => {
    await plantsApi.patchCareProfile(plantId, data)
    set((s) => ({
      profileVersions: { ...s.profileVersions, [plantId]: (s.profileVersions[plantId] ?? 0) + 1 },
    }))
  },

  createMap: async (data) => {
    const map = await mapsApi.create(data)
    set((s) => ({ maps: [...s.maps, map] }))
    return map
  },

  deleteMap: async (id) => {
    await mapsApi.delete(id)
    set((s) => ({ maps: s.maps.filter((m) => m.id !== id) }))
  },

  loadPlantFact: async () => {
    try {
      const fact = await plantsApi.fact()
      set({ plantFact: fact })
    } catch {
      set({ plantFact: null })
    }
  },

  setActiveUser: (id) => {
    localStorage.setItem(STORAGE_KEY, String(id))
    set({ activeUserId: id })
  },

  setShowPlantPicker: (show) => set({ showPlantPicker: show }),

  setAssistantPageContext: (context) => set({ assistantPageContext: context }),

  updateUserLanguage: async (userId, language) => {
    const updated = await usersApi.setLanguage(userId, language)
    set((s) => ({ users: s.users.map((u) => (u.id === userId ? updated : u)) }))
  },

  clearError: () => set({ error: null }),
}))
