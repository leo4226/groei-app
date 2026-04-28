import type { User, Location, Plant, PlantCreateInput, DashboardData, CareLogEntry, MapInfo, MapDetail, MapPlant, MapObject, MapItems, ObjectCreateInput, GroundZone, PlantIcon, IconSyncResult, PlantAlert, AlertSummary } from '../types'

const API = '/api'

async function ensureOk(res: Response, fallback: string): Promise<void> {
  if (res.ok) return
  let msg = fallback
  try {
    const body = await res.json()
    if (body.detail) msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
  } catch { /* keep fallback */ }
  throw new Error(msg)
}

// --- Users ---

export async function fetchUsers(): Promise<User[]> {
  const res = await fetch(`${API}/users`)
  await ensureOk(res, 'Failed to load users')
  return res.json()
}

// --- Locations ---

export async function fetchLocations(): Promise<Location[]> {
  const res = await fetch(`${API}/locations`)
  await ensureOk(res, 'Failed to load locations')
  return res.json()
}

// --- Plants ---

export async function fetchPlants(): Promise<Plant[]> {
  const res = await fetch(`${API}/plants`)
  await ensureOk(res, 'Failed to load plants')
  return res.json()
}

export async function fetchPlant(id: number): Promise<Plant> {
  const res = await fetch(`${API}/plants/${id}`)
  await ensureOk(res, 'Failed to load plant')
  return res.json()
}

export async function createPlant(data: PlantCreateInput): Promise<Plant> {
  const res = await fetch(`${API}/plants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  await ensureOk(res, 'Failed to create plant')
  return res.json()
}

export async function updatePlant(id: number, data: Partial<Plant>): Promise<Plant> {
  const res = await fetch(`${API}/plants/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  await ensureOk(res, 'Failed to update plant')
  return res.json()
}

export async function archivePlant(id: number): Promise<void> {
  const res = await fetch(`${API}/plants/${id}`, { method: 'DELETE' })
  await ensureOk(res, 'Failed to archive plant')
}

export async function uploadPlantPhoto(plantId: number, file: File): Promise<Plant> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API}/plants/${plantId}/photo`, {
    method: 'POST',
    body: form,
  })
  await ensureOk(res, 'Failed to upload photo')
  return res.json()
}

// --- Dashboard ---

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch(`${API}/dashboard`)
  await ensureOk(res, 'Failed to load dashboard')
  return res.json()
}

// --- Maps ---

export async function fetchMaps(): Promise<MapInfo[]> {
  const res = await fetch(`${API}/maps`)
  await ensureOk(res, 'Failed to load maps')
  return res.json()
}

export async function fetchMapDetail(slug: string): Promise<MapDetail> {
  const res = await fetch(`${API}/maps/${slug}`)
  await ensureOk(res, 'Failed to load map')
  return res.json()
}

export async function fetchMapPlants(slug: string): Promise<MapPlant[]> {
  const res = await fetch(`${API}/maps/${slug}/plants`)
  await ensureOk(res, 'Failed to load map plants')
  return res.json()
}

export async function updatePlantPosition(plantId: number, data: { map_id: number; map_x: number; map_y: number }): Promise<void> {
  const res = await fetch(`${API}/plants/${plantId}/position`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  await ensureOk(res, 'Failed to update plant position')
}

export async function fetchMapItems(slug: string): Promise<MapItems> {
  const res = await fetch(`${API}/maps/${slug}/items`)
  await ensureOk(res, 'Failed to load map items')
  return res.json()
}

// --- Objects ---

export async function fetchObjects(): Promise<MapObject[]> {
  const res = await fetch(`${API}/objects`)
  await ensureOk(res, 'Failed to load objects')
  return res.json()
}

export async function createObject(data: ObjectCreateInput): Promise<MapObject> {
  const res = await fetch(`${API}/objects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  await ensureOk(res, 'Failed to create object')
  return res.json()
}

export async function updateObject(id: number, data: Partial<MapObject>): Promise<MapObject> {
  const res = await fetch(`${API}/objects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  await ensureOk(res, 'Failed to update object')
  return res.json()
}

export async function updateObjectPosition(id: number, data: { map_x: number; map_y: number; rotation?: number }): Promise<void> {
  const res = await fetch(`${API}/objects/${id}/position`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  await ensureOk(res, 'Failed to update object position')
}

export async function archiveObject(id: number): Promise<void> {
  const res = await fetch(`${API}/objects/${id}`, { method: 'DELETE' })
  await ensureOk(res, 'Failed to archive object')
}

export async function updatePlantContainer(plantId: number, containerId: number | null): Promise<void> {
  const res = await fetch(`${API}/plants/${plantId}/container`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ container_id: containerId }),
  })
  await ensureOk(res, 'Failed to update plant container')
}

export async function duplicatePlant(plantId: number): Promise<Plant> {
  const res = await fetch(`${API}/plants/${plantId}/duplicate`, { method: 'POST' })
  await ensureOk(res, 'Failed to duplicate plant')
  return res.json()
}

export async function fetchGroundZones(slug: string): Promise<GroundZone[]> {
  const res = await fetch(`${API}/maps/${slug}/ground-zones`)
  await ensureOk(res, 'Failed to load ground zones')
  return res.json()
}

export async function updatePlantGroundZone(
  plantId: number,
  groundZoneId: string | null,
  mapX: number | null,
  mapY: number | null,
): Promise<void> {
  const res = await fetch(`${API}/plants/${plantId}/ground-zone`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ground_zone_id: groundZoneId, map_x: mapX, map_y: mapY }),
  })
  await ensureOk(res, 'Failed to update plant ground zone')
}

export async function updatePlantDisplayRadius(plantId: number, display_radius_cm: number | null): Promise<void> {
  const res = await fetch(`${API}/plants/${plantId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_radius_cm }),
  })
  await ensureOk(res, 'Failed to update plant size')
}

export async function updatePlantLock(plantId: number, locked: boolean): Promise<void> {
  const res = await fetch(`${API}/plants/${plantId}/lock?locked=${locked}`, { method: 'PATCH' })
  await ensureOk(res, 'Failed to update plant lock')
}

// --- Care ---

export async function markCareDone(plantId: number, careType: string, userId: number, notes?: string): Promise<void> {
  const res = await fetch(`${API}/care/done`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plant_id: plantId, care_type: careType, user_id: userId, notes }),
  })
  await ensureOk(res, 'Failed to mark care as done')
}

export async function skipCare(plantId: number, careType: string, userId: number): Promise<void> {
  const res = await fetch(`${API}/care/skip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plant_id: plantId, care_type: careType, user_id: userId }),
  })
  await ensureOk(res, 'Failed to skip care')
}

// --- Grow Here ---

export interface AISuggestion {
  commonName: string
  latinName: string
  dutchName: string
  sunFit: 'perfect' | 'good' | 'acceptable'
  reasoning: string
  caveat: string | null
  companionNote: string | null
}

export interface GrowHereResponse {
  suggestions: AISuggestion[]
  spotSummary: string
}

export async function fetchGrowHereSuggestions(
  sunHours: number,
  selectedMonth: number,
  existingPlants: string[],
): Promise<GrowHereResponse> {
  const res = await fetch(`${API}/garden/grow-here`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sun_hours: sunHours, selected_month: selectedMonth, existing_plants: existingPlants }),
  })
  await ensureOk(res, 'AI suggesties ophalen mislukt')
  return res.json()
}

export async function deleteCareSchedule(scheduleId: number): Promise<void> {
  const res = await fetch(`${API}/care/schedules/${scheduleId}`, { method: 'DELETE' })
  await ensureOk(res, 'Failed to delete care schedule')
}

export async function fetchCareLog(plantId: number): Promise<CareLogEntry[]> {
  const res = await fetch(`${API}/care/log/${plantId}`)
  await ensureOk(res, 'Failed to load care log')
  return res.json()
}

// --- Alerts ---

export async function fetchLatestGardenWatering(): Promise<string | null> {
  const res = await fetch(`${API}/garden/water-log/latest`)
  await ensureOk(res, 'Failed to load garden water log')
  const data = await res.json()
  return data.watered_at ?? null
}

export interface GardenWaterStatus {
  status: 'hydrated' | 'thirsty' | 'dry'
  rain_7day_mm: number
  weekly_budget_mm: number
  season: string
  watered_at: string | null
}

export async function fetchGardenWaterStatus(): Promise<GardenWaterStatus> {
  const res = await fetch(`${API}/garden/water-status`)
  await ensureOk(res, 'Failed to load garden water status')
  return res.json()
}

export async function logGardenWatering(wateredAt?: string, userId?: number): Promise<string> {
  const res = await fetch(`${API}/garden/water-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watered_at: wateredAt ?? null, watered_by: userId ?? null }),
  })
  await ensureOk(res, 'Failed to log garden watering')
  const data = await res.json()
  return data.watered_at
}

export async function deleteLatestGardenWatering(): Promise<void> {
  const res = await fetch(`${API}/garden/water-log/latest`, { method: 'DELETE' })
  await ensureOk(res, 'Failed to delete garden watering')
}

export async function fetchPlantAlerts(plantId: number): Promise<PlantAlert[]> {
  const res = await fetch(`${API}/plants/${plantId}/alerts`)
  await ensureOk(res, 'Failed to load plant alerts')
  return res.json()
}

export async function fetchAlertSummary(): Promise<AlertSummary> {
  const res = await fetch(`${API}/alerts/summary`)
  await ensureOk(res, 'Failed to load alert summary')
  return res.json()
}

// --- Icons ---

export async function fetchIconCatalog(): Promise<PlantIcon[]> {
  const res = await fetch(`${API}/icon-catalog`)
  await ensureOk(res, 'Failed to load icon catalog')
  return res.json()
}

export async function syncIcons(): Promise<IconSyncResult> {
  const res = await fetch(`${API}/icon-catalog/sync`, { method: 'POST' })
  await ensureOk(res, 'Failed to sync icons')
  return res.json()
}
