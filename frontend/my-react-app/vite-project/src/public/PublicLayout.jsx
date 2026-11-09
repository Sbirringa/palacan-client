import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { BRAND, SPETTRO, FONT, FONT_IMPORT, Wordmark, PalacanIcon, LanguageSwitcher, SfondoPalacan } from '../components/palacanBrand';
import { useTesti } from '../components/testiHome';

// ============================================================
// PUBLIC LAYOUT — cornice delle pagine pubbliche, nell'identita'
// PALACAN "Da ogni punto di vista": Abisso, Luce, spettro, Geist.
// Export e props invariati: default PublicLayout({ children,
// eyebrow, headerAction }), IconList, SectionDivider, FeatureSection.
// Navigazione in 5 lingue (inglese di default).
// ============================================================

const C = { testo: BRAND.luce, tenue: BRAND.nebbia, bordo: BRAND.linea, superficie: BRAND.grafite };

function useNav() {
  const { t } = useTesti();
  return {
    t,
    principale: [
      { label: t.nav.security, href: '/sicurezza' },
      { label: t.nav.technology, href: '/tecnologia' },
      { label: t.nav.openSource, href: '/open-source' },
      { label: t.nav.documents, href: '/documenti' },  // [palacan-v4b]
      { label: t.nav.ecosystem, href: '/ecosistema' },
      { label: t.nav.about, href: '/chi-siamo' },
      { label: t.nav.faq, href: '/faq' },
    ],
    legale: [
      { label: t.nav.privacy, href: '/privacy' },
      { label: t.nav.terms, href: '/termini' },
    ],
  };
}

// ------------------------------------------------------------ stili articolo
function Stili() {
  const B = BRAND;
  const X = ':not(.not-prose *)';
  return (
    <style>{`
      ${FONT_IMPORT}
      .pl-root ::selection { background: ${B.ghiaccio}; color: ${B.abisso}; }

      .pl-article { color: rgba(243,241,236,0.8); font-family: ${FONT}; font-weight: 300; font-size: 1.0625rem; line-height: 1.75; max-width: 50rem; }
      .pl-article > * + * { margin-top: 1.15em; }
      .pl-article h1 { font-weight: 300; color: ${B.luce}; font-size: clamp(2.5rem, 1.4rem + 4.2vw, 4.6rem); line-height: 1.02; letter-spacing: -0.045em; margin: 0 0 0.45em; text-wrap: balance; }
      .pl-article h1 + p { font-size: clamp(1.15rem, 1rem + 0.5vw, 1.35rem); line-height: 1.6; color: rgba(243,241,236,0.88); text-wrap: pretty; }
      .pl-article h2${X} { font-weight: 400; color: ${B.luce}; font-size: clamp(1.6rem, 1.2rem + 1.4vw, 2.3rem); line-height: 1.15; letter-spacing: -0.03em; margin-top: 2.6em; padding-top: 1.3em; border-top: 1px solid ${B.linea}; position: relative; }
      .pl-article h2${X}::before { content: ''; position: absolute; top: -1px; left: 0; width: 44px; height: 1px; background: ${SPETTRO}; }
      .pl-article h3${X} { font-weight: 500; color: ${B.luce}; font-size: 1.3rem; letter-spacing: -0.015em; margin-top: 2em; }
      .pl-article p${X}, .pl-article li${X} { color: rgba(243,241,236,0.76); }
      .pl-article strong, .pl-article b { color: ${B.luce}; font-weight: 500; }
      .pl-article a${X} { color: ${B.luce}; text-decoration: underline; text-decoration-color: rgba(157,180,255,0.55); text-underline-offset: 4px; text-decoration-thickness: 1px; transition: text-decoration-color .2s; }
      .pl-article a${X}:hover { text-decoration-color: ${B.ghiaccio}; }
      .pl-article ul${X} { list-style: none; padding-left: 0; }
      .pl-article ul${X} > li { position: relative; padding-left: 1.5em; }
      .pl-article ul${X} > li + li { margin-top: 0.55em; }
      .pl-article ul${X} > li::before { content: ''; position: absolute; left: 0.15em; top: 0.72em; width: 6px; height: 6px; border-radius: 6px; background: ${SPETTRO}; }
      .pl-article ol { padding-left: 1.3em; }
      .pl-article ol > li::marker { color: ${B.ghiaccio}; }
      .pl-article hr { border: 0; border-top: 1px solid ${B.linea}; margin: 3em 0; }
      .pl-article blockquote { margin-left: 0; padding: 0.2em 0 0.2em 1.4em; border-left: 1px solid ${B.ghiaccio}; color: ${B.luce}; font-size: 1.2em; line-height: 1.5; }
      .pl-article code { font-family: 'Geist Mono Variable', 'Geist Mono', ui-monospace, monospace; font-size: 0.88em; background: rgba(243,241,236,0.07); color: ${B.luce}; padding: 0.15em 0.4em; border-radius: 6px; }
      .pl-article pre { background: ${B.grafite}; box-shadow: inset 0 0 0 1px ${B.linea}; border-radius: 18px; padding: 1.2em 1.4em; overflow-x: auto; font-size: 0.9em; }
      .pl-article pre code { background: none; padding: 0; }
      .pl-article table { width: 100%; border-collapse: collapse; font-size: 0.95em; display: block; overflow-x: auto; }
      .pl-article th { text-align: left; color: ${B.luce}; font-weight: 500; border-bottom: 1px solid ${B.lineaForte}; padding: 0.7em 1em 0.7em 0; }
      .pl-article td { border-bottom: 1px solid ${B.linea}; padding: 0.7em 1em 0.7em 0; }
      .pl-article details { border-top: 1px solid ${B.linea}; padding: 1.1em 0; }
      .pl-article details:last-of-type { border-bottom: 1px solid ${B.linea}; }
      .pl-article summary { cursor: pointer; color: ${B.luce}; font-weight: 400; font-size: 1.15rem; list-style: none; display: flex; justify-content: space-between; gap: 1em; }
      .pl-article summary::-webkit-details-marker { display: none; }
      .pl-article summary::after { content: '+'; flex-shrink: 0; color: ${B.ghiaccio}; font-weight: 300; transition: transform .4s cubic-bezier(.16,1,.3,1); }
      .pl-article details[open] > summary::after { transform: rotate(45deg); }
      .pl-article details > *:not(summary) { margin-top: 0.8em; }

      /* compatibilita': colori dei vecchi temi scritti dentro le pagine */
      .pl-article [class*="text-[#1A1A1A]"], .pl-article [class*="text-[#292524]"], .pl-article [class*="text-[#3F3D3A]"],
      .pl-article [class*="text-black"], .pl-article [class*="text-gray-900"], .pl-article [class*="text-stone-900"] { color: ${B.luce} !important; }
      .pl-article [class*="text-[#4B5563]"], .pl-article [class*="text-[#6B7280]"], .pl-article [class*="text-gray-6"],
      .pl-article [class*="text-gray-7"], .pl-article [class*="text-stone-6"] { color: rgba(243,241,236,0.76) !important; }
      .pl-article [class*="text-[#9CA3AF]"], .pl-article [class*="text-gray-4"], .pl-article [class*="text-gray-5"] { color: ${B.nebbia} !important; }
      .pl-article [class*="text-[#0F766E]"], .pl-article [class*="text-[#0B5A54]"], .pl-article [class*="text-[#155E75]"], .pl-article [class*="text-teal-"] { color: ${B.ghiaccio} !important; }
      .pl-article [class*="bg-white"], .pl-article [class*="bg-[#F2F2F3]"], .pl-article [class*="bg-[#FAFAFA]"],
      .pl-article [class*="bg-gray-50"], .pl-article [class*="bg-gray-100"], .pl-article [class*="bg-stone-50"] { background-color: ${B.grafite} !important; }
      .pl-article [class*="bg-[#0F766E]"], .pl-article [class*="bg-teal-"] { background-color: ${B.luce} !important; color: ${B.abisso} !important; }
      .pl-article [class*="border-[#E4E4E7]"], .pl-article [class*="border-[#ECECEE]"], .pl-article [class*="border-gray-"], .pl-article [class*="border-[#0F766E]"] { border-color: ${B.linea} !important; }
      .pl-article [class*="shadow"] { box-shadow: none !important; }

      .pl-focus:focus-visible { outline: none; box-shadow: 0 0 0 1px ${B.luce}; }
    `}</style>
  );
}

// ------------------------------------------------------------ blocchi esportati
function Icona({ icon: Icon }) {
  if (!Icon) return null;
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: C.superficie, boxShadow: `inset 0 0 0 1px ${C.bordo}` }}>
      <Icon size={17} strokeWidth={1.6} style={{ color: BRAND.ghiaccio }} />
    </span>
  );
}

export function IconList({ items = [] }) {
  return (
    <div className="not-prose mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
      {items.map(({ icon, text }, i) => (
        <div key={i} className="flex items-start gap-4 pt-6" style={{ borderTop: `1px solid ${C.bordo}` }}>
          <Icona icon={icon} />
          <span className="pt-1.5 text-[15px] leading-relaxed" style={{ fontFamily: FONT, fontWeight: 300, color: 'rgba(243,241,236,0.82)' }}>{text}</span>
        </div>
      ))}
    </div>
  );
}

// accent resta accettato per compatibilita' (l'identita' ha un solo accento)
// eslint-disable-next-line no-unused-vars
export function SectionDivider({ eyebrow, title, description, accent }) {
  return (
    <div className="not-prose mb-8 mt-16 pt-10" style={{ borderTop: `1px solid ${C.bordo}`, fontFamily: FONT }}>
      {eyebrow && <span className="text-[11px] uppercase" style={{ color: C.tenue, letterSpacing: '0.2em' }}>{eyebrow}</span>}
      <h2 className="mt-4 max-w-3xl text-[28px] leading-[1.1] sm:text-[40px]" style={{ color: C.testo, letterSpacing: '-0.035em', fontWeight: 300 }}>{title}</h2>
      {description && <p className="mt-4 max-w-2xl text-base leading-relaxed sm:text-lg" style={{ color: C.tenue, fontWeight: 300 }}>{description}</p>}
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
export function FeatureSection({ icon, title, children, accent, noTopBorder = false }) {
  return (
    <div className={noTopBorder ? 'not-prose mt-2' : 'not-prose mt-16 pt-10'} style={{ borderTop: noTopBorder ? 'none' : `1px solid ${C.bordo}`, fontFamily: FONT }}>
      <div className="mb-5 flex items-center gap-4">
        <Icona icon={icon} />
        <h2 className="text-2xl leading-tight sm:text-[32px]" style={{ color: C.testo, letterSpacing: '-0.03em', fontWeight: 300 }}>{title}</h2>
      </div>
      <div className="space-y-4 text-[17px] leading-relaxed" style={{ color: 'rgba(243,241,236,0.78)', fontWeight: 300 }}>{children}</div>
    </div>
  );
}

// ------------------------------------------------------------ header
function NavCapsula({ voci }) {
  const [sopra, setSopra] = useState(null);
  return (
    <nav aria-label="Main" className="hidden lg:block">
      <ul className="flex items-center rounded-full p-1" onMouseLeave={() => setSopra(null)} style={{ background: 'rgba(243,241,236,0.03)', boxShadow: `inset 0 0 0 1px ${C.bordo}` }}>
        {voci.map((v) => (
          <li key={v.href} className="relative" onMouseEnter={() => setSopra(v.href)}>
            <NavLink to={v.href} onFocus={() => setSopra(v.href)} className="pl-focus relative block rounded-full px-4 py-2 text-[13.5px]" style={{ fontFamily: FONT }}>
              {({ isActive }) => (
                <>
                  {(sopra === v.href || (sopra === null && isActive)) && (
                    <motion.span
                      layoutId="pl-nav"
                      className="absolute inset-0 rounded-full"
                      style={{ background: isActive ? 'rgba(243,241,236,0.1)' : 'rgba(243,241,236,0.07)' }}
                      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                    />
                  )}
                  <span className="relative" style={{ color: isActive || sopra === v.href ? C.testo : C.tenue, transition: 'color .2s' }}>{v.label}</span>
                  {isActive && <span aria-hidden="true" className="absolute bottom-[4px] left-1/2 h-px w-4 -translate-x-1/2" style={{ background: SPETTRO }} />}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Header() {
  const { t, principale, legale } = useNav();
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  useEffect(() => setMenu(false), [location.pathname]);

  return (
    <header className="sticky top-0 z-[500]" style={{ background: 'rgba(5,6,11,0.72)', backdropFilter: 'blur(20px) saturate(140%)', WebkitBackdropFilter: 'blur(20px) saturate(140%)', borderBottom: `1px solid ${C.bordo}` }}>
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5 sm:px-8 lg:grid-cols-[1fr_auto_1fr]">
        <Link to="/" aria-label={`PALACAN — ${t.nav.home}`} className="pl-focus justify-self-start rounded">
          <Wordmark size={14} />
        </Link>
        <NavCapsula voci={principale} />
        <div className="flex items-center gap-2 justify-self-end">
          <LanguageSwitcher />
          <Link to="/" className="pl-focus hidden whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-medium sm:inline-flex" style={{ fontFamily: FONT, background: C.testo, color: BRAND.abisso }}>
            {t.nav.getStarted}
          </Link>
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-controls="pl-menu-mobile"
            aria-label={menu ? t.nav.menuClose : t.nav.menuOpen}
            className="pl-focus rounded-full p-2 lg:hidden"
            style={{ color: C.testo }}
          >
            {menu ? <X size={20} strokeWidth={1.6} /> : <Menu size={20} strokeWidth={1.6} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menu && (
          <motion.nav
            id="pl-menu-mobile"
            aria-label="Menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: [0.87, 0, 0.13, 1] }}
            className="overflow-hidden lg:hidden"
            style={{ borderTop: `1px solid ${C.bordo}` }}
          >
            <ul className="px-6 pb-6 pt-2">
              {[{ label: t.nav.home, href: '/' }, ...principale, ...legale].map((v) => (
                <li key={v.href} style={{ borderBottom: `1px solid ${C.bordo}` }}>
                  <NavLink to={v.href} end className="block py-3.5 text-xl" style={({ isActive }) => ({ fontFamily: FONT, fontWeight: 300, color: isActive ? BRAND.ghiaccio : C.testo, letterSpacing: '-0.01em' })}>
                    {v.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

// ------------------------------------------------------------ layout
export default function PublicLayout({ children, eyebrow, headerAction }) {
  const location = useLocation();
  const { t, principale, legale } = useNav();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="pl-root relative flex min-h-screen flex-col" style={{ fontFamily: FONT, background: 'transparent', color: C.testo, zIndex: 1 }}>
      <Stili />
      <style>{`html, body { background: ${BRAND.abisso}; }`}</style>
      {/* stesso ambiente della home: orizzonte basso e intensita' ridotta, perche' qui si legge */}
      <SfondoPalacan intensita={0.55} orizzonte={0.82} />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[700] focus:rounded-full focus:px-4 focus:py-2 focus:text-sm" style={{ background: C.testo, color: BRAND.abisso }}>
        {t.nav.skip}
      </a>

      <Header />

      <div className="relative flex-1 overflow-hidden">
        {/* una luce fredda dall'alto, come nell'ingresso della home */}
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-[560px] w-[1000px] -translate-x-1/2" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(157,180,255,0.07), transparent 65%)' }} />

        <main id="main-content" className="relative mx-auto w-full max-w-6xl px-6 pb-28 pt-14 sm:pt-20" tabIndex={-1}>
          {(eyebrow || headerAction) && (
            <div className="mb-8 flex flex-wrap items-center gap-4">
              {eyebrow && (
                <span className="flex items-center gap-2.5 text-[11px] uppercase" style={{ color: C.tenue, letterSpacing: '0.2em' }}>
                  <span style={{ width: 6, height: 6, borderRadius: 6, background: SPETTRO }} />
                  {eyebrow}
                </span>
              )}
              {headerAction}
            </div>
          )}

          <motion.article
            key={location.pathname}
            className="pl-article"
            initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.article>
        </main>
      </div>

      <footer className="px-6 py-14" style={{ borderTop: `1px solid ${C.bordo}` }}>
        <div className="mx-auto flex max-w-7xl flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-4">
            <PalacanIcon size={34} />
            <div className="flex flex-col gap-2">
              <Wordmark size={14} />
              <span className="text-sm" style={{ color: C.tenue, fontWeight: 300 }}>{t.footer.tagline}</span>
            </div>
          </div>
          <nav aria-label="Pages" className="grid grid-cols-2 gap-x-10 gap-y-2.5 text-sm sm:grid-cols-4">
            {[...principale, ...legale].map((v) => (
              <Link key={v.href} to={v.href} className="pl-focus rounded transition-colors hover:text-white" style={{ color: C.tenue }}>{v.label}</Link>
            ))}
          </nav>
        </div>
        <p className="mx-auto mt-12 max-w-7xl text-sm" style={{ color: C.tenue }}>© {new Date().getFullYear()} Palacan</p>
      </footer>
    </div>
  );
}
