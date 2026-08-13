import type { Translations } from '../../i18n/translations'
import Glyph from '../ui/Glyph'
import FormRow from '../ui/FormRow'
import TileGrid from '../ui/TileGrid'
import TileIcon from '../ui/TileIcon'
import ChipCluster from '../ui/ChipCluster'

export interface PotDetails {
  potMaterial: string
  potDiameter: string
  potHeight: string
  hasDrainage: boolean
  substrate: string[]
}

interface PotDetailsFieldsProps {
  t: Translations
  value: PotDetails
  onChange: (patch: Partial<PotDetails>) => void
}

/**
 * The Pot + Substrate rows, shared by Add Plant and Edit Plant.
 *
 * Add Plant has collected these since #823; the edit form never offered them,
 * so a repotting could be recorded as a date but the pot itself could never be
 * corrected — write-once data with no correction path (#886). Sharing the
 * markup keeps the two forms from drifting the way the Light row did.
 */
export default function PotDetailsFields({ t, value, onChange }: PotDetailsFieldsProps) {
  return (
    <>
      <FormRow label={t.addPlant.labelPot} description={t.addPlant.labelPotDesc}>
        <TileGrid
          options={[
            { id: 'terracotta', title: t.addPlant.potTerracotta, subtitle: t.addPlant.potTerracottaSub, glyph: <TileIcon name="pot-terracotta" /> },
            { id: 'plastic', title: t.addPlant.potPlastic, subtitle: t.addPlant.potPlasticSub, glyph: <TileIcon name="pot-plastic" /> },
            { id: 'ceramic', title: t.addPlant.potCeramic, subtitle: t.addPlant.potCeramicSub, glyph: <TileIcon name="pot-ceramic" /> },
            { id: 'basket', title: t.addPlant.potBasket, subtitle: t.addPlant.potBasketSub, glyph: <TileIcon name="pot-basket" /> },
          ]}
          value={value.potMaterial}
          onChange={(id) => onChange({ potMaterial: id })}
        />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t.addPlant.labelPotDiameter}</label>
            <input
              type="number"
              value={value.potDiameter || ''}
              onChange={(e) => onChange({ potDiameter: e.target.value })}
              placeholder="⌀ 18"
              className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t.addPlant.labelPotHeight}</label>
            <input
              type="number"
              value={value.potHeight || ''}
              onChange={(e) => onChange({ potHeight: e.target.value })}
              placeholder="↑ 22"
              className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-mono text-sm"
            />
          </div>
        </div>
        <label className="inline-flex items-center gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={value.hasDrainage}
            onChange={(e) => onChange({ hasDrainage: e.target.checked })}
            className="sr-only peer"
          />
          <span className="font-heading text-sm rounded-full border px-3 py-1.5 peer-checked:bg-primary/10 peer-checked:border-primary peer-checked:text-primary bg-paper border-border text-text-soft transition-all inline-flex items-center gap-1">
            {value.hasDrainage && <Glyph name="check" size={13} />}{t.addPlant.labelDrainageYes}
          </span>
        </label>
      </FormRow>

      <FormRow
        label={t.addPlant.labelSubstrate}
        description={t.addPlant.labelSubstrateDesc}
        help={t.addPlant.substrateHelp}
      >
        <ChipCluster
          options={t.addPlant.substrateOptions}
          selected={value.substrate}
          onChange={(next) => onChange({ substrate: next })}
        />
      </FormRow>
    </>
  )
}
