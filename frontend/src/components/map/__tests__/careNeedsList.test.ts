import { describe, expect, it } from 'vitest'
import type { CareWarningOut, MapObject, MapPlant } from '../../../types'
import { en } from '../../../i18n/en'
import { buildCareNeedsGroups, getCareTypeDisplay } from '../careNeedsListModel'

function warning(careType: string, icon: string): CareWarningOut {
  return {
    care_type: careType,
    severity: 'warning',
    trigger: 'schedule_due_today',
    days_overdue: 0,
    message_nl: `${careType} vandaag`,
    message_en: `${careType} due today`,
    icon,
    color: '#FFC233',
  }
}

function plant(id: number, name: string, warnings: CareWarningOut[]): MapPlant {
  return {
    id,
    name,
    species: null,
    species_common_name_nl: null,
    species_common_name_en: null,
    map_x: 0,
    map_y: 0,
    photo_path: null,
    container_id: null,
    ground_zone_id: null,
    display_radius_cm: null,
    care_status: warnings.length ? 'due_today' : 'good',
    temp_status: 'comfortable',
    most_urgent: null,
    sun_requirement: null,
    plant_type: null,
    icon_key: null,
    species_id: null,
    phenology: null,
    is_locked: false,
    top_alert: null,
    alerts: [],
    top_warning: warnings[0] ?? null,
    warnings,
  }
}

describe('CareNeedsList grouping', () => {
  it('groups every warning type instead of only the top warning', () => {
    const lavender = plant(1, 'Lavender', [warning('prune', '✂️'), warning('water', '💧')])
    const monstera = plant(2, 'Monstera', [warning('rotate', '🔄')])
    const basil = plant(3, 'Basil', [])

    const result = buildCareNeedsGroups([lavender, monstera, basil], [])

    expect(result.groups.map(group => group.careType).sort()).toEqual(['prune', 'rotate', 'water'])
    expect(result.groups.find(group => group.careType === 'water')?.plants.map(p => p.name)).toEqual(['Lavender'])
    expect(result.goodPlants.map(p => p.name)).toEqual(['Basil'])
  })

  it('includes contained plant warnings in the same grouped list', () => {
    const pot = {
      name: 'Terracotta pot',
      contained_plants: [plant(4, 'Mint', [warning('heat_protect', '🔥')])],
    } as MapObject

    const result = buildCareNeedsGroups([], [pot])

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].careType).toBe('heat_protect')
    expect(result.groups[0].plants[0].containerName).toBe('Terracotta pot')
  })

  it('uses the active language for care labels', () => {
    expect(getCareTypeDisplay('prune', en).label).toBe('Prune')
    expect(getCareTypeDisplay('heat_protect', en).label).toBe('Heat protect')
  })
})
