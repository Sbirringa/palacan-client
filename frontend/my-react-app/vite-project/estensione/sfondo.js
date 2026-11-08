/* global chrome */
// estensione/sfondo.js  [palacan-l1d]
//
// Parte "di sfondo" dell'estensione (service worker): scarica dal sito l'elenco delle impronte e la sua firma,
// verifica la firma con la chiave di rilascio FISSATA nell'estensione (configurazione.js, scritta da
// scripts/preparaEstensione.mjs dalla chiave pubblica del repository) e con lo stesso motore dell'app
// (palacan-crypto in WebAssembly); poi confronta le impronte dei file che la pagina ha caricato (le calcola
// pagina.js) e accende l'icona: verde, rossa o grigia. Ricorda l'ultimo numero di rilascio visto: una versione piu'
// vecchia, anche se firmata, e' rossa.
// Non legge i messaggi, non legge le richieste del browser, vede solo il sito di Palacan.

import * as motore from './palacan_crypto.js';
import { SITO, CHIAVE_RILASCIO } from './configurazione.js';
import {
  PERCORSO_ELENCO, PERCORSO_FIRMA, sha256Hex, verificaRilascio, percorsoDaUrl, valutaFile, valutaDocumento,
  peggiore, assenteInnocuo, cspSicura, esitoComplessivo, descriviMotivo,
} from './controllo.js';

const ORIGINE = new URL(SITO).origin;

// --- motore -----------------------------------------------------------------------------------------------------
let avvio = null;
function motorePronto() {
  if (!avvio) {
    avvio = (async () => {
      const r = await fetch(chrome.runtime.getURL('palacan_crypto_bg.wasm'));
      motore.initSync({ module: await WebAssembly.compile(await r.arrayBuffer()) });
      return motore;
    })();
    avvio.catch(() => { avvio = null; });
  }
  return avvio;
}

// --- stato di ogni scheda (chrome.storage.session: resta anche se il service worker si addormenta) ----------------
const chiave = (id) => `scheda:${id}`;
const code = new Map();
function inCoda(id, lavoro) {
  const dopo = (code.get(id) || Promise.resolve()).then(lavoro, lavoro);
  code.set(id, dopo.catch(() => {}));
  return dopo;
}
async function leggiScheda(id) {
  const k = chiave(id);
  return (await chrome.storage.session.get(k))[k] || null;
}

const ASPETTO = {
  verde: { testo: '✓', colore: '#1a7f37', titolo: 'Palacan Verifica: il sito coincide con il codice pubblicato e firmato' },
  rosso: { testo: '!', colore: '#cf222e', titolo: 'Palacan Verifica: ATTENZIONE, il sito NON coincide con il codice firmato' },
  grigio: { testo: '…', colore: '#6e7781', titolo: 'Palacan Verifica: controllo in corso o non completo' },
};
async function mostra(tabId, s) {
  const a = ASPETTO[s.stato] || ASPETTO.grigio;
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: a.colore });
    await chrome.action.setBadgeText({ tabId, text: a.testo });
    await chrome.action.setTitle({ tabId, title: [a.titolo, ...s.motivi.slice(0, 3).map(descriviMotivo)].join('\n') });
  } catch (_) { /* scheda chiusa nel frattempo */ }
}
async function salva(tabId, s) {
  Object.assign(s, esitoComplessivo(s), { aggiornata: Date.now() });
  await chrome.storage.session.set({ [chiave(tabId)]: s });
  await mostra(tabId, s);
  return s;
}

const nuovaScheda = (url) => ({ v: 1, url, stato: 'grigio', motivi: ['in_corso'], firma: null, elenco: null, csp: null, documento: undefined, esiti: {} });

// --- elenco e firma, scaricati dall'estensione (non dalla pagina) --------------------------------------------------
async function scarica(percorso) {
  const r = await fetch(`${ORIGINE}/${percorso}`, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
  if (!r.ok) return { mancante: true };
  return { dati: new Uint8Array(await r.arrayBuffer()) };
}

async function controllaFirma(s) {
  let elenco;
  let firma;
  try {
    [elenco, firma] = await Promise.all([scarica(PERCORSO_ELENCO), scarica(PERCORSO_FIRMA)]);
  } catch (_) {
    s.firma = { esito: 'rete' };
    return;
  }
  if (elenco.mancante) { s.firma = { esito: 'elenco_mancante' }; return; }
  if (firma.mancante) { s.firma = { esito: 'firma_mancante' }; return; }
  let el;
  let fi;
  try {
    el = JSON.parse(new TextDecoder().decode(elenco.dati));
    fi = JSON.parse(new TextDecoder().decode(firma.dati));
    if (!el || typeof el.file !== 'object' || !el.file) throw new Error('elenco');
  } catch (_) {
    s.firma = { esito: 'formato' };
    return;
  }
  let m;
  try {
    m = await motorePronto();
  } catch (_) {
    s.firma = { esito: 'motore' };
    return;
  }
  const improntaElenco = await sha256Hex(elenco.dati);
  const { ultimoNumero = 0 } = await chrome.storage.local.get('ultimoNumero');
  const esito = await verificaRilascio(m, CHIAVE_RILASCIO, fi, { improntaElenco, ultimoNumero });
  if (!esito.valida) {
    s.firma = { esito: esito.motivo, numero: fi && fi.numero, ultimoNumero };
    return;
  }
  s.firma = { esito: 'valida', commit: fi.commit, numero: fi.numero, quando: fi.quando, improntaElenco };
  s.elenco = { file: el.file };
  if (Number(fi.numero) > Number(ultimoNumero)) await chrome.storage.local.set({ ultimoNumero: Number(fi.numero) });
}

// il file dello script di servizio (sw.js) si scarica dall'estensione: dalla pagina passerebbe proprio da lui
async function improntaDalSito(url) {
  try {
    const r = await fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (!r.ok) return { url, errore: `http_${r.status}` };
    return { url, impronta: await sha256Hex(new Uint8Array(await r.arrayBuffer())) };
  } catch (_) {
    return { url, errore: 'rete' };
  }
}

function registraFile(s, voce) {
  const p = percorsoDaUrl(voce.url, ORIGINE);
  if (p === null || assenteInnocuo(p, voce.errore)) return;
  let esito;
  if (voce.errore) {
    esito = 'non_scaricato';
    s.errori = { ...(s.errori || {}), [p]: voce.errore };
  }
  else if (!s.elenco) esito = 'in_attesa';
  else esito = valutaFile(s.elenco, p, voce.impronta);
  if (esito === 'escluso') return;
  if (!(p in s.esiti)) s.ordine = [...(s.ordine || []), p];  // in che ordine la pagina li ha caricati
  s.esiti[p] = peggiore(s.esiti[p], esito);
}

async function riceviFile(tabId, m) {
  let s = await leggiScheda(tabId);
  if (!s || s.url !== m.url) s = nuovaScheda(m.url);
  if (!s.firma || s.firma.esito === 'rete' || s.firma.esito === 'motore') await controllaFirma(s);
  if (m.documento) {
    if (m.documento.errore) {
      if (s.documento !== 'diverso') s.documento = 'non_scaricato';
    } else {
      s.csp = cspSicura(m.documento.csp);
      s.documento = s.elenco ? peggiore(s.documento, valutaDocumento(s.elenco, m.documento.impronta)) : 'in_attesa';
    }
  }
  for (const voce of m.file || []) registraFile(s, voce);
  for (const url of m.servizi || []) {
    const p = percorsoDaUrl(url, ORIGINE);
    if (p !== null && !(p in s.esiti)) registraFile(s, await improntaDalSito(url));
  }
  return salva(tabId, s);
}

// --- messaggi ------------------------------------------------------------------------------------------------------
const dalSito = (sender) => sender && sender.tab && typeof sender.tab.id === 'number' && sender.origin === ORIGINE
  && sender.frameId === 0;

chrome.runtime.onMessage.addListener((m, sender, rispondi) => {
  if (!m || typeof m !== 'object') return false;
  if (m.tipo === 'inizio' && dalSito(sender)) {
    const id = sender.tab.id;
    inCoda(id, async () => {
      const s = nuovaScheda(String(m.url));
      await salva(id, s);
      await controllaFirma(s);
      return salva(id, s);
    }).then(() => rispondi({ ok: true }), () => rispondi({ ok: false }));
    return true;
  }
  if (m.tipo === 'file' && dalSito(sender)) {
    const id = sender.tab.id;
    inCoda(id, () => riceviFile(id, m)).then((s) => rispondi({ stato: s.stato }), () => rispondi({ stato: 'grigio' }));
    return true;
  }
  if (m.tipo === 'stato' && !sender.tab && typeof m.tabId === 'number') {  // dal popup
    leggiScheda(m.tabId).then((s) => rispondi({ scheda: s }), () => rispondi({ scheda: null }));
    return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(chiave(tabId)).catch(() => {});
});
