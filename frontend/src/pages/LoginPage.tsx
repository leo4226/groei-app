import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login, register, forgotPassword, saveToken } from '../api/auth'
import { household } from '../api/client'
import { useFloreren } from '../store/useFloreren'
import PageDecor from '../components/PageDecor'
import Glyph from '../components/ui/Glyph'
import { resolveIconUrl } from '../utils/icons'
import { DEMO_BIODIVERSITY, DEMO_SUGGESTIONS } from '../demo/demoGarden'

// This page is shown BEFORE there is an account language, so it cannot use the
// account-driven translation catalog (useT). It carries its own bilingual copy
// below, defaults to Dutch (all current users + the biodiversity content are
// Dutch), and offers an NL/EN toggle. The chosen language is passed to
// register/join so the new account starts in that language. (LoginPage remains
// the documented exception to the catalog rule — see CLAUDE.md § Languages.)
type Lang = 'nl' | 'en'

const LANG_KEY = 'floreren-landing-lang'

function initialLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'nl'
  } catch {
    return 'nl'
  }
}

interface FeatureCopy {
  no: string
  icon: string
  title: string
  text: string
}

interface LandingCopy {
  kicker: string
  heroTitle: string
  heroSubtitle: string
  heroProof: string
  primaryCta: string
  loginLink: string
  homeLink: string
  mobileTagline: string
  stampText: string
  features: readonly FeatureCopy[]
  signIn: string
  tabLogin: string
  tabRegister: string
  tabJoin: string
  yourName: string
  namePlaceholderRegister: string
  namePlaceholderJoin: string
  householdName: string
  optional: string
  householdPlaceholder: (name: string) => string
  householdDefault: string
  householdFallback: (name: string) => string
  uniqueNameHint: string
  inviteCode: string
  email: string
  password: string
  show: string
  hide: string
  forgotPassword: string
  forgotSentText: string
  backToLogin: string
  submitLogin: string
  submitRegister: string
  submitJoin: string
  submitForgot: string
  genericError: string
  previewKicker: string
  previewTitle: string
  previewText: string
  demoCta: string
  bioKicker: string
  bioTitle: string
  bioText: string
  scoreLabel: string
  bioSpecies: (n: number) => string
  bioNative: (n: number) => string
  bioDracht: (n: number) => string
  bioBees: (n: number) => string
  bloomLabel: string
  suggTitle: string
  badgeNative: string
  badgeStreek: string
  bioScope: string
  trustKicker: string
  trustTitle: string
  trustItems: readonly string[]
  tourCta: string
  tourIntro: string
}

const COPY: Record<Lang, LandingCopy> = {
  nl: {
    kicker: 'Veldgids & plantenzorg',
    heroTitle: 'Stop met gokken waar een plant moet staan.',
    heroSubtitle:
      'Een veldjournaal en tuinhulp. Herken planten, plan op zon en schaduw, en laat de biodiversiteit in je tuin floreren.',
    heroProof: 'Zie het licht door je tuin bewegen.',
    primaryCta: 'Maak een account',
    loginLink: 'Inloggen',
    homeLink: 'Terug naar Floreren',
    mobileTagline: 'Laat je tuin floreren',
    stampText: 'FLOREREN · VELDGIDS · PLANTENZORG ·',
    features: [
      {
        no: '01',
        icon: 'daisy',
        title: 'Herken',
        text: 'Fotografeer een plant en de veldscanner herkent hem in seconden. Elke vondst wordt een soortenkaart in je veldgids.',
      },
      {
        no: '02',
        icon: 'rosemary',
        title: 'Verzorg',
        text: 'Water-, voedings- en snoeiherinneringen, afgestemd op jouw tuin.',
      },
      {
        no: '03',
        icon: 'sunflower',
        title: 'Plaats',
        text: 'De zonnekaart toont per uur waar zon en schaduw vallen — zo vindt elke plant de juiste plek.',
      },
      {
        no: '04',
        icon: 'wildebloemen',
        title: 'Floreer',
        text: 'Advies over je bloeiboog en streekeigen planten, zodat bijen en vlinders het hele jaar voedsel vinden.',
      },
    ],
    signIn: 'Aanmelden',
    tabLogin: 'Inloggen',
    tabRegister: 'Registreren',
    tabJoin: 'Meedoen',
    yourName: 'Je naam',
    namePlaceholderRegister: 'Sam',
    namePlaceholderJoin: 'Lisbeth',
    householdName: 'Naam van je tuin',
    optional: '(optioneel)',
    householdPlaceholder: (name) => `Tuin van ${name}`,
    householdDefault: 'Mijn tuin',
    householdFallback: (name) => `Tuin van ${name}`,
    uniqueNameHint: 'Namen zijn uniek voor alle gebruikers — kies een naam die nog niet in gebruik is.',
    inviteCode: 'Uitnodigingscode',
    email: 'E-mail',
    password: 'Wachtwoord',
    show: 'Toon',
    hide: 'Verberg',
    forgotPassword: 'Wachtwoord vergeten?',
    forgotSentText: 'Kijk in je inbox. Als dat e-mailadres bekend is, is er een herstellink onderweg.',
    backToLogin: 'Terug naar inloggen',
    submitLogin: 'Inloggen',
    submitRegister: 'Account aanmaken',
    submitJoin: 'Tuin toetreden',
    submitForgot: 'Verstuur herstellink',
    genericError: 'Er ging iets mis',
    previewKicker: 'De zonnekaart',
    previewTitle: 'Zie je tuin in zon en schaduw',
    previewText:
      'Elke tuin heeft zijn eigen licht. Floreren berekent per uur waar zon en schaduw vallen — en laat zien waar elke plant het beste staat. Speel er zelf mee in de voorbeeldtuin.',
    demoCta: 'Bekijk de voorbeeldtuin',
    bioKicker: 'De biodiversiteitshulp',
    bioTitle: 'Weet wat je tuin voor bijen doet',
    bioText:
      'Floreren kent de bloeimaanden en de waarde voor bestuivers van je planten. Je ziet je bloeiboog, hoeveel wilde bijensoorten je tuin kan ondersteunen, en welke inheemse en streekeigen planten de gaten vullen.',
    scoreLabel: 'Biodiversiteit',
    bioSpecies: (n) => `${n} soorten`,
    bioNative: (n) => `${n} inheems`,
    bioDracht: (n) => `${n} bijenplanten (drachtplanten)`,
    bioBees: (n) => `Tot ${n} wilde bijensoorten kunnen hier terecht`,
    bloomLabel: 'Bloeimaanden voor bestuivers',
    suggTitle: 'Aanbevolen voor deze tuin',
    badgeNative: 'Inheems',
    badgeStreek: 'Streekeigen',
    bioScope: 'De biodiversiteitsgegevens en aanbevelingen zijn momenteel afgestemd op Nederland.',
    tourCta: 'Zo werkt het',
    tourIntro: 'Vier dingen die Floreren voor je tuin doet.',
    trustKicker: 'Op jouw voorwaarden',
    trustTitle: 'Vrij te gebruiken. Open om te blijven.',
    trustItems: [
      'Gratis te gebruiken',
      'Exporteer je gegevens wanneer je wilt',
      'Open source onder de AGPL-3.0-licentie',
    ],
  },
  en: {
    kicker: 'Field guide & plant care',
    heroTitle: 'Stop guessing where a plant should go.',
    heroSubtitle:
      'A field journal and plant-care companion. Identify plants, plan around sun and shade, and let your garden’s biodiversity flourish.',
    heroProof: 'Watch light move through your garden.',
    primaryCta: 'Create an account',
    loginLink: 'Log in',
    homeLink: 'Back to Floreren',
    mobileTagline: 'Let your garden flourish',
    stampText: 'FLOREREN · FIELD GUIDE · PLANT CARE ·',
    features: [
      {
        no: '01',
        icon: 'daisy',
        title: 'Identify',
        text: 'Photograph any plant and the field scanner names it in seconds. Every find becomes a specimen card in your field guide.',
      },
      {
        no: '02',
        icon: 'rosemary',
        title: 'Care',
        text: 'Watering, feeding and pruning reminders tuned to your own garden.',
      },
      {
        no: '03',
        icon: 'sunflower',
        title: 'Position',
        text: 'The sun heatmap shows where sun and shade fall hour by hour — so every plant finds the right spot.',
      },
      {
        no: '04',
        icon: 'wildebloemen',
        title: 'Flourish',
        text: 'Advice on your flowering arc (bloeiboog) and regional native plants, so bees and butterflies find food all year round.',
      },
    ],
    signIn: 'Sign in',
    tabLogin: 'Log in',
    tabRegister: 'Register',
    tabJoin: 'Join',
    yourName: 'Your name',
    namePlaceholderRegister: 'Sam',
    namePlaceholderJoin: 'Lisbeth',
    householdName: 'Household name',
    optional: '(optional)',
    householdPlaceholder: (name) => `${name}'s Garden`,
    householdDefault: 'My Garden',
    householdFallback: (name) => `${name}'s Garden`,
    uniqueNameHint: 'Names are unique across all users — pick one that is not taken yet.',
    inviteCode: 'Invite code',
    email: 'Email',
    password: 'Password',
    show: 'Show',
    hide: 'Hide',
    forgotPassword: 'Forgot password?',
    forgotSentText: 'Check your inbox. If that email is registered, a reset link is on its way.',
    backToLogin: 'Back to log in',
    submitLogin: 'Log in',
    submitRegister: 'Create account',
    submitJoin: 'Join garden',
    submitForgot: 'Send reset link',
    genericError: 'Something went wrong',
    previewKicker: 'The sun heatmap',
    previewTitle: 'See your garden in sun and shade',
    previewText:
      'Every garden has its own light. Floreren computes where sun and shade fall hour by hour — and shows where each plant thrives. Try it yourself in the example garden.',
    demoCta: 'Explore the example garden',
    bioKicker: 'The biodiversity helper',
    bioTitle: 'Know what your garden does for bees',
    bioText:
      'Floreren knows the flowering months and pollinator value of your plants. See your bloom arc, how many wild bee species your garden can support, and which native and regional plants fill the gaps.',
    scoreLabel: 'Biodiversity',
    bioSpecies: (n) => `${n} species`,
    bioNative: (n) => `${n} native`,
    bioDracht: (n) => `${n} bee forage plants`,
    bioBees: (n) => `Up to ${n} wild bee species can forage here`,
    bloomLabel: 'Pollinator bloom months',
    suggTitle: 'Recommended for this garden',
    badgeNative: 'Native',
    badgeStreek: 'Regional',
    bioScope: 'Biodiversity data and recommendations are currently tailored to the Netherlands.',
    tourCta: 'See how it works',
    tourIntro: 'Four things Floreren does for your garden.',
    trustKicker: 'On your terms',
    trustTitle: 'Free to use. Open to keep.',
    trustItems: [
      'Free to use',
      'Export your data whenever you want',
      'Open source under the AGPL-3.0 licence',
    ],
  },
}

const MRZ_LINE = 'V<FLO<<FIELD<GUIDE<<PLANT<CARE<<<<<<<<<<<<'

/** Faded circular herbarium stamp, echoing the specimen-card motif. */
function HerbariumStamp({ text, className }: { text: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      className={`motion-safe:animate-[spin_120s_linear_infinite] ${className ?? ''}`}
    >
      <defs>
        <path id="stamp-ring" d="M100,100 m-76,0 a76,76 0 1,1 152,0 a76,76 0 1,1 -152,0" fill="none" />
      </defs>
      <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="58" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 4" />
      <text fontSize="13" letterSpacing="5.5" fill="currentColor" style={{ fontFamily: 'var(--font-mono)' }}>
        <textPath href="#stamp-ring">{text}</textPath>
      </text>
    </svg>
  )
}

function SpecimenEntry({ f, compact }: { f: FeatureCopy; compact?: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <div
        className={`flex flex-none items-center justify-center rounded-full border border-border bg-surface shadow-[0_2px_8px_rgba(31,42,30,0.06)] ${compact ? 'h-11 w-11' : 'h-14 w-14'}`}
      >
        <img src={resolveIconUrl(f.icon)!} alt="" className={compact ? 'h-7 w-7' : 'h-9 w-9'} />
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="m-0 font-mono text-[9.5px] uppercase tracking-[0.2em] text-text-muted">
          № {f.no} · <span className="text-primary">{f.title}</span>
        </p>
        <p className={`m-0 mt-1 leading-[1.45] text-text-soft ${compact ? 'text-[12.5px]' : 'text-[13.5px]'}`}>
          {f.text}
        </p>
      </div>
    </div>
  )
}

/** `inline` places the toggle in a header row instead of floating it in the
 *  corner — the floating variant forced neighbouring links into an arbitrary
 *  right margin and left the two controls on different baselines. */
function LangToggle({ lang, onChange, inline = false }: { lang: Lang; onChange: (l: Lang) => void; inline?: boolean }) {
  return (
    <div className={`${inline ? 'relative' : 'absolute right-4 top-4 z-20'} flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5 font-mono text-[10px] uppercase tracking-[0.14em] shadow-[0_2px_8px_rgba(31,42,30,0.06)]`}>
      {(['nl', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={lang === l}
          className={`rounded-full px-2.5 py-1 transition-colors ${
            lang === l ? 'bg-primary text-bg' : 'bg-transparent text-text-soft hover:text-text'
          }`}
          style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

function useMotionAllowed() {
  const [motionAllowed, setMotionAllowed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setMotionAllowed(!media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  return motionAllowed
}

function SunProof({ motionAllowed, label }: { motionAllowed: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!motionAllowed || !el || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '160px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [motionAllowed])

  return (
    <div ref={ref} data-testid="landing-sun-proof" className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-[0_22px_56px_rgba(31,42,30,0.14)]">
      {motionAllowed && isVisible ? (
        <video
          src="/landing/sunmap-demo.mp4"
          poster="/landing/sunmap-demo-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          className="block h-auto w-full"
        />
      ) : (
        <img
          src="/landing/sunmap-demo-poster.jpg"
          alt=""
          width="700"
          height="1000"
          className="block h-auto w-full"
        />
      )}
      <p className="m-0 border-t border-border bg-surface px-4 py-3 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
        {label}
      </p>
    </div>
  )
}

// The hero art bleeds to the viewport edges, so the variant is chosen by the
// viewport's SHAPE rather than its width: the 9:16 plate (garden along the
// bottom) for portrait, the 16:9 plate (garden on the right) for landscape.
// A width breakpoint would hand a portrait desktop window the landscape plate
// and crop the garden away. object-position keeps the garden — not the empty
// paper the copy sits on — inside the crop.
const PORTRAIT_ART = '(max-aspect-ratio: 1/1)'

function HeroArtwork() {
  return (
    <picture aria-hidden="true" data-testid="landing-hero-art" className="absolute inset-0 block">
      <source media={PORTRAIT_ART} srcSet="/landing/botanical-sun-atlas-mobile.avif" type="image/avif" />
      <source media={PORTRAIT_ART} srcSet="/landing/botanical-sun-atlas-mobile.webp" type="image/webp" />
      <source srcSet="/landing/botanical-sun-atlas-desktop.avif" type="image/avif" />
      <source srcSet="/landing/botanical-sun-atlas-desktop.webp" type="image/webp" />
      <img
        src="/landing/botanical-sun-atlas-desktop.webp"
        alt=""
        width="1024"
        height="576"
        fetchPriority="high"
        decoding="async"
        className="block h-full w-full object-cover object-[50%_45%] [@media(max-aspect-ratio:1/1)]:object-bottom"
      />
    </picture>
  )
}

/** Paper wash over the artwork so the copy keeps its contrast at every crop:
 *  from the left in landscape, from the top in portrait — in both cases from
 *  the side the copy sits on. */
function HeroScrim() {
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 [@media(max-aspect-ratio:1/1)]:hidden"
        style={{ background: 'linear-gradient(100deg, #fffef9 0%, rgba(255,254,249,0.97) 30%, rgba(255,254,249,0.72) 45%, rgba(255,254,249,0.12) 62%, rgba(255,254,249,0) 74%)' }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 [@media(min-aspect-ratio:1/1)]:hidden"
        style={{ background: 'linear-gradient(180deg, #fffef9 0%, rgba(255,254,249,0.99) 40%, rgba(255,254,249,0.72) 54%, rgba(255,254,249,0.06) 70%)' }}
      />
      {/* Portrait only: the copy runs to the top and the tour link sits at the
          bottom, so the plate needs paper at both ends and garden in between. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-36 [@media(min-aspect-ratio:1/1)]:hidden"
        style={{ background: 'linear-gradient(0deg, #fffef9 0%, rgba(255,254,249,0.72) 45%, rgba(255,254,249,0) 100%)' }}
      />
    </>
  )
}

function LandingProofSections({ t, lang, motionAllowed }: { t: LandingCopy; lang: Lang; motionAllowed: boolean }) {
  return (
    <>
      <section id="product-preview" className="mx-auto w-full max-w-[1024px] scroll-mt-6 px-5 py-20">
        <div className="grid gap-16 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <p className="m-0 mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
              {t.previewKicker}
            </p>
            <h2 className="m-0 font-heading text-[28px] font-medium leading-[1.12] tracking-[-0.01em] text-primary">
              {t.previewTitle}
            </h2>
            <p className="mt-3 max-w-[420px] text-[15px] leading-[1.6] text-text-soft">
              {t.previewText}
            </p>
            <div className="mt-6 w-full max-w-[320px]">
              <SunProof motionAllowed={motionAllowed} label={t.heroProof} />
            </div>
            <div className="mt-auto flex flex-col items-center pt-6 lg:items-start">
              <Link
                to="/demo"
                data-testid="landing-demo-cta"
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-bg shadow-md transition-transform active:scale-95"
              >
                {t.demoCta}
              </Link>
            </div>
          </div>

          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <p className="m-0 mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
              {t.bioKicker}
            </p>
            <h2 className="m-0 font-heading text-[28px] font-medium leading-[1.12] tracking-[-0.01em] text-primary">
              {t.bioTitle}
            </h2>
            <p className="mt-3 max-w-[420px] text-[15px] leading-[1.6] text-text-soft">
              {t.bioText}
            </p>
            <p className="m-0 mt-3 max-w-[420px] text-[12px] leading-[1.5] text-text-muted">
              {t.bioScope}
            </p>
            <div className="mt-6 flex w-full max-w-[320px] flex-col gap-3">
              <div className="rounded-2xl border border-border bg-surface p-4 shadow-[0_18px_50px_rgba(31,42,30,0.10)]">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-text">{t.scoreLabel}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-bold text-primary">{DEMO_BIODIVERSITY.score}</span>
                </div>
                <p className="m-0 mt-1.5 text-[12px] leading-[1.5] text-text-soft">
                  {t.bioSpecies(DEMO_BIODIVERSITY.speciesCount)} · {t.bioNative(DEMO_BIODIVERSITY.nativeCount)}
                </p>
                <p className="m-0 text-[12px] leading-[1.5] text-text-soft">
                  {t.bioDracht(DEMO_BIODIVERSITY.drachtplantCount)}
                </p>
                <p className="m-0 mt-1 text-[12px] font-medium leading-[1.5] text-primary">
                  {t.bioBees(DEMO_BIODIVERSITY.beeSpecies)}
                </p>
                <div className="mt-2.5">
                  <p className="m-0 mb-1 text-[10px] uppercase tracking-wide text-text-muted">{t.bloomLabel}</p>
                  <div className="flex h-8 items-end gap-[3px]">
                    {DEMO_BIODIVERSITY.bloomMonths.map((v, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${v > 0 ? 'bg-primary/70' : 'bg-border'}`}
                        style={{ height: `${Math.max(9, (v / Math.max(...DEMO_BIODIVERSITY.bloomMonths)) * 100)}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-4 shadow-[0_18px_50px_rgba(31,42,30,0.10)]">
                <p className="m-0 mb-2.5 text-[13px] font-semibold text-text">{t.suggTitle}</p>
                <div className="flex flex-col gap-2.5">
                  {DEMO_SUGGESTIONS.map((s) => (
                    <div key={s.icon} className="flex items-start gap-2.5">
                      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-border bg-bg">
                        <img src={resolveIconUrl(s.icon)!} alt="" className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 text-[12.5px] font-semibold leading-tight text-text">
                          {lang === 'nl' ? s.name_nl : s.name_en}{' '}
                          <span className={`ml-1 inline-block rounded-full px-1.5 py-px align-[1px] text-[9px] font-bold uppercase tracking-wide ${s.badge === 'native' ? 'bg-primary/10 text-primary' : 'bg-amber-400/25 text-amber-800'}`}>
                            {s.badge === 'native' ? t.badgeNative : t.badgeStreek}
                          </span>
                        </p>
                        <p className="m-0 mt-0.5 text-[11.5px] leading-[1.45] text-text-soft">
                          {lang === 'nl' ? s.reason_nl : s.reason_en}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface/70 px-5 py-16">
        <div className="mx-auto max-w-[840px] text-center">
          <p className="m-0 font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">{t.trustKicker}</p>
          <h2 className="m-0 mt-3 font-heading text-[clamp(30px,4vw,46px)] font-medium leading-[1.02] text-primary">{t.trustTitle}</h2>
          <ul className="m-0 mt-8 grid list-none gap-3 p-0 text-left sm:grid-cols-3">
            {t.trustItems.map((item) => (
              <li key={item} className="rounded-2xl border border-border bg-bg/70 px-4 py-4 text-sm leading-[1.45] text-text-soft">
                {item}
              </li>
            ))}
          </ul>
          <Link
            to="/login?mode=register"
            className="mt-8 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-bg shadow-md transition-transform active:scale-95"
          >
            {t.primaryCta}
          </Link>
        </div>
      </section>
    </>
  )
}

/**
 * The public homepage is deliberately ONE screen: full-bleed artwork, the
 * promise, and the two ways in (account / demo garden). Everything that used
 * to stack below it — the four steps, the sun + biodiversity proof, the trust
 * block — now lives one click away on /tour, so the first thing a visitor
 * sees is a composition rather than the top of a scroll.
 */
function PublicHome({ t, lang, onChangeLanguage }: { t: LandingCopy; lang: Lang; onChangeLanguage: (lang: Lang) => void }) {
  return (
    // min-h-dvh (not h-dvh): one screen by design, but short landscape windows
    // grow rather than clip the copy.
    <div className="landing-focus relative flex min-h-dvh flex-col overflow-hidden bg-[#fffef9]">
      <HeroArtwork />
      <HeroScrim />
      {/* Plate mark: a delicate inset rule, the way a botanical print is framed */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-3 z-10 rounded-[6px] border border-[#8a9482]/25 sm:inset-5" />

      <header className="relative z-20 flex w-full items-center gap-3 px-7 pt-7 sm:px-10 sm:pt-9">
        <Link to="/" className="font-heading text-[24px] font-medium tracking-[-0.02em] text-[#2F5D3A]">Floreren.</Link>
        {/* Paper chip: top-right sits over foliage, where bare text would vanish */}
        <Link
          to="/login"
          className="ml-auto rounded-full border border-[#8a9482]/40 bg-[#fffef9]/85 px-4 py-1.5 text-sm font-semibold text-[#2F5D3A] shadow-[0_2px_8px_rgba(31,42,30,0.06)] backdrop-blur-sm"
        >
          {t.loginLink}
        </Link>
        <LangToggle lang={lang} onChange={onChangeLanguage} inline />
      </header>

      {/* Landscape: copy sits beside the garden, optically centred. Portrait:
          the plate's paper is at the TOP, so the copy anchors there instead. */}
      <main className="relative z-10 flex flex-1 items-center px-7 sm:px-10 [@media(max-aspect-ratio:1/1)]:items-start [@media(max-aspect-ratio:1/1)]:pt-6">
        <div className="w-full max-w-[560px] py-6">
          <p className="m-0 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#5a6553]">
            <span className="h-px w-7 flex-none bg-[#8a9482]" />
            {t.kicker}
          </p>
          <h1 className="m-0 mt-4 font-heading text-[clamp(34px,6.6vw,64px)] font-medium leading-[0.98] tracking-[-0.035em] text-[#2F5D3A]">
            {t.heroTitle}
          </h1>
          <p className="mb-0 mt-5 max-w-[460px] text-[15px] leading-[1.55] text-[#43503e] sm:text-[16px]">
            {t.heroSubtitle}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/login?mode=register"
              data-testid="landing-primary-cta"
              className="rounded-full bg-[#2F5D3A] px-6 py-3 text-sm font-semibold text-[#fffef9] shadow-md transition-transform active:scale-95"
            >
              {t.primaryCta}
            </Link>
            <Link
              to="/demo"
              data-testid="landing-demo-cta"
              className="rounded-full border border-[#8a9482] bg-[#fffef9]/80 px-5 py-3 text-sm font-semibold text-[#2F5D3A] backdrop-blur-sm transition-transform active:scale-95"
            >
              {t.demoCta}
            </Link>
          </div>
        </div>
      </main>

      {/* The rest of the story is a click, not a scroll */}
      <footer className="relative z-10 px-7 pb-8 sm:px-10 sm:pb-10">
        <Link
          to="/tour"
          data-testid="landing-tour-link"
          className="group inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#5a6553] transition-colors hover:text-[#2F5D3A]"
        >
          <span className="h-px w-7 flex-none bg-[#8a9482] transition-all group-hover:w-10" />
          {t.tourCta}
        </Link>
      </footer>
    </div>
  )
}

/** /tour — the long-form counterpart to the one-screen homepage. */
export function LandingTour() {
  const [lang, setLang] = useState<Lang>(initialLang)
  const motionAllowed = useMotionAllowed()
  const t = COPY[lang]

  function changeLang(l: Lang) {
    setLang(l)
    try {
      localStorage.setItem(LANG_KEY, l)
      localStorage.setItem('floreren_lang', l)
    } catch { /* private mode — ignore */ }
  }

  return (
    <div className="landing-focus relative min-h-dvh overflow-hidden">
      <PageDecor variant="sparse" />

      <header className="relative z-20 mx-auto flex w-full max-w-[1024px] items-center gap-3 px-5 pt-5">
        <Link to="/" className="font-heading text-[24px] font-medium tracking-[-0.02em] text-primary">Floreren.</Link>
        <Link to="/login" className="ml-auto text-sm font-semibold text-primary underline-offset-4 hover:underline">
          {t.loginLink}
        </Link>
        <LangToggle lang={lang} onChange={changeLang} inline />
      </header>

      <section className="relative z-10 mx-auto w-full max-w-[1024px] px-5 pb-4 pt-12">
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">{t.tourCta}</p>
        <h1 className="m-0 mt-3 max-w-[720px] font-heading text-[clamp(30px,4.4vw,46px)] font-medium leading-[1.04] tracking-[-0.02em] text-primary">
          {t.tourIntro}
        </h1>
        <div className="mt-10 grid gap-x-10 gap-y-8 border-t border-border pt-10 md:grid-cols-2">
          {t.features.map((f) => <SpecimenEntry key={f.no} f={f} />)}
        </div>
      </section>

      <div className="relative z-10">
        <LandingProofSections t={t} lang={lang} motionAllowed={motionAllowed} />
      </div>
    </div>
  )
}

export default function LoginPage({ publicHome = false }: { publicHome?: boolean }) {
  const [lang, setLang] = useState<Lang>(initialLang)
  // ?mode=register opens the register tab directly (the demo garden's
  // "create your own garden" CTA links here).
  const [mode, setMode] = useState<'login' | 'register' | 'join' | 'forgot'>(() =>
    new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'login',
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const navigate = useNavigate()

  const t = COPY[lang]

  function changeLang(l: Lang) {
    setLang(l)
    try {
      localStorage.setItem(LANG_KEY, l)
      // Keep the app-wide pre-auth language (LanguageContext) in sync so the
      // public demo garden follows the language chosen here.
      localStorage.setItem('floreren_lang', l)
    } catch {
      // ignore storage failures (private mode)
    }
  }

  if (publicHome) {
    return <PublicHome t={t} lang={lang} onChangeLanguage={changeLang} />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await login(email, password)
        saveToken(res.token)
        useFloreren.getState().resetForNewSession()
        navigate('/maps', { replace: true })
      } else if (mode === 'register') {
        const hName = householdName.trim() || t.householdFallback(name.trim())
        const res = await register(email, password, name, hName, lang)
        saveToken(res.token)
        useFloreren.getState().resetForNewSession()
        navigate('/maps', { replace: true })
      } else if (mode === 'join') {
        const res = await household.join({ code: code.toUpperCase().trim(), email, password, name, language: lang })
        saveToken(res.token)
        useFloreren.getState().resetForNewSession()
        navigate('/maps', { replace: true })
      } else {
        await forgotPassword(email)
        setForgotSent(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.genericError)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    fontSize: '0.95rem',
    color: 'var(--color-text)',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--color-text-soft)',
    marginBottom: '6px',
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* Botanical garden-bed decor + a calm wash behind the content */}
      <PageDecor variant="landing" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'radial-gradient(ellipse 60% 44% at 50% 50%, var(--color-bg) 12%, transparent 72%)' }}
      />

      <LangToggle lang={lang} onChange={changeLang} />
      <Link to="/" className="absolute left-4 top-4 z-20 text-sm font-semibold text-primary underline-offset-4 hover:underline">
        {t.homeLink}
      </Link>

      <div className="relative z-10 mx-auto flex min-h-[80dvh] w-full max-w-[1060px] flex-col items-center justify-center gap-8 px-5 py-10 lg:flex-row lg:items-center lg:gap-20">
        {/* ── Left: field-guide cover hero (desktop) ── */}
        <section className="relative hidden max-w-[520px] flex-1 lg:block">
          <HerbariumStamp text={t.stampText} className="absolute -left-16 -top-24 h-52 w-52 text-primary opacity-[0.07]" />

          <p className="relative m-0 mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
            <span className="h-px w-7 flex-none bg-border" />
            {t.kicker}
            <span className="h-px min-w-[24px] max-w-[70px] flex-1 bg-border" />
          </p>

          <h1 className="relative m-0 font-heading text-[clamp(52px,6.5vw,76px)] font-medium leading-[0.98] tracking-[-0.02em] text-primary">
            Floreren<span className="text-text">.</span>
          </h1>

          <p className="relative mt-4 max-w-[440px] font-heading text-[16px] italic leading-[1.55] text-text-soft">
            {t.heroSubtitle}
          </p>

          <div className="relative mt-9 flex flex-col gap-5">
            {t.features.map((f) => (
              <SpecimenEntry key={f.no} f={f} />
            ))}
          </div>

          <p
            aria-hidden="true"
            className="relative m-0 mt-9 overflow-hidden whitespace-nowrap border-t border-dashed border-border pt-4 font-mono text-[11px] tracking-[0.24em] text-text-muted opacity-50"
          >
            {MRZ_LINE}
          </p>
        </section>

        {/* ── Right: auth column ── */}
        <div className="w-full max-w-[380px] flex-none">
          {/* Brand block (mobile shows the full tagline here) */}
          <div className="mb-7 text-center lg:hidden">
            <h1 className="m-0 font-heading text-[44px] font-medium leading-none tracking-[-0.02em] text-primary">
              Floreren
            </h1>
            <p className="m-0 mt-2 font-heading text-[15px] italic text-text-soft">
              {t.mobileTagline}
            </p>
            <p className="m-0 mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
              {t.kicker}
            </p>
          </div>

          <div id="auth-card" className="rounded-[18px] border border-border bg-surface p-6 shadow-[0_18px_50px_rgba(31,42,30,0.10)]">
            <p className="m-0 mb-5 flex items-center gap-2.5 font-mono text-[9.5px] uppercase tracking-[0.22em] text-text-muted">
              <span className="h-px flex-1 bg-border" />
              {t.signIn}
              <span className="h-px flex-1 bg-border" />
            </p>

            {/* Mode toggle — only login/register, not forgot */}
            {mode !== 'forgot' && (
              <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: '8px', padding: '3px', marginBottom: '22px' }}>
                {(['login', 'register', 'join'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMode(m); setError(null); setForgotSent(false) }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: mode === m ? 'var(--color-surface)' : 'transparent',
                      color: mode === m ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      fontWeight: mode === m ? 600 : 400,
                      fontSize: '0.875rem',
                      boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all 0.15s ease',
                      fontFamily: 'inherit',
                    }}
                  >
                    {m === 'login' ? t.tabLogin : m === 'register' ? t.tabRegister : t.tabJoin}
                  </button>
                ))}
              </div>
            )}

            {mode === 'forgot' && forgotSent ? (
              /* Success state — no form */
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <p style={{ color: 'var(--color-text)', fontSize: '0.95rem', lineHeight: 1.5, margin: '0 0 20px' }}>
                  {t.forgotSentText}
                </p>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); setForgotSent(false) }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                  }}
                >
                  <Glyph name="arrow-left" size={14} className="inline-block align-[-2px] mr-1" />
                  {t.backToLogin}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {mode === 'register' && (
                  <>
                    <div>
                      <label htmlFor="register-name" style={labelStyle}>{t.yourName}</label>
                      <input
                        id="register-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder={t.namePlaceholderRegister}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label htmlFor="register-household" style={labelStyle}>
                        {t.householdName}{' '}
                        <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>{t.optional}</span>
                      </label>
                      <input
                        id="register-household"
                        type="text"
                        value={householdName}
                        onChange={(e) => setHouseholdName(e.target.value)}
                        placeholder={name ? t.householdPlaceholder(name) : t.householdDefault}
                        style={inputStyle}
                      />
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: '-4px 0 0', lineHeight: 1.4, display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                      <Glyph name="alert" size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>{t.uniqueNameHint}</span>
                    </p>
                  </>
                )}
                {mode === 'join' && (
                  <>
                    <div>
                      <label htmlFor="join-code" style={labelStyle}>{t.inviteCode}</label>
                      <input
                        id="join-code"
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        required
                        placeholder="A3K9XZ"
                        style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div>
                      <label htmlFor="join-name" style={labelStyle}>{t.yourName}</label>
                      <input
                        id="join-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder={t.namePlaceholderJoin}
                        style={inputStyle}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="auth-email" style={labelStyle}>{t.email}</label>
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    style={inputStyle}
                  />
                </div>

                {mode !== 'forgot' && (
                  <div>
                    <label htmlFor="auth-password" style={labelStyle}>{t.password}</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        style={{ ...inputStyle, paddingRight: '48px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '4px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '6px 10px',
                          fontSize: '0.8rem',
                          color: 'var(--color-text-muted)',
                          fontFamily: 'inherit',
                        }}
                      >
                        {showPassword ? t.hide : t.show}
                      </button>
                    </div>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => { setMode('forgot'); setError(null); setEmail(''); setPassword('') }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-primary)',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          padding: '6px 0 0',
                          fontFamily: 'inherit',
                          fontWeight: 500,
                        }}
                      >
                        {t.forgotPassword}
                      </button>
                    )}
                  </div>
                )}

                {error && (
                  <p style={{ color: 'var(--color-overdue)', fontSize: '0.85rem', margin: 0 }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'var(--color-primary)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                    fontFamily: 'inherit',
                    marginTop: '4px',
                  }}
                >
                  {loading ? '…' : mode === 'login' ? t.submitLogin : mode === 'register' ? t.submitRegister : mode === 'join' ? t.submitJoin : t.submitForgot}
                </button>

                {mode === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setError(null) }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-primary)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontFamily: 'inherit',
                    }}
                  >
                    <Glyph name="arrow-left" size={14} className="inline-block align-[-2px] mr-1" />
                    {t.backToLogin}
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
