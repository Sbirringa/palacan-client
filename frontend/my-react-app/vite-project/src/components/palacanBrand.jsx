import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion, useInView } from 'framer-motion';
import { createPortal } from 'react-dom';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { useTesti, LINGUE, linguaAttiva } from './testiHome';

// ============================================================
// PALACAN — "Da ogni punto di vista"
//
// Idea: il messaggio attraversa il mondo alla luce del sole, sparso
// in migliaia di frammenti. Solo da un punto preciso — quello di chi
// deve leggerlo — i frammenti tornano a formare un senso.
//
// Regole del linguaggio visivo:
// - cifrato  = frammenti sparsi in profondita', fuori fuoco, con una
//              leggera scomposizione spettrale (ghiaccio / ambra)
// - in chiaro = frammenti allineati, nitidi, luce bianca calda
// - il colore esiste solo mentre qualcosa NON e' ancora leggibile
// ============================================================

export const BRAND = {
  abisso: '#05060B',
  grafite: '#101119',
  grafiteAlta: '#171924',
  luce: '#F3F1EC',
  nebbia: '#8D8FA0',
  ghiaccio: '#9DB4FF',
  ambra: '#FFC58A',
  azione: '#4452C8', // per sfondi con testo bianco: contrasto 6.39:1
  linea: 'rgba(243,241,236,0.1)',
  lineaForte: 'rgba(243,241,236,0.2)',
};

export const SPETTRO = `linear-gradient(90deg, ${BRAND.ghiaccio}, ${BRAND.luce} 50%, ${BRAND.ambra})`;
// Caratteri serviti IN LOCALE (Fontsource): nessuna richiesta a Google Fonts, come il resto dell'app.
export const FONT = "'Geist Variable', 'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif";
export const FONT_MONO = "'Geist Mono Variable', 'Geist Mono', 'IBM Plex Mono', ui-monospace, monospace";
export const FONT_IMPORT = ''; // un tempo @import da Google Fonts: rimosso per privacy

// useInView di framer-motion usa IntersectionObserver senza controllare che esista.
// Dove manca (jsdom nei test, browser molto vecchi) consideriamo l'elemento visibile.
// La condizione e' fissa per tutta la vita della pagina, quindi l'ordine degli hook non cambia.
const HA_INTERSECTION_OBSERVER = typeof window !== 'undefined' && typeof window.IntersectionObserver !== 'undefined';
export function useInViewSicuro(ref, opzioni) {
  if (!HA_INTERSECTION_OBSERVER) return true;
  return useInView(ref, opzioni); // eslint-disable-line react-hooks/rules-of-hooks
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const expoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// hash deterministico (solo per forme visive, NON crittografico)
export function hash(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function casuale(seme) {
  let s = hash(seme) || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822519) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489917) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
  };
}

// ============================================================
// WORDMARK statico
// ============================================================
export function Wordmark({ size = 16, color = BRAND.luce, className, style }) {
  return (
    <span
      className={className}
      aria-label="PALACAN"
      style={{
        fontFamily: FONT,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: '0.24em',
        marginRight: '-0.24em',
        color,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      PALACAN
    </span>
  );
}

// ============================================================
// ICONA: frammenti che convergono in prospettiva verso un punto di
// luce. stato 'allineato' (default) o 'disperso' (non verificato).
// ============================================================
export function PalacanIcon({ size = 40, stato = 'allineato', sfondo = true, title }) {
  const id = useMemo(() => `pi${hash(`${size}${stato}${Math.random()}`)}`, [size, stato]);
  const tratti = useMemo(() => {
    const r = casuale('palacan-icona');
    const n = size < 28 ? 14 : 46;
    return Array.from({ length: n }, () => {
      const a = r() * Math.PI * 2;
      const d = 0.28 + Math.pow(r(), 0.7) * 0.62;
      return { a, d, l: 0.05 + d * 0.13, w: 0.6 + d * 1.6, f: d > 0.55 };
    });
  }, [size]);
  const disperso = stato === 'disperso';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <radialGradient id={`${id}n`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.25" stopColor={disperso ? BRAND.ghiaccio : '#FFE9CF'} stopOpacity="0.9" />
          <stop offset="1" stopColor={disperso ? BRAND.ghiaccio : BRAND.ambra} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#15161F" />
          <stop offset="1" stopColor="#04050A" />
        </linearGradient>
      </defs>
      {sfondo && <rect width="100" height="100" rx="23" fill={`url(#${id}s)`} />}
      {tratti.map((t, i) => {
        const cx = 50 + Math.cos(t.a) * t.d * 50;
        const cy = 50 + Math.sin(t.a) * t.d * 50;
        const k = disperso ? 0.4 : 1;
        const ex = cx - Math.cos(t.a) * t.l * 50 * k;
        const ey = cy - Math.sin(t.a) * t.l * 50 * k;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={ex}
            y2={ey}
            stroke={t.f ? BRAND.ghiaccio : BRAND.luce}
            strokeOpacity={disperso ? 0.35 : 0.25 + (1 - t.d) * 0.6}
            strokeWidth={t.w * (size < 28 ? 2.2 : 1)}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="50" cy="50" r={disperso ? 10 : 22} fill={`url(#${id}n)`} />
    </svg>
  );
}

// Icona animata per i caricamenti: i frammenti respirano verso il centro
export function PalacanLoader({ size = 40, label = 'Loading' }) {
  const reduce = useReducedMotion();
  return (
    <span role="status" aria-label={label} style={{ display: 'inline-block', lineHeight: 0 }}>
      <motion.span
        style={{ display: 'inline-block' }}
        animate={reduce ? undefined : { rotate: 360, scale: [1, 0.92, 1] }}
        transition={{ rotate: { duration: 14, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } }}
      >
        <PalacanIcon size={size} sfondo={false} />
      </motion.span>
    </span>
  );
}

// ============================================================
// TESTO A FRAMMENTI: cifrato = frammenti sparsi, in chiaro = lettere.
// Usato nelle bolle dei telefoni (il messaggio che si ricompone).
// ============================================================
export function FragmentText({ text, cifrato, seme = '', passo = 0.04 }) {
  const reduce = useReducedMotion();
  const parole = useMemo(() => {
    let i = 0;
    return String(text).split(' ').map((p) => {
      const out = { p, i };
      i += p.length + 1;
      return out;
    });
  }, [text]);

  return (
    <span aria-label={text}>
      {parole.map(({ p, i: inizio }, w) => (
        <React.Fragment key={w}>
          {w > 0 && ' '}
          <span style={{ whiteSpace: 'nowrap' }}>
            {p.split('').map((ch, j) => {
              const i = inizio + j;
              const r = casuale(`${seme}:${i}:${ch}`);
              const punti = [0, 1, 2].map(() => ({ x: (r() - 0.5) * 22, y: (r() - 0.5) * 16, c: r() > 0.5 ? BRAND.ghiaccio : BRAND.ambra }));
              const ritardo = reduce ? 0 : i * passo;
              return (
                <span key={j} aria-hidden="true" style={{ position: 'relative', display: 'inline-block' }}>
                  <motion.span
                    style={{ display: 'inline-block' }}
                    initial={false}
                    animate={{ opacity: cifrato ? 0 : 1, filter: cifrato ? 'blur(4px)' : 'blur(0px)' }}
                    transition={{ duration: reduce ? 0 : 0.35, delay: cifrato ? 0 : ritardo + 0.28 }}
                  >
                    {ch}
                  </motion.span>
                  {!reduce &&
                    punti.map((pt, k) => (
                      <motion.span
                        key={k}
                        style={{ position: 'absolute', left: '50%', top: '50%', width: 2.5, height: 2.5, marginLeft: -1.25, marginTop: -1.25, borderRadius: 2, background: pt.c }}
                        initial={false}
                        animate={{ x: cifrato ? pt.x : 0, y: cifrato ? pt.y : 0, opacity: cifrato ? 0.9 : 0, scale: cifrato ? 1 : 0.4 }}
                        transition={{ duration: 0.55, delay: cifrato ? 0 : ritardo, ease: [0.16, 1, 0.3, 1] }}
                      />
                    ))}
                </span>
              );
            })}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

// Una piccola nuvola di frammenti: il messaggio cifrato in viaggio
export function FragmentCluster({ seme = 'pacchetto', larghezza = 84, altezza = 30, n = 26 }) {
  const reduce = useReducedMotion();
  const punti = useMemo(() => {
    const r = casuale(seme);
    return Array.from({ length: n }, () => ({
      x: r() * larghezza,
      y: r() * altezza,
      s: 1.6 + r() * 2.2,
      c: r() > 0.55 ? BRAND.ghiaccio : r() > 0.4 ? BRAND.ambra : BRAND.luce,
      dx: (r() - 0.5) * 8,
      dy: (r() - 0.5) * 6,
      d: 1.2 + r() * 1.4,
    }));
  }, [seme, larghezza, altezza, n]);
  return (
    <span style={{ position: 'relative', display: 'block', width: larghezza, height: altezza }} aria-hidden="true">
      {punti.map((p, i) => (
        <motion.span
          key={i}
          style={{ position: 'absolute', left: p.x, top: p.y, width: p.s, height: p.s, borderRadius: 3, background: p.c, boxShadow: `0 0 6px ${p.c}` }}
          animate={reduce ? undefined : { x: [0, p.dx, 0], y: [0, p.dy, 0], opacity: [0.95, 0.5, 0.95] }}
          transition={{ duration: p.d, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

// ============================================================
// FRAGMENT HERO — l'ingresso cinematografico del marchio.
// La camera parte dentro una nuvola di frammenti, si allontana
// ruotando e si aggancia all'unico punto di vista da cui i
// frammenti formano PALACAN. Poi l'utente puo' uscire dal punto di
// vista muovendo il puntatore: il nome si scompone e si ricompone.
// ============================================================
const FOCALE = 1000;
const DURATA_INTRO = 4.4;

function spriteMorbido(r, g, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = typeof c.getContext === 'function' ? c.getContext('2d') : null;
  if (!x) return c;
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
  gr.addColorStop(0.35, `rgba(${r},${g},${b},0.85)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return c;
}

// Stato condiviso tra l'ingresso (il nome) e l'ambiente fisso dietro la pagina:
// l'ingresso scrive camera, momento dell'aggancio e orizzonte; l'ambiente li legge.
export const scenaPalacan = {
  attivo: false,
  visibile: false,
  yaw: 0,
  pitch: 0,
  dolly: 0,
  k: 0,
  orizzonteY: 0,
  inizio: 0, // secondi (performance.now) di avvio dell'ingresso
  riduci: false,
};

export function FragmentHero({ titolo, sottotitolo, suggerimento, etichettaRivedi, children }) {
  const reduce = useReducedMotion();
  const sezioneRef = useRef(null);
  const telaRef = useRef(null);
  const motore = useRef(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const sezione = sezioneRef.current;
    const tela = telaRef.current;
    if (!sezione || !tela) return undefined;
    const ctx = typeof tela.getContext === 'function' ? tela.getContext('2d') : null;
    if (!ctx || typeof IntersectionObserver === 'undefined') {
      // ambiente senza canvas/IntersectionObserver (test, browser vecchi): niente animazione, testi visibili
      setPronto(true);
      return undefined;
    }
    const sprite = { luce: spriteMorbido(245, 243, 238), caldo: spriteMorbido(255, 200, 150), freddo: spriteMorbido(150, 175, 255) };

    const st = {
      W: 0, H: 0, punti: [], passo: 4, larghezzaNome: 1,
      T0: performance.now(), yawU: 0, pitchU: 0, yawT: 0, pitchT: 0, ultimo: -10,
      mostrato: false, visibile: true, raf: 0, vivo: true,
    };

    function misura() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = sezione.getBoundingClientRect();
      st.W = r.width;
      st.H = r.height;
      tela.width = Math.round(st.W * dpr);
      tela.height = Math.round(st.H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function campiona() {
      st.passo = st.W < 700 ? 5 : 4;
      const c = document.createElement('canvas');
      c.width = 1800;
      c.height = 300;
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.textBaseline = 'middle';
      x.font = `500 220px ${FONT}`;
      const parola = 'PALACAN';
      const track = 0.2 * 220;
      const larg = parola.split('').map((ch) => x.measureText(ch).width);
      const tot = larg.reduce((a, b) => a + b, 0) + track * (parola.length - 1);
      let px = (1800 - tot) / 2;
      parola.split('').forEach((ch, i) => {
        x.fillText(ch, px, 158);
        px += larg[i] + track;
      });
      st.larghezzaNome = tot;
      const d = x.getImageData(0, 0, 1800, 300).data;
      const out = [];
      const P = st.passo;
      for (let y = 0; y < 300; y += P) {
        for (let xx = 0; xx < 1800; xx += P) {
          if (d[(y * 1800 + xx) * 4 + 3] > 140) {
            const u = Math.random() + Math.random() + Math.random() - 1.5;
            const z = u * 620;
            const x0 = xx - 900 + (Math.random() - 0.5) * P * 0.6;
            const y0 = y - 150 + (Math.random() - 0.5) * P * 0.6;
            out.push({
              X: (x0 * (FOCALE + z)) / FOCALE,
              Y: (y0 * (FOCALE + z)) / FOCALE,
              z,
              x0,
              y0,
              fase: Math.random() * 6.283,
              ritmo: 0.9 + Math.random() * 1.6, // ogni frammento pulsa con un suo ritmo
              sz: 0.75 + Math.random() * 0.5,
            });
          }
        }
      }
      st.punti = out;
      st.fotoNome = null;
    }

    // il resto del traffico del mondo: frammenti lontani che non si allineano mai
    function preparaSfondo() {
      const n = st.W < 700 ? 320 : 620;
      // nebbie pre-disegnate una sola volta (non a ogni fotogramma)
      const neb = document.createElement('canvas');
      const nw = Math.max(1, Math.round(st.W / 2));
      const nh = Math.max(1, Math.round(st.H / 2));
      neb.width = nw;
      neb.height = nh;
      const nx = neb.getContext('2d');
      const r1 = Math.max(nw, nh) * 0.6;
      const g1 = nx.createRadialGradient(nw * 0.18, nh * 0.3, 0, nw * 0.18, nh * 0.3, r1);
      g1.addColorStop(0, 'rgba(120,145,255,0.22)');
      g1.addColorStop(1, 'rgba(120,145,255,0)');
      nx.fillStyle = g1;
      nx.fillRect(0, 0, nw, nh);
      const g2 = nx.createRadialGradient(nw * 0.84, nh * 0.72, 0, nw * 0.84, nh * 0.72, r1);
      g2.addColorStop(0, 'rgba(255,190,130,0.15)');
      g2.addColorStop(1, 'rgba(255,190,130,0)');
      nx.fillStyle = g2;
      nx.fillRect(0, 0, nw, nh);
      st.nebbia = neb;

      // velo finale: vignettatura + grana, disegnati UNA volta e poi solo copiati
      const velo = document.createElement('canvas');
      velo.width = nw;
      velo.height = nh;
      const vx = velo.getContext('2d');
      const vg = vx.createRadialGradient(nw / 2, nh * 0.45, Math.min(nw, nh) * 0.35, nw / 2, nh * 0.45, Math.max(nw, nh) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.42)');
      vx.fillStyle = vg;
      vx.fillRect(0, 0, nw, nh);
      // grana su un livello separato, poi fusa sopra con trasparenza bassissima
      const livello = document.createElement('canvas');
      livello.width = nw;
      livello.height = nh;
      const lx = livello.getContext('2d');
      const grana = lx.createImageData(nw, nh);
      for (let i = 0; i < grana.data.length; i += 4) {
        const n = Math.random();
        grana.data[i] = 255;
        grana.data[i + 1] = 255;
        grana.data[i + 2] = 255;
        grana.data[i + 3] = n > 0.55 ? Math.round((n - 0.55) * 30) : 0; // al massimo ~5% di opacita'
      }
      lx.putImageData(grana, 0, 0);
      vx.drawImage(livello, 0, 0);
      st.velo = velo;

      // l'oceano di frammenti: una griglia in prospettiva che ondeggia sotto il nome
      const colonne = st.W < 700 ? 56 : 100;
      const righe = st.W < 700 ? 28 : 42;
      const oc = { colonne, righe, xs: [], zs: [], colori: [], dimensioni: [], jx: [], jz: [] };
      for (let i = 0; i < colonne * righe; i += 1) {
        oc.jx.push((Math.random() - 0.5) * 46);
        oc.jz.push((Math.random() - 0.5) * 70);
      }
      for (let c = 0; c < colonne; c += 1) oc.xs.push(-3400 + (6800 * c) / (colonne - 1));
      for (let r = 0; r < righe; r += 1) {
        const u = r / (righe - 1); // 0 = lontano, 1 = vicino
        oc.zs.push(5600 - Math.pow(u, 1.35) * 5480);
        // lontano freddo (ghiaccio) -> medio luce -> vicino caldo (ambra)
        const col = u < 0.5
          ? [157 + (243 - 157) * (u / 0.5), 180 + (241 - 180) * (u / 0.5), 255 + (236 - 255) * (u / 0.5)]
          : [243 + (255 - 243) * ((u - 0.5) / 0.5), 241 + (197 - 241) * ((u - 0.5) / 0.5), 236 + (138 - 236) * ((u - 0.5) / 0.5)];
        oc.colori.push(`rgb(${Math.round(col[0])},${Math.round(col[1])},${Math.round(col[2])})`);
        oc.dimensioni.push(0.8 + u * 1.5);
      }
      st.oceano = oc;

      // alba, linea d'orizzonte e velatura dietro i testi: disegnate una volta
      {
        const W = st.W, H = st.H;
        const k = Math.min(W * (W < 700 ? 0.8 : 0.74), 1150) / st.larghezzaNome;
        const cx = W / 2, cy = H * 0.4, orizzonte = cy + 104 * k;
        const luce = document.createElement('canvas');
        luce.width = Math.max(1, Math.round(W / 2));
        luce.height = Math.max(1, Math.round(H / 2));
        const lx2 = luce.getContext('2d');
        lx2.scale(0.5, 0.5);
        lx2.save();
        lx2.translate(cx, orizzonte);
        lx2.scale(1, 0.26);
        const alba = lx2.createRadialGradient(0, 0, 0, 0, 0, W * 0.72);
        alba.addColorStop(0, 'rgba(255,228,200,0.55)');
        alba.addColorStop(0.2, 'rgba(255,190,140,0.28)');
        alba.addColorStop(0.48, 'rgba(140,160,255,0.16)');
        alba.addColorStop(1, 'rgba(140,160,255,0)');
        lx2.fillStyle = alba;
        lx2.fillRect(-W, -W * 0.7, W * 2, W * 1.4);
        lx2.restore();
        st.alba = luce;

        const riga = document.createElement('canvas');
        riga.width = Math.max(1, Math.round(W));
        riga.height = 3;
        const rx = riga.getContext('2d');
        const linea = rx.createLinearGradient(0, 0, W, 0);
        linea.addColorStop(0, 'rgba(157,180,255,0)');
        linea.addColorStop(0.3, 'rgba(157,180,255,0.35)');
        linea.addColorStop(0.5, 'rgba(255,236,214,0.85)');
        linea.addColorStop(0.7, 'rgba(255,197,138,0.35)');
        linea.addColorStop(1, 'rgba(255,197,138,0)');
        rx.fillStyle = linea;
        rx.fillRect(0, 0.75, W, 1.5);
        st.lineaOrizzonte = riga;

        const scrim = document.createElement('canvas');
        scrim.width = Math.max(1, Math.round(W / 2));
        scrim.height = Math.max(1, Math.round(H / 2));
        const sx2 = scrim.getContext('2d');
        sx2.scale(0.5, 0.5);
        sx2.translate(cx, orizzonte + 150 * k);
        sx2.scale(1, 0.42);
        const velatura = sx2.createRadialGradient(0, 0, 0, 0, 0, Math.min(W * 0.42, 640));
        velatura.addColorStop(0, 'rgba(5,6,11,0.8)');
        velatura.addColorStop(0.6, 'rgba(5,6,11,0.45)');
        velatura.addColorStop(1, 'rgba(5,6,11,0)');
        sx2.fillStyle = velatura;
        sx2.fillRect(-W, -H * 2, W * 2, H * 4);
        st.velatura = scrim;
      }

      // due soli strati a piena risoluzione: niente ridimensionamenti a ogni fotogramma
      {
        const W = st.W, H = st.H;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const k = Math.min(W * (W < 700 ? 0.8 : 0.74), 1150) / st.larghezzaNome;
        const orizzonte = H * 0.4 + 104 * k;
        const crea = () => {
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(W * dpr));
          c.height = Math.max(1, Math.round(H * dpr));
          const g = c.getContext('2d');
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          return [c, g];
        };
        const [fondo, gf] = crea();
        gf.globalAlpha = 0.9;
        gf.drawImage(st.nebbia, -W * 0.04, -H * 0.04, W * 1.08, H * 1.08);
        gf.globalAlpha = 1;
        st.fondo = fondo;
        // l'alba: pronta a piena risoluzione, ma disegnata solo quando il nome si compone
        const [albaPiena, ga] = crea();
        ga.drawImage(st.alba, 0, 0, W, H);
        st.albaPiena = albaPiena;
        st.orizzonteY = orizzonte;
        const [sopra, gs] = crea();
        gs.drawImage(st.velatura, 0, 0, W, H);
        st.sopra = sopra;
      }
      st.sfondo = Array.from({ length: n }, () => {
        const c = Math.random();
        return {
          x: (Math.random() * 2 - 1) * 2600,
          y: (Math.random() * 2 - 1) * 1500,
          z: 700 + Math.random() * 2600,
          s: 0.6 + Math.random() * 1.8,
          fase: Math.random() * 6.283,
          v: 6 + Math.random() * 16,
          spr: c < 0.14 ? 'freddo' : c < 0.24 ? 'caldo' : 'luce',
          stella: Math.random() < 0.06, // pochi frammenti lontani piu' luminosi, che ogni tanto brillano
        };
      });
    }

    function cameraIntro(t) {
      if (t < 3.5) {
        const u = easeInOut(clamp(t / 3.5, 0, 1));
        return { yaw: lerp(1.75, 0.16, u), pitch: lerp(0.55, 0.06, u), dolly: lerp(-820, 40, u), roll: lerp(-0.25, 0.01, u) };
      }
      const u = expoOut(clamp((t - 3.5) / 0.9, 0, 1));
      return { yaw: lerp(0.16, 0, u), pitch: lerp(0.06, 0, u), dolly: lerp(40, 0, u), roll: lerp(0.01, 0, u) };
    }

    function frame(now) {
      if (!st.vivo) return;
      st.raf = requestAnimationFrame(frame);
      if (!st.visibile) return;
      const { W, H } = st;
      const t = (now - st.T0) / 1000;
      const inIntro = t < DURATA_INTRO && !reduce;
      let cam;
      if (inIntro) cam = cameraIntro(t);
      else {
        if (!st.mostrato) {
          st.mostrato = true;
          setPronto(true);
        }
        if (now / 1000 - st.ultimo > 1.6) {
          st.yawT *= 0.96;
          st.pitchT *= 0.96;
        }
        st.yawU = lerp(st.yawU, st.yawT, 0.07);
        st.pitchU = lerp(st.pitchU, st.pitchT, 0.07);
        cam = { yaw: st.yawU, pitch: st.pitchU, dolly: 0, roll: 0 };
      }
      const disall = clamp(Math.abs(cam.yaw) / 0.45 + Math.abs(cam.pitch) / 0.35 + Math.abs(cam.dolly) / 300, 0, 1);
      const allineato = 1 - disall;

      // canvas trasparente sopra l'ambiente: la scia si ottiene cancellando in parte il fotogramma prima
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${lerp(1, 0.38, disall)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';

      const cx = W / 2;
      const cy = H * 0.4;
      const k = Math.min(W * (W < 700 ? 0.8 : 0.74), 1150) / st.larghezzaNome;
      // la zona del nome = il punto di vista giusto (con un po' di margine)
      st.zona = { x0: cx - (st.larghezzaNome / 2) * k - 40, x1: cx + (st.larghezzaNome / 2) * k + 40, y0: cy - 110 * k, y1: cy + 110 * k, W, H };
      const dt = Math.min(0.05, st.ultimoT ? t - st.ultimoT : 0.016);
      st.ultimoT = t;
      const tA = t - DURATA_INTRO; // < 0 prima della composizione, 0 = istante dell'aggancio
      const liscio = (x) => { const c = clamp(x, 0, 1); return c * c * (3 - 2 * c); };

      scenaPalacan.attivo = true;
      scenaPalacan.yaw = cam.yaw;
      scenaPalacan.pitch = cam.pitch;
      scenaPalacan.dolly = cam.dolly;
      scenaPalacan.k = k;
      scenaPalacan.orizzonteY = cy + 104 * k;
      scenaPalacan.inizio = st.T0 / 1000;
      scenaPalacan.riduci = Boolean(reduce);

      // ---- il culmine: alba, linea d'orizzonte e bagliore nascono con il nome ----
      {
        const orizzonte = cy + 104 * k;
        const albaA = reduce ? 1 : liscio((tA + 0.2) / 2.2);
        const respiro = 0.88 + 0.12 * Math.sin(t * 0.45);
        ctx.globalCompositeOperation = 'lighter';
        if (st.albaPiena && albaA > 0) {
          // l'alba sorge: sale di qualche pixel mentre si accende
          ctx.globalAlpha = albaA * respiro;
          ctx.drawImage(st.albaPiena, 0, (1 - albaA) * 34, W, H);
        }
        // la linea si apre dal centro verso i lati
        const apertura = reduce ? 1 : liscio((tA + 0.05) / 1.1);
        if (st.lineaOrizzonte && apertura > 0) {
          const larga = W * apertura;
          const sxL = (W - larga) / 2;
          ctx.globalAlpha = Math.min(1, 0.4 + apertura) * respiro;
          ctx.drawImage(st.lineaOrizzonte, sxL, 0, Math.max(1, larga), 3, sxL, orizzonte - 1.5, Math.max(1, larga), 3);
        }
        // bagliore anamorfico: una striscia di luce morbida e larga, con un nucleo, nell'istante dell'aggancio
        if (!reduce && tA > -0.25 && tA < 1.9) {
          const f = tA < 0.1 ? liscio((tA + 0.25) / 0.35) : 1 - liscio((tA - 0.1) / 1.8);
          ctx.globalAlpha = 1;
          ctx.save();
          ctx.translate(cx, orizzonte);
          ctx.scale(1, 0.045);
          const striscia = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.62);
          striscia.addColorStop(0, `rgba(255,246,236,${0.95 * f})`);
          striscia.addColorStop(0.18, `rgba(255,214,176,${0.55 * f})`);
          striscia.addColorStop(0.45, `rgba(157,180,255,${0.3 * f})`);
          striscia.addColorStop(1, 'rgba(157,180,255,0)');
          ctx.fillStyle = striscia;
          ctx.fillRect(-W, -W * 0.7, W * 2, W * 1.4);
          ctx.restore();
          const nucleo = ctx.createRadialGradient(cx, orizzonte, 0, cx, orizzonte, 260);
          nucleo.addColorStop(0, `rgba(255,248,240,${0.75 * f})`);
          nucleo.addColorStop(0.35, `rgba(255,214,176,${0.22 * f})`);
          nucleo.addColorStop(1, 'rgba(255,214,176,0)');
          ctx.fillStyle = nucleo;
          ctx.fillRect(cx - 260, orizzonte - 260, 520, 520);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

      const tAgg = t - DURATA_INTRO;
      if (!reduce && tAgg > -0.2 && tAgg < 2.4) {
        const b = tAgg < 0.25 ? clamp((tAgg + 0.2) / 0.45, 0, 1) : clamp(1 - (tAgg - 0.25) / 2.1, 0, 1);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.45);
        g.addColorStop(0, `rgba(255,236,210,${0.16 * b})`);
        g.addColorStop(1, 'rgba(255,236,210,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      const scan = !reduce && tAgg > 0.05 && tAgg < 1.35 ? lerp(-0.1, 1.1, easeInOut((tAgg - 0.05) / 1.3)) : null;
      const scanX = scan !== null ? cx + (scan - 0.5) * st.larghezzaNome * k * 1.1 : null;

      // il nome: calcolo completo quando si muove, immagine "fotografata" quando e' fermo
      const disegnaNome = (g, conScintille) => {
        g.globalCompositeOperation = 'lighter';
        const cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
        const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
        const base = st.passo * k * 1.05;
        const pts = st.punti;
        for (let i = 0; i < pts.length; i += 1) {
          const p = pts[i];
          const x1 = p.X * cyw + p.z * syw;
          const z1 = -p.X * syw + p.z * cyw;
          const y1 = p.Y * cp - z1 * sp;
          const z2 = p.Y * sp + z1 * cp;
          const zc = z2 + cam.dolly;
          if (FOCALE + zc < 60) continue;
          const sc = FOCALE / (FOCALE + zc);
          const xs = x1 * sc * k;
          const ys = y1 * sc * k;
          const sx = cx + xs * cr - ys * sr;
          const sy = cy + xs * sr + ys * cr;
          if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;
          const fuoco = Math.min(1, Math.abs(zc) / 700) * disall;
          const dim = base * p.sz * (0.9 + fuoco * 6) * Math.min(1.8, sc);
          let a = (0.95 / (1 + fuoco * 7)) * clamp(sc, 0.35, 1.4);
          a *= 0.78 + 0.22 * Math.sin(t * 2.2 + p.fase) * disall + 0.22 * allineato;
          if (scanX !== null) a *= 1 + 1.8 * Math.exp(-(((sx - scanX) / (38 * k + 20)) ** 2));
          if (conScintille && allineato > 0.9 && !reduce) a *= 1 + 1.4 * Math.max(0, Math.sin(t * 1.1 + p.fase * 7)) ** 24;
          const spr = disall < 0.08 ? sprite.luce : zc < -60 ? sprite.caldo : zc > 60 ? sprite.freddo : sprite.luce;
          g.globalAlpha = clamp(a, 0.02, 1);
          g.drawImage(spr, sx - dim / 2, sy - dim / 2, dim, dim);
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      };

      const fermo = !inIntro && !reduce && disall < 0.002 && scanX === null && tAgg > 1.6;
      if (fermo) {
        if (!st.fotoNome || st.fotoW !== W || st.fotoH !== H) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const foto = document.createElement('canvas');
          foto.width = Math.round(W * dpr);
          foto.height = Math.round(H * dpr);
          const g = foto.getContext('2d');
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          disegnaNome(g, false);
          st.fotoNome = foto;
          st.fotoW = W;
          st.fotoH = H;
          // un frammento ogni 7 puo' scintillare: poche operazioni per fotogramma
          st.scintille = st.punti.filter((_, i) => i % 7 === 0);
          st.vivi = st.punti.filter((_, i) => i % 2 === 0); // meta' dei frammenti, ridisegnati vivi
        }
        // --- il nome vivo ---
        const vita = liscio((tA - 1.6) / 1.2); // entra piano dopo il culmine
        const respiro = 0.93 + 0.07 * Math.sin(t * 0.8); // respiro d'insieme, lentissimo
        ctx.globalCompositeOperation = 'lighter';
        // base: la foto del nome, un po' piu' tenue per lasciare spazio alla vita sopra
        ctx.globalAlpha = (1 - 0.4 * vita) * respiro;
        ctx.drawImage(st.fotoNome, 0, 0, W, H);
        ctx.globalAlpha = 1;
        // onda di luce che attraversa le lettere da sinistra a destra, ogni ~6 s
        const ciclo = 6.2;
        const fronte = (((t - DURATA_INTRO) % ciclo) / ciclo) * 1.6 - 0.3; // da -0.3 a 1.3
        const base = st.passo * k * 1.05;
        const mx = st.mx;
        const my = st.my;
        const vivi = st.vivi;
        for (let i = 0; i < vivi.length; i += 1) {
          const p = vivi[i];
          const px = cx + p.x0 * k;
          const py = cy + p.y0 * k;
          const pulsa = 0.5 + 0.5 * Math.sin(t * p.ritmo + p.fase); // ogni frammento con il suo ritmo
          const u = p.x0 / st.larghezzaNome + 0.5; // posizione lungo il nome, 0..1
          const cresta = Math.exp(-(((u - fronte) / 0.07) ** 2));
          let vicino = 0;
          if (mx !== undefined) {
            const dx = px - mx;
            const dy = py - my;
            vicino = Math.exp(-(dx * dx + dy * dy) / (95 * 95));
          }
          const a = vita * (0.28 + 0.5 * pulsa + 1.1 * cresta + 1.2 * vicino) * respiro;
          if (a < 0.03) continue;
          const dim = base * p.sz * (0.85 + 0.45 * pulsa + 1.1 * cresta + 0.9 * vicino);
          const spr = cresta > 0.35 ? (i % 2 ? sprite.caldo : sprite.freddo) : sprite.luce;
          ctx.globalAlpha = clamp(a, 0, 1);
          ctx.drawImage(spr, px - dim / 2, py - dim / 2, dim, dim);
        }
        // scintille rare, piu' intense
        for (let i = 0; i < st.scintille.length; i += 1) {
          const p = st.scintille[i];
          const f = Math.max(0, Math.sin(t * 1.1 + p.fase * 7)) ** 24;
          if (f < 0.04) continue;
          const dim = base * p.sz * 1.6;
          ctx.globalAlpha = clamp(f * 0.95, 0, 1);
          ctx.drawImage(sprite.luce, cx + p.x0 * k - dim / 2, cy + p.y0 * k - dim / 2, dim, dim);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      } else {
        disegnaNome(ctx, true);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // sopra pronto: velatura dietro i testi (una sola copia 1:1)
      if (st.sopra) ctx.drawImage(st.sopra, 0, 0, W, H);

      // il bordo inferiore dell'ingresso si dissolve nell'ambiente: nessuna linea di separazione
      {
        const alto = Math.min(260, H * 0.3);
        const sfuma = ctx.createLinearGradient(0, H - alto, 0, H);
        sfuma.addColorStop(0, 'rgba(0,0,0,0)');
        sfuma.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        ctx.fillStyle = sfuma;
        ctx.fillRect(0, H - alto, W, alto);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    const onMove = (e) => {
      const r = sezione.getBoundingClientRect();
      st.mx = e.clientX - r.left;
      st.my = e.clientY - r.top;
      if (!st.mostrato) return;
      const z = st.zona;
      if (z) {
        // dentro la zona del nome: si resta nel punto di vista giusto (nome composto, vivo)
        // fuori dalla zona: inclinazione proporzionale alla distanza dal bordo dello schermo,
        // con gli stessi massimi di sempre (yaw 0.75, pitch 0.4)
        const dx = st.mx < z.x0 ? (st.mx - z.x0) / Math.max(1, z.x0) : st.mx > z.x1 ? (st.mx - z.x1) / Math.max(1, z.W - z.x1) : 0;
        const dy = st.my < z.y0 ? (st.my - z.y0) / Math.max(1, z.y0) : st.my > z.y1 ? (st.my - z.y1) / Math.max(1, z.H - z.y1) : 0;
        st.yawT = clamp(dx, -1, 1) * 0.75;
        st.pitchT = clamp(dy, -1, 1) * 0.4;
      } else {
        st.yawT = ((e.clientX - r.left) / r.width - 0.5) * 1.5;
        st.pitchT = ((e.clientY - r.top) / r.height - 0.5) * 0.8;
      }
      st.ultimo = performance.now() / 1000;
    };
    const onLeave = () => {
      st.yawT = 0;
      st.pitchT = 0;
      st.mx = undefined;
      st.my = undefined;
    };
    sezione.addEventListener('pointermove', onMove);
    sezione.addEventListener('pointerleave', onLeave);

    const io = new IntersectionObserver(([v]) => {
      st.visibile = v.isIntersecting;
      scenaPalacan.visibile = v.isIntersecting;
    });
    io.observe(sezione);

    let larg = window.innerWidth;
    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (window.innerWidth === larg) return;
        larg = window.innerWidth;
        misura();
        campiona();
        preparaSfondo();
      }, 200);
    };
    window.addEventListener('resize', onResize);

    motore.current = {
      rivedi: () => {
        st.T0 = performance.now();
        st.mostrato = false;
        st.yawT = st.pitchT = st.yawU = st.pitchU = 0;
        setPronto(false);
      },
    };

    const avvia = () => {
      if (!st.vivo) return;
      misura();
      campiona();
      preparaSfondo();
      ctx.fillStyle = BRAND.abisso;
      ctx.fillRect(0, 0, st.W, st.H);
      st.T0 = performance.now() - (reduce ? (DURATA_INTRO + 3) * 1000 : 0);
      st.raf = requestAnimationFrame(frame);
    };
    const font = document.fonts && document.fonts.load ? document.fonts.load(`500 220px ${FONT}`) : Promise.resolve();
    Promise.race([font, new Promise((r) => setTimeout(r, 2000))]).then(avvia, avvia);

    return () => {
      st.vivo = false;
      scenaPalacan.attivo = false;
      scenaPalacan.visibile = false;
      cancelAnimationFrame(st.raf);
      io.disconnect();
      sezione.removeEventListener('pointermove', onMove);
      sezione.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
    };
  }, [reduce]);

  const comparsa = (ritardo) => ({
    initial: false,
    animate: pronto ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 10, filter: 'blur(6px)' },
    transition: { duration: 1.1, delay: pronto ? ritardo : 0, ease: [0.16, 1, 0.3, 1] },
  });

  return (
    <section
      ref={sezioneRef}
      className="relative overflow-hidden"
      style={{ height: '100svh', minHeight: 620, background: 'transparent', touchAction: 'pan-y' }}
    >
      <h1 className="sr-only">PALACAN — {titolo}</h1>
      <canvas ref={telaRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {/* vignettatura e grana sono disegnate dentro il canvas (vedi preparaSfondo): come CSS
          sovrapposto al canvas animato costringevano a ricomporre lo schermo a ogni fotogramma */}
      <div className="pointer-events-none absolute left-0 right-0 flex flex-col items-center px-6 text-center" style={{ top: 'calc(40% + clamp(64px, 8.5vw, 124px))' }}>
        <motion.p {...comparsa(0.25)} className="m-0 text-[22px] sm:text-[30px]" style={{ fontFamily: FONT, fontWeight: 300, color: BRAND.luce, letterSpacing: '-0.01em' }}>
          {titolo}
        </motion.p>
        <motion.p {...comparsa(0.45)} className="mt-4 max-w-[36rem] text-[15px] sm:text-[17px]" style={{ fontFamily: FONT, fontWeight: 300, color: BRAND.nebbia, lineHeight: 1.6, textWrap: 'balance' }}>
          {sottotitolo}
        </motion.p>
        <motion.div {...comparsa(0.7)} className="pointer-events-auto mt-8 flex flex-wrap items-center justify-center gap-3">
          {children}
        </motion.div>
      </div>

      <motion.p
        {...comparsa(1.1)}
        className="pointer-events-none absolute bottom-16 left-0 right-0 m-0 text-center text-[11px] sm:bottom-8"
        style={{ fontFamily: FONT, color: BRAND.nebbia, letterSpacing: '0.16em', textTransform: 'uppercase' }}
      >
        {suggerimento}
      </motion.p>
      {!reduce && (
        <motion.button
          {...comparsa(1.1)}
          type="button"
          onClick={() => motore.current?.rivedi()}
          className="absolute bottom-6 right-6 rounded-full px-3 py-2 text-[11px] outline-none focus-visible:ring-1"
          style={{ fontFamily: FONT, color: BRAND.nebbia, letterSpacing: '0.14em', textTransform: 'uppercase', '--tw-ring-color': BRAND.luce }}
        >
          {etichettaRivedi}
        </motion.button>
      )}
    </section>
  );
}

// ============================================================
// SELETTORE LINGUA — condiviso da home e pagine pubbliche
export function LanguageSwitcher() {
  const { t, i18n } = useTesti();
  const [aperto, setAperto] = useState(false);
  const ref = useRef(null);
  const attuale = linguaAttiva(i18n);

  useEffect(() => {
    if (!aperto) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setAperto(false);
    const onKey = (e) => e.key === 'Escape' && setAperto(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [aperto]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aperto}
        aria-label={`${t.nav.language}: ${LINGUE.find((l) => l.code === attuale)?.label}`}
        className="rounded-full px-3 py-2 text-[12px] font-medium outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-1"
        style={{ fontFamily: FONT, letterSpacing: '0.12em', color: BRAND.luce, boxShadow: `inset 0 0 0 1px ${BRAND.linea}`, '--tw-ring-color': BRAND.luce }}
      >
        {attuale.toUpperCase()}
      </button>
      <AnimatePresence>
        {aperto && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="absolute right-0 top-full mt-2 min-w-[160px] overflow-hidden rounded-2xl py-1.5"
            style={{ zIndex: 600, background: BRAND.grafite, boxShadow: `inset 0 0 0 1px ${BRAND.linea}, 0 24px 60px rgba(0,0,0,0.5)` }}
          >
            {LINGUE.map((l) => (
              <li key={l.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={l.code === attuale}
                  onClick={() => {
                    i18n.changeLanguage(l.code);
                    setAperto(false);
                  }}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-white/[0.05]"
                  style={{ fontFamily: FONT, color: l.code === attuale ? BRAND.luce : BRAND.nebbia }}
                >
                  {l.label}
                  {l.code === attuale && <span style={{ width: 5, height: 5, borderRadius: 5, background: SPETTRO }} />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}



// ============================================================
// CURSORE PREMIUM — un punto di luce, un anello che lo segue con un
// leggero ritardo e una scia di frammenti spettrali. Solo su mouse
// (pointer: fine) e senza "riduci movimento". Sui campi di testo torna
// il cursore normale, per scrivere comodamente.
// ============================================================
const SELETTORE_INTERATTIVO = 'a, button, [role="tab"], [role="option"], summary, label, [data-cursor]';
const SELETTORE_TESTO = 'input, textarea, [contenteditable="true"]';

export function CursorePremium() {
  const reduce = useReducedMotion();
  const telaRef = useRef(null);
  const puntoRef = useRef(null);
  const anelloRef = useRef(null);
  const [attivo, setAttivo] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || reduce || typeof window.matchMedia !== 'function') return undefined;
    if (!window.matchMedia('(pointer: fine)').matches) return undefined;
    setAttivo(true);
    return undefined;
  }, [reduce]);

  useEffect(() => {
    if (!attivo) return undefined;
    document.documentElement.classList.add('cursore-premium');
    const tela = telaRef.current;
    const ctx = tela.getContext('2d');
    const punto = puntoRef.current;
    const anello = anelloRef.current;
    const st = { x: -100, y: -100, ax: -100, ay: -100, px: -100, py: -100, scia: [], sopra: false, testo: false, premuto: false, visibile: false, raf: 0 };
    const colori = [[157, 180, 255], [255, 197, 138], [243, 241, 236]];

    const misura = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      tela.width = window.innerWidth * dpr;
      tela.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    misura();

    const onMove = (e) => {
      st.x = e.clientX;
      st.y = e.clientY;
      if (!st.visibile) {
        st.visibile = true;
        st.ax = st.px = st.x;
        st.ay = st.py = st.y;
      }
      const el = e.target instanceof Element ? e.target : null;
      st.testo = Boolean(el?.closest(SELETTORE_TESTO));
      st.sopra = !st.testo && Boolean(el?.closest(SELETTORE_INTERATTIVO));
      // scia: frammenti in proporzione alla velocita'
      const vel = Math.hypot(st.x - st.px, st.y - st.py);
      const n = Math.min(4, Math.floor(vel / 9));
      for (let i = 0; i < n; i += 1) {
        const c = colori[Math.floor(Math.random() * colori.length)];
        st.scia.push({
          x: st.px + (st.x - st.px) * (i / Math.max(1, n)) + (Math.random() - 0.5) * 6,
          y: st.py + (st.y - st.py) * (i / Math.max(1, n)) + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6 + 0.15,
          vita: 1,
          durata: 0.5 + Math.random() * 0.6,
          s: 1 + Math.random() * 1.8,
          c,
        });
      }
      if (st.scia.length > 160) st.scia.splice(0, st.scia.length - 160);
      st.px = st.x;
      st.py = st.y;
    };
    const onDown = () => { st.premuto = true; };
    const onUp = () => { st.premuto = false; };
    const onLeave = () => { st.visibile = false; };

    let ultimo = performance.now();
    const frame = (now) => {
      st.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - ultimo) / 1000);
      ultimo = now;
      st.ax += (st.x - st.ax) * 0.18;
      st.ay += (st.y - st.ay) * 0.18;
      const scala = st.premuto ? 0.75 : st.sopra ? 1.9 : 1;
      const nascosto = !st.visibile || st.testo;
      punto.style.transform = `translate3d(${st.x}px, ${st.y}px, 0) scale(${st.sopra ? 0.5 : 1})`;
      punto.style.opacity = nascosto ? '0' : '1';
      anello.style.transform = `translate3d(${st.ax}px, ${st.ay}px, 0) scale(${scala})`;
      anello.style.opacity = nascosto ? '0' : st.sopra ? '1' : '0.55';
      anello.style.boxShadow = st.sopra ? '0 0 18px rgba(157,180,255,0.45), inset 0 0 8px rgba(255,197,138,0.25)' : 'none';

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = st.scia.length - 1; i >= 0; i -= 1) {
        const f = st.scia[i];
        f.vita -= dt / f.durata;
        if (f.vita <= 0) {
          st.scia.splice(i, 1);
          continue;
        }
        f.x += f.vx;
        f.y += f.vy;
        ctx.fillStyle = `rgba(${f.c[0]},${f.c[1]},${f.c[2]},${0.75 * f.vita})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.s * f.vita, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    st.raf = requestAnimationFrame(frame);

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    document.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', misura);
    return () => {
      cancelAnimationFrame(st.raf);
      document.documentElement.classList.remove('cursore-premium');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      document.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', misura);
    };
  }, [attivo]);

  if (!attivo || typeof document === 'undefined') return null;
  // Portale nel <body>: il cursore sta sopra a TUTTO (pannelli di accesso, finestre, menu),
  // anche a cio' che App.jsx mostra fuori dal contenitore della home.
  return createPortal(
    <>
      <style>{`
        html.cursore-premium, html.cursore-premium * { cursor: none !important; }
        html.cursore-premium input, html.cursore-premium textarea, html.cursore-premium [contenteditable="true"] { cursor: text !important; }
      `}</style>
      <canvas ref={telaRef} aria-hidden="true" style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 2147483645 }} />
      <div
        ref={anelloRef}
        aria-hidden="true"
        style={{
          position: 'fixed', left: -17, top: -17, width: 34, height: 34, borderRadius: '50%', pointerEvents: 'none', zIndex: 2147483646,
          border: '1px solid rgba(243,241,236,0.6)', transition: 'opacity .25s, box-shadow .3s, border-color .3s', willChange: 'transform', opacity: 0,
        }}
      />
      <div
        ref={puntoRef}
        aria-hidden="true"
        style={{
          position: 'fixed', left: -3, top: -3, width: 6, height: 6, borderRadius: '50%', pointerEvents: 'none', zIndex: 2147483647,
          background: BRAND.luce, boxShadow: '0 0 10px rgba(243,241,236,0.8)', transition: 'opacity .2s', willChange: 'transform', opacity: 0,
        }}
      />
    </>,
    document.body
  );
}

// ============================================================
// SFONDO PALACAN — l'ambiente fisso dietro tutto il sito: nebbie,
// campo profondo di frammenti, oceano di frammenti che ondeggia,
// vignettatura e grana. Un solo canvas, fermo, sotto il contenuto.
//  - nella home segue l'ingresso: stessa camera, stesso orizzonte,
//    compare con la camera che si alza, riceve l'onda dell'aggancio;
//  - scorrendo, l'orizzonte sale e l'oceano diventa il pavimento;
//    oltre la prima schermata si attenua per lasciare leggere;
//  - nelle pagine pubbliche: orizzonte basso, intensita' ridotta.
// ============================================================
export function SfondoPalacan({ intensita = 1, orizzonte = 0.52 }) {
  const reduce = useReducedMotion();
  const telaRef = useRef(null);

  useEffect(() => {
    const tela = telaRef.current;
    if (!tela) return undefined;
    const ctx = typeof tela.getContext === 'function' ? tela.getContext('2d') : null;
    if (!ctx) return undefined;   // ambiente senza canvas: resta il fondo tinta unita
    const sprite = { luce: spriteMorbido(245, 243, 238), caldo: spriteMorbido(255, 200, 150), freddo: spriteMorbido(150, 175, 255) };
    const st = { W: 0, H: 0, raf: 0, vivo: true, T0: performance.now(), yaw: 0, pitch: 0, forza: intensita, visibile: !document.hidden };
    const liscio = (x) => { const c = clamp(x, 0, 1); return c * c * (3 - 2 * c); };

    function prepara() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      st.W = window.innerWidth;
      st.H = window.innerHeight;
      tela.width = Math.round(st.W * dpr);
      tela.height = Math.round(st.H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { W, H } = st;
      const crea = () => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(W * dpr));
        c.height = Math.max(1, Math.round(H * dpr));
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        return [c, g];
      };
      // nebbie ai lati (fredda in alto a sinistra, calda in basso a destra)
      const [neb, gn] = crea();
      const r1 = Math.max(W, H) * 0.6;
      const g1 = gn.createRadialGradient(W * 0.18, H * 0.3, 0, W * 0.18, H * 0.3, r1);
      g1.addColorStop(0, 'rgba(120,145,255,0.2)');
      g1.addColorStop(1, 'rgba(120,145,255,0)');
      gn.fillStyle = g1;
      gn.fillRect(0, 0, W, H);
      const g2 = gn.createRadialGradient(W * 0.84, H * 0.72, 0, W * 0.84, H * 0.72, r1);
      g2.addColorStop(0, 'rgba(255,190,130,0.135)');
      g2.addColorStop(1, 'rgba(255,190,130,0)');
      gn.fillStyle = g2;
      gn.fillRect(0, 0, W, H);
      st.nebbia = neb;
      // vignettatura + grana (disegnate una volta)
      const [velo, gv] = crea();
      const vg = gv.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.42)');
      gv.fillStyle = vg;
      gv.fillRect(0, 0, W, H);
      const lv = document.createElement('canvas');
      lv.width = Math.max(1, Math.round(W / 2));
      lv.height = Math.max(1, Math.round(H / 2));
      const lx = lv.getContext('2d');
      const grana = lx.createImageData(lv.width, lv.height);
      for (let i = 0; i < grana.data.length; i += 4) {
        const n = Math.random();
        grana.data[i] = 255;
        grana.data[i + 1] = 255;
        grana.data[i + 2] = 255;
        grana.data[i + 3] = n > 0.55 ? Math.round((n - 0.55) * 30) : 0;
      }
      lx.putImageData(grana, 0, 0);
      gv.drawImage(lv, 0, 0, W, H);
      st.velo = velo;
      // campo profondo
      const n = W < 700 ? 320 : 620;
      st.campo = Array.from({ length: n }, () => {
        const c = Math.random();
        return {
          x: (Math.random() * 2 - 1) * 2600,
          y: (Math.random() * 2 - 1) * 1500,
          z: 700 + Math.random() * 2600,
          s: 0.6 + Math.random() * 1.8,
          fase: Math.random() * 6.283,
          v: 6 + Math.random() * 16,
          spr: c < 0.14 ? 'freddo' : c < 0.24 ? 'caldo' : 'luce',
          stella: Math.random() < 0.06,
        };
      });
      // oceano
      const colonne = W < 700 ? 56 : 100;
      const righe = W < 700 ? 28 : 42;
      const oc = { colonne, righe, xs: [], zs: [], colori: [], dimensioni: [], jx: [], jz: [] };
      for (let i = 0; i < colonne * righe; i += 1) {
        oc.jx.push((Math.random() - 0.5) * 46);
        oc.jz.push((Math.random() - 0.5) * 70);
      }
      for (let c = 0; c < colonne; c += 1) oc.xs.push(-3400 + (6800 * c) / (colonne - 1));
      for (let r = 0; r < righe; r += 1) {
        const u = r / (righe - 1);
        oc.zs.push(5600 - Math.pow(u, 1.35) * 5480);
        const col = u < 0.5
          ? [157 + (243 - 157) * (u / 0.5), 180 + (241 - 180) * (u / 0.5), 255 + (236 - 255) * (u / 0.5)]
          : [243 + (255 - 243) * ((u - 0.5) / 0.5), 241 + (197 - 241) * ((u - 0.5) / 0.5), 236 + (138 - 236) * ((u - 0.5) / 0.5)];
        oc.colori.push(`rgb(${Math.round(col[0])},${Math.round(col[1])},${Math.round(col[2])})`);
        oc.dimensioni.push(0.8 + u * 1.5);
      }
      st.oceano = oc;
    }

    function frame(now) {
      if (!st.vivo) return;
      st.raf = requestAnimationFrame(frame);
      if (!st.visibile) return;
      const { W, H } = st;
      const t = (now - st.T0) / 1000;
      const dt = Math.min(0.05, st.ultimoT ? t - st.ultimoT : 0.016);
      st.ultimoT = t;
      const scena = scenaPalacan;
      const conIngresso = scena.attivo;
      const scrollY = window.scrollY || 0;

      // camera: segue l'ingresso finche' e' visibile, poi una deriva lentissima
      const yawT = conIngresso && scena.visibile ? scena.yaw : reduce ? 0 : Math.sin(t * 0.05) * 0.06;
      const pitchT = conIngresso && scena.visibile ? scena.pitch : 0;
      st.yaw += (yawT - st.yaw) * 0.1;
      st.pitch += (pitchT - st.pitch) * 0.1;
      const dolly = conIngresso && scena.visibile ? scena.dolly : 0;

      // proiezione e orizzonte (allineati all'ingresso a pagina in cima)
      const k = conIngresso && scena.k ? scena.k : Math.min(W * (W < 700 ? 0.8 : 0.74), 1150) / 1550;
      const cx = W / 2;
      const base = conIngresso && scena.orizzonteY ? scena.orizzonteY : H * orizzonte;
      // lettura: 0 sull'ingresso, 1 quando si e' lasciata la prima schermata
      const lettura = conIngresso ? liscio((scrollY - H * 0.3) / (H * 0.8)) : 1;
      // all'inizio l'orizzonte sale agganciato alla linea sotto il nome; poi la camera "si alza":
      // l'orizzonte scende e l'oceano si raccoglie in basso, lasciando calma la zona dei testi
      const agganciato = conIngresso ? Math.max(H * 0.2, base - scrollY) : base;
      const orizz = conIngresso ? agganciato + (H * 0.7 - agganciato) * lettura : base;
      const cy = orizz - 104 * k;

      // intensita' e ritmo: pieni sull'ingresso, piu' tenui e lenti mentre si legge
      const obiettivo = intensita * (1 - 0.5 * lettura);
      st.forza += (obiettivo - st.forza) * 0.05;
      const forza = st.forza;
      const calma = conIngresso ? 1 - 0.45 * lettura : 0.6; // velocita' di onde e scintille
      st.tempoOnde = (st.tempoOnde || 0) + dt * calma;

      // momento dell'aggancio (per l'onda) e comparsa dell'oceano durante l'ingresso
      const tIngresso = conIngresso ? now / 1000 - scena.inizio : 999;
      const tA = tIngresso - DURATA_INTRO;
      const oceanoA = conIngresso && !scena.riduci ? liscio((tIngresso - 1.7) / 1.8) : 1;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = BRAND.abisso;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.6 + 0.4 * forza;
      ctx.drawImage(st.nebbia, 0, 0, W, H);
      ctx.globalAlpha = 1;

      // campo profondo
      ctx.globalCompositeOperation = 'lighter';
      {
        const cyw = Math.cos(st.yaw), syw = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
        for (let i = 0; i < st.campo.length; i += 1) {
          const q = st.campo[i];
          if (!reduce) {
            q.x += q.v * dt * calma;
            if (q.x > 2600) q.x = -2600;
          }
          const x1 = q.x * cyw + q.z * syw;
          const z1 = -q.x * syw + q.z * cyw;
          const y1 = q.y * cp - z1 * sp;
          const z2 = q.y * sp + z1 * cp + dolly * 0.35;
          if (FOCALE + z2 < 80) continue;
          const sc = FOCALE / (FOCALE + z2);
          const sx = cx + x1 * sc * k;
          const sy = cy + y1 * sc * k;
          if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
          const lum = q.stella
            ? 0.4 + 0.5 * calma * Math.max(0, Math.sin(st.tempoOnde * 0.7 + q.fase)) ** 6
            : 0.2 + 0.3 * calma * (0.5 + 0.5 * Math.sin(st.tempoOnde * 0.9 + q.fase));
          ctx.globalAlpha = Math.min(1, lum * Math.min(1, sc * 2)) * (0.55 + 0.45 * forza);
          const dim = Math.max(1.6, q.s * sc * (q.stella ? 6 : 3.8));
          ctx.drawImage(sprite[q.spr], sx - dim / 2, sy - dim / 2, dim, dim);
        }
      }

      // oceano di frammenti
      if (oceanoA > 0) {
        const oc = st.oceano;
        const cyw1 = Math.cos(st.yaw * 0.6), syw1 = Math.sin(st.yaw * 0.6);
        const cp1 = Math.cos(st.pitch), sp1 = Math.sin(st.pitch);
        const quota = 560;
        const tt = reduce ? 0 : st.tempoOnde;
        const onda = conIngresso && !scena.riduci && tA > 0 && tA < 5;
        const raggio = tA * 1250;
        const smorza = onda ? (1 - tA / 5) ** 1.5 : 0;
        for (let r = 0; r < oc.righe; r += 1) {
          const z = oc.zs[r];
          const u = r / (oc.righe - 1);
          ctx.fillStyle = oc.colori[r];
          const baseA = Math.min(1, (1 - u) * 0.4 + u * 0.7) * Math.min(1, u * 3 + 0.2);
          for (let c = 0; c < oc.colonne; c += 1) {
            const x = oc.xs[c] + oc.jx[r * oc.colonne + c];
            const zj = z + oc.jz[r * oc.colonne + c];
            let picco = 0;
            if (onda) {
              const d = Math.hypot(x, zj - 2100);
              picco = Math.exp(-(((d - raggio) / 380) ** 2)) * smorza;
            }
            const y = quota
              + 58 * Math.sin(x * 0.0013 + tt * 0.7)
              + 42 * Math.sin(z * 0.0019 - tt * 0.55)
              + 18 * Math.sin((x + z) * 0.0042 + tt * 1.25)
              - 230 * picco;
            const x1 = x * cyw1 + zj * syw1;
            const z1 = -x * syw1 + zj * cyw1;
            const yr = y - quota + 380;
            const y1 = yr * cp1 - z1 * sp1;
            const zc = yr * sp1 + z1 * cp1 + dolly * 0.5;
            if (FOCALE + zc < 80) continue;
            const sc = FOCALE / (FOCALE + zc);
            const sx = cx + x1 * sc * k;
            const sy = orizz + y1 * sc * k;
            if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;
            const cresta = 0.55 + 0.45 * Math.sin(x * 0.0013 + tt * 0.7);
            const alfa = baseA * (0.45 + 0.55 * cresta) * oceanoA * forza * (1 + 4 * picco);
            if (alfa < 0.04) continue;
            ctx.globalAlpha = Math.min(1, alfa);
            const dd = oc.dimensioni[r] * Math.max(0.6, sc * 1.4);
            ctx.fillRect(sx - dd / 2, sy - dd / 2, dd, dd);
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(st.velo, 0, 0, W, H);
    }

    const onVisibilita = () => { st.visibile = !document.hidden; };
    let larg = window.innerWidth;
    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // su mobile la barra del browser cambia solo l'altezza: si rifa' tutto solo se cambia la larghezza
        if (window.innerWidth === larg && Math.abs(window.innerHeight - st.H) < 120) return;
        larg = window.innerWidth;
        prepara();
      }, 200);
    };
    prepara();
    st.raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', onVisibilita);
    window.addEventListener('resize', onResize);
    return () => {
      st.vivo = false;
      cancelAnimationFrame(st.raf);
      document.removeEventListener('visibilitychange', onVisibilita);
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
    };
  }, [reduce, intensita, orizzonte]);

  return (
    <canvas
      ref={telaRef}
      aria-hidden="true"
      // z-index -1: dentro il contenitore della pagina resta sotto TUTTO, anche ai testi non posizionati
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: -1, pointerEvents: 'none', display: 'block' }}
    />
  );
}
