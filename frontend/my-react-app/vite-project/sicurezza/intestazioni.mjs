// sicurezza/intestazioni.mjs  [palacan-l1a]
//
// L1a (Chiusura limiti): intestazioni di sicurezza della pagina web. Prima nginx serviva l'app SENZA nessuna
// intestazione: niente Content-Security-Policy (il browser avrebbe eseguito qualunque script finito nella pagina),
// niente protezione dall'incorporamento in altri siti, niente HSTS.
//
// Qui si scrivono, a ogni build, due file per nginx (il Dockerfile li copia in /etc/nginx/):
//   - palacan-intestazioni.conf: su ogni risposta (nosniff, niente incorporamento, niente Referer, HSTS, permessi);
//   - palacan-csp.conf: la Content-Security-Policy, sulla pagina (index.html):
//       * script SOLO dal sito stesso (niente script nella pagina, niente eval, niente CDN); WebAssembly ammesso
//         ('wasm-unsafe-eval': serve a vodozemac, non permette eval di JavaScript);
//       * collegamenti SOLO al sito stesso e all'API (https e wss), presa da VITE_API_URL come nel resto dell'app;
//       * immagini, caratteri e media solo dal sito (piu' data: e blob: generati dall'app stessa);
//       * niente plugin, niente <base>, niente incorporamento in altri siti.
//     Gli stili restano 'unsafe-inline': le librerie dell'interfaccia li mettono nella pagina, e gli stili non
//     eseguono codice.

import fs from 'node:fs';
import path from 'node:path';

export const FILE_INTESTAZIONI = 'palacan-intestazioni.conf';
export const FILE_CSP = 'palacan-csp.conf';

function origineApi(apiUrl) {
  const testo = String(apiUrl || '').trim();
  if (!testo) return null;
  let u;
  try {
    u = new URL(testo);
  } catch (_) {
    throw new Error(`VITE_API_URL non e' un indirizzo valido: ${testo}`);
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) {
    throw new Error(`VITE_API_URL deve essere https (http solo in locale): ${testo}`);
  }
  if (!/^[a-z0-9.-]+$/i.test(u.hostname) || (u.port && !/^\d+$/.test(u.port))) {
    throw new Error(`VITE_API_URL con caratteri non ammessi: ${testo}`);
  }
  const ws = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return { http: `${u.protocol}//${u.host}`, ws: `${ws}//${u.host}` };
}

export function direttive(apiUrl) {
  const api = origineApi(apiUrl);
  const collegamenti = ["'self'", ...(api ? [api.http, api.ws] : [])];
  return [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", "'wasm-unsafe-eval'"]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'", 'data:']],
    ['media-src', ["'self'", 'data:', 'blob:']],  // suoni di notifica scritti nel codice (data:) e flussi locali (blob:)
    ['connect-src', collegamenti],
    ['worker-src', ["'self'"]],
    ['manifest-src', ["'self'"]],
    ['frame-src', ["'none'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'none'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
}

export function politicaContenuti(apiUrl) {
  return direttive(apiUrl).map(([nome, valori]) => `${nome} ${valori.join(' ')}`).join('; ');
}

export const INTESTAZIONI = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'no-referrer'],
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ['Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()'],
  ['Cross-Origin-Opener-Policy', 'same-origin'],
];

const riga = (nome, valore) => `add_header ${nome} "${valore}" always;`;

export function testoIntestazioni() {
  return `# [palacan-l1a] generato da sicurezza/intestazioni.mjs a ogni build: non modificare a mano\n${INTESTAZIONI.map(([n, v]) => riga(n, v)).join('\n')}\n`;
}

export function testoCsp(apiUrl) {
  return `# [palacan-l1a] generato da sicurezza/intestazioni.mjs a ogni build: non modificare a mano\n${riga('Content-Security-Policy', politicaContenuti(apiUrl))}\n`;
}

/** Plugin di Vite: a fine build scrive i due file per nginx nella cartella della build. */
export function intestazioniNginx() {
  let api = '';
  let cartella = 'dist';
  return {
    name: 'palacan-intestazioni-nginx',
    apply: 'build',
    configResolved(config) {
      api = config.env?.VITE_API_URL || process.env.VITE_API_URL || '';
      cartella = path.resolve(config.root, config.build.outDir);
      origineApi(api); // un indirizzo sbagliato ferma la build qui, non in produzione
    },
    closeBundle() {
      fs.mkdirSync(cartella, { recursive: true });
      fs.writeFileSync(path.join(cartella, FILE_INTESTAZIONI), testoIntestazioni());
      fs.writeFileSync(path.join(cartella, FILE_CSP), testoCsp(api));
    },
  };
}
