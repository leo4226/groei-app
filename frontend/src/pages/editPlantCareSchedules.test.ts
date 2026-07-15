import { describe, expect, it } from 'vitest'
import type { MapInfo, Plant } from '../types'
import {
  buildCareScheduleSyncPayload,
  buildScheduleEditorState,
  careEnvironmentForPlant,
  editableCareTypesForEnvironment,
} from './editPlantCareSchedules'

function plant(overrides: Partial<Plant> = {}): Plant {
  return {
    id: 1,
    name: 'Monstera',
    species: null,
    species_common_name_nl: null,
    species_common_name_en: null,
    location_id: null,
    location_name: null,
    location_icon: null,
    map_id: 1,
    map_x: null,
    map_y: null,
    photo_path: null,
    acquired_date: null,
    pot_size_cm: null,
    container_id: null,
    last_repotted: null,
    notes: null,
    is_active: true,
    is_locked: false,
    created_at: null,
    sown_date: null,
    sun_requirement: null,
    plant_type: null,
    icon_key: null,
    icon_requested: false,
    phase: 'established',
    quantity: 1,
    species_id: null,
    phenology: null,
    care_schedules: [],
    care_status: 'good',
    temp_status: 'comfortable',
    ...overrides,
  }
}

const indoorMap = { map_type: 'indoor' } as Pick<MapInfo, 'map_type'>
const outdoorMap = { map_type: 'outdoor' } as Pick<MapInfo, 'map_type'>

describe('careEnvironmentForPlant', () => {
  it('distinguishes indoor, outdoor container, and outdoor ground plants', () => {
    expect(careEnvironmentForPlant(plant(), indoorMap)).toBe('indoor')
    expect(careEnvironmentForPlant(plant({ container_id: 9 }), outdoorMap)).toBe('outdoor_container')
    expect(careEnvironmentForPlant(plant(), outdoorMap)).toBe('outdoor_ground')
  })
})

describe('editableCareTypesForEnvironment', () => {
  it('includes indoor-only recurring care indoors and never includes weather or photo', () => {
    const types = editableCareTypesForEnvironment('indoor')
    expect(types).toEqual([
      'water', 'fertilize', 'prune', 'repot',
      'pest_check', 'mist', 'rotate', 'dust',
    ])
    expect(types).not.toContain('frost_protect')
    expect(types).not.toContain('heat_protect')
    expect(types).not.toContain('photo')
  })

  it('offers repot for outdoor containers but not outdoor ground', () => {
    expect(editableCareTypesForEnvironment('outdoor_container')).toEqual([
      'water', 'fertilize', 'prune', 'repot', 'pest_check',
    ])
    expect(editableCareTypesForEnvironment('outdoor_ground')).toEqual([
      'water', 'fertilize', 'prune', 'pest_check',
    ])
  })
})

describe('schedule editor state and payload', () => {
  it('uses active persisted intervals and safe defaults for missing schedules', () => {
    const p = plant({
      care_schedules: [
        {
          id: 1, plant_id: 1, care_type: 'water', interval_days: 11,
          season_adjust: null, next_due: '2026-07-24', last_done: null,
          last_done_by: null, last_done_by_name: null, notes: null, is_active: true,
          rhythm_opt_out: true,
        },
        {
          id: 2, plant_id: 1, care_type: 'dust', interval_days: 45,
          season_adjust: null, next_due: '2026-08-27', last_done: null,
          last_done_by: null, last_done_by_name: null, notes: null, is_active: true,
        },
      ],
    })

    const state = buildScheduleEditorState(p, 'indoor')

    expect(state.water).toEqual({ enabled: true, days: 11, rhythmEnabled: false })
    expect(state.dust).toEqual({ enabled: true, days: 45, rhythmEnabled: true })
    expect(state.fertilize).toEqual({ enabled: false, days: 30, rhythmEnabled: true })
    expect(state.mist).toEqual({ enabled: false, days: 7, rhythmEnabled: true })
  })

  it('submits only enabled types valid for the current environment', () => {
    const state = buildScheduleEditorState(plant(), 'indoor')
    state.water = { enabled: true, days: 8, rhythmEnabled: false }
    state.repot = { enabled: true, days: 540, rhythmEnabled: true }
    state.mist = { enabled: true, days: 5, rhythmEnabled: true }
    state.dust = { enabled: true, days: 30, rhythmEnabled: true }

    expect(buildCareScheduleSyncPayload(state, 'outdoor_container')).toEqual([
      { care_type: 'water', interval_days: 8, rhythm_opt_out: true },
      { care_type: 'repot', interval_days: 540 },
    ])
  })
})
