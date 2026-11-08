// ============================================================
// PALACAN — geometria del segno (modulo puro, senza React)
//
// Il segno e' un cerchio diviso in quattro quarti. Ogni quarto vive
// nella propria cella (griglia 2x2, cella 50x50 su viewBox 100x100) e
// puo' stare in quattro orientamenti (0/90/180/270 gradi attorno al
// centro della cella). Quattro quarti x quattro orientamenti = 8 bit:
// ogni forma possibile del segno e' un byte, 256 stati in tutto.
//
//   DISCO   — il cerchio intero: informazione integra, leggibile
//   SOGLIA  — il segno Palacan: i due quarti inferiori girati verso
//             l'esterno, il cerchio "si alza" e diventa un passaggio
//   APERTO  — tutti i vertici verso l'esterno (vuoto a stella)
//   chiave  — qualunque altro stato: la forma cifrata
//
// Regola del movimento: si cifra girando in avanti (senso orario),
// si ricompone girando all'indietro (senso antiorario). Sempre a
// quarti di giro, mai rotazioni libere.
// ============================================================

export const CELL = 50;

// Ordine delle celle: 0 = alto-sinistra, 1 = alto-destra,
// 2 = basso-sinistra, 3 = basso-destra.
export const CELL_ORIGINS = [
  [0, 0],
  [50, 0],
  [0, 50],
  [50, 50],
];

export const CELL_CENTERS = CELL_ORIGINS.map(([x, y]) => [x + 25, y + 25]);

// Orientamenti in gradi (0 = vertice del quarto nell'angolo in alto a
// sinistra della sua cella, poi in senso orario).
export const STATES = {
  disco: [180, 270, 90, 0],
  soglia: [180, 270, 0, 90],
  aperto: [0, 90, 270, 180],
};

export const GAP_LOGO = 2.4;
export const GAP_INTERO = -0.4;

// Quarto di disco con il vertice nell'angolo alto-sinistro della cella,
// coordinate assolute nel viewBox 100x100.
export function quarterPath(index) {
  const [x, y] = CELL_ORIGINS[index];
  return `M${x} ${y} H${x + CELL} A${CELL} ${CELL} 0 0 1 ${x} ${y + CELL} Z`;
}

// Fattore di scala del quarto attorno al centro della sua cella per
// ottenere una fessura "gap" tra i quarti (in unita' del viewBox 100).
export function gapScale(gap) {
  // gap negativo = leggera sovrapposizione: evita le giunture
  // antialias quando i quarti devono sembrare un cerchio unico
  const g = Math.max(-1, Math.min(40, Number(gap) || 0));
  return (CELL - g) / CELL;
}

const norm = (deg) => ((Math.round(deg) % 360) + 360) % 360;

export function isValidState(arr) {
  return Array.isArray(arr) && arr.length === 4 && arr.every((d) => Number.isFinite(d) && norm(d) % 90 === 0);
}

export function stateToDegrees(state) {
  if (typeof state === 'string') {
    const s = STATES[state];
    if (!s) throw new Error(`Stato Palacan sconosciuto: ${state}`);
    return s.slice();
  }
  if (isValidState(state)) return state.map(norm);
  throw new Error('Stato Palacan non valido: servono 4 orientamenti multipli di 90');
}

// FNV-1a 32 bit — NON crittografico: serve solo a derivare una forma
// visiva stabile da un seme (id messaggio, indice lettera...). La
// crittografia vera resta interamente in olmService.
export function fnv1a(input) {
  const str = String(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function byteToState(byte) {
  const b = byte & 255;
  return [(b >> 6) & 3, (b >> 4) & 3, (b >> 2) & 3, b & 3].map((o) => o * 90);
}

function differsFrom(a, b) {
  return a.reduce((n, d, i) => n + (norm(d) !== norm(b[i]) ? 1 : 0), 0);
}

// Stato "cifrato" derivato da un seme: sempre diverso dal disco e dalla
// soglia in almeno due quarti, cosi' una forma cifrata non viene mai
// scambiata per il segno o per il messaggio integro.
export function keyFrom(seed) {
  let h = fnv1a(seed);
  for (let tries = 0; tries < 8; tries += 1) {
    const st = byteToState(h & 255);
    if (differsFrom(st, STATES.disco) >= 2 && differsFrom(st, STATES.soglia) >= 2) return st;
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  }
  return [90, 0, 270, 180];
}

// Angolo assoluto di arrivo partendo da "current" (cumulativo, puo'
// superare 360) verso l'orientamento "targetDeg".
//   forward  -> gira in senso orario (0..270 gradi in piu')
//   backward -> gira in senso antiorario (0..270 gradi in meno)
//   shortest -> il verso piu' breve (pareggio: orario)
export function turnTarget(current, targetDeg, direction = 'forward') {
  const cur = Number(current) || 0;
  const t = norm(targetDeg);
  const fwd = (t - norm(cur) + 360) % 360;
  const back = (norm(cur) - t + 360) % 360;
  if (direction === 'backward') return cur - back;
  if (direction === 'shortest') return back < fwd ? cur - back : cur + fwd;
  return cur + fwd;
}

// Impronta visiva di un safety number (vedi computeSafetyNumber in
// olmService): 30 cifre in 6 gruppi da 5 -> 12 forme. Stessa stringa,
// stesse forme su entrambi i dispositivi: il confronto a colpo d'occhio
// affianca quello delle cifre, non lo sostituisce.
export function glyphsFromSafetyNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 5) return [];
  const groups = digits.match(/.{1,5}/g).filter((g) => g.length === 5);
  const out = [];
  groups.forEach((g, i) => {
    // mescola il gruppo col suo indice: gruppi uguali in posizioni
    // diverse non producono la stessa coppia di forme
    const n = fnv1a(`${i}:${g}`);
    out.push(byteToState(n & 255), byteToState((n >>> 8) & 255));
  });
  return out;
}

// Stato statico come attributo transform (per rendering senza GSAP:
// favicon, reduced motion, stringhe SVG).
export function staticTransform(index, deg, gap) {
  const [cx, cy] = CELL_CENTERS[index];
  const k = gapScale(gap);
  return `rotate(${norm(deg)} ${cx} ${cy}) translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})`;
}

export function markSVGString({ state = 'soglia', gap = GAP_LOGO, color = '#ECEAF4', background = null, radius = 22, padding = 18 } = {}) {
  const degs = stateToDegrees(state);
  const vb = 100 + padding * 2;
  const bg = background
    ? `<rect x="${-padding}" y="${-padding}" width="${vb}" height="${vb}" rx="${radius}" fill="${background}"/>`
    : '';
  const quarters = degs
    .map((d, i) => `<path d="${quarterPath(i)}" fill="${color}" transform="${staticTransform(i, d, gap)}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-padding} ${-padding} ${vb} ${vb}">${bg}${quarters}</svg>`;
}

// ============================================================
// WORDMARK — PALACAN disegnato, non composto con un font.
// Costruito sulla stessa griglia del segno: altezza 100 (= il
// segno), tratto 11, curve con raggio meta' altezza come il disco.
// Le tre A sono la cupola della SOGLIA disegnata a tratto; la loro
// traversa giace sulla linea d'imposta (y 50), dove nel segno la
// cupola incontra i quarti inferiori. Ogni lettera e' tagliata in
// quattro celle come il segno: nel motion ogni cella gira a quarti.
// ============================================================
const T = 11;
const R = 30.5; // meta' dell'altezza dell'occhiello di P (0..61 = traversa A)

const GLYPH = {
  P: {
    w: 90,
    d:
      `M0 0 H${90 - R} A${R} ${R} 0 0 1 ${90 - R} ${2 * R} H${T} V100 H0 Z ` +
      `M${T} ${T} H${90 - R} A${R - T} ${R - T} 0 0 1 ${90 - R} ${2 * R - T} H${T} Z`,
  },
  A: {
    w: 100,
    d: `M0 100 V50 A50 50 0 0 1 100 50 V100 H${100 - T} V61 H${T} V100 Z M${T} 50 A${50 - T} ${50 - T} 0 0 1 ${100 - T} 50 Z`,
  },
  L: { w: 80, d: `M0 0 H${T} V${100 - T} H80 V100 H0 Z` },
  C: {
    w: 100,
    d: `M100 0 V${T} H50 A${50 - T} ${50 - T} 0 0 0 50 ${100 - T} H100 V100 H50 A50 50 0 0 1 50 0 Z`,
  },
  N: {
    w: 100,
    d: `M0 100 V0 H${T * 1.25} L${100 - T} ${100 - T * 2.6} V0 H100 V100 H${100 - T * 1.25} L${T} ${T * 2.6} V100 Z`,
  },
};

export const WORDMARK_TRACKING = 30;

export function wordmarkLayout(word = 'PALACAN') {
  let x = 0;
  const letters = word.split('').map((ch, i) => {
    const g = GLYPH[ch];
    if (!g) throw new Error(`Lettera non disegnata nel wordmark: ${ch}`);
    const item = { ch, i, x, w: g.w, d: g.d };
    x += g.w + WORDMARK_TRACKING;
    return item;
  });
  return { letters, width: x - WORDMARK_TRACKING, height: 100 };
}
