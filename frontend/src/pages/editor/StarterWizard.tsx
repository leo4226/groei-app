import { useState } from 'react'
import { useT } from '../../context/LanguageContext'
import CompassBearingPicker from '../../components/settings/CompassBearingPicker'
import {
  STARTER_TEMPLATES,
  STARTER_TEMPLATE_ORDER,
  buildTemplateZones,
  fitScalePxPerM,
  type StarterTemplateId,
  type TemplateRect,
} from '../../utils/starterTemplates'

export interface StarterWizardResult {
  rects: TemplateRect[]
  scalePxPerM: number
  bearing: number
  /** Garden GPS — drives the sun/shadow model. Undefined when the user skips. */
  lat?: number
  lon?: number
}

interface Props {
  /** Called on finish. `null` = "Draw my own" / dismiss → fall back to the
   *  blank-canvas + tour flow. */
  onComplete: (result: StarterWizardResult | null) => void
}

const STEP_ORDER = ['shape', 'size', 'orientation', 'location'] as const
type Step = (typeof STEP_ORDER)[number]
type GeoStatus = 'idle' | 'locating' | 'set' | 'error'

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 300,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
}

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)', borderRadius: 18,
  padding: '26px 22px 22px', width: '100%', maxWidth: 420,
  border: '1px solid var(--color-border)', boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
  maxHeight: '90vh', overflowY: 'auto',
}

const titleStyle: React.CSSProperties = {
  margin: '0 0 4px', fontFamily: 'var(--font-heading)', fontWeight: 500,
  fontSize: 21, color: 'var(--color-text)', letterSpacing: '-0.01em',
}

const subtitleStyle: React.CSSProperties = {
  margin: '0 0 20px', fontFamily: 'var(--font-body)', fontSize: 13,
  color: 'var(--color-text-muted)', lineHeight: 1.5,
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10,
  textTransform: 'uppercase', letterSpacing: '0.18em',
  color: 'var(--color-text-muted)', marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  border: '1px solid var(--color-border)', borderRadius: 10,
  padding: '10px 14px', fontSize: 15,
  background: 'var(--color-bg)', color: 'var(--color-text)',
  fontFamily: 'var(--font-body)', outline: 'none',
}

const primaryBtnStyle: React.CSSProperties = {
  flex: 1, padding: '12px 0', borderRadius: 10,
  background: 'var(--color-primary)', color: '#fff',
  fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
  border: 'none', cursor: 'pointer',
}

const ghostBtnStyle: React.CSSProperties = {
  padding: '12px 18px', borderRadius: 10,
  background: 'transparent', color: 'var(--color-text-muted)',
  fontFamily: 'var(--font-body)', fontSize: 15,
  border: '1px solid var(--color-border)', cursor: 'pointer',
}

const progressRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginBottom: 12,
}

const progressLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10,
  textTransform: 'uppercase', letterSpacing: '0.18em',
  color: 'var(--color-text-muted)',
}

const closeBtnStyle: React.CSSProperties = {
  width: 44, height: 44, marginRight: -12, marginTop: -12,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--color-text-muted)', fontSize: 17, lineHeight: 1,
}

// A miniature glyph of each starter shape so the picker reads at a glance.
function ShapePreview({ id }: { id: StarterTemplateId }) {
  const fill = 'var(--color-primary)'
  const faint = 'color-mix(in srgb, var(--color-primary) 22%, transparent)'
  return (
    <svg width={44} height={36} viewBox="0 0 44 36" aria-hidden="true">
      {id === 'rectangle' && <rect x={6} y={6} width={32} height={24} rx={2} fill={faint} stroke={fill} strokeWidth={1.5} />}
      {id === 'l_shape' && (
        <path d="M6 6 H22 V18 H38 V30 H6 Z" fill={faint} stroke={fill} strokeWidth={1.5} strokeLinejoin="round" />
      )}
      {id === 'balcony' && <rect x={4} y={14} width={36} height={8} rx={2} fill={faint} stroke={fill} strokeWidth={1.5} />}
      {id === 'blank' && (
        <rect x={6} y={6} width={32} height={24} rx={2} fill="none" stroke="var(--color-text-muted)" strokeWidth={1.5} strokeDasharray="3 3" />
      )}
    </svg>
  )
}

export default function StarterWizard({ onComplete }: Props) {
  const t = useT()
  const w = t.editor.wizard

  const [step, setStep] = useState<Step>('shape')
  const [templateId, setTemplateId] = useState<StarterTemplateId>('rectangle')
  const [widthM, setWidthM] = useState(String(STARTER_TEMPLATES.rectangle.defaultWidthM))
  const [depthM, setDepthM] = useState(String(STARTER_TEMPLATES.rectangle.defaultDepthM))
  const [bearing, setBearing] = useState(0)
  const [lat, setLat] = useState<number | null>(null)
  const [lon, setLon] = useState<number | null>(null)
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle')

  function requestLocation() {
    if (!navigator.geolocation) { setGeoStatus('error'); return }
    setGeoStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude)
        setLon(pos.coords.longitude)
        setGeoStatus('set')
      },
      () => setGeoStatus('error'),
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  const shapeMeta: { id: StarterTemplateId; label: string; hint: string }[] = STARTER_TEMPLATE_ORDER.map((id) => ({
    id,
    label: id === 'rectangle' ? w.shapeRectangle : id === 'l_shape' ? w.shapeLshape : id === 'balcony' ? w.shapeBalcony : w.shapeCustom,
    hint: id === 'rectangle' ? w.shapeRectangleHint : id === 'l_shape' ? w.shapeLshapeHint : id === 'balcony' ? w.shapeBalconyHint : w.shapeCustomHint,
  }))

  function pickShape(id: StarterTemplateId) {
    if (id === 'blank') { onComplete(null); return }
    setTemplateId(id)
    setWidthM(String(STARTER_TEMPLATES[id].defaultWidthM))
    setDepthM(String(STARTER_TEMPLATES[id].defaultDepthM))
    setStep('size')
  }

  function finish() {
    const wM = Math.max(0.5, parseFloat(widthM) || STARTER_TEMPLATES[templateId].defaultWidthM)
    const dM = Math.max(0.5, parseFloat(depthM) || STARTER_TEMPLATES[templateId].defaultDepthM)
    const scale = fitScalePxPerM(wM, dM)
    onComplete({
      rects: buildTemplateZones(templateId, wM, dM, scale),
      scalePxPerM: scale,
      bearing,
      lat: lat ?? undefined,
      lon: lon ?? undefined,
    })
  }

  // Every exit lands on the same place: a blank canvas plus the intro tour.
  const leave = () => onComplete(null)

  return (
    <div style={overlayStyle} onClick={leave}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        {/* Progress + a way out. Step 1 previously had neither: no back, no
            cancel, and the backdrop did nothing, so the only exits were
            picking a shape or picking "Draw my own". */}
        <div style={progressRowStyle}>
          <span style={progressLabelStyle}>
            {w.stepOf(STEP_ORDER.indexOf(step) + 1, STEP_ORDER.length)}
          </span>
          <button type="button" onClick={leave} aria-label={w.close} style={closeBtnStyle}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {step === 'shape' && (
          <>
            <h2 style={titleStyle}>{w.shapeTitle}</h2>
            <p style={subtitleStyle}>{w.shapeSubtitle}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {shapeMeta.map(({ id, label, hint }) => (
                <button
                  key={id}
                  onClick={() => pickShape(id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
                    padding: '14px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    border: `1px solid ${id === 'blank' ? 'var(--color-border)' : 'var(--color-border)'}`,
                    background: 'var(--color-bg)',
                  }}
                >
                  <ShapePreview id={id} />
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-text-muted)', lineHeight: 1.35 }}>{hint}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'size' && (
          <>
            <h2 style={titleStyle}>{w.sizeTitle}</h2>
            <p style={subtitleStyle}>{w.sizeSubtitle}</p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>{w.widthLabel}</label>
                <input
                  type="number" min="0.5" step="0.5" inputMode="decimal"
                  value={widthM} onChange={(e) => setWidthM(e.target.value)} style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>{w.depthLabel}</label>
                <input
                  type="number" min="0.5" step="0.5" inputMode="decimal"
                  value={depthM} onChange={(e) => setDepthM(e.target.value)} style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('orientation')} style={primaryBtnStyle}>{w.next}</button>
              <button onClick={() => setStep('shape')} style={ghostBtnStyle}>{w.back}</button>
            </div>
          </>
        )}

        {step === 'orientation' && (
          <>
            <h2 style={titleStyle}>{w.orientationTitle}</h2>
            <p style={subtitleStyle}>{w.orientationSubtitle}</p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
              <CompassBearingPicker value={bearing} onChange={setBearing} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('location')} style={primaryBtnStyle}>{w.next}</button>
              <button onClick={() => setStep('size')} style={ghostBtnStyle}>{w.back}</button>
            </div>
          </>
        )}

        {step === 'location' && (
          <>
            <h2 style={titleStyle}>{w.locationTitle}</h2>
            <p style={subtitleStyle}>{w.locationSubtitle}</p>
            <div style={{ marginBottom: 22 }}>
              <button
                type="button"
                onClick={requestLocation}
                disabled={geoStatus === 'locating'}
                style={{
                  ...primaryBtnStyle,
                  width: '100%',
                  background: geoStatus === 'set' ? 'var(--color-primary)' : 'var(--color-bg)',
                  color: geoStatus === 'set' ? '#fff' : 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  cursor: geoStatus === 'locating' ? 'default' : 'pointer',
                }}
              >
                {geoStatus === 'locating'
                  ? w.locating
                  : geoStatus === 'set'
                    ? `✓ ${w.locationSet}`
                    : w.useMyLocation}
              </button>
              {geoStatus === 'error' && (
                <p style={{ ...subtitleStyle, margin: '10px 0 0', color: 'var(--color-overdue)' }}>
                  {w.locationError}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={finish} style={primaryBtnStyle}>
                {geoStatus === 'set' ? w.finish : w.skip}
              </button>
              <button onClick={() => setStep('orientation')} style={ghostBtnStyle}>{w.back}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
