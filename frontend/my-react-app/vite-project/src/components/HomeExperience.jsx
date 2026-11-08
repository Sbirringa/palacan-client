import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import Lenis from 'lenis';
import { ArrowUp } from 'lucide-react';
import { BRAND, SPETTRO, FONT, FONT_MONO, FragmentHero, FragmentText, FragmentCluster, PalacanIcon, PalacanLoader, Wordmark } from './palacanBrand';
import { useTesti } from './testiHome';

// ScrollTrigger usa window.matchMedia: lo registriamo solo dove esiste (browser veri).
// In ambienti senza (jsdom nei test, browser molto vecchi) la home funziona senza animazioni di scorrimento.
const PUO_ANIMARE_SCORRIMENTO = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
if (PUO_ANIMARE_SCORRIMENTO) gsap.registerPlugin(ScrollTrigger);

// ============================================================
// PALACAN — esperienza della home, identita' "Da ogni punto di vista".
// Gli export hanno gli stessi nomi di prima: chi li importa riceve la
// nuova identita' senza modifiche.
// ============================================================

const INK = BRAND.abisso;
const INK_SOFT = BRAND.luce;
const ACCENT = BRAND.azione;
const FONT_DISPLAY = { fontFamily: FONT };
const FONT_BODY = { fontFamily: FONT };

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// ------------------------------------------------------------ scroll
function useLenisScroll() {
  useEffect(() => {
    if (!PUO_ANIMARE_SCORRIMENTO) return undefined;
    const lenis = new Lenis({ duration: 1.1, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    const onTick = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);
    // se si apre un pannello o una finestra sopra la home (accesso, passphrase...), la home si ferma
    const PANNELLI = '[data-lenis-prevent].fixed, [role="dialog"]';
    const controlla = () => {
      if (document.querySelector(PANNELLI)) lenis.stop();
      else lenis.start();
    };
    const osservatore = new MutationObserver(controlla);
    osservatore.observe(document.body, { childList: true, subtree: true });
    return () => {
      osservatore.disconnect();
      gsap.ticker.remove(onTick);
      lenis.destroy();
    };
  }, []);
}

// Rivelazione = messa a fuoco: gli elementi arrivano da una leggera
// sfocatura, come i frammenti che si allineano.
function useScrollDrivenReveals() {
  useEffect(() => {
    if (!PUO_ANIMARE_SCORRIMENTO) return undefined;
    const tweens = gsap.utils.toArray('.ct-scroll-reveal').map((el) =>
      gsap.fromTo(
        el,
        { opacity: 0, y: 24, filter: 'blur(8px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', ease: 'none', scrollTrigger: { trigger: el, start: 'top 90%', end: 'top 60%', scrub: 0.6 } }
      )
    );
    return () => tweens.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
  }, []);
}

// Il cursore personalizzato resta disattivato (export mantenuto).
function ReactiveCursor() {
  return null;
}

// ------------------------------------------------------------ pulsante
function MagneticButton({ children, onClick, disabled, primary }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const onMove = useCallback((e) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    gsap.to(ref.current, { x: (e.clientX - (r.left + r.width / 2)) * 0.14, y: (e.clientY - (r.top + r.height / 2)) * 0.14, duration: 0.3, ease: 'power2.out' });
  }, [reduce]);
  const onLeave = useCallback(() => gsap.to(ref.current, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.45)' }), []);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="group relative inline-flex items-center justify-center whitespace-nowrap rounded-full px-7 py-3.5 text-[15px] font-medium outline-none transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        fontFamily: FONT,
        letterSpacing: '0.005em',
        '--tw-ring-color': BRAND.luce,
        '--tw-ring-offset-color': BRAND.abisso,
        ...(primary
          ? { background: BRAND.luce, color: BRAND.abisso }
          : { background: 'transparent', color: BRAND.luce, boxShadow: `inset 0 0 0 1px ${BRAND.lineaForte}` }),
      }}
    >
      {primary && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[2px] -z-10 rounded-full opacity-0 blur-[10px] transition-opacity duration-500 group-hover:opacity-70"
          style={{ background: SPETTRO }}
        />
      )}
      {children}
    </button>
  );
}

// ------------------------------------------------------------ hero (il marchio)
function InteractiveHero({ onEnter, mostraContenuto = true, children }) {
  const { t } = useTesti();
  void onEnter;
  return (
    <FragmentHero titolo={t.hero.tagline} sottotitolo={t.hero.sub} suggerimento={t.hero.hint} etichettaRivedi={t.hero.replay}>
      {mostraContenuto ? children : null}
    </FragmentHero>
  );
}

// ------------------------------------------------------------ simboli (stesse firme)
function BrandEmblem({ size = 56 }) {
  return <PalacanIcon size={size} title="Palacan" />;
}

function VerificationSeal({ size = 90, verified = false }) {
  return (
    <motion.span style={{ display: 'inline-block', lineHeight: 0 }} animate={{ scale: verified ? [1, 1.06, 1] : 1 }} transition={{ duration: 0.6 }}>
      <PalacanIcon size={size} stato={verified ? 'allineato' : 'disperso'} title={verified ? 'Verified' : 'Not verified'} />
    </motion.span>
  );
}

function RatchetSymbol({ size = 100 }) {
  return <PalacanLoader size={size} />;
}

// ============================================================
// I DUE TELEFONI — il messaggio esce cifrato, attraversa il server
// come nuvola di frammenti e si ricompone nella bolla di chi lo riceve.
// Sequenziale: ogni tappa parte solo quando la precedente e' finita.
// ============================================================
const TAPPE = [
  { key: 'scrive', ms: 1700 },
  { key: 'invia', ms: 600 },
  { key: 'cifra', ms: 1000 },
  { key: 'verso-server', ms: 1250 },
  { key: 'server', ms: 1500 },
  { key: 'verso-destinatario', ms: 1250 },
  { key: 'decifra', ms: 1900 },
  { key: 'letto', ms: 900 },
];
const ORDINE = TAPPE.map((x) => x.key);
const SEQUENZA = [...[0, 1].flatMap((mi) => TAPPE.map((x) => ({ mi, ...x }))), { mi: 1, key: 'pausa', ms: 2400 }];
const IN_VIAGGIO = new Set(['cifra', 'verso-server', 'server', 'verso-destinatario']);
const RAIL_DI = { scrive: 0, invia: 0, cifra: 1, 'verso-server': 2, server: 2, 'verso-destinatario': 2, decifra: 3, letto: 4, pausa: 4 };
const ORE = ['20:14', '20:15'];

function useViaggio() {
  const reduce = useReducedMotion();
  const [indice, setIndice] = useState(0);
  const [giro, setGiro] = useState(0);
  const [digitate, setDigitate] = useState(0);
  const passo = reduce ? SEQUENZA[SEQUENZA.length - 1] : SEQUENZA[indice];

  useEffect(() => {
    if (reduce) return undefined;
    const id = setTimeout(() => {
      if (indice === SEQUENZA.length - 1) {
        setIndice(0);
        setGiro((g) => g + 1);
      } else setIndice((i) => i + 1);
      setDigitate(0);
    }, SEQUENZA[indice].ms);
    return () => clearTimeout(id);
  }, [indice, reduce]);

  const raggiunta = (mi, key) => {
    if (passo.key === 'pausa') return true;
    if (mi !== passo.mi) return mi < passo.mi;
    return ORDINE.indexOf(passo.key) >= ORDINE.indexOf(key);
  };
  return { passo, giro, digitate, setDigitate, raggiunta, reduce };
}

function useLarghezza(ref) {
  const [w, setW] = useState(1100);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}

function BollaRicevuta({ testo, seme }) {
  const [cifrato, setCifrato] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setCifrato(false), 380);
    return () => clearTimeout(id);
  }, []);
  return <FragmentText text={testo} cifrato={cifrato} seme={seme} />;
}

function StatoInvio({ stato, t }) {
  const stile = {
    invio: { bg: BRAND.nebbia, glow: 'none' },
    cifrato: { bg: SPETTRO, glow: `0 0 8px ${BRAND.ghiaccio}` },
    consegnato: { bg: BRAND.luce, glow: 'none' },
    letto: { bg: BRAND.ghiaccio, glow: `0 0 8px ${BRAND.ghiaccio}` },
  }[stato];
  const etichetta = { invio: t.status.sending, cifrato: t.status.encrypted, consegnato: t.status.delivered, letto: t.status.read }[stato];
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ width: 6, height: 6, borderRadius: 6, background: stile.bg, boxShadow: stile.glow }} />
      <span style={{ color: stato === 'letto' ? BRAND.ghiaccio : BRAND.nebbia }}>{etichetta}</span>
    </span>
  );
}

function Telefono({ persona, larghezza, altezza, viaggio, conversazione, t, inclinazione = 0 }) {
  const { passo, giro, digitate, setDigitate, raggiunta } = viaggio;
  const altro = t.names[1 - persona];
  const corrente = conversazione[passo.mi];
  const staScrivendo = passo.key === 'scrive' && corrente.da === persona;
  const invia = passo.key === 'invia' && corrente.da === persona;

  useEffect(() => {
    if (!staScrivendo) return undefined;
    const id = setInterval(() => setDigitate((n) => Math.min(corrente.testo.length, n + 1)), (passo.ms * 0.82) / corrente.testo.length);
    return () => clearInterval(id);
  }, [staScrivendo, corrente.testo, passo.ms, setDigitate]);

  const bolle = conversazione
    .map((msg, mi) => {
      if (msg.da === persona) {
        if (!raggiunta(mi, 'invia')) return null;
        const stato = raggiunta(mi, 'letto') ? 'letto' : raggiunta(mi, 'decifra') ? 'consegnato' : raggiunta(mi, 'cifra') ? 'cifrato' : 'invio';
        return { id: `${giro}-${mi}`, tipo: 'inviata', msg, stato };
      }
      if (!raggiunta(mi, 'decifra')) return null;
      return { id: `${giro}-${mi}`, tipo: 'ricevuta', msg };
    })
    .filter(Boolean);

  return (
    <div className="relative" style={{ width: larghezza, height: altezza, perspective: 1600 }}>
      {/* ombra e bagliore sotto il telefono */}
      <div className="absolute left-1/2 top-[101%] h-16 w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'rgba(0,0,0,0.7)', filter: 'blur(26px)' }} />
      <div className="absolute left-1/2 top-[99%] h-10 w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: persona === 0 ? 'rgba(157,180,255,0.12)' : 'rgba(255,197,138,0.1)', filter: 'blur(30px)' }} />
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateY: inclinazione, rotateX: inclinazione ? 2 : 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* tasti laterali in titanio */}
        {[
          { lato: 'left', top: '17%', h: '6%' },
          { lato: 'left', top: '25%', h: '9%' },
          { lato: 'left', top: '36%', h: '9%' },
          { lato: 'right', top: '28%', h: '13%' },
        ].map((b, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="absolute w-[3px]"
            style={{ [b.lato]: -2, top: b.top, height: b.h, borderRadius: 3, background: 'linear-gradient(90deg, #3b3e4b, #1a1b22 60%, #4a4d5b)' }}
          />
        ))}
        <div
          className="relative h-full w-full"
          style={{
            borderRadius: 48,
            padding: 7,
            background: 'linear-gradient(145deg, #4b4f5e 0%, #1c1d25 22%, #0d0e14 50%, #1a1b23 78%, #444857 100%)',
            boxShadow: '0 60px 120px rgba(0,0,0,0.65), inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 1px rgba(255,255,255,0.18)',
          }}
        >
          <div className="relative flex h-full w-full flex-col overflow-hidden" style={{ borderRadius: 41, background: '#06070D', fontFamily: FONT, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.9)' }}>
          {/* sfondo dello schermo: luce morbida, come un display acceso al buio */}
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(90% 55% at 20% 0%, rgba(157,180,255,0.12), transparent 60%), radial-gradient(80% 50% at 90% 100%, rgba(255,197,138,0.07), transparent 60%)' }} />
          {/* riflesso del vetro */}
          <div className="pointer-events-none absolute inset-0 z-30" style={{ background: 'linear-gradient(118deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 28%, transparent 42%)' }} />
          <div className="relative flex items-center justify-between px-7 pt-3.5 text-[10px] font-medium" style={{ color: 'rgba(243,241,236,0.72)' }}>
            <span>{corrente.ora}</span>
            <span className="flex items-center gap-1" aria-hidden="true">
              {[4, 6, 8, 10].map((h, i) => (
                <span key={i} className="w-[2.5px] rounded-[1px]" style={{ height: h, background: 'currentColor', opacity: 0.5 + i * 0.15 }} />
              ))}
              <span className="ml-1 h-[9px] w-[17px] rounded-[3px] p-[1.5px]" style={{ border: '1px solid rgba(243,241,236,0.45)' }}>
                <span className="block h-full w-[70%] rounded-[1.5px]" style={{ background: 'currentColor' }} />
              </span>
            </span>
          </div>
          <div className="absolute left-1/2 top-2.5 h-[22px] w-[82px] -translate-x-1/2 rounded-full" style={{ background: '#000' }} />

          <div className="relative mt-5 flex items-center gap-3 px-5 pb-3.5" style={{ borderBottom: `1px solid ${BRAND.linea}` }}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm" style={{ background: 'rgba(243,241,236,0.08)', color: BRAND.luce }}>
              {altro[0]}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium" style={{ color: BRAND.luce }}>{altro}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[10px]" style={{ color: BRAND.nebbia }}>
                <span style={{ width: 5, height: 5, borderRadius: 5, background: SPETTRO }} />
                {t.e2e}
              </span>
            </span>
          </div>

          <div className="relative flex flex-1 flex-col justify-end gap-2.5 overflow-hidden px-4 pb-3">
            <AnimatePresence initial={false}>
              {bolle.map((b) => (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex flex-col ${b.tipo === 'inviata' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className="max-w-[88%] px-3.5 py-2.5 text-[13.5px] leading-snug"
                    style={
                      b.tipo === 'inviata'
                        ? { background: BRAND.luce, color: BRAND.abisso, borderRadius: '18px 18px 5px 18px' }
                        : { background: BRAND.grafiteAlta, color: BRAND.luce, boxShadow: `inset 0 0 0 1px ${BRAND.linea}`, borderRadius: '18px 18px 18px 5px' }
                    }
                  >
                    {b.tipo === 'ricevuta' ? <BollaRicevuta testo={b.msg.testo} seme={b.id} /> : b.msg.testo}
                  </div>
                  <div className="mt-1 flex items-center gap-2 px-1 text-[9.5px]" style={{ color: 'rgba(141,143,160,0.85)' }}>
                    <span>{b.msg.ora}</span>
                    {b.tipo === 'inviata' && <StatoInvio stato={b.stato} t={t} />}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="relative flex items-center gap-2 px-3 pb-5 pt-1">
            <div className="flex h-10 min-w-0 flex-1 items-center px-4 text-[13px]" style={{ borderRadius: 20, background: 'rgba(243,241,236,0.05)', boxShadow: `inset 0 0 0 1px ${BRAND.linea}` }}>
              {staScrivendo ? (
                <span className="truncate" style={{ color: BRAND.luce }}>
                  {corrente.testo.slice(0, digitate)}
                  <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.9, repeat: Infinity }} style={{ color: BRAND.ghiaccio }}>|</motion.span>
                </span>
              ) : (
                <span style={{ color: 'rgba(141,143,160,0.6)' }}>{t.composer}</span>
              )}
            </div>
            <motion.span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              animate={{ scale: invia ? [1, 0.86, 1] : 1, backgroundColor: staScrivendo || invia ? BRAND.luce : 'rgba(243,241,236,0.08)' }}
              transition={{ duration: 0.4 }}
            >
              <ArrowUp size={17} strokeWidth={2.2} color={staScrivendo || invia ? BRAND.abisso : BRAND.nebbia} />
            </motion.span>
          </div>
          </div>
        </div>
      </motion.div>
      <p className="absolute left-0 right-0 top-[103%] mt-6 text-center text-xs" style={{ fontFamily: FONT, color: BRAND.nebbia }}>
        {t.phoneOf(t.names[persona])}
      </p>
    </div>
  );
}

function ServerPalacan({ attivo, t }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center" style={{ fontFamily: FONT }}>
      <div className="relative" style={{ width: 188, height: 132 }}>
        {/* bagliore quando il pacchetto e' dentro */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-10 rounded-[50px]"
          animate={{ opacity: attivo ? 1 : 0 }}
          transition={{ duration: 0.5 }}
          style={{ background: 'radial-gradient(closest-side, rgba(157,180,255,0.28), transparent)' }}
        />
        <div
          className="relative h-full w-full overflow-hidden"
          style={{
            borderRadius: 22,
            background: 'linear-gradient(180deg, #1d1f2b 0%, #111219 40%, #0b0c12 100%)',
            boxShadow: `0 40px 90px rgba(0,0,0,0.6), inset 0 0 0 1px ${attivo ? 'rgba(157,180,255,0.5)' : 'rgba(255,255,255,0.08)'}, inset 0 1px 0 rgba(255,255,255,0.14)`,
            transition: 'box-shadow .5s',
          }}
        >
          {/* riflesso del vetro */}
          <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.08), transparent 38%)' }} />
          {/* quattro alloggiamenti con LED */}
          <div className="absolute inset-x-4 top-4 flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex h-[18px] items-center gap-2 rounded-md px-2" style={{ background: 'rgba(0,0,0,0.35)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.04)' }}>
                <motion.span
                  className="h-[5px] w-[5px] rounded-full"
                  style={{ background: BRAND.ghiaccio }}
                  animate={reduce ? { opacity: 0.6 } : attivo ? { opacity: [0.2, 1, 0.2], boxShadow: ['0 0 0px #9DB4FF', '0 0 8px #9DB4FF', '0 0 0px #9DB4FF'] } : { opacity: [0.35, 0.6, 0.35] }}
                  transition={{ duration: attivo ? 0.5 : 2.4, repeat: Infinity, delay: i * (attivo ? 0.12 : 0.6) }}
                />
                <motion.span
                  className="h-[2px] flex-1 rounded-full"
                  style={{ transformOrigin: '0% 50%', background: attivo ? SPETTRO : 'rgba(243,241,236,0.08)' }}
                  animate={{ scaleX: attivo && !reduce ? [0.2, 1, 0.5] : 1, opacity: attivo ? 0.9 : 1 }}
                  transition={{ duration: 0.6, repeat: attivo ? Infinity : 0, delay: i * 0.1 }}
                />
              </div>
            ))}
          </div>
          {/* barra di luce frontale */}
          <motion.div
            className="absolute bottom-3 left-1/2 h-[3px] w-16 -translate-x-1/2 rounded-full"
            animate={{ background: attivo ? SPETTRO : 'rgba(243,241,236,0.14)', boxShadow: attivo ? '0 0 16px rgba(157,180,255,0.7)' : '0 0 0 rgba(0,0,0,0)' }}
            transition={{ duration: 0.4 }}
          />
        </div>
        {/* riflesso sul "pavimento" */}
        <div aria-hidden="true" className="absolute left-2 right-2 top-full mt-1 h-10 rounded-[22px]" style={{ background: 'linear-gradient(180deg, rgba(29,31,43,0.5), transparent)', filter: 'blur(2px)', opacity: 0.6 }} />
      </div>
      <span className="mt-8 text-sm font-medium" style={{ color: attivo ? BRAND.luce : BRAND.nebbia, transition: 'color 0.4s' }}>{t.server}</span>
      <span className="mt-1 text-xs" style={{ color: attivo ? BRAND.ghiaccio : 'rgba(141,143,160,0.75)', transition: 'color 0.4s' }}>
        {attivo ? t.serverActive : t.serverIdle}
      </span>
    </div>
  );
}

function MessageJourney() {
  const { t: tutto } = useTesti();
  const t = tutto.journey;
  const conversazione = [
    { da: 0, testo: t.messages[0], ora: ORE[0] },
    { da: 1, testo: t.messages[1], ora: ORE[1] },
  ];
  const viaggio = useViaggio();
  const { passo, giro, reduce } = viaggio;
  const sceneRef = useRef(null);
  const W = useLarghezza(sceneRef);
  const verticale = W < 1000;

  const tel = verticale ? { w: Math.min(W, 320), h: 430 } : { w: 232, h: 480 };
  const seg = verticale ? 130 : 96;
  const serverH = 170;
  const H = verticale ? tel.h * 2 + seg * 2 + serverH + 40 : 560;
  const assi = verticale
    ? { A: tel.h + 95, S: tel.h + seg + 59, B: tel.h + seg * 2 + serverH - 50, fisso: W / 2 }
    : { A: tel.w + 110, S: W / 2, B: W - tel.w - 110, fisso: H / 2 - 20 };

  const msg = conversazione[passo.mi];
  const daA = msg.da === 0;
  const partenza = daA ? assi.A : assi.B;
  const arrivo = daA ? assi.B : assi.A;
  const posizione = { cifra: partenza, 'verso-server': assi.S, server: assi.S, 'verso-destinatario': arrivo }[passo.key] ?? partenza;
  const inMovimento = passo.key === 'verso-server' || passo.key === 'verso-destinatario';
  const durata = (passo.ms / 1000) * 0.96;
  const xy = (v) => (verticale ? { x: assi.fisso, y: v } : { x: v, y: assi.fisso });
  const pacchetto = !reduce && IN_VIAGGIO.has(passo.key);
  const luce = { da: Math.min(partenza, posizione), a: Math.max(partenza, posizione) };
  const rail = RAIL_DI[passo.key];

  return (
    <section className="relative overflow-hidden py-24 sm:py-32" style={{ background: 'transparent', color: BRAND.luce, fontFamily: FONT }}>
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[700px] w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(157,180,255,0.05), transparent 65%)' }} />
      <div className="relative mx-auto max-w-[1180px] px-6">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-[11px] uppercase" style={{ color: BRAND.nebbia, letterSpacing: '0.2em' }}>{t.eyebrow}</span>
          <h2 className="mt-5 text-[34px] leading-[1.05] sm:text-[56px]" style={{ fontWeight: 300, letterSpacing: '-0.035em' }}>{t.title}</h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: BRAND.nebbia, fontWeight: 300 }}>{t.sub}</p>
        </div>

        <div ref={sceneRef} className="relative mx-auto mt-16 sm:mt-20" style={{ height: H }}>
          <div
            className="absolute"
            style={
              verticale
                ? { left: W / 2, top: tel.h + 44, width: 1, height: seg * 2 + serverH - 52, background: BRAND.linea }
                : { top: assi.fisso, left: tel.w + 16, right: tel.w + 16, height: 1, background: BRAND.linea }
            }
          />
          {!reduce && !verticale && (
            <motion.div
              aria-hidden="true"
              className="absolute"
              style={{ top: assi.fisso - 1, left: tel.w + 16, right: tel.w + 16, height: 3, backgroundImage: 'linear-gradient(90deg, transparent 0, rgba(157,180,255,0.35) 6px, transparent 14px)', backgroundSize: '140px 3px', backgroundRepeat: 'repeat-x', opacity: 0.5, filter: 'blur(0.5px)' }}
              animate={{ backgroundPositionX: ['0px', '140px'] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
            />
          )}
          {!reduce && (
            <motion.div
              className="absolute"
              initial={false}
              animate={verticale ? { top: luce.da, height: luce.a - luce.da, opacity: pacchetto ? 0.9 : 0 } : { left: luce.da, width: luce.a - luce.da, opacity: pacchetto ? 0.9 : 0 }}
              transition={{ duration: inMovimento ? durata : 0.5, ease: [0.87, 0, 0.13, 1] }}
              style={
                verticale
                  ? { left: W / 2, width: 1, background: `linear-gradient(${daA ? 180 : 0}deg, transparent, ${BRAND.ghiaccio})` }
                  : { top: assi.fisso, height: 1, background: `linear-gradient(${daA ? 90 : 270}deg, transparent, ${BRAND.ghiaccio})` }
              }
            />
          )}

          <div className="absolute" style={verticale ? { left: (W - tel.w) / 2, top: 0 } : { left: 0, top: assi.fisso - tel.h / 2 }}>
            <Telefono persona={0} larghezza={tel.w} altezza={tel.h} viaggio={viaggio} conversazione={conversazione} t={t} inclinazione={verticale ? 0 : 9} />
          </div>
          <div className="absolute" style={verticale ? { left: (W - tel.w) / 2, top: tel.h + seg * 2 + serverH } : { right: 0, top: assi.fisso - tel.h / 2 }}>
            <Telefono persona={1} larghezza={tel.w} altezza={tel.h} viaggio={viaggio} conversazione={conversazione} t={t} inclinazione={verticale ? 0 : -9} />
          </div>
          <div className="absolute -translate-x-1/2" style={verticale ? { left: W / 2, top: tel.h + seg } : { left: W / 2, top: assi.fisso - 66 }}>
            <ServerPalacan attivo={passo.key === 'server'} t={t} />
          </div>

          <AnimatePresence>
            {pacchetto && (
              <motion.div
                key={`${giro}-${passo.mi}`}
                className="pointer-events-none absolute left-0 top-0 z-20"
                style={{ translateX: '-50%', translateY: '-50%' }}
                initial={{ ...xy(partenza), opacity: 0, scale: 0.4, filter: 'blur(6px)' }}
                animate={{ ...xy(posizione), opacity: 1, scale: passo.key === 'server' ? 1.15 : 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.4, filter: 'blur(6px)', transition: { duration: 0.35 } }}
                transition={{
                  x: { duration: inMovimento ? durata : 0.01, ease: [0.87, 0, 0.13, 1] },
                  y: { duration: inMovimento ? durata : 0.01, ease: [0.87, 0, 0.13, 1] },
                  default: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
                }}
              >
                <FragmentCluster seme={`${giro}-${passo.mi}`} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <ol className="mx-auto mt-24 hidden max-w-4xl grid-cols-5 gap-4 md:grid">
          {t.steps.map((label, i) => (
            <li key={label} className="flex flex-col gap-3">
              <span className="h-px w-full" style={{ background: i === rail ? SPETTRO : i < rail ? 'rgba(243,241,236,0.45)' : BRAND.linea, transition: 'background 0.4s' }} />
              <span className="text-xs" style={{ color: i === rail ? BRAND.luce : BRAND.nebbia, transition: 'color 0.4s' }}>{i + 1}. {label}</span>
            </li>
          ))}
        </ol>
        <p className="mt-16 text-center text-sm md:hidden" style={{ color: BRAND.luce }} aria-hidden="true">{rail + 1}. {t.steps[rail]}</p>
        <p className="sr-only" aria-live="polite">{t.names[msg.da]}: {t.steps[rail]}</p>
        <p className="mx-auto mt-8 max-w-md text-center text-[13px] leading-6" style={{ color: 'rgba(141,143,160,0.8)' }}>{t.foot}</p>
      </div>
    </section>
  );
}

// ============================================================
// OPEN SOURCE — il codice vero. Cambiando scheda le righe "vanno a
// fuoco" come il nome nell'ingresso: da sfocate e spaziate a nitide.
// ============================================================
function evidenziaSintassi(riga) {
  const parti = [];
  let ultimo = 0;
  const pattern = /(\/\/.*$)|('.*?'|".*?")|(\b\w+(?=\())|(\b(?:const|await|async|function|if|throw|new|return)\b)/g;
  let m;
  while ((m = pattern.exec(riga)) !== null) {
    if (m.index > ultimo) parti.push({ testo: riga.slice(ultimo, m.index), tipo: 'normale' });
    if (m[1]) parti.push({ testo: m[1], tipo: 'commento' });
    else if (m[2]) parti.push({ testo: m[2], tipo: 'stringa' });
    else if (m[3]) parti.push({ testo: m[3], tipo: 'funzione' });
    else if (m[4]) parti.push({ testo: m[4], tipo: 'chiave' });
    ultimo = pattern.lastIndex;
  }
  if (ultimo < riga.length) parti.push({ testo: riga.slice(ultimo), tipo: 'normale' });
  return parti;
}

const COLORI_SINTASSI = {
  normale: 'rgba(243,241,236,0.6)',
  chiave: BRAND.ghiaccio,
  stringa: BRAND.ambra,
  funzione: BRAND.luce,
  commento: 'rgba(141,143,160,0.75)',
};

const CODICE = {
  MESSAGING: {
    file: 'messageService.js',
    righe: [
      'const session = olmAccount.createOutboundSession(identityKey, oneTimeKey);',
      'const ciphertext = session.encrypt(JSON.stringify(message));',
      'await sendToServer({ room_id, ciphertext, sender: username });',
      'const plaintext = session.decrypt(receivedCiphertext);',
    ],
  },
  IDENTITY: {
    file: 'identityService.js',
    righe: [
      'const fingerprint = await getIdentityKeyFingerprint(peerIdentityKey);',
      'if (fingerprint !== previousFingerprint) flagIdentityChange();',
      'const safetyNumber = await computeSafetyNumber(myKey, peerKey);',
    ],
  },
  DEVICES: {
    file: 'deviceService.js',
    righe: [
      'const deviceId = await getOrCreateDeviceId();',
      'await uploadIdentityKey(deviceId, publicIdentityKey);',
      'await revokeDevice(deviceId); // session ended immediately',
    ],
  },
  SECURITY: {
    file: 'backupService.js',
    righe: [
      'const key = await deriveKeyArgon2id(passphrase, salt);',
      'const encrypted = await aesGcmEncrypt(backupData, key);',
      "if (!authorized) throw new Error('Access denied');",
    ],
  },
};

function CodeExplainer() {
  const { t: tutto } = useTesti();
  const t = tutto.code;
  const reduce = useReducedMotion();
  const [scheda, setScheda] = useState('MESSAGING');
  const [riga, setRiga] = useState(0);
  const dati = CODICE[scheda];
  const spiegazioni = t.lines[scheda];

  useEffect(() => setRiga(0), [scheda]);

  return (
    <div className="mx-auto w-full max-w-3xl" style={{ fontFamily: FONT }}>
      <div className="mb-5 flex flex-wrap items-center justify-center gap-1.5 rounded-full p-1" role="tablist" style={{ boxShadow: `inset 0 0 0 1px ${BRAND.linea}`, width: 'fit-content', marginLeft: 'auto', marginRight: 'auto' }}>
        {Object.keys(CODICE).map((k) => {
          const attiva = scheda === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={attiva}
              onClick={() => setScheda(k)}
              className="relative rounded-full px-4 py-2 text-[13px] outline-none focus-visible:ring-1"
              style={{ color: attiva ? BRAND.abisso : BRAND.nebbia, '--tw-ring-color': BRAND.luce }}
            >
              {attiva && <motion.span layoutId="codice-scheda" className="absolute inset-0 rounded-full" style={{ background: BRAND.luce }} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
              <span className="relative">{t.tabs[k]}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden" style={{ borderRadius: 22, background: BRAND.grafite, boxShadow: `inset 0 0 0 1px ${BRAND.linea}, 0 40px 100px rgba(0,0,0,0.45)` }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${BRAND.linea}` }}>
          <span className="text-xs" style={{ fontFamily: FONT_MONO, color: BRAND.nebbia }}>{dati.file}</span>
          <span style={{ width: 28, height: 2, borderRadius: 2, background: SPETTRO, opacity: 0.8 }} />
        </div>
        <div className="p-4 text-[12.5px] leading-loose" style={{ fontFamily: FONT_MONO }}>
          <AnimatePresence mode="wait">
            <motion.div key={scheda}>
              {dati.righe.map((codice, i) => (
                <div key={i} onMouseEnter={() => setRiga(i)} onFocus={() => setRiga(i)} tabIndex={0} className="outline-none">
                  <motion.div
                    className="cursor-default whitespace-pre-wrap rounded-lg px-3 py-1.5"
                    initial={reduce ? false : { opacity: 0, filter: 'blur(6px)', letterSpacing: '0.25em' }}
                    animate={{ opacity: riga === i ? 1 : 0.5, filter: 'blur(0px)', letterSpacing: '0em' }}
                    exit={{ opacity: 0, filter: 'blur(6px)' }}
                    transition={{ duration: 0.7, delay: reduce ? 0 : i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                    style={{ background: riga === i ? 'rgba(157,180,255,0.06)' : 'transparent', transition: 'background 0.2s' }}
                  >
                    <span style={{ color: 'rgba(141,143,160,0.5)' }}>{String(i + 1).padStart(2, '0')}  </span>
                    {evidenziaSintassi(codice).map((p, j) => (
                      <span key={j} style={{ color: COLORI_SINTASSI[p.tipo] }}>{p.testo}</span>
                    ))}
                  </motion.div>
                  <AnimatePresence>
                    {riga === i && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden px-3">
                        <div className="relative py-1.5 pl-6 text-[12.5px]" style={{ fontFamily: FONT, color: 'rgba(243,241,236,0.8)' }}>
                          <span className="absolute left-2 top-2 bottom-2 w-px" style={{ background: SPETTRO }} />
                          {spiegazioni[i]}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export {
  useLenisScroll,
  useScrollDrivenReveals,
  ReactiveCursor,
  MagneticButton,
  InteractiveHero,
  BrandEmblem,
  VerificationSeal,
  RatchetSymbol,
  MessageJourney,
  CodeExplainer,
  INK,
  INK_SOFT,
  ACCENT,
  FONT_DISPLAY,
  FONT_BODY,
  // nuova identita', riesportata per comodita'
  BRAND,
  SPETTRO,
  FONT,
  FONT_MONO,
  Wordmark,
  PalacanIcon,
  PalacanLoader,
  FragmentText,
  FragmentCluster,
};
