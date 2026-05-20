import type { User, Location, Plant, PlantCreateInput, DashboardData, DashboardV2Data, StatusCounts, RecentLogEntry, CareLogEntry, MapInfo, MapDetail, MapPlant, MapObject, MapItems, ObjectCreateInput, GroundZone, PlantIcon, IconSyncResult, IconGapReport, PlantAlert, AlertSummary, PlantFactOut } from '../types'

const BASE = import.meta.env.VITE_API_BASE_URL || '/api'

// ── Generic typed API client ──

type ApiOptions = {
  body?: unknown
  form?: FormData
  params?: Record<string, string>
}

async function ensureOk(res: Response, fallback: string): Promise<void> {
  if (res.ok) return
  let msg = fallback
  try {
    const body = await res.json()
    if (body.detail) msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
  } catch { /* keep fallback */ }
  throw new Error(msg)
}

async function api<T>(method: string, path: string, options: ApiOptions = {}): Promise<T> {
  const url = BASE + path + (options.params ? '?' + new URLSearchParams(options.params) : '')
  const token = localStorage.getItem('floreren-token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const init: RequestInit = { method, headers }
  if (options.form) {
    init.body = options.form
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }

  const res = await fetch(url, init)

  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('floreren-token')
    window.location.href = '/login'
    throw new Error('Session expired — redirecting to login')
  }

  await ensureOk(res, `Failed: ${method} ${path}`)
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Local types ──

export interface GardenWaterStatus {
  status: 'hydrated' | 'thirsty' | 'dry'
  rain_7day_mm: number
  rain_14day_mm: number
  weekly_budget_mm: number
  biweekly_budget_mm: number
  season: string
  watered_at: string | null
}

export interface AISuggestion {
  commonName: string
  latinName: string
  dutchName: string
  sunFit: 'perfect' | 'good' | 'acceptable'
  reasoning: string
  caveat: string | null
  companionNote: string | null
}
export interface GrowHereResponse { suggestions: AISuggestion[]; spotSummary: string }

// ── Users ──

export const fetchUsers            = ()                    => api<User[]>('GET', '/users')
export const fetchLocations        = ()                    => api<Location[]>('GET', '/locations')
export const updateUserLanguage    = (userId: number, language: 'nl' | 'en') => api<User>('PATCH', `/users/${userId}/language`, { body: { language } })

// ── Plants ──

export const fetchPlants           = ()                    => api<Plant[]>('GET', '/plants')
export const fetchPlant            = (id: number)          => api<Plant>('GET', `/plants/${id}`)
export const createPlant           = (data: PlantCreateInput) => api<Plant>('POST', '/plants', { body: data })
export const updatePlant           = (id: number, data: Partial<Plant>) => api<Plant>('PUT', `/plants/${id}`, { body: data })
export const archivePlant          = (id: number)          => api<void>('DELETE', `/plants/${id}`)
export const restorePlant          = (id: number)          => api<void>('PATCH', `/plants/${id}/restore`)
export const uploadPlantPhoto      = (plantId: number, file: File) => { const f = new FormData(); f.append('file', file); return api<Plant>('POST', `/plants/${plantId}/photo`, { form: f }) }
export const updatePlantPosition   = (plantId: number, data: { map_id: number; map_x: number; map_y: number }) => api<void>('PUT', `/plants/${plantId}/position`, { body: data })
export const updatePlantContainer  = (plantId: number, containerId: number | null) => api<void>('PUT', `/plants/${plantId}/container`, { body: { container_id: containerId } })
export const updatePlantGroundZone = (plantId: number, groundZoneId: string | null, mapX: number | null, mapY: number | null) => api<void>('PUT', `/plants/${plantId}/ground-zone`, { body: { ground_zone_id: groundZoneId, map_x: mapX, map_y: mapY } })
export const updatePlantDisplayRadius = (plantId: number, display_radius_cm: number | null) => api<void>('PUT', `/plants/${plantId}`, { body: { display_radius_cm } })
export const updatePlantLock       = (plantId: number, locked: boolean) => api<void>('PATCH', `/plants/${plantId}/lock`, { params: { locked: String(locked) } })
export const duplicatePlant        = (plantId: number)    => api<Plant>('POST', `/plants/${plantId}/duplicate`)
export const fetchPlantAlerts      = (plantId: number)    => api<PlantAlert[]>('GET', `/plants/${plantId}/alerts`)

// ── Dashboard ──

export const fetchDashboard        = ()                    => api<DashboardData>('GET', '/dashboard')
export const fetchDashboardV2      = ()                    => api<DashboardV2Data>('GET', '/dashboard/v2')

// ── Maps ──

export const fetchMaps             = ()                    => api<MapInfo[]>('GET', '/maps')
export const createMap             = (data: { name: string; map_type?: string; lat?: number; lon?: number; bearing?: number }) => api<MapInfo>('POST', '/maps', { body: data })
export const updateMap             = (id: number, data: { name?: string; canvas_data?: string; map_type?: string; lat?: number; lon?: number; bearing?: number }) => api<MapInfo>('PUT', `/maps/${id}`, { body: data })
export const deleteMap             = (id: number)          => api<void>('DELETE', `/maps/${id}`)
export const fetchMapById          = (id: number)          => api<MapInfo>('GET', `/maps/by-id/${id}`)
export const fetchMapDetail        = (slug: string)        => api<MapDetail>('GET', `/maps/${slug}`)
export const fetchMapPlants        = (slug: string)        => api<MapPlant[]>('GET', `/maps/${slug}/plants`)
export const fetchMapItems         = (slug: string)        => api<MapItems>('GET', `/maps/${slug}/items`)

// ── Objects ──

export const fetchObjects          = ()                    => api<MapObject[]>('GET', '/objects')
export const createObject          = (data: ObjectCreateInput) => api<MapObject>('POST', '/objects', { body: data })
export const updateObject          = (id: number, data: Partial<MapObject>) => api<MapObject>('PUT', `/objects/${id}`, { body: data })
export const updateObjectPosition  = (id: number, data: { map_x: number; map_y: number; rotation?: number }) => api<void>('PUT', `/objects/${id}/position`, { body: data })
export const archiveObject         = (id: number)          => api<void>('DELETE', `/objects/${id}`)
export const restoreObject         = (id: number)          => api<void>('PATCH', `/objects/${id}/restore`)

// ── Ground Zones ──

export const fetchGroundZones      = (slug: string)        => api<GroundZone[]>('GET', `/maps/${slug}/ground-zones`)

// ── Care ──

export const markCareDone          = (plantId: number, careType: string, userId: number, notes?: string) => api<void>('POST', '/care/done', { body: { plant_id: plantId, care_type: careType, user_id: userId, notes } })
export const skipCare              = (plantId: number, careType: string, userId: number) => api<void>('POST', '/care/skip', { body: { plant_id: plantId, care_type: careType, user_id: userId } })
export const deleteCareSchedule    = (scheduleId: number)  => api<void>('DELETE', `/care/schedules/${scheduleId}`)
export const fetchCareLog          = (plantId: number)    => api<CareLogEntry[]>('GET', `/care/log/${plantId}`)

// ── Garden Water ──

export const fetchLatestGardenWatering  = ()               => api<{ watered_at: string | null }>('GET', '/garden/water-log/latest').then(d => d.watered_at ?? null)
export const fetchGardenWaterStatus     = ()               => api<GardenWaterStatus>('GET', '/garden/water-status')
export const logGardenWatering          = (wateredAt?: string, userId?: number) => api<{ watered_at: string }>('POST', '/garden/water-log', { body: { watered_at: wateredAt ?? null, watered_by: userId ?? null } }).then(d => d.watered_at)
export const deleteLatestGardenWatering = ()               => api<void>('DELETE', '/garden/water-log/latest')

export interface GardenFertilizeStatus {
  fertilized_at: string | null
  pending_count: number
}
export const fetchGardenFertilizeStatus     = ()               => api<GardenFertilizeStatus>('GET', '/garden/fertilize-status')
export const logGardenFertilizing           = (fertilizedAt?: string, userId?: number) => api<{ fertilized_at: string; schedules_updated: number }>('POST', '/garden/fertilize-log', { body: { fertilized_at: fertilizedAt ?? null, fertilized_by: userId ?? null } })
export const deleteLatestGardenFertilizing  = ()               => api<void>('DELETE', '/garden/fertilize-log/latest')

// ── Alerts ──

export const fetchAlertSummary     = ()                    => api<AlertSummary>('GET', '/alerts/summary')

// ── Calendar ──

import type { CalendarEvent } from '../pages/calendar/calendarTypes'

export const fetchCalendarEvents   = (from: string, to: string, env?: string) => {
  const params: Record<string, string> = { from, to }
  if (env && env !== 'all') params.env = env
  return api<CalendarEvent[]>('GET', '/calendar/events', { params })
}

// ── Icons ──

export const fetchIconCatalog      = ()                    => api<PlantIcon[]>('GET', '/icon-catalog')
export const syncIcons             = ()                    => api<IconSyncResult>('POST', '/icon-catalog/sync')
export const fetchIconGaps         = ()                    => api<IconGapReport>('GET', '/icon-catalog/gaps')
export const requestIcon           = (plantId: number)     => api<{ status: string; plant_id: number }>('PATCH', `/icon-catalog/request/${plantId}`)

// ── Plant Fact ──

export const fetchPlantFact      = ()                    => api<PlantFactOut>('GET', '/plant-fact')

// ── Admin ──

export interface AdminAccount {
  id: number
  email: string
  name: string
  created_at: string
  household_name: string
}

export const fetchAdminAccounts = () => api<AdminAccount[]>('GET', '/admin/accounts')

// ── Grow Here ──

export const fetchGrowHereSuggestions = (sunHours: number, selectedMonth: number, existingPlants: string[]) =>
  api<GrowHereResponse>('POST', '/garden/grow-here', { body: { sun_hours: sunHours, selected_month: selectedMonth, existing_plants: existingPlants } })

// ── Plant identification (Pl@ntNet) ──

export async function identifyPlant(imageBlob: Blob): Promise<import('../types').IdentifyResponse> {
  const form = new FormData()
  form.append('image', imageBlob, 'plant.jpg')
  return api<import('../types').IdentifyResponse>('POST', '/plants/identify', { form })
}

export async function commitIdentification(
  scientificName: string,
  photoBase64: string,
): Promise<import('../types').IdentifyCommitResult> {
  return api<import('../types').IdentifyCommitResult>('POST', '/plants/identify/commit', {
    body: { scientific_name: scientificName, photo_base64: photoBase64 },
  })
}