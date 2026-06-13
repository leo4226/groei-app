import type { User, Location, Plant, PlantCreateInput, DashboardV2Data, CareLogEntry, RecentLogEntry, MapInfo, MapDetail, MapPlant, MapObject, MapItems, ObjectCreateInput, GroundZone, PlantIcon, IconSyncResult, IconGapReport, PlantAlert, AlertSummary, PlantFactOut, RecommendationsOut, GardenSuggestionsOut } from '../types'
import { indexIconUrls } from '../utils/icons'

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

export async function apiRequest<T>(method: string, path: string, options: ApiOptions = {}): Promise<T> {
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

  if (res.status === 401) {
    localStorage.removeItem('floreren-token')
    window.location.href = '/login'
    throw new Error('Session expired — redirecting to login')
  }

  if (res.status === 403) {
    let detail = 'Forbidden'
    try { const body = await res.json(); if (body.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail) } catch {}
    throw new Error(detail)
  }

  await ensureOk(res, `Failed: ${method} ${path}`)
  if (res.status === 204) return undefined as T
  return res.json()
}

/** Retry transient network errors (TypeError from fetch). */
async function api<T>(method: string, path: string, options: ApiOptions = {}): Promise<T> {
  const MAX_RETRIES = 2
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await apiRequest<T>(method, path, options)
    } catch (e) {
      const isNetworkError = e instanceof TypeError
      if (!isNetworkError || attempt === MAX_RETRIES) throw e
      lastError = e
      await new Promise(r => setTimeout(r, (attempt + 1) * 1000))
    }
  }

  throw lastError
}

// ── Exported local types ──

export interface GardenWaterStatus {
  status: 'hydrated' | 'thirsty' | 'dry'
  rain_7day_mm: number
  rain_14day_mm: number
  weekly_budget_mm: number
  biweekly_budget_mm: number
  season: string
  watered_at: string | null
}

export interface GardenFertilizeStatus {
  fertilized_at: string | null
  pending_count: number
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

export interface AdminAccount {
  id: number
  email: string
  name: string
  created_at: string
  household_name: string
}

export interface AccountMe {
  id: number
  household_id: number
  email: string
  name: string
  avatar: string | null
  is_admin: boolean
  household_name: string
}

export interface AdminUserRow {
  id: number
  name: string
  email: string
  created_at: string
  household_id: number
  household_name: string
  plant_count: number
  map_count: number
  last_activity: string | null
}

export interface AdminActivityEvent {
  kind: string
  label: string
  household: string
  ts: string | null
}

export interface AdminOverview {
  total_accounts: number
  total_plants: number
  total_maps: number
  missing_icons: number
  recent_accounts: AdminUserRow[]
  recent_activity: AdminActivityEvent[]
}

export interface AdminPlantRow {
  id: number
  name: string
  species: string | null
  icon_key: string | null
  phase: string
  icon_requested: boolean
  has_thresholds: boolean
  household_name: string
  created_at: string
}

export interface AdminSpeciesRow {
  id: number
  common_name_nl: string
  latin_name: string | null
  has_thresholds: boolean
  has_latin_name: boolean
  plant_count: number
}

// ── Domain namespaces ──

export const users = {
  list:        ()                                          => api<User[]>('GET', '/users'),
  locations:   ()                                          => api<Location[]>('GET', '/locations'),
  updateLocation: (id: number, data: Partial<Location>)         => api<Location>('PATCH', `/locations/${id}`, { body: data }),
  deleteLocation: (id: number)                                  => api<{ok: boolean}>('DELETE', `/locations/${id}`),
  setLanguage: (userId: number, language: 'nl' | 'en')   => api<User>('PATCH', `/users/${userId}/language`, { body: { language } }),
  updateUser:  (userId: number, data: { name?: string; avatar?: string }) => api<User>('PATCH', `/users/${userId}`, { body: data }),
}

export const plants = {
  list:              ()                                            => api<Plant[]>('GET', '/plants'),
  get:               (id: number)                                  => api<Plant>('GET', `/plants/${id}`),
  create:            (data: PlantCreateInput)                      => api<Plant>('POST', '/plants', { body: data }),
  update:            (id: number, data: Partial<Plant>)            => api<Plant>('PUT', `/plants/${id}`, { body: data }),
  archive:           (id: number)                                  => api<void>('DELETE', `/plants/${id}`),
  bulkArchive:       (ids: number[])                               => api<{ok: boolean; count: number}>('POST', '/plants/bulk-archive', { body: { plant_ids: ids } }),
  restore:           (id: number)                                  => api<void>('PATCH', `/plants/${id}/restore`),
  uploadPhoto:       (plantId: number, file: File)                 => { const f = new FormData(); f.append('file', file); return api<Plant>('POST', `/plants/${plantId}/photo`, { form: f }) },
  setPosition:       (plantId: number, data: { map_id: number; map_x: number; map_y: number; ground_zone_id: null }) => api<void>('PUT', `/plants/${plantId}/position`, { body: data }),
  setContainer:      (plantId: number, containerId: number | null) => api<void>('PUT', `/plants/${plantId}/container`, { body: { container_id: containerId } }),
  setGroundZone:     (plantId: number, groundZoneId: string | null, mapX: number | null, mapY: number | null) => api<void>('PUT', `/plants/${plantId}/ground-zone`, { body: { ground_zone_id: groundZoneId, map_x: mapX, map_y: mapY } }),
  setRadius:         (plantId: number, display_radius_cm: number | null) => api<void>('PUT', `/plants/${plantId}`, { body: { display_radius_cm } }),
  setLock:           (plantId: number, locked: boolean)            => api<void>('PATCH', `/plants/${plantId}/lock`, { params: { locked: String(locked) } }),
  duplicate:         (plantId: number)                             => api<Plant>('POST', `/plants/${plantId}/duplicate`),
  alerts:            (plantId: number)                             => api<PlantAlert[]>('GET', `/plants/${plantId}/alerts`),
  warnings:          (plantId: number)                             => api<import('../types').PlantWarningStateOut>('GET', `/plants/${plantId}/warnings`),
  warningSummary:    (env: string = 'all')                         => api<import('../types').WarningSummaryOut>('GET', '/warnings/summary', { params: { env } }),
  patchCareProfile:  (plantId: number, data: Record<string, { active: boolean }>) => api<void>('PATCH', `/plants/${plantId}/care-profile`, { body: data }),
  fact:              ()                                            => api<PlantFactOut>('GET', '/plant-fact'),
  identify:          async (imageBlob: Blob, lang: 'nl' | 'en' = 'nl')  => { const f = new FormData(); f.append('image', imageBlob, 'plant.jpg'); return api<import('../types').IdentifyResponse>('POST', `/plants/identify?lang=${lang}`, { form: f }) },
  identifyPlantnet:  async (imageBlob: Blob, lang: 'nl' | 'en' = 'en')  => { const f = new FormData(); f.append('image', imageBlob, 'plant.jpg'); return api<import('../types').IdentifyResponse>('POST', `/plants/identify?engine=plantnet&lang=${lang}`, { form: f }) },
  commitIdentify:    (scientificName: string, photoBase64: string) => api<import('../types').IdentifyCommitResult>('POST', '/plants/identify/commit', { body: { scientific_name: scientificName, photo_base64: photoBase64 } }),
}

export const photos = {
  list: (plantId: number) => api<import('../types').PlantPhoto[]>('GET', `/plants/${plantId}/photos`),
  upload: (plantId: number, image: Blob, opts: { note?: string; takenAt?: string; careLogId?: number } = {}) => {
    const f = new FormData()
    f.append('file', image, 'photo.jpg')
    if (opts.note) f.append('note', opts.note)
    if (opts.takenAt) f.append('taken_at', opts.takenAt)
    if (opts.careLogId != null) f.append('care_log_id', String(opts.careLogId))
    return api<import('../types').PlantPhoto>('POST', `/plants/${plantId}/photos`, { form: f })
  },
  updateNote: (photoId: number, note: string) => api<import('../types').PlantPhoto>('PATCH', `/photos/${photoId}`, { body: { note } }),
  remove: (photoId: number) => api<{ ok: boolean }>('DELETE', `/photos/${photoId}`),
  photoReminder: (plantId: number, enabled: boolean, intervalDays = 30) =>
    api<{ ok: boolean }>('PUT', `/plants/${plantId}/photo-reminder`,
      { body: { enabled, interval_days: intervalDays } }),
}

export const dashboard = {
  v2: () => api<DashboardV2Data>('GET', '/dashboard/v2'),
}

export const species = {
  ecology: (id: number) => api<import('../types').EcologyOut>('GET', `/species/${id}/ecology`),
  lookupLatin: (latin: string) => api<{ id: number; care_thresholds: Record<string, unknown> | null }>('GET', `/species/by-latin/${encodeURIComponent(latin)}`),
}

export const maps = {
  list:    ()                                                                                                     => api<MapInfo[]>('GET', '/maps'),
  create:  (data: { name: string; map_type?: string; lat?: number; lon?: number; bearing?: number })             => api<MapInfo>('POST', '/maps', { body: data }),
  update:  (id: number, data: { name?: string; canvas_data?: string; map_type?: string; lat?: number; lon?: number; bearing?: number }) => api<MapInfo>('PUT', `/maps/${id}`, { body: data }),
  delete:  (id: number)                                                                                          => api<void>('DELETE', `/maps/${id}`),
  byId:    (id: number)                                                                                          => api<MapInfo>('GET', `/maps/by-id/${id}`),
  detail:  (slug: string)                                                                                        => api<MapDetail>('GET', `/maps/${slug}`),
  biodiversity: (slug: string)                                                                                   => api<import('../types').GardenBiodiversityOut>('GET', `/maps/${slug}/biodiversity`),
  plantSuggestions: (slug: string)                                                                               => api<GardenSuggestionsOut>('GET', `/maps/${slug}/plant-suggestions`),
  plants:  (slug: string)                                                                                        => api<MapPlant[]>('GET', `/maps/${slug}/plants`),
  items:   (slug: string)                                                                                        => api<MapItems>('GET', `/maps/${slug}/items`),
}

export const objects = {
  list:        ()                                                                           => api<MapObject[]>('GET', '/objects'),
  create:      (data: ObjectCreateInput)                                                    => api<MapObject>('POST', '/objects', { body: data }),
  update:      (id: number, data: Partial<MapObject>)                                      => api<MapObject>('PUT', `/objects/${id}`, { body: data }),
  setPosition: (id: number, data: { map_x: number; map_y: number; rotation?: number })    => api<void>('PUT', `/objects/${id}/position`, { body: data }),
  archive:     (id: number)                                                                 => api<void>('DELETE', `/objects/${id}`),
  restore:     (id: number)                                                                 => api<void>('PATCH', `/objects/${id}/restore`),
}

export const groundZones = {
  list: (slug: string) => api<GroundZone[]>('GET', `/maps/${slug}/ground-zones`),
}

export const care = {
  done:           (plantId: number, careType: string, userId: number, notes?: string, water_amount?: number) => api<{ ok: boolean; next_due: string; care_log_id: number }>('POST', '/care/done', { body: { plant_id: plantId, care_type: careType, user_id: userId, notes, water_amount } }),
  skip:           (plantId: number, careType: string, userId: number)                  => api<void>('POST', '/care/skip', { body: { plant_id: plantId, care_type: careType, user_id: userId } }),
  deleteSchedule: (scheduleId: number)                                                  => api<void>('DELETE', `/care/schedules/${scheduleId}`),
  updateScheduleInterval: (scheduleId: number, intervalDays: number)                    => api<{ ok: boolean; schedule_id: number; interval_days: number }>('PATCH', `/care/schedules/${scheduleId}`, { body: { interval_days: intervalDays } }),
  log:            (plantId: number)                                                     => api<CareLogEntry[]>('GET', `/care/log/${plantId}`),
  householdLog:   (limit = 50, offset = 0)                                              => api<RecentLogEntry[]>('GET', '/care/log', { params: { limit: String(limit), offset: String(offset) } }),
}

export const garden = {
  latestWatering:  ()                                                    => api<{ watered_at: string | null }>('GET', '/garden/water-log/latest').then(d => d.watered_at ?? null),
  waterStatus:     ()                                                    => api<GardenWaterStatus>('GET', '/garden/water-status'),
  logWater:        (wateredAt?: string, userId?: number)                 => api<{ watered_at: string }>('POST', '/garden/water-log', { body: { watered_at: wateredAt ?? null, watered_by: userId ?? null } }).then(d => d.watered_at),
  deleteWater:     ()                                                    => api<void>('DELETE', '/garden/water-log/latest'),
  fertilizeStatus: ()                                                    => api<GardenFertilizeStatus>('GET', '/garden/fertilize-status'),
  logFertilize:    (fertilizedAt?: string, userId?: number)             => api<{ fertilized_at: string; schedules_updated: number }>('POST', '/garden/fertilize-log', { body: { fertilized_at: fertilizedAt ?? null, fertilized_by: userId ?? null } }),
  deleteFertilize: ()                                                    => api<void>('DELETE', '/garden/fertilize-log/latest'),
  growHere:        (sunHours: number, selectedMonth: number, existingPlants: string[]) => api<GrowHereResponse>('POST', '/garden/grow-here', { body: { sun_hours: sunHours, selected_month: selectedMonth, existing_plants: existingPlants } }),
  recommendations: (mapId: number, sunHours: number, month: number, svf?: number, limit?: number) =>
    api<RecommendationsOut>('GET', '/garden/recommendations', {
      params: {
        map_id: String(mapId),
        sun_hours: String(sunHours),
        month: String(month),
        ...(svf !== undefined ? { svf: String(svf) } : {}),
        ...(limit !== undefined ? { limit: String(limit) } : {}),
      },
    }),
}

export const alerts = {
  summary: () => api<AlertSummary>('GET', '/alerts/summary'),
}

import type { CalendarEvent } from '../pages/calendar/calendarTypes'

export const calendar = {
  events: (from: string, to: string, env?: string) => {
    const params: Record<string, string> = { from, to }
    if (env && env !== 'all') params.env = env
    return api<CalendarEvent[]>('GET', '/calendar/events', { params })
  },
}

export const icons = {
  catalog: async (): Promise<PlantIcon[]> => {
    const entries = await api<PlantIcon[]>('GET', '/icon-catalog')
    indexIconUrls(entries)
    return entries.slice().sort((a, b) => a.name.localeCompare(b.name))
  },
  sync:    () => api<IconSyncResult>('POST', '/icon-catalog/sync'),
  gaps:    () => api<IconGapReport>('GET', '/icon-catalog/gaps'),
  request: (plantId: number) => api<{ status: string; plant_id: number }>('PATCH', `/icon-catalog/request/${plantId}`),
}

export const weeds = {
  catalog:        ()                                            => api<import('../types').WeedSpeciesListItem[]>('GET', '/weed-catalog'),
  createSighting: (body: import('../types').WeedSightingCreate) => api<import('../types').WeedSightingOut>('POST', '/weed-sightings', { body }),
}

export const auth = {
  me: () => api<AccountMe>("GET", "/auth/me"),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api<{ message: string }>("POST", "/auth/change-password", { body: data }),
}

export const admin = {
  accounts:             ()           => api<AdminAccount[]>('GET', '/admin/accounts'),
  deleteAccount:        (id: number) => api<void>('DELETE', `/admin/accounts/${id}`),
  deleteAccounts:       (ids: number[]) => api<{status: string; account_ids: number[]; names: string[]; households_cleared: number}>('DELETE', '/admin/accounts/bulk', { body: { account_ids: ids } }),
  backfillThresholds:   ()           => api<{ processed: number; succeeded: number; failed: number }>('POST', '/admin/backfill-thresholds'),
  backfillCareSchedules:()           => api<{ checked: number; seeded: number }>('POST', '/admin/backfill-care-schedules'),
  thresholdsPreview:     ()           => api<{ active_total: number; missing_thresholds: number; has_thresholds: number }>('GET', '/admin/backfill-thresholds/preview'),
  schedulesPreview:      ()           => api<{ total_with_thresholds: number; missing_schedules: number; has_schedules: number }>('GET', '/admin/backfill-care-schedules/preview'),
  backfillPlantTypes:    ()           => api<{ status: string; found: number; updated: number; skipped: number }>('POST', '/admin/backfill-plant-types'),
  backfillPlantTypesPreview: ()     => api<{ total_active_plants: number; missing_plant_type: number }>('GET', '/admin/backfill-plant-types/preview'),
}

export const adminPanel = {
  overview: () => api<AdminOverview>('GET', '/admin-panel/overview'),
  users:    () => api<AdminUserRow[]>('GET', '/admin-panel/users'),
  plants:   () => api<AdminPlantRow[]>('GET', '/admin-panel/plants'),
  species:  () => api<AdminSpeciesRow[]>('GET', '/admin-panel/species'),
  activity: () => api<AdminActivityEvent[]>('GET', '/admin-panel/activity'),
  me:       () => api<{ email: string }>('GET', '/admin-panel/me'),
  backfillFacts: (limit: number = 50) => api<{ processed: number; updated: number; skipped: number; errors: Array<{species_id: number; name: string; error: string}> }>('POST', `/admin-panel/backfill-facts?limit=${limit}`),
  backfillFactsPreview: () => api<{ total_species: number; missing_facts: number }>('GET', '/admin-panel/backfill-facts/preview'),
  generateIcons: (opts: { scope?: 'all' | 'in_use'; mapOnly?: boolean; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (opts.scope) q.set('scope', opts.scope)
    if (opts.mapOnly) q.set('map_only', 'true')
    if (opts.limit != null) q.set('limit', String(opts.limit))
    const qs = q.toString()
    return api<IconGenerateResult>('POST', `/admin-panel/generate-icons${qs ? `?${qs}` : ''}`)
  },
  generateIconsPreview: (opts: { scope?: 'all' | 'in_use'; mapOnly?: boolean } = {}) => {
    const q = new URLSearchParams()
    if (opts.scope) q.set('scope', opts.scope)
    if (opts.mapOnly) q.set('map_only', 'true')
    const qs = q.toString()
    return api<{ scope: string; map_only: boolean; count: number }>('GET', `/admin-panel/generate-icons/preview${qs ? `?${qs}` : ''}`)
  },
}

export interface IconGenerateResult {
  generated: { id: number; name: string; latin: string; icon_id: string; cat: string }[]
  count: number
  skipped: { id: number; name: string; latin: string; error: string }[]
  skipped_count: number
  sync_result: { matched: number; matches: { plant_id: number; plant_name: string; icon_key: string }[] }
  scope?: string
  map_only?: boolean
  remaining?: number
}

export interface HouseholdMember {
  id: number
  name: string
  email: string
  avatar: string | null
  created_at: string
}

export const household = {
  invite:      ()                             => api<{ code: string; expires_at: string }>('POST', '/household/invite'),
  join:        (data: { code: string; email: string; password: string; name: string }) => api<import('../api/auth').AuthResponse>('POST', '/household/join', { body: data }),
  members:     ()                             => api<HouseholdMember[]>('GET', '/household/members'),
  removeMember:(userId: number)               => api<void>('DELETE', `/household/members/${userId}`),
  rename:      (name: string)                  => api<{ name: string }>('PATCH', '/household', { body: { name } }),
}

export interface NotificationPrefs {
  digest_enabled: boolean
  digest_time: string  // "HH:MM" — the send hour for digest AND push (Europe/Amsterdam)
  push_enabled: boolean
}

export const notifications = {
  getPrefs:    ()                       => api<NotificationPrefs>('GET', '/settings/notifications'),
  updatePrefs: (prefs: NotificationPrefs) => api<NotificationPrefs>('PUT', '/settings/notifications', { body: prefs }),
  vapidKey:    ()                       => api<{ key: string }>('GET', '/push/vapid-public-key'),
  pushSubscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    api<{ ok: boolean }>('POST', '/push/subscription', { body: sub }),
  pushUnsubscribe: (endpoint: string) =>
    api<{ ok: boolean }>('DELETE', '/push/subscription', { body: { endpoint } }),
}
