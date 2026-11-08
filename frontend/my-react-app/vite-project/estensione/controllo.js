// estensione/controllo.js  [palacan-l1d]
//
// Il cuore dell'estensione "Palacan Verifica": funzioni pure, senza chrome.*, provate con vitest
// (tests/estensioneVerifica.test.js) contro sicurezza/rilascio.mjs e il motore vero.
//   - verificaRilascio: la STESSA verifica di sicurezza/rilascio.mjs (L1c), scritta per il browser (WebCrypto):
//     firma ibrida ed25519 + ML-DSA-65 con la chiave di rilascio FISSATA nell'estensione, elenco giusto, numero non
//     piu' basso dell'ultimo visto (niente ritorno a versioni vecchie);
//   - valutaFile / valutaDocumento: l'impronta di un file caricato dalla pagina e' quella dell'elenco firmato?
//   - cspSicura: la pagina puo' eseguire solo script del sito stesso (niente script in linea, niente altri siti)?
//   - esitoComplessivo: verde (tutto torna), rosso (qualcosa NON torna), grigio (controllo non completo).

export const VERSIONE = 1;
export const CONTESTO_RILASCIO = 'rilascio';
export const PERCORSO_ELENCO = 'palacan-impronte.json';
export const PERCORSO_FIRMA = 'rilascio/palacan-impronte.sig';
const ESCLUSI = new Set([PERCORSO_ELENCO, PERCORSO_FIRMA]);

let sottile = globalThis.crypto && globalThis.crypto.subtle;
/** Solo per le prove (in jsdom crypto.subtle puo' mancare). */
export function usaCrypto(s) {
  sottile = s;
}

const t = (v) => (v == null ? '' : String(v).trim());

export function daBase64(s) {
  const bin = atob(t(s));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u[i] = bin.charCodeAt(i);
  return u;
}

export async function sha256Hex(dati) {
  const byte = typeof dati === 'string' ? new TextEncoder().encode(dati) : dati;
  const h = new Uint8Array(await sottile.digest('SHA-256', byte));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function testoRilascio({ impronta, commit, numero, quando }) {
  return `palacan-rilascio-v1|${t(impronta)}|${t(commit)}|${Number(numero)}|${t(quando)}`;
}

/** Come verificaRilascio di sicurezza/rilascio.mjs: { valida: true } oppure { valida: false, motivo }. */
export async function verificaRilascio(motore, pubblica, firma, { improntaElenco, ultimoNumero = 0 } = {}) {
  try {
    if (!firma || firma.v !== VERSIONE || firma.contesto !== CONTESTO_RILASCIO) return { valida: false, motivo: 'formato' };
    if (!pubblica || t(firma.chiave_ed) !== t(pubblica.ed)) return { valida: false, motivo: 'chiave_diversa' };
    if (t(firma.chiave_pq_impronta) !== await sha256Hex(daBase64(pubblica.pq))) return { valida: false, motivo: 'chiave_diversa' };
    if (improntaElenco !== undefined && t(firma.impronta_elenco) !== t(improntaElenco)) return { valida: false, motivo: 'elenco_diverso' };
    if (!(Number(firma.numero) >= Number(ultimoNumero || 0))) return { valida: false, motivo: 'versione_vecchia' };
    const messaggio = testoRilascio({ impronta: firma.impronta_elenco, commit: firma.commit, numero: firma.numero, quando: firma.quando });
    const ok = motore.pqfirma_verifica_ibrida(CONTESTO_RILASCIO, t(pubblica.ed), t(pubblica.pq), messaggio, t(firma.firma_ed), t(firma.firma_pq)) === true;
    return ok ? { valida: true } : { valida: false, motivo: 'firma_falsa' };
  } catch (_) {
    return { valida: false, motivo: 'firma_falsa' };
  }
}

/** Indirizzo -> nome del file nell'elenco ('/' -> 'index.html'); null se e' di un altro sito. */
export function percorsoDaUrl(url, sito) {
  let u;
  let o;
  try {
    u = new URL(url, sito);
    o = new URL(sito);
  } catch (_) {
    return null;
  }
  if (u.origin !== o.origin || u.protocol !== o.protocol) return null;  // blob: e data: non sono file del sito
  let p;
  try {
    p = decodeURIComponent(u.pathname);
  } catch (_) {
    p = u.pathname;
  }
  p = p.replace(/^\/+/, '');
  return p === '' ? 'index.html' : p;
}

/**
 * Un file caricato dalla pagina: 'ok' | 'diverso' | 'sconosciuto' | 'escluso'.
 * Un indirizzo che non e' nell'elenco ma restituisce esattamente index.html (le pagine dell'app, /login, /chat...)
 * e' 'ok': e' cio' che fa nginx per ogni indirizzo dell'app.
 */
export function valutaFile(elenco, percorso, impronta) {
  if (ESCLUSI.has(percorso)) return 'escluso';
  const file = (elenco && elenco.file) || {};
  if (Object.prototype.hasOwnProperty.call(file, percorso)) return file[percorso] === impronta ? 'ok' : 'diverso';
  if (file['index.html'] && file['index.html'] === impronta) return 'ok';
  return 'sconosciuto';
}

/**
 * Un file che il sito NON ha (404) e che non e' codice (un'icona chiesta dal browser, per esempio) non conta: la pagina
 * non ha ricevuto niente da eseguire. Il codice (js, wasm, css, html) che non si riesce a scaricare resta grigio.
 */
export function assenteInnocuo(percorso, errore) {
  return errore === 'http_404' && !/\.(m?js|wasm|css|html?|json|webmanifest)$/i.test(String(percorso));
}

/** La pagina stessa: deve essere esattamente index.html dell'elenco, a qualunque indirizzo dell'app. */
export function valutaDocumento(elenco, impronta) {
  const atteso = elenco && elenco.file && elenco.file['index.html'];
  return atteso && atteso === impronta ? 'ok' : 'diverso';
}

const GRAVITA = { escluso: 0, ok: 1, in_attesa: 2, non_scaricato: 3, sconosciuto: 4, diverso: 5 };
/** Due esiti per lo stesso file: vale il peggiore (un file visto diverso resta rosso per tutta la pagina). */
export function peggiore(a, b) {
  if (a === undefined) return b;
  return (GRAVITA[b] ?? 0) > (GRAVITA[a] ?? 0) ? b : a;
}

function direttive(politica) {
  const mappa = new Map();
  for (const pezzo of String(politica).split(';')) {
    const parole = pezzo.trim().split(/\s+/).filter(Boolean);
    if (!parole.length) continue;
    const nome = parole[0].toLowerCase();
    if (!mappa.has(nome)) mappa.set(nome, parole.slice(1).map((x) => x.toLowerCase()));
  }
  return mappa;
}

function unaPoliticaSicura(politica) {
  const d = direttive(politica);
  const solo = (valori, ammessi) => Array.isArray(valori) && valori.length > 0 && valori.every((x) => ammessi.includes(x));
  const script = d.get('script-src') || d.get('default-src');
  if (!solo(script, ["'self'", "'wasm-unsafe-eval'"])) return false;
  const worker = d.get('worker-src') || d.get('child-src') || script;
  if (!solo(worker, ["'self'"]) && !solo(worker, ["'self'", "'wasm-unsafe-eval'"])) return false;
  if (!solo(d.get('object-src') || d.get('default-src'), ["'none'"])) return false;
  if (!solo(d.get('base-uri'), ["'none'", "'self'"])) return false;
  return true;
}

/**
 * La CSP della pagina (testo dell'intestazione; piu' intestazioni arrivano separate da virgole) lascia eseguire
 * solo i file del sito? Con piu' politiche valgono tutte insieme: basta che una sia sicura.
 */
export function cspSicura(intestazione) {
  if (!intestazione) return false;
  return String(intestazione).split(',').some((p) => unaPoliticaSicura(p));
}

/**
 * Lo stato di una pagina: { stato: 'verde' | 'rosso' | 'grigio', motivi: [...] }.
 * firma: { esito: 'valida' | 'rete' | 'motore' | <motivo rosso> } | null; csp: true | false | null (non vista);
 * esiti: { percorso: esito }; documento: esito della pagina stessa (index.html) o undefined.
 */
export function esitoComplessivo({ firma, csp, esiti, documento } = {}) {
  const rossi = [];
  const grigi = new Set();
  if (!firma) grigi.add('in_corso');
  else if (firma.esito === 'rete' || firma.esito === 'motore') grigi.add(firma.esito);
  else if (firma.esito !== 'valida') rossi.push(firma.esito);
  if (csp === false) rossi.push('csp_debole');
  else if (csp !== true) grigi.add('csp_non_vista');
  if (documento === 'diverso') rossi.push('file_diverso:index.html');
  else if (documento !== 'ok') grigi.add('in_corso');
  for (const [p, e] of Object.entries(esiti || {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (e === 'diverso') rossi.push(`file_diverso:${p}`);
    else if (e === 'sconosciuto') rossi.push(`file_sconosciuto:${p}`);
    else if (e === 'non_scaricato') grigi.add(`file_non_scaricato:${p}`);
    else if (e === 'in_attesa') grigi.add('in_corso');
  }
  if (rossi.length) return { stato: 'rosso', motivi: rossi };
  if (grigi.size) return { stato: 'grigio', motivi: [...grigi] };
  return { stato: 'verde', motivi: [] };
}

const TESTI = {
  in_corso: 'Controllo in corso...',
  rete: 'Non riesco a scaricare l\'elenco o la firma dal sito (sei offline?).',
  motore: 'Il motore di verifica dell\'estensione non si e\' avviato.',
  formato: 'La firma o l\'elenco hanno un formato sconosciuto.',
  elenco_mancante: 'Il sito NON pubblica l\'elenco delle impronte.',
  firma_mancante: 'Il sito NON pubblica la firma dell\'elenco.',
  chiave_diversa: 'L\'elenco e\' firmato con una chiave che NON e\' quella di rilascio di Palacan.',
  elenco_diverso: 'La firma NON corrisponde all\'elenco servito dal sito.',
  versione_vecchia: 'Il sito serve una versione PIU\' VECCHIA di una gia\' vista: possibile ritorno indietro forzato.',
  firma_falsa: 'La firma dell\'elenco NON e\' valida.',
  csp_debole: 'La pagina permette di eseguire codice che non viene dal sito (protezione CSP assente o indebolita).',
  csp_non_vista: 'Non sono riuscito a leggere la protezione CSP della pagina.',
};

/** Testo in italiano per un motivo (anche 'file_diverso:assets/x.js'). */
export function descriviMotivo(motivo) {
  const [tipo, ...resto] = String(motivo).split(':');
  const file = resto.join(':');
  if (tipo === 'file_diverso') return `Il file ${file} e' DIVERSO da quello pubblicato e firmato.`;
  if (tipo === 'file_sconosciuto') return `La pagina ha caricato ${file}, che NON e' nell'elenco firmato.`;
  if (tipo === 'file_non_scaricato') return `Non sono riuscito a controllare ${file}.`;
  return TESTI[motivo] || motivo;
}
