import { describe, expect, it } from 'vitest'
import type { CareWarningOut, MapPlant, TopAlert } from '../../../types'
import { markerBadgesForPlant } from '../PlantMarker'

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
    plant_type: null,
    icon_key: null,
    species_id: null,
    phenology: null,
    is_locked: false,
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
