import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion, useAnimationControls } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import {
  useLenisScroll,
  useScrollDrivenReveals,
  InteractiveHero,
  MessageJourney,
  CodeExplainer,
  MagneticButton,
  RatchetSymbol,
} from './HomeExperience.jsx';
import { BRAND, SPETTRO, FONT, FONT_MONO, FONT_IMPORT, Wordmark, PalacanIcon, LanguageSwitcher, FragmentText, FragmentCluster, CursorePremium, SfondoPalacan, useInViewSicuro } from './palacanBrand';
import { useTesti } from './testiHome';

// ============================================================
// LANDING — PALACAN, "Da ogni punto di vista".
// Internazionale: inglese di default, poi italiano, francese,
// spagnolo, tedesco (segue il selettore lingua di i18next).
// Firma invariata: default export, stesse props.
// ============================================================

const C = { testo: BRAND.luce, tenue: BRAND.nebbia, bordo: BRAND.linea };

function useNav(t) {
  return {
    principale: [
      { label: t.nav.security, href: '/sicurezza' },
      { label: t.nav.technology, href: '/tecnologia' },
      { label: t.nav.openSource, href: '/open-source' },
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

function useOltreHero() {
  const [oltre, setOltre] = useState(false);
  useEffect(() => {
    const onScroll = () => setOltre(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return oltre;
}

// ------------------------------------------------------------ header
function NavCapsula({ voci }) {
  const [sopra, setSopra] = useState(null);
  return (
    <nav aria-label="Main" className="hidden lg:block">
      <ul
        className="flex items-center rounded-full p-1"
        onMouseLeave={() => setSopra(null)}
        style={{ background: 'rgba(243,241,236,0.03)', boxShadow: `inset 0 0 0 1px ${C.bordo}`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
        {voci.map((v) => (
          <li key={v.href} className="relative" onMouseEnter={() => setSopra(v.href)}>
            {sopra === v.href && (
              <motion.span layoutId="nav-sopra" className="absolute inset-0 rounded-full" style={{ background: 'rgba(243,241,236,0.08)' }} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />
            )}
            <Link
              to={v.href}
              onFocus={() => setSopra(v.href)}
              className="relative block rounded-full px-4 py-2 text-[13.5px] outline-none transition-colors focus-visible:ring-1"
              style={{ fontFamily: FONT, color: sopra === v.href ? C.testo : C.tenue, '--tw-ring-color': BRAND.luce }}
            >
              {v.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Header({ isOlmReady, onShowPersonalRegister, onShowPersonalLogin }) {
  const { t } = useTesti();
  const nav = useNav(t);
  const oltre = useOltreHero();
  const [menu, setMenu] = useState(false);

  return (
    <header
      className="fixed left-0 right-0 top-0 z-[500]"
      style={{
        background: oltre || menu ? 'rgba(5,6,11,0.72)' : 'transparent',
        backdropFilter: oltre || menu ? 'blur(20px) saturate(140%)' : 'none',
        WebkitBackdropFilter: oltre || menu ? 'blur(20px) saturate(140%)' : 'none',
        borderBottom: `1px solid ${oltre ? C.bordo : 'transparent'}`,
        transition: 'background 0.5s ease, border-color 0.5s ease',
      }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5 sm:px-8 lg:grid-cols-[1fr_auto_1fr]">
        {/* il nome compare quando quello grande dell'ingresso e' uscito dallo schermo */}
        <Link
          to="/"
          aria-label="PALACAN"
          className="justify-self-start rounded outline-none focus-visible:ring-1"
          style={{ opacity: oltre || menu ? 1 : 0, transition: 'opacity 0.6s ease', '--tw-ring-color': BRAND.luce }}
          tabIndex={oltre || menu ? 0 : -1}
        >
          <Wordmark size={14} />
        </Link>

        <NavCapsula voci={nav.principale} />

        <div className="flex items-center gap-2 justify-self-end">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={onShowPersonalLogin}
            disabled={!isOlmReady}
            className="hidden rounded-full px-3 py-2 text-[13.5px] outline-none transition-colors hover:text-white focus-visible:ring-1 disabled:opacity-50 md:block"
            style={{ fontFamily: FONT, color: C.tenue, '--tw-ring-color': BRAND.luce }}
          >
            {t.nav.login}
          </button>
          <button
            type="button"
            onClick={onShowPersonalRegister}
            disabled={!isOlmReady}
            className="hidden whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 sm:inline-flex"
            style={{ fontFamily: FONT, background: C.testo, color: BRAND.abisso, '--tw-ring-color': BRAND.luce, '--tw-ring-offset-color': BRAND.abisso }}
          >
            {t.nav.getStarted}
          </button>
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-controls="menu-mobile"
            aria-label={menu ? t.nav.menuClose : t.nav.menuOpen}
            className="rounded-full p-2 outline-none focus-visible:ring-1 lg:hidden"
            style={{ color: C.testo, '--tw-ring-color': BRAND.luce }}
          >
            {menu ? <X size={20} strokeWidth={1.6} /> : <Menu size={20} strokeWidth={1.6} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menu && (
          <motion.nav
            id="menu-mobile"
            aria-label="Menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: [0.87, 0, 0.13, 1] }}
            className="overflow-hidden lg:hidden"
            style={{ borderTop: `1px solid ${C.bordo}` }}
          >
            <ul className="px-6 pt-2">
              {[...nav.principale, ...nav.legale].map((v, i) => (
                <motion.li key={v.href} initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ delay: 0.05 + i * 0.035 }} style={{ borderBottom: `1px solid ${C.bordo}` }}>
                  <Link to={v.href} onClick={() => setMenu(false)} className="block py-3.5 text-xl" style={{ fontFamily: FONT, fontWeight: 300, color: C.testo, letterSpacing: '-0.01em' }}>
                    {v.label}
                  </Link>
                </motion.li>
              ))}
            </ul>
            <div className="flex gap-3 px-6 pb-6 pt-5">
              <button type="button" onClick={() => { setMenu(false); onShowPersonalLogin?.(); }} disabled={!isOlmReady} className="flex-1 rounded-full py-3 text-sm disabled:opacity-50" style={{ fontFamily: FONT, color: C.testo, boxShadow: `inset 0 0 0 1px ${BRAND.lineaForte}` }}>
                {t.nav.login}
              </button>
              <button type="button" onClick={() => { setMenu(false); onShowPersonalRegister?.(); }} disabled={!isOlmReady} className="flex-1 rounded-full py-3 text-sm font-medium disabled:opacity-50" style={{ fontFamily: FONT, background: C.testo, color: BRAND.abisso }}>
                {t.nav.getStarted}
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

// ------------------------------------------------------------ il database cifrato
// Il visitatore scrive un messaggio; viene cifrato DAVVERO nel suo
// browser (AES-GCM, Web Crypto) con una chiave che esiste solo in
// questa pagina. Nella tabella compare il testo cifrato reale.
// "Con la tua chiave" lo decifra davvero: solo la sua riga torna
// parole, le altre (altre conversazioni, altre chiavi) restano chiuse.
// Colonne: solo quelle confermate nel codice di Palacan
// (sendToServer({ room_id, ciphertext, sender }), Message.room_id).
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const cryptoDisponibile = () => typeof window !== 'undefined' && window.isSecureContext && !!window.crypto?.subtle;

function aBase64(bytes) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

async function nuovaChiave() {
  return window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function cifra(chiave, testo) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chiave, new TextEncoder().encode(testo)));
  const tutto = new Uint8Array(iv.length + ct.length);
  tutto.set(iv);
  tutto.set(ct, iv.length);
  return { b64: aBase64(tutto), iv, ct };
}

// Testo cifrato che "si deposita": caratteri casuali che si fermano uno a uno
function CifratoCheSiDeposita({ valore }) {
  const reduce = useReducedMotion();
  const [mostrato, setMostrato] = useState(valore);
  useEffect(() => {
    if (reduce) {
      setMostrato(valore);
      return undefined;
    }
    let passo = 0;
    const totale = valore.length;
    const id = setInterval(() => {
      passo += Math.max(2, Math.ceil(totale / 18));
      const fermi = valore.slice(0, passo);
      let resto = '';
      for (let i = passo; i < totale; i += 1) resto += BASE64[Math.floor(Math.random() * 64)];
      setMostrato(fermi + resto);
      if (passo >= totale) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [valore, reduce]);
  return <span style={{ wordBreak: 'break-all' }}>{mostrato}</span>;
}

const MESSAGGI_ALTRI = ['·', '··', '···']; // mai mostrati: servono solo a produrre testo cifrato reale
const MITTENTI_ALTRI = ['maya', 'leo.nord', 'nightowl']; // mai mostrati: vengono cifrati come il resto

// ============================================================
// INTERRUTTORE ONESTA' — "tutto cifrato" (mittente, stanza, orario,
// messaggio) descrive il database DOPO la minimizzazione dei
// metadati. Finche' il backend non la fa davvero, la build di
// produzione mostra solo la colonna ciphertext (l'unica oggi
// illeggibile per il server).
//  - sviluppo (npm run dev): tutto cifrato, per lavorare al design
//  - produzione: attivare con VITE_METADATI_NASCOSTI=true in
//    .env.production SOLO quando il backend nasconde i metadati
// ============================================================
function metadatiNascosti() {
  try {
    const env = import.meta.env || {};
    return Boolean(env.DEV) || env.VITE_METADATI_NASCOSTI === 'true';
  } catch {
    return false;
  }
}
const TUTTO_CIFRATO = metadatiNascosti();
const COLONNE = TUTTO_CIFRATO ? ['sender', 'room_id', 'sent_at', 'ciphertext'] : ['ciphertext'];

function uuidCasuale() {
  return window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

// Cella cifrata: un'impronta di 6 quadratini calcolata dai byte e il testo cifrato su una
// riga sola, che sfuma a destra invece di andare a capo.
const IMPRONTA = ['#9DB4FF', '#B9C6FF', '#D8D6EE', '#F3E3CF', '#FFD2A6', '#FFC58A'];
function CellaTesto({ cella, tua, nuova }) {
  const b = cella.byte;
  return (
    <span role="cell" className="flex min-w-0 items-center gap-2.5" title={cella.b64}>
      <span className="flex shrink-0 gap-[2px]" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="h-[9px] w-[4px] rounded-[1px]"
            style={{ background: IMPRONTA[b[i * 3] % IMPRONTA.length], opacity: tua ? 0.55 + (b[i * 3 + 1] / 255) * 0.45 : 0.18 + (b[i * 3 + 1] / 255) * 0.3 }}
          />
        ))}
      </span>
      <span
        className="block min-w-0 flex-1 overflow-hidden whitespace-nowrap text-[12px]"
        style={{
          fontFamily: FONT_MONO,
          color: tua ? 'rgba(255,214,176,0.95)' : 'rgba(174,178,198,0.5)',
          WebkitMaskImage: 'linear-gradient(90deg, #000 78%, transparent)',
          maskImage: 'linear-gradient(90deg, #000 78%, transparent)',
        }}
      >
        {nuova ? <CifratoCheSiDeposita valore={cella.b64} /> : cella.b64}
      </span>
    </span>
  );
}

// Forma d'onda del testo cifrato: una barra per byte, alta in proporzione al valore.
// E' un'impronta visiva unica di quei byte; sotto, il base64 in piccolo.
function CellaOnda({ cella, principale, tua, nuova }) {
  const reduce = useReducedMotion();
  const byte = cella.byte;
  const n = Math.min(principale ? 56 : 22, byte.length);
  const passo = 4;
  const id = useMemo(() => `onda${Math.random().toString(36).slice(2, 9)}`, []);
  return (
    <span role="cell" className="flex min-w-0 flex-col gap-1.5" title={cella.b64}>
      <svg viewBox={`0 0 ${n * passo} 22`} preserveAspectRatio="none" className="block h-[22px] w-full" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={tua ? BRAND.ghiaccio : 'rgba(157,180,255,0.55)'} />
            <stop offset="1" stopColor={tua ? BRAND.ambra : 'rgba(255,197,138,0.45)'} />
          </linearGradient>
          <clipPath id={`${id}c`}>
            {nuova && !reduce ? (
              <motion.rect x="0" y="0" height="22" initial={{ width: 0 }} animate={{ width: n * passo }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
            ) : (
              <rect x="0" y="0" height="22" width={n * passo} />
            )}
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}c)`} fill={`url(#${id})`} opacity={tua ? 1 : 0.7}>
          {Array.from({ length: n }, (_, i) => {
            const h = 2 + (byte[i] / 255) * 20;
            return <rect key={i} x={i * passo} y={22 - h} width={passo * 0.55} height={h} rx="0.8" />;
          })}
        </g>
      </svg>
      <span
        className={principale ? 'block min-w-0 break-all text-[10.5px] leading-relaxed' : 'block min-w-0 truncate text-[10.5px]'}
        style={{ fontFamily: FONT_MONO, color: tua ? 'rgba(255,197,138,0.85)' : 'rgba(141,143,160,0.55)' }}
      >
        {nuova ? <CifratoCheSiDeposita valore={cella.b64} /> : cella.b64}
      </span>
    </span>
  );
}

function CellaCifrata({ valore, principale, tua }) {
  return (
    <span
      role="cell"
      title={valore}
      className={principale ? 'block min-w-0 leading-relaxed' : 'block min-w-0 truncate'}
      style={{ color: tua ? (principale ? BRAND.ambra : 'rgba(255,197,138,0.8)') : principale ? 'rgba(255,197,138,0.45)' : 'rgba(157,180,255,0.45)' }}
    >
      <CifratoCheSiDeposita valore={valore} />
    </span>
  );
}

function DatabaseCifrato({ t, nome }) {
  const v = t.vault;
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const visto = useInViewSicuro(ref, { amount: 0.25 });
  const giaVisto = useInViewSicuro(ref, { amount: 0.25, once: true });
  const disponibile = cryptoDisponibile();
  const [testo, setTesto] = useState('');
  const [righe, setRighe] = useState([]);
  const scossa = useAnimationControls();
  const campoRef = useRef(null);
  const [focusCampo, setFocusCampo] = useState(false);
  const [fase, setFase] = useState('pronto'); // pronto | scompone | viaggia | deposita
  const [ultima, setUltima] = useState(null);
  const [scansione, setScansione] = useState(0);
  const contatore = useRef(0);
  const nomeRef = useRef(nome);
  nomeRef.current = nome;

  // una sola chiave per riga (come una conversazione), un IV nuovo per ogni campo
  const nuovaRiga = async (messaggio, tua, mittente) => {
    const chiave = await nuovaChiave();
    const campi = { sender: mittente, room_id: uuidCasuale(), sent_at: new Date().toISOString(), ciphertext: messaggio };
    const celle = {};
    let byte = 0;
    for (const col of COLONNE) {
      const c = await cifra(chiave, campi[col]);
      const tutti = new Uint8Array(c.iv.length + c.ct.length);
      tutti.set(c.iv);
      tutti.set(c.ct, c.iv.length);
      celle[col] = { b64: c.b64, byte: tutti };
      if (col === 'ciphertext') byte = tutti.length;
    }
    contatore.current += 1;
    return { id: `r${contatore.current}`, celle, byte, tua };
  };

  useEffect(() => {
    if (!disponibile) return undefined;
    let vivo = true;
    (async () => {
      const altri = [];
      for (const [i, m] of MESSAGGI_ALTRI.entries()) altri.push(await nuovaRiga(`${m}${i}${Math.random()}`, false, MITTENTI_ALTRI[i]));
      if (vivo) setRighe(altri);
    })();
    return () => { vivo = false; };
  }, [disponibile]);

  // il server "prova a leggere": una scansione periodica che non trova nulla
  useEffect(() => {
    if (!TUTTO_CIFRATO || reduce || !visto) return undefined;
    const id = setInterval(() => setScansione((n) => n + 1), 5200);
    return () => clearInterval(id);
  }, [reduce, visto]);

  const onInvia = async () => {
    if (fase !== 'pronto' || !disponibile) return;
    const messaggio = testo.trim().slice(0, 120);
    if (!messaggio) {
      // campo vuoto: nessun invio, il campo "vibra" e prende il focus
      campoRef.current?.focus();
      if (!reduce) scossa.start({ x: [0, -8, 7, -5, 3, 0], transition: { duration: 0.45 } });
      return;
    }
    const pausa = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
    setFase('scompone');
    const riga = await nuovaRiga(messaggio, true, nomeRef.current || v.you);
    await pausa(650);
    setFase('viaggia');
    await pausa(900);
    setRighe((prec) => [riga, ...prec].slice(0, 5));
    setUltima(riga.id);
    setFase('deposita');
    setTesto('');
    await pausa(900);
    setFase('pronto');
  };

  const griglia = TUTTO_CIFRATO ? '30px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.9fr)' : '30px minmax(0,1fr)';
  const campiTotali = righe.length * COLONNE.length;

  return (
    <section ref={ref} className="overflow-hidden px-6 py-20 sm:py-24" style={{ fontFamily: FONT }}>
      <div className="mx-auto max-w-4xl">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-[11px] uppercase" style={{ color: C.tenue, letterSpacing: '0.2em' }}>{v.eyebrow}</span>
          <h2 className="mt-4 text-[28px] leading-[1.08] sm:text-[42px]" style={{ fontWeight: 300, letterSpacing: '-0.035em', textWrap: 'balance' }}>{v.title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed sm:text-base" style={{ color: C.tenue, fontWeight: 300 }}>{v.sub}</p>
        </div>

        {!disponibile ? (
          <p className="mt-10 text-center text-sm" style={{ color: C.tenue }}>{v.noCrypto}</p>
        ) : (
          <>
            {/* 1. scrivi */}
            <div className="mx-auto mt-9 flex max-w-2xl flex-col gap-3 sm:flex-row">
              <motion.div className="flex flex-1" animate={scossa}>
              <motion.div
                className="relative flex h-14 flex-1 items-center overflow-hidden rounded-full px-6"
                style={{ background: BRAND.grafite }}
                animate={{
                  boxShadow:
                    fase === 'scompone'
                      ? `inset 0 0 0 1px ${BRAND.ghiaccio}, 0 0 40px rgba(157,180,255,0.25)`
                      : focusCampo
                        ? 'inset 0 0 0 1px rgba(157,180,255,0.55), 0 0 32px rgba(157,180,255,0.12)'
                        : `inset 0 0 0 1px ${BRAND.lineaForte}, 0 0 0 rgba(0,0,0,0)`,
                }}
                transition={{ duration: 0.4 }}
              >
                <input
                  ref={campoRef}
                  value={fase === 'pronto' || fase === 'deposita' ? testo : ''}
                  onChange={(e) => setTesto(e.target.value.slice(0, 120))}
                  onKeyDown={(e) => { if (e.key === 'Enter') onInvia(); }}
                  placeholder={fase === 'pronto' || fase === 'deposita' ? v.placeholder : ''}
                  aria-label={v.placeholder}
                  maxLength={120}
                  disabled={fase === 'scompone' || fase === 'viaggia'}
                  onFocus={() => setFocusCampo(true)}
                  onBlur={() => setFocusCampo(false)}
                  className="h-full w-full bg-transparent text-[15px] outline-none focus:outline-none"
                  style={{ color: C.testo, fontFamily: FONT, outline: 'none', boxShadow: 'none', border: 0, caretColor: BRAND.ghiaccio }}
                />
                {fase === 'scompone' && (
                  <span className="pointer-events-none absolute inset-y-0 left-6 right-6 flex items-center text-[15px]" style={{ color: C.testo }} aria-hidden="true">
                    <FragmentText text={testo.trim()} cifrato seme={`invio-${contatore.current}`} passo={0.012} />
                  </span>
                )}
              </motion.div>
              </motion.div>
              <MagneticButton primary onClick={onInvia} disabled={fase !== 'pronto'}>{v.send}</MagneticButton>
            </div>

            {/* 2. il fascio */}
            <div className="relative mx-auto h-12 w-px" aria-hidden="true">
              <div className="absolute inset-0" style={{ background: BRAND.linea }} />
              <motion.div
                className="absolute inset-x-0 top-0"
                style={{ background: `linear-gradient(180deg, transparent, ${BRAND.ghiaccio})`, boxShadow: `0 0 12px ${BRAND.ghiaccio}` }}
                initial={false}
                animate={{ height: fase === 'viaggia' || fase === 'deposita' ? '100%' : '0%', opacity: fase === 'viaggia' ? 1 : 0 }}
                transition={{ duration: fase === 'viaggia' ? 0.85 : 0.6, ease: [0.87, 0, 0.13, 1] }}
              />
              <AnimatePresence>
                {fase === 'viaggia' && (
                  <motion.div
                    className="absolute left-1/2 top-0 -translate-x-1/2"
                    initial={{ y: -14, opacity: 0, scale: 0.6 }}
                    animate={{ y: 34, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.4, filter: 'blur(6px)' }}
                    transition={{ duration: 0.85, ease: [0.87, 0, 0.13, 1] }}
                  >
                    <FragmentCluster seme={`db-${contatore.current}`} larghezza={60} altezza={22} n={18} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 3. il database: la camera "atterra" sulla tabella */}
            <div className="relative" style={{ perspective: 1400 }}>
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-16 rounded-[70px]"
                animate={{ opacity: fase === 'deposita' ? 1 : 0.55 }}
                transition={{ duration: 0.8 }}
                style={{ background: 'radial-gradient(55% 55% at 50% 30%, rgba(157,180,255,0.12), transparent 70%)' }}
              />
              {/* cornice con profilo spettrale */}
              <motion.div
                className="relative rounded-[28px] p-px"
                style={{
                  background: 'linear-gradient(135deg, rgba(157,180,255,0.45), rgba(243,241,236,0.07) 38%, rgba(243,241,236,0.04) 62%, rgba(255,197,138,0.4))',
                  boxShadow: '0 70px 160px rgba(0,0,0,0.6), 0 0 80px rgba(157,180,255,0.06)',
                  transformOrigin: '50% 0%',
                }}
                initial={false}
                animate={giaVisto || reduce ? { rotateX: 0, y: 0, opacity: 1 } : { rotateX: 18, y: 40, opacity: 0 }}
                transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="relative overflow-hidden rounded-[27px]" style={{ background: 'linear-gradient(180deg, rgba(20,22,33,0.94), rgba(9,10,16,0.97))' }}>
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40" style={{ background: 'radial-gradient(70% 100% at 50% 0%, rgba(157,180,255,0.08), transparent)' }} />

                  {/* barra superiore */}
                  <div className="relative flex flex-wrap items-center justify-between gap-3 px-6 py-4" style={{ borderBottom: `1px solid ${C.bordo}` }}>
                    <span className="flex min-w-0 items-center gap-3 text-[12.5px]" style={{ fontFamily: FONT_MONO }}>
                      <span className="flex gap-1.5" aria-hidden="true">
                        {[0, 1, 2].map((i) => <span key={i} className="h-[8px] w-[8px] rounded-full" style={{ background: 'rgba(243,241,236,0.1)' }} />)}
                      </span>
                      <span style={{ color: C.tenue }}>palacan-db</span>
                      <span style={{ color: 'rgba(141,143,160,0.4)' }}>/</span>
                      <span style={{ color: C.testo }}>{TUTTO_CIFRATO ? 'messages' : 'messages.ciphertext'}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="rounded-full px-2.5 py-1 text-[10.5px]" style={{ fontFamily: FONT_MONO, color: BRAND.ghiaccio, boxShadow: 'inset 0 0 0 1px rgba(157,180,255,0.3)', background: 'rgba(157,180,255,0.06)' }}>AES-256-GCM</span>
                      <span className="flex items-center gap-2 rounded-full px-2.5 py-1 text-[10.5px]" style={{ fontFamily: FONT_MONO, color: C.tenue, boxShadow: `inset 0 0 0 1px ${C.bordo}` }}>
                        <motion.span
                          className="h-[6px] w-[6px] rounded-full"
                          style={{ background: BRAND.ghiaccio }}
                          animate={reduce ? undefined : { opacity: fase === 'deposita' ? [1, 0.2, 1, 0.2, 1] : [1, 0.35, 1] }}
                          transition={{ duration: fase === 'deposita' ? 0.6 : 1.8, repeat: Infinity }}
                        />
                        {righe.length} rows
                      </span>
                    </span>
                  </div>

                  <div role="table" aria-label="palacan-db messages" className="relative">
                    {TUTTO_CIFRATO && scansione > 0 && !reduce && (
                      <motion.div
                        key={scansione}
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 z-10 h-14"
                        style={{ background: 'linear-gradient(180deg, transparent, rgba(157,180,255,0.08), transparent)', borderBottom: '1px solid rgba(157,180,255,0.2)' }}
                        initial={{ top: '-15%', opacity: 0 }}
                        animate={{ top: '100%', opacity: [0, 1, 1, 0] }}
                        transition={{ duration: 2.4, ease: 'easeInOut' }}
                      />
                    )}

                    {/* intestazioni: nomi delle colonne, discreti */}
                    <div role="row" className="hidden gap-4 px-5 py-2.5 sm:grid" style={{ gridTemplateColumns: griglia, borderBottom: `1px solid ${C.bordo}` }}>
                      <span role="columnheader" />
                      {COLONNE.map((c) => (
                        <span key={c} role="columnheader" className="truncate text-[10.5px] uppercase" style={{ fontFamily: FONT_MONO, color: 'rgba(141,143,160,0.7)', letterSpacing: '0.08em' }}>{c}</span>
                      ))}
                    </div>

                    {/* in attesa del primo invio: uno spazio vuoto, non una riga finta */}
                    <AnimatePresence initial={false}>
                      {!righe.some((r) => r.tua) && (
                        <motion.div
                          key="slot"
                          className="mx-3 my-2 flex items-center justify-center gap-3 rounded-xl px-4 py-3 text-[12.5px]"
                          style={{ border: '1px dashed rgba(157,180,255,0.26)', color: C.tenue, fontFamily: FONT }}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
                          transition={{ duration: 0.5, ease: [0.87, 0, 0.13, 1] }}
                        >
                          <motion.span className="h-[6px] w-[6px] rounded-full" style={{ background: SPETTRO }} animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity }} />
                          {v.slot}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence initial={false}>
                      {righe.map((r, i) => {
                        const nuova = r.id === ultima;
                        return (
                          <motion.div
                            key={r.id}
                            layout
                            role="row"
                            className="group relative px-5 py-3 transition-colors hover:bg-white/[0.02]"
                            style={{ borderBottom: i < righe.length - 1 ? `1px solid ${C.bordo}` : 'none', background: r.tua ? 'linear-gradient(90deg, rgba(157,180,255,0.07), rgba(255,197,138,0.025) 60%, transparent)' : undefined }}
                            initial={{ opacity: 0, y: -12, filter: 'blur(8px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], layout: { duration: 0.6, ease: [0.87, 0, 0.13, 1] } }}
                          >
                            {nuova && !reduce && (
                              <motion.span
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0"
                                initial={{ opacity: 0.9 }}
                                animate={{ opacity: 0 }}
                                transition={{ duration: 2.4, ease: 'easeOut' }}
                                style={{ background: 'linear-gradient(90deg, rgba(157,180,255,0.24), rgba(255,197,138,0.14) 60%, transparent)' }}
                              />
                            )}
                            {r.tua && <span aria-hidden="true" className="absolute bottom-2 left-0 top-2 w-[2px] rounded-full" style={{ background: SPETTRO }} />}

                            {/* desktop */}
                            <div className="relative hidden items-center gap-4 sm:grid" style={{ gridTemplateColumns: griglia }}>
                              {r.tua ? (
                                <span className="justify-self-start rounded-full px-1.5 py-[1px] text-[9.5px] uppercase" style={{ background: SPETTRO, color: BRAND.abisso, letterSpacing: '0.08em', fontFamily: FONT }}>{v.you}</span>
                              ) : (
                                <span className="text-[11px]" style={{ fontFamily: FONT_MONO, color: 'rgba(141,143,160,0.45)' }}>{String(righe.length - i).padStart(2, '0')}</span>
                              )}
                              {COLONNE.map((c) => (
                                <CellaTesto key={c} cella={r.celle[c]} tua={r.tua} nuova={nuova} />
                              ))}
                            </div>

                            {/* telefono: etichetta + valore, una riga ciascuno */}
                            <div className="relative flex flex-col gap-1.5 sm:hidden">
                              {r.tua && <span className="mb-0.5 w-fit rounded-full px-1.5 py-[1px] text-[9.5px] uppercase" style={{ background: SPETTRO, color: BRAND.abisso, fontFamily: FONT }}>{v.you}</span>}
                              {COLONNE.map((c) => (
                                <div key={c} className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-2">
                                  <span className="text-[10.5px] uppercase" style={{ fontFamily: FONT_MONO, color: 'rgba(141,143,160,0.6)', letterSpacing: '0.06em' }}>{c}</span>
                                  <CellaTesto cella={r.celle[c]} tua={r.tua} nuova={nuova} />
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  {/* piede: dati dell'ultimo invio e quanto il server riesce a leggere */}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" style={{ borderTop: `1px solid ${C.bordo}`, background: 'rgba(243,241,236,0.015)' }}>
                    <span className="flex flex-wrap items-center gap-2 text-[11px]" style={{ fontFamily: FONT_MONO, color: C.tenue }}>
                      {TUTTO_CIFRATO ? v.readable(campiTotali) : 'ciphertext · AES-256-GCM'}
                      <AnimatePresence>
                        {ultima && (
                          <motion.span key={ultima} className="flex gap-1.5" initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ delay: reduce ? 0 : 0.8, duration: 0.5 }}>
                            {[`${righe.find((r) => r.id === ultima)?.byte ?? 0} B`, 'IV 96 bit'].map((x) => (
                              <span key={x} className="rounded-full px-2 py-[1px]" style={{ boxShadow: `inset 0 0 0 1px ${C.bordo}` }}>{x}</span>
                            ))}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                    <span className="flex items-center gap-2.5">
                      <span className="relative h-[3px] w-20 overflow-hidden rounded-full" style={{ background: 'rgba(243,241,236,0.08)' }} aria-hidden="true" />
                      <span className="text-[11px]" style={{ fontFamily: FONT_MONO, color: BRAND.ghiaccio }}>0%</span>
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>

            <p className="mx-auto mt-8 max-w-2xl text-center text-[14.5px] leading-relaxed" style={{ color: C.tenue, fontWeight: 300 }}>{TUTTO_CIFRATO ? v.captionAll : v.captionServer}</p>
            <p className="mx-auto mt-4 max-w-xl text-center text-[12px]" style={{ color: 'rgba(141,143,160,0.7)' }}>{v.foot}</p>
          </>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------ scegli il tuo nome
// L'unica cosa che Palacan chiede, da provare subito: un campo
// tipografico enorme. Finche' non lo tocchi scrive da solo degli
// esempi; poi scrivi il tuo. Ogni lettera arriva "a fuoco", come i
// frammenti del logo. Solo anteprima: nulla viene inviato.
const CARATTERI_NON_AMMESSI = /[^a-z0-9._]/g;

const CHIAVE_NOME_SCELTO = 'palacan:nome-scelto'; // letta da UnifiedAuthCard per precompilare la registrazione

function ScegliNome({ t, onClaim, disabled, onNome }) {
  const reduce = useReducedMotion();
  const zonaRef = useRef(null);
  const inputRef = useRef(null);
  const visto = useInViewSicuro(zonaRef, { amount: 0.4 });
  const [valore, setValore] = useState('');
  const [toccato, setToccato] = useState(false);
  const [focus, setFocus] = useState(false);
  const [demo, setDemo] = useState('');
  const esempi = t.identity.examples;

  // dimostrazione: scrive e cancella esempi finche' l'utente non interviene
  useEffect(() => {
    if (toccato || reduce || !visto) return undefined;
    let annullato = false;
    let timer;
    let e = 0;
    let i = 0;
    let fase = 'scrive';
    const passo = () => {
      if (annullato) return;
      const parola = esempi[e % esempi.length];
      if (fase === 'scrive') {
        i += 1;
        setDemo(parola.slice(0, i));
        if (i >= parola.length) {
          fase = 'cancella';
          timer = setTimeout(passo, 1500);
          return;
        }
        timer = setTimeout(passo, 85 + Math.random() * 75);
      } else {
        i -= 1;
        setDemo(parola.slice(0, i));
        if (i <= 0) {
          fase = 'scrive';
          e += 1;
          timer = setTimeout(passo, 380);
          return;
        }
        timer = setTimeout(passo, 36);
      }
    };
    timer = setTimeout(passo, 500);
    return () => {
      annullato = true;
      clearTimeout(timer);
    };
  }, [toccato, reduce, visto, esempi]);

  const prendiNome = () => {
    try {
      if (toccato && valore) sessionStorage.setItem(CHIAVE_NOME_SCELTO, valore);
    } catch {
      /* sessionStorage non disponibile: la registrazione parte vuota, come prima */
    }
    onClaim?.();
  };

  const testo = toccato ? valore : reduce ? esempi[0] : demo;
  const vuoto = toccato && valore.length === 0;
  const cursore = focus || !toccato;

  return (
    <div ref={zonaRef} className="mx-auto mt-16 flex w-full max-w-4xl flex-col items-center" style={{ fontFamily: FONT }}>
      {/* il campo: display tipografico + input vero (invisibile ma usabile, anche da tastiera mobile) */}
      <div className="relative w-full cursor-text" onClick={() => inputRef.current?.focus()}>
        <div
          className="flex min-h-[1.25em] items-baseline justify-center overflow-hidden whitespace-nowrap px-2"
          style={{ fontSize: 'clamp(40px, 8.5vw, 108px)', fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1.15 }}
          aria-hidden="true"
        >
          <span style={{ color: BRAND.nebbia }}>@</span>
          {testo.split('').map((ch, i) => (
            <motion.span
              key={`${toccato ? 'u' : 'd'}-${i}-${ch}`}
              initial={reduce ? false : { opacity: 0, filter: 'blur(10px)', y: 8 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              style={{ color: C.testo, display: 'inline-block' }}
            >
              {ch}
            </motion.span>
          ))}
          {vuoto && (
            <span style={{ color: 'rgba(141,143,160,0.35)' }}>{t.identity.examples[0]}</span>
          )}
          {cursore && (
            <motion.span
              animate={reduce ? undefined : { opacity: [1, 0, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              style={{ display: 'inline-block', width: '0.045em', height: '0.9em', marginLeft: '0.06em', alignSelf: 'center', background: BRAND.ghiaccio, borderRadius: 2 }}
            />
          )}
        </div>
        <motion.div
          className="mx-auto mt-3 h-px"
          style={{ background: SPETTRO }}
          initial={false}
          animate={{ width: focus ? '72%' : '38%', opacity: focus ? 1 : 0.55 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
        <input
          ref={inputRef}
          value={valore}
          onChange={(e) => {
            setToccato(true);
            const pulito = e.target.value.toLowerCase().replace(CARATTERI_NON_AMMESSI, '').slice(0, 20);
            setValore(pulito);
            onNome?.(pulito);
          }}
          onFocus={() => {
            setFocus(true);
            setToccato(true);
          }}
          onBlur={() => setFocus(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !disabled) prendiNome();
          }}
          aria-label={t.identity.hint}
          maxLength={20}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
          style={{ fontSize: 16, outline: 'none', boxShadow: 'none', border: 0 }}
        />
      </div>
      <p className="mt-5 text-center text-[13px]" style={{ color: BRAND.nebbia }}>{t.identity.hint}</p>

      <div className="mt-9 flex flex-col items-center gap-3">
        <MagneticButton primary onClick={prendiNome} disabled={disabled}>{t.identity.claim}</MagneticButton>
        <span className="max-w-xs text-center text-[12px]" style={{ color: 'rgba(141,143,160,0.75)' }}>{t.identity.note}</span>
      </div>

    </div>
  );
}

// ------------------------------------------------------------ blocchi
function Blocco({ id, eyebrow, titolo, descrizione, children }) {
  return (
    <section id={id} className="ct-scroll-reveal mx-auto max-w-5xl px-6 py-20 sm:py-28" style={{ fontFamily: FONT }}>
      {eyebrow && <span className="text-[11px] uppercase" style={{ color: C.tenue, letterSpacing: '0.2em' }}>{eyebrow}</span>}
      <h2 className="mt-4 max-w-3xl text-[30px] leading-[1.08] sm:text-[46px]" style={{ color: C.testo, fontWeight: 300, letterSpacing: '-0.035em' }}>{titolo}</h2>
      {descrizione && <p className="mt-5 max-w-2xl text-base leading-relaxed sm:text-lg" style={{ color: C.tenue, fontWeight: 300 }}>{descrizione}</p>}
      {children}
    </section>
  );
}

function Punti({ items }) {
  return (
    <ul className="mt-12 grid gap-x-12 gap-y-7 sm:grid-cols-2">
      {items.map((testo) => (
        <li key={testo} className="flex gap-4 pt-6" style={{ borderTop: `1px solid ${C.bordo}` }}>
          <span className="mt-[9px] shrink-0" style={{ width: 6, height: 6, borderRadius: 6, background: SPETTRO }} />
          <span className="text-[15px] leading-relaxed" style={{ color: 'rgba(243,241,236,0.82)', fontWeight: 300 }}>{testo}</span>
        </li>
      ))}
    </ul>
  );
}

const NUMERO_ESEMPIO = '48291 03847 62015 90372 11584 76230';

function VerificationCard({ t }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex flex-col gap-7 rounded-[28px] p-8" style={{ background: BRAND.grafite, boxShadow: `inset 0 0 0 1px ${C.bordo}`, fontFamily: FONT }}>
      <div className="flex items-center gap-5">
        <motion.span animate={{ scale: ok ? [1, 1.08, 1] : 1 }} transition={{ duration: 0.6 }} style={{ lineHeight: 0 }}>
          <PalacanIcon size={64} stato={ok ? 'allineato' : 'disperso'} />
        </motion.span>
        <span aria-live="polite" className="text-sm" style={{ color: ok ? BRAND.ghiaccio : C.tenue }}>{ok ? t.verify.done : t.verify.todo}</span>
      </div>
      <div className="grid grid-cols-3 gap-x-5 gap-y-1 text-lg tracking-wider" style={{ fontFamily: "'Geist Mono Variable', 'Geist Mono', ui-monospace, monospace", color: C.testo }}>
        {NUMERO_ESEMPIO.split(' ').map((g, i) => (
          <motion.span key={g} animate={{ opacity: ok ? 1 : 0.55, filter: ok ? 'blur(0px)' : 'blur(0.6px)' }} transition={{ delay: ok ? i * 0.06 : 0 }}>{g}</motion.span>
        ))}
      </div>
      <div>
        <MagneticButton primary onClick={() => setOk((v) => !v)}>{ok ? t.verify.undo : t.verify.match}</MagneticButton>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ pagina
export default function Landing({ isOlmReady, onShowPersonalLogin, onShowPersonalRegister, onEnterpriseLogin, onEnterpriseActivate }) {
  const { t } = useTesti();
  const nav = useNav(t);
  const [nomeScelto, setNomeScelto] = useState('');
  useLenisScroll();
  useScrollDrivenReveals();

  const vediComeFunziona = () => document.getElementById('come-funziona')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const scrollAOltre = () => document.getElementById('dopo-hero')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="relative flex min-h-screen flex-col" style={{ fontFamily: FONT, background: 'transparent', color: C.testo, zIndex: 1 }}>
      <style>{`
        ${FONT_IMPORT}
        html, body { background: ${BRAND.abisso}; }
        ::selection { background: ${BRAND.ghiaccio}; color: ${BRAND.abisso}; }
      `}</style>

      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[700] focus:rounded-full focus:px-4 focus:py-2" style={{ background: C.testo, color: BRAND.abisso }}>
        {t.nav.skip}
      </a>

      {/* l'ambiente fisso dietro tutta la home: oceano, campo profondo, nebbie */}
      <SfondoPalacan />
      <CursorePremium />
      <Header isOlmReady={isOlmReady} onShowPersonalRegister={onShowPersonalRegister} onShowPersonalLogin={onShowPersonalLogin} />

      <InteractiveHero onEnter={scrollAOltre}>
        <MagneticButton primary onClick={onShowPersonalRegister} disabled={!isOlmReady}>{t.hero.cta}</MagneticButton>
        <MagneticButton onClick={vediComeFunziona}>{t.hero.how}</MagneticButton>
      </InteractiveHero>
      <div id="dopo-hero" />

      <main id="main-content" className="flex-1" tabIndex={-1}>
        <section className="px-6 pb-24 pt-24 sm:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-[11px] uppercase" style={{ color: C.tenue, letterSpacing: '0.2em' }}>{t.identity.eyebrow}</span>
            <h2 className="mt-5 text-[32px] leading-[1.06] sm:text-[52px]" style={{ fontWeight: 300, letterSpacing: '-0.04em' }}>
              <span className="block" style={{ color: C.tenue, textWrap: 'balance' }}>{t.identity.title1}</span>
              <span className="block" style={{ textWrap: 'balance' }}>{t.identity.title2}</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: C.tenue, fontWeight: 300 }}>{t.identity.sub}</p>
          </div>
          <ScegliNome t={t} onClaim={onShowPersonalRegister} disabled={!isOlmReady} onNome={setNomeScelto} />
          <div className="mx-auto mt-28 grid max-w-5xl gap-12 sm:grid-cols-3">
            {t.features.map((f, i) => (
              <div key={f.t} className="ct-scroll-reveal flex flex-col gap-3 pt-6" style={{ borderTop: `1px solid ${C.bordo}` }}>
                <span className="text-[11px]" style={{ color: C.tenue, letterSpacing: '0.2em' }}>0{i + 1}</span>
                <h3 className="text-xl font-medium" style={{ letterSpacing: '-0.015em' }}>{f.t}</h3>
                <p className="text-[15px] leading-relaxed" style={{ color: C.tenue, fontWeight: 300 }}>{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        <div id="come-funziona" style={{ scrollMarginTop: 72 }}>
          <MessageJourney />
        </div>

        <DatabaseCifrato t={t} nome={nomeScelto} />

        <section className="px-6 py-24 sm:py-32" id="open-source">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <span className="text-[11px] uppercase" style={{ color: C.tenue, letterSpacing: '0.2em' }}>{t.code.eyebrow}</span>
            <h2 className="mt-5 text-[32px] leading-tight sm:text-[48px]" style={{ fontWeight: 300, letterSpacing: '-0.035em' }}>{t.code.title}</h2>
            <p className="mt-4 text-base" style={{ color: C.tenue, fontWeight: 300 }}>{t.code.sub}</p>
          </div>
          <CodeExplainer />
        </section>

        <Blocco titolo={t.keys.title} descrizione={t.keys.sub}>
          <div className="mt-12"><RatchetSymbol size={64} /></div>
          <Punti items={t.keys.points} />
        </Blocco>

        <section className="ct-scroll-reveal mx-auto grid max-w-5xl items-center gap-12 px-6 py-20 sm:py-28 lg:grid-cols-2">
          <div>
            <h2 className="text-[30px] leading-[1.08] sm:text-[46px]" style={{ fontWeight: 300, letterSpacing: '-0.035em' }}>{t.verify.title}</h2>
            <p className="mt-5 text-base leading-relaxed sm:text-lg" style={{ color: C.tenue, fontWeight: 300 }}>{t.verify.sub}</p>
          </div>
          <VerificationCard t={t} />
        </section>

        <Blocco titolo={t.devices.title} descrizione={t.devices.sub}>
          <Punti items={t.devices.points} />
        </Blocco>

        <Blocco id="aziende" eyebrow={t.business.eyebrow} titolo={t.business.title} descrizione={t.business.sub}>
          <Punti items={t.business.points} />
          <div className="mt-12 flex flex-wrap gap-3">
            <MagneticButton primary onClick={onEnterpriseActivate}>{t.business.activate}</MagneticButton>
            <MagneticButton onClick={onEnterpriseLogin}>{t.business.login}</MagneticButton>
          </div>
        </Blocco>

        <section className="px-6 py-28 text-center sm:py-40">
          <div className="mx-auto flex max-w-2xl flex-col items-center">
            <PalacanIcon size={76} />
            <h2 className="mt-10 text-[32px] leading-[1.06] sm:text-[52px]" style={{ fontWeight: 300, letterSpacing: '-0.04em' }}>{t.final.title}</h2>
            <div className="mt-10">
              <MagneticButton primary onClick={onShowPersonalRegister} disabled={!isOlmReady}>{t.final.cta}</MagneticButton>
            </div>
            {!isOlmReady && <p className="mt-4 text-sm" style={{ color: C.tenue }} aria-live="polite">{t.final.preparing}</p>}
          </div>
        </section>
      </main>

      <footer className="px-6 py-14" style={{ borderTop: `1px solid ${C.bordo}` }}>
        <div className="mx-auto flex max-w-7xl flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-4">
            <Wordmark size={15} />
            <span className="text-sm" style={{ color: C.tenue, fontWeight: 300 }}>{t.footer.tagline}</span>
          </div>
          <nav aria-label="Pages" className="grid grid-cols-2 gap-x-10 gap-y-2.5 text-sm sm:grid-cols-4">
            {[...nav.principale, ...nav.legale].map((v) => (
              <Link key={v.href} to={v.href} className="transition-colors hover:text-white" style={{ color: C.tenue }}>{v.label}</Link>
            ))}
          </nav>
        </div>
        <div className="mx-auto mt-12 flex max-w-7xl flex-wrap items-center justify-between gap-3 text-sm" style={{ color: C.tenue }}>
          <span>© {new Date().getFullYear()} Palacan</span>
          <button type="button" onClick={onShowPersonalLogin} disabled={!isOlmReady} className="underline decoration-dotted underline-offset-4 hover:text-white disabled:opacity-50">
            {t.footer.login}
          </button>
        </div>
      </footer>
    </div>
  );
}
