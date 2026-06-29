import { describe, expect, it } from 'vitest'
import type { CareWarningOut, MapObject, MapPlant } from '../../../types'
import { en } from '../../../i18n/en'
import { buildCareNeedsGroups, getCareTypeDisplay, localizedWarningCopy, localizedWeatherWarningCopy } from '../careNeedsListModel'

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
    quantity: 1,
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


  it('extracts localized weather copy from top_warning carriers for aggregate cards', () => {
    const weatherWarning: CareWarningOut = {
      care_type: 'frost_protect',
      severity: 'urgent',
      trigger: 'weather_event',
      days_overdue: null,
      message_nl: 'Vorst vannacht — min -2°C',
      message_en: 'Frost tonight — min -2°C',
      reason_nl: 'Minimum -2°C verwacht vannacht (grens 0°C).',
      reason_en: 'Minimum -2°C expected tonight (threshold 0°C).',
      action_nl: 'Dek gevoelige planten af of zet potten binnen of beschut.',
      action_en: 'Cover sensitive plants or move pots inside/sheltered.',
      icon: '❄️',
      color: '#2544a0',
    }

    expect(localizedWeatherWarningCopy([{ top_warning: weatherWarning }], en)).toEqual({
      headline: 'Frost tonight — min -2°C',
      reason: 'Minimum -2°C expected tonight (threshold 0°C).',
      action: 'Cover sensitive plants or move pots inside/sheltered.',
    })
  })

  it('does not show schedule warnings as weather explanation copy', () => {
    expect(localizedWeatherWarningCopy([{ top_warning: warning('water', '💧') }], en)).toBeNull()
  })

  it('localizes structured weather warning reason and action copy', () => {
    const weatherWarning: CareWarningOut = {
      care_type: 'heat_protect',
      severity: 'urgent',
      trigger: 'weather_event',
      days_overdue: null,
      message_nl: 'Hitte morgen — max 32°C',
      message_en: 'Heat tomorrow — max 32°C',
      reason_nl: 'Maximum 32°C verwacht morgen (grens 28°C).',
      reason_en: 'Maximum 32°C expected tomorrow (threshold 28°C).',
      action_nl: 'Geef vroeg of laat water; zet potten in de schaduw en controleer bakken eerst.',
      action_en: 'Water early or late; move pots to shade and check containers first.',
      icon: '🔥',
      color: '#e08049',
    }

    expect(localizedWarningCopy(weatherWarning, en)).toEqual({
      headline: 'Heat tomorrow — max 32°C',
      reason: 'Maximum 32°C expected tomorrow (threshold 28°C).',
      action: 'Water early or late; move pots to shade and check containers first.',
    })
  })
})
