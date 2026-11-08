/* global chrome */
// estensione/pagina.js  [palacan-l1d]
//
// Gira solo sulle pagine di Palacan, dall'inizio del caricamento (document_start), in un mondo separato da quello
// della pagina (il codice del sito non lo puo' toccare). Annota OGNI file che la pagina carica dal sito (anche quelli
// caricati dopo, mentre usi l'app), ne calcola l'impronta SHA-256 e la manda alla parte di sfondo, che la confronta
// con l'elenco firmato. I file si riscaricano dalla cache del browser ("force-cache"), cioe' gli stessi byte che ha
// ricevuto la pagina. Non legge i messaggi ne' il contenuto della pagina: solo quali file ha caricato.
(() => {
  'use strict';

  if (window.top !== window) return;
  const origine = location.origin;
  const indirizzo = location.href.split('#')[0];
  const visti = new Set([indirizzo]);
  const daControllare = new Set();
  let pronto = false;
  let timer = null;
  let documentoMandato = false;

  const manda = (m) => {
    try {
      return chrome.runtime.sendMessage(m).catch(() => null);
    } catch (_) {
      return Promise.resolve(null);  // estensione aggiornata o disattivata mentre la pagina era aperta
    }
  };

  function aggiungi(url) {
    let u;
    try {
      u = new URL(url, indirizzo);
    } catch (_) {
      return;
    }
    u.hash = '';
    if (u.protocol !== location.protocol || u.origin !== origine || visti.has(u.href)) return;
    visti.add(u.href);
    daControllare.add(u.href);
    programma();
  }

  function programma() {
    if (!pronto) return;
    clearTimeout(timer);
    timer = setTimeout(invia, 300);
  }

  async function impronta(url, conCsp) {
    try {
      const r = await fetch(url, { cache: 'force-cache', credentials: 'same-origin' });
      if (!r.ok || new URL(r.url).origin !== origine) return { url, errore: `http_${r.status}` };
      const h = new Uint8Array(await crypto.subtle.digest('SHA-256', await r.arrayBuffer()));
      const voce = { url, impronta: Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('') };
      if (conCsp) voce.csp = r.headers.get('content-security-policy');
      return voce;
    } catch (_) {
      return { url, errore: 'rete' };
    }
  }

  async function servizi() {
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (!reg) return [];
      return [reg.active, reg.waiting, reg.installing].filter(Boolean).map((w) => w.scriptURL);
    } catch (_) {
      return [];
    }
  }

  async function invia() {
    const lista = [...daControllare];
    daControllare.clear();
    const messaggio = { tipo: 'file', url: indirizzo, file: await Promise.all(lista.map((u) => impronta(u, false))), servizi: await servizi() };
    if (!documentoMandato) {
      documentoMandato = true;
      messaggio.documento = await impronta(indirizzo, true);
    }
    await manda(messaggio);
  }

  manda({ tipo: 'inizio', url: indirizzo });

  // ogni file caricato dalla pagina, dal primo all'ultimo (anche quelli caricati prima che questo codice partisse)
  try {
    new PerformanceObserver((lista) => {
      for (const voce of lista.getEntries()) aggiungi(voce.name);
    }).observe({ type: 'resource', buffered: true });
  } catch (_) { /* senza PerformanceObserver restano i file dichiarati nella pagina */ }

  function dichiarati() {
    for (const el of document.querySelectorAll('script[src], link[href]')) aggiungi(el.src || el.href);
  }

  window.addEventListener('load', () => {
    setTimeout(() => {
      dichiarati();
      pronto = true;
      invia();
    }, 500);
  }, { once: true });

  // il popup chiede "questa scheda e' Palacan?"
  chrome.runtime.onMessage.addListener((m, _mittente, rispondi) => {
    if (m && m.tipo === 'ci_sei') {
      rispondi({ url: location.href });
      return false;
    }
    return false;
  });
})();
