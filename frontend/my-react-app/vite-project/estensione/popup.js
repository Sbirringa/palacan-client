/* global chrome */
// estensione/popup.js  [palacan-l1d]  Mostra lo stato della scheda attiva.
import { SITO, CHIAVE_RILASCIO } from './configurazione.js';
import { descriviMotivo } from './controllo.js';

const $ = (id) => document.getElementById(id);
const TITOLI = {
  verde: 'Il sito coincide con il codice pubblicato e firmato',
  rosso: 'ATTENZIONE: il sito NON coincide con il codice firmato',
  grigio: 'Controllo in corso o non completo',
};

function riga(dt, dd) {
  const a = document.createElement('dt');
  a.textContent = dt;
  const b = document.createElement('dd');
  b.textContent = dd;
  $('dettagli').append(a, b);
}

async function main() {
  $('nota').textContent = `Chiave di rilascio: ML-DSA-65 ${String(CHIAVE_RILASCIO.impronta_pq).slice(0, 16)}..., ed25519 ${String(CHIAVE_RILASCIO.ed).slice(0, 12)}... - Sito: ${SITO}`;
  const [scheda] = await chrome.tabs.query({ active: true, currentWindow: true });
  let presente = null;
  try {
    presente = await chrome.tabs.sendMessage(scheda.id, { tipo: 'ci_sei' });
  } catch (_) { /* nessuna pagina di Palacan in questa scheda */ }
  if (!presente) {
    $('stato').textContent = 'Questa scheda non e\' Palacan';
    return;
  }
  const { scheda: s } = await chrome.runtime.sendMessage({ tipo: 'stato', tabId: scheda.id });
  if (!s) {
    $('stato').textContent = 'Ricarica la pagina per controllarla';
    return;
  }
  $('stato').textContent = TITOLI[s.stato] || s.stato;
  $('stato').className = `stato ${s.stato}`;
  for (const m of s.motivi || []) {
    const li = document.createElement('li');
    li.textContent = descriviMotivo(m);
    $('motivi').append(li);
  }
  if (s.firma && s.firma.esito === 'valida') {
    riga('Commit', s.firma.commit);
    riga('Rilascio', `${s.firma.numero} (${s.firma.quando})`);
  }
  const controllati = Object.values(s.esiti || {}).filter((e) => e === 'ok').length + (s.documento === 'ok' ? 1 : 0);
  riga('File controllati', String(controllati));
}

main().catch((e) => {
  $('stato').textContent = `Errore: ${e.message}`;
});
