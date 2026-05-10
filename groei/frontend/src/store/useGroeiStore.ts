import { create } from 'zustand'
import type { User, Location, Plant, DashboardData, DashboardV2Data, PlantCreateInput, MapInfo, PlantFactOut } from '../types'
import * as api from '../api/client'

interface GroeiStore {
  users: User[]
  locations: Location[]
  maps: MapInfo[]
  plants: Plant[]
  dashboard: DashboardData | null
  dashboardV2: DashboardV2Data | null
  plantFact: PlantFactOut | null
  activeUserId: number | null
  isLoading: boolean
  error: string | null
  showPlantPicker: boolean

  load: () => Promise<void>
  loadMaps: () => Promise<void>
  loadDashboard: () => Promise<void>
  loadDashboardV2: () => Promise<void>
  loadPlants: () => Promise<void>
  loadPlantFact: () => Promise<void>
  addPlant: (data: PlantCreateInput) => Promise<Plant>
  updatePlant: (id: number, data: Partial<Plant>) => Promise<void>
  archivePlant: (id: number) => Promise<void>
  uploadPhoto: (plantId: number, file: File) => Promise<void>
  markCareDone: (plantId: number, careType: string, notes?: string) => Promise<void>
  skipCare: (plantId: number, careType: string) => Promise<void>
  createMap: (name: string) => Promise<MapInfo>
  deleteMap: (id: number) => Promise<void>
  setActiveUser: (id: number) => void
  setShowPlantPicker: (show: boolean) => void
  clearError: () => void
}

const STORAGE_KEY = 'groei-active-user'

function getSavedUserId(): number | null {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved ? parseInt(saved, 10) : null
}

/** Surgically remove a care task from the dashboard's buckets. */
function _removeDashboardTask(dashboard: DashboardData | null, plantId: number, careType: string): DashboardData | null {
  if (!dashboard) return null
  const remove = (tasks: typeof dashboard.overdue) =>
    tasks.filter(t => !(t.plant_id === plantId && t.care_type === careType))
  return {
    overdue: remove(dashboard.overdue),
    due_today: remove(dashboard.due_today),
    upcoming: remove(dashboard.upcoming),
  }
}

export const useGroeiStore = create<GroeiStore>((set, get) => ({
  users: [],
  locations: [],
  maps: [],
  plants: [],
  dashboard: null,
  dashboardV2: null,
  plantFact: null,
  activeUserId: getSavedUserId(),
  isLoading: false,
  error: null,
  showPlantPicker: false,

  load: async () => {
    set({ isLoading: true, error: null })
    try {
      const [users, locations, maps, plants] = await Promise.all([
        api.fetchUsers(),
        api.fetchLocations(),
        api.fetchMaps(),
        api.fetchPlants(),
      ])
      const state: Partial<GroeiStore> = { users, locations, maps, plants, isLoading: false }
      if (!get().activeUserId && users.length > 0) {
        state.activeUserId = users[0].id
        localStorage.setItem(STORAGE_KEY, String(users[0].id))
      }
      set(state)
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false })
    }
  },

  loadMaps: async () => {
    try {
      const maps = await api.fetchMaps()
      set({ maps })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  loadDashboard: async () => {
    try {
      const dashboard = await api.fetchDashboard()
      set({ dashboard })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  loadDashboardV2: async () => {
    try {
      const dashboardV2 = await api.fetchDashboardV2()
      set({ dashboardV2 })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  loadPlants: async () => {
    try {
      const plants = await api.fetchPlants()
      set({ plants })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  addPlant: async (data) => {
    const plant = await api.createPlant(data)
    set((s) => ({ plants: [...s.plants, plant] }))
    return plant
  },

  updatePlant: async (id, data) => {
    const updated = await api.updatePlant(id, data)
    set((s) => ({ plants: s.plants.map((p) => (p.id === id ? updated : p)) }))
  },

  archivePlant: async (id) => {
    await api.archivePlant(id)
    set((s) => ({ plants: s.plants.filter((p) => p.id !== id) }))
  },

  uploadPhoto: async (plantId, file) => {
    const updated = await api.uploadPlantPhoto(plantId, file)
    set((s) => ({ plants: s.plants.map((p) => (p.id === plantId ? updated : p)) }))
  },

  markCareDone: async (plantId, careType, notes) => {
    const userId = get().activeUserId
    if (!userId) throw new Error('No active user')
    await api.markCareDone(plantId, careType, userId, notes)
    // Surgical update: adjust the plant's care_status and remove task from dashboard
    set((s) => ({
      plants: s.plants.map((p) =>
        p.id === plantId ? { ...p, care_status: 'good' as const, most_urgent: undefined } : p,
      ),
      dashboard: _removeDashboardTask(s.dashboard, plantId, careType),
      dashboardV2: s.dashboardV2 ? {
        ...s.dashboardV2,
        overdue: s.dashboardV2.overdue.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
        due_today: s.dashboardV2.due_today.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
        upcoming: s.dashboardV2.upcoming.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
      } : null,
    }))
  },

  skipCare: async (plantId, careType) => {
    const userId = get().activeUserId
    if (!userId) throw new Error('No active user')
    await api.skipCare(plantId, careType, userId)
    set((s) => ({
      dashboard: _removeDashboardTask(s.dashboard, plantId, careType),
      dashboardV2: s.dashboardV2 ? {
        ...s.dashboardV2,
        overdue: s.dashboardV2.overdue.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
        due_today: s.dashboardV2.due_today.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
        upcoming: s.dashboardV2.upcoming.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
      } : null,
    }))
  },

  createMap: async (name) => {
    const map = await api.createMap(name)
    set((s) => ({ maps: [...s.maps, map] }))
    return map
  },

  deleteMap: async (id) => {
    await api.deleteMap(id)
    set((s) => ({ maps: s.maps.filter((m) => m.id !== id) }))
  },

  loadPlantFact: async () => {
    try {
      const fact = await api.fetchPlantFact()
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

  clearError: () => set({ error: null }),
}))
