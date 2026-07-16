import { describe, expect, it } from 'vitest'
import type { CareWarningOut, MapPlant, TopAlert } from '../../../types'
import { containedPlantHaloColor, markerBadgesForPlant, plantMarkerHaloColor, topMarkerBadge } from '../PlantMarker'

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

function alert(alertType: string, icon: string): TopAlert {
  return { alert_type: alertType, severity: 'warning', icon }
}

function plant(warnings: CareWarningOut[], alerts: TopAlert[]): MapPlant {
  return {
    id: 1,
    name: 'Lavender',
    species: null,
    species_common_name_nl: null,
    species_common_name_en: null,
    map_x: 0,
    map_y: 0,
    photo_path: null,
    container_id: null,
    ground_zone_id: null,
    display_radius_cm: null,
    care_status: 'good',
    temp_status: 'comfortable',
    most_urgent: null,
    sun_requirement: null,
    measured_sun_hours: null,
    plant_type: null,
    icon_key: null,
    species_id: null,
    phenology: null,
    is_locked: false,
    quantity: 1,
    top_alert: alerts[0] ?? null,
    alerts,
    top_warning: warnings[0] ?? null,
    warnings,
  }
}

describe('PlantMarker warning badges', () => {
  it('renders badges from unified care warnings instead of legacy alerts when warnings exist', () => {
    const p = plant([warning('water', '💧'), warning('heat_protect', '🔥')], [alert('legacy_prune', '✂️')])

    expect(markerBadgesForPlant(p).map(b => b.icon)).toEqual(['💧', '🔥'])
  })
})

describe('topMarkerBadge (canvas cap)', () => {
  it('returns only the single most-urgent badge even with several warnings', () => {
    const p = plant([warning('water', '💧'), warning('heat_protect', '🔥')], [])
    expect(topMarkerBadge(p)?.icon).toBe('💧')
  })

  it('returns null when there are no warnings', () => {
    expect(topMarkerBadge(plant([], []))).toBeNull()
  })
})

describe('plant warning halos', () => {
  it('uses the warning color when the map warnings toggle is enabled', () => {
    const p = plant([warning('water', '💧')], [])

    expect(plantMarkerHaloColor(p, 'indoor', true)).toBe('#FFC233')
  })

  it('hides free-standing plant halos when the map warnings toggle is disabled', () => {
    const p = plant([warning('water', '💧')], [])

    expect(plantMarkerHaloColor(p, 'indoor', false)).toBeNull()
  })

  it('hides contained plant halos when the map warnings toggle is disabled', () => {
    const p = { ...plant([warning('water', '💧')], []), container_id: 42 }

    expect(containedPlantHaloColor(p, false)).toBeNull()
  })
})
