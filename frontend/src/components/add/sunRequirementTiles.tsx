import type { ReactNode } from 'react'
import type { Translations } from '../../i18n/translations'
import { SUN_REQUIREMENT_IDS } from '../../utils/plantSunRequirements'
import TileIcon from '../ui/TileIcon'

/**
 * The Light row's tiles, shared by Add Plant and Edit Plant.
 *
 * One tile per `SUN_REQUIREMENT_IDS` value, in ascending light order, so the
 * control cannot produce a value the sun-fit engine does not understand. The
 * subtitles are hours of *direct sun*, which is what `PLANT_SUN_PROFILES`
 * actually compares against — the old lux ranges described the light meter
 * reading of a spot, while the value is stored as the plant's requirement.
 */
export function sunRequirementTiles(t: Translations): Array<{
  id: string
  title: string
  subtitle: string
  glyph: ReactNode
}> {
  const byId = {
    shade: {
      title: t.addPlant.lightShade,
      subtitle: t.addPlant.lightShadeSub,
      glyph: <TileIcon name="light-shade" />,
    },
    partial_sun: {
      title: t.addPlant.lightPartial,
      subtitle: t.addPlant.lightPartialSub,
      glyph: <TileIcon name="light-indirect" />,
    },
    full_sun: {
      title: t.addPlant.lightFullSun,
      subtitle: t.addPlant.lightFullSunSub,
      glyph: <TileIcon name="light-full" />,
    },
  }
  return SUN_REQUIREMENT_IDS.map(id => ({ id, ...byId[id] }))
}
