// scripts/verificaEstensione.mjs  [palacan-l1d]
//
// Prova l'estensione "Palacan Verifica" in un Chromium vero (quello di Playwright), con il motore vero.
//
//   node scripts/verificaEstensione.mjs                 (dopo npm run build) PROVA IN LOCALE, niente esce dal PC:
//       serve dist/ con le stesse intestazioni di nginx, firma l'elenco con una chiave di PROVA (solo in memoria),
//       carica l'estensione con quella chiave e simula gli attacchi: l'icona deve essere verde solo quando tutto
//       torna e rossa, con il motivo giusto, per: un file cambiato, una versione vecchia, la firma tolta, una firma
//       fatta con un'altra chiave, la CSP tolta. Ogni richiesta verso l'esterno (API vera compresa) viene bloccata.
//   node scripts/verificaEstensione.mjs --sito https://...   SITO VERO, come un visitatore qualsiasi (nessun login):
//       estensione con la chiave di rilascio VERA del repository: deve essere verde; poi si finge di aver gia' visto
//       una versione piu' nuova e deve diventare rossa (versione vecchia). Il sito non viene toccato.
// Uscita: 0 = tutto come previsto; 1 = qualcosa non va (elencato); 2 = Chromium di Playwright non disponibile.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { preparaEstensione } from './preparaEstensione.mjs';
import { nuovaChiaveRilascio, firmaRilascio } from '../sicurezza/rilascio.mjs';

const FE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argomento = (nome, riserva) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : riserva;
};
const SITO_VERO = argomento('--sito', null);
const DIST = path.join(FE, 'dist');
const TIPI = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json', '.pdf': 'application/pdf',
  '.txt': 'text/plain', '.webmanifest': 'application/manifest+json', '.sig': 'application/json',
};
const problemi = [];
const ok = (cosa) => console.log(`OK: ${cosa}`);
const male = (cosa) => {
  console.log(`NON VA: ${cosa}`);
  problemi.push(cosa);
};

async function motore() {
  const pkg = await import('../src/crypto/pkg/palacan_crypto.js');
  pkg.initSync({ module: fs.readFileSync(path.join(FE, 'src', 'crypto', 'pkg', 'palacan_crypto_bg.wasm')) });
  return pkg;
}

function leggiIntestazioni(file) {
  const testo = fs.readFileSync(path.join(DIST, file), 'utf8');
  return [...testo.matchAll(/^add_header\s+(\S+)\s+"([^"]*)"\s+always;$/gm)].map((m) => [m[1], m[2]]);
}

async function apriBrowser(estensione, profilo, soloLocale) {
  let chromium;
  try {
    ({ chromium } = await import('@playwright/test'));
  } catch (_) {
    console.log('SALTATO: @playwright/test non disponibile');
    process.exit(2);
  }
  const args = [`--disable-extensions-except=${estensione}`, `--load-extension=${estensione}`];
  // in locale nessun indirizzo esterno si risolve: niente esce dal PC (API vera compresa)
  if (soloLocale) args.push('--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
  const prove = [{ channel: 'chromium', headless: true, args }, { headless: false, args }];
  let ultimo = null;
  for (const opzioni of prove) {
    let contesto = null;
    try {
      contesto = await chromium.launchPersistentContext(profilo, opzioni);
      let sw = contesto.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
      if (!sw) sw = await contesto.waitForEvent('serviceworker', { timeout: 15000 });
      return { contesto, sw };
    } catch (e) {
      ultimo = e;
      if (contesto) await contesto.close().catch(() => {});
    }
  }
  console.log(`SALTATO: non riesco ad avviare Chromium con l'estensione (${ultimo && ultimo.message.split('\n')[0]})`);
  process.exit(2);
  return null;
}

async function schedaDi(sw, origine) {
  const tutte = await sw.evaluate(() => chrome.storage.session.get(null));  // eslint-disable-line no-undef
  return Object.entries(tutte)
    .filter(([k, s]) => k.startsWith('scheda:') && s && String(s.url).startsWith(origine))
    .map(([, s]) => s)
    .sort((a, b) => (b.aggiornata || 0) - (a.aggiornata || 0))[0] || null;
}

/** Apre la pagina da zero (cache, script di servizio e stato dell'estensione puliti) e aspetta l'esito. */
async function prova(ambiente, attesa, motivo = null) {
  const { contesto, sw, origine } = ambiente;
  const pagina = contesto.pages()[0] || await contesto.newPage();
  const cdp = await contesto.newCDPSession(pagina);
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Storage.clearDataForOrigin', { origin: origine, storageTypes: 'service_workers,cache_storage' }).catch(() => {});
  await cdp.detach().catch(() => {});
  await sw.evaluate(async () => {
    const tutte = await chrome.storage.session.get(null);  // eslint-disable-line no-undef
    await chrome.storage.session.remove(Object.keys(tutte));  // eslint-disable-line no-undef
  });
  await pagina.goto(`${origine}/`, { waitUntil: 'load' });
  const fine = Date.now() + 25000;
  let s = null;
  while (Date.now() < fine) {
    await new Promise((r) => setTimeout(r, 500));
    s = await schedaDi(sw, origine);
    if (s && s.stato === attesa && (!motivo || s.motivi.some((m) => m.startsWith(motivo)))) break;
    if (s && attesa === 'verde' && s.stato === 'rosso') break;
  }
  if (s && attesa === 'verde' && s.stato === 'verde') {
    // l'app carica altri file mentre gira: si aspetta ancora un po' e si rilegge (devono restare verdi)
    await new Promise((r) => setTimeout(r, 3000));
    s = await schedaDi(sw, origine);
  }
  return s;
}

function controlla(titolo, s, attesa, motivo = null) {
  const visto = s ? `${s.stato}${s.motivi.length ? ` (${s.motivi.join(', ')})` : ''}${s.errori ? ` errori: ${JSON.stringify(s.errori)}` : ''}` : 'nessuno stato';
  if (s && s.stato === attesa && (!motivo || s.motivi.some((m) => m.startsWith(motivo)))) ok(`${titolo}: ${visto}`);
  else male(`${titolo}: atteso ${attesa}${motivo ? ` con ${motivo}` : ''}, visto ${visto}`);
}

const impostaUltimo = (sw, n) => sw.evaluate((x) => chrome.storage.local.set({ ultimoNumero: x }), n);  // eslint-disable-line no-undef

async function provaLocale(cartella, profilo) {
  if (!fs.existsSync(path.join(DIST, 'palacan-impronte.json'))) throw new Error('manca dist/palacan-impronte.json: prima npm run build');
  const m = await motore();
  const buona = nuovaChiaveRilascio(m);
  const altra = nuovaChiaveRilascio(m);
  const fileChiave = path.join(cartella, 'chiave-prova-pubblica.json');
  fs.writeFileSync(fileChiave, JSON.stringify(buona.pubblica));
  const elenco = fs.readFileSync(path.join(DIST, 'palacan-impronte.json'));
  const impronta = crypto.createHash('sha256').update(elenco).digest('hex');
  const numero = Math.floor(Date.now() / 1000);
  const dati = { impronta, commit: '0000000', numero, quando: new Date().toISOString() };
  const firme = {
    buona: Buffer.from(JSON.stringify(firmaRilascio(m, buona.privata, dati))),
    altra: Buffer.from(JSON.stringify(firmaRilascio(m, altra.privata, dati))),
  };
  const base = leggiIntestazioni('palacan-intestazioni.conf');
  const csp = leggiIntestazioni('palacan-csp.conf');
  const scenario = { firma: 'buona', csp: true, alterato: null };

  const server = http.createServer((req, res) => {
    const percorso = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (percorso === '/rilascio/palacan-impronte.sig') {
      if (scenario.firma === 'nessuna') { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.end(firme[scenario.firma]);
      return;
    }
    let file = path.join(DIST, percorso);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    const ext = path.extname(file).toLowerCase();
    const intestazioni = ext === '.html' ? [...base, ...(scenario.csp ? csp : [])] : base;
    for (const [n, v] of intestazioni) if (n !== 'Strict-Transport-Security') res.setHeader(n, v);
    res.setHeader('Content-Type', TIPI[ext] || 'application/octet-stream');
    let corpo = fs.readFileSync(file);
    const rel = path.relative(DIST, file).split(path.sep).join('/');
    if (scenario.alterato === rel) corpo = Buffer.concat([corpo, Buffer.from('\n/* alterato dal server */\n')]);
    res.end(corpo);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origine = `http://127.0.0.1:${server.address().port}`;
  const estensione = path.join(cartella, 'estensione');
  preparaEstensione({ uscita: estensione, sito: origine, chiave: fileChiave });
  console.log(`Prova in locale su ${origine} (chiave di PROVA, solo in memoria; nessuna richiesta esce dal PC)`);

  const { contesto, sw } = await apriBrowser(estensione, profilo, true);
  try {
    const amb = { contesto, sw, origine };
    await impostaUltimo(sw, 0);

    let s = await prova(amb, 'verde');
    controlla('sito uguale al codice firmato -> verde', s, 'verde');
    const caricati = s ? (s.ordine || []).filter((p) => s.esiti[p] === 'ok') : [];
    console.log(`    file controllati: ${caricati.length + 1} (pagina compresa)`);
    // il primo file .js (avvio dell'app), l'ultimo (caricato piu' tardi, mentre l'app gira) e lo script di servizio
    const js = caricati.filter((p) => p.endsWith('.js') && p !== 'sw.js');
    const bersagli = [...new Set([js[0], js[js.length - 1], caricati.includes('sw.js') ? 'sw.js' : null].filter(Boolean))];
    if (!bersagli.length) male('nessun file .js controllato: la pagina non ha caricato codice?');
    for (const bersaglio of bersagli) {
      scenario.alterato = bersaglio;
      s = await prova(amb, 'rosso', `file_diverso:${bersaglio}`);
      controlla(`il server cambia ${bersaglio} -> rosso`, s, 'rosso', `file_diverso:${bersaglio}`);
      scenario.alterato = null;
    }

    scenario.alterato = 'index.html';
    s = await prova(amb, 'rosso', 'file_diverso:index.html');
    controlla('il server cambia la pagina (index.html) -> rosso', s, 'rosso', 'file_diverso:index.html');
    scenario.alterato = null;

    await impostaUltimo(sw, numero + 1);
    s = await prova(amb, 'rosso', 'versione_vecchia');
    controlla('versione piu\' vecchia di una gia\' vista -> rosso', s, 'rosso', 'versione_vecchia');
    await impostaUltimo(sw, numero);

    scenario.firma = 'nessuna';
    s = await prova(amb, 'rosso', 'firma_mancante');
    controlla('firma tolta dal server -> rosso', s, 'rosso', 'firma_mancante');

    scenario.firma = 'altra';
    s = await prova(amb, 'rosso', 'chiave_diversa');
    controlla('elenco firmato con un\'altra chiave -> rosso', s, 'rosso', 'chiave_diversa');
    scenario.firma = 'buona';

    scenario.csp = false;
    s = await prova(amb, 'rosso', 'csp_debole');
    controlla('protezione CSP tolta -> rosso', s, 'rosso', 'csp_debole');
    scenario.csp = true;

    s = await prova(amb, 'verde');
    controlla('di nuovo tutto a posto -> verde', s, 'verde');
  } finally {
    await contesto.close().catch(() => {});
    server.close();
  }
}

async function provaSitoVero(cartella, profilo) {
  const origine = new URL(SITO_VERO).origin;
  const estensione = path.join(cartella, 'estensione');
  preparaEstensione({ uscita: estensione, sito: origine });
  console.log(`Sito vero: ${origine} (chiave di rilascio del repository; solo lettura, nessun login)`);
  const { contesto, sw } = await apriBrowser(estensione, profilo, false);
  try {
    const amb = { contesto, sw, origine };
    await impostaUltimo(sw, 0);
    let s = await prova(amb, 'verde');
    controlla('il sito vero coincide con il codice firmato -> verde', s, 'verde');
    if (s && s.firma && s.firma.esito === 'valida') {
      console.log(`    commit ${s.firma.commit}, rilascio ${s.firma.numero} (${s.firma.quando}), file controllati ${Object.values(s.esiti).filter((e) => e === 'ok').length + 1}`);
      await impostaUltimo(sw, Number(s.firma.numero) + 1);
      s = await prova(amb, 'rosso', 'versione_vecchia');
      controlla('se avessi gia\' visto una versione piu\' nuova -> rosso', s, 'rosso', 'versione_vecchia');
    }
  } finally {
    await contesto.close().catch(() => {});
  }
}

async function main() {
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'palacan-l1d-'));
  const profilo = path.join(cartella, 'profilo');
  try {
    if (SITO_VERO) await provaSitoVero(cartella, profilo);
    else await provaLocale(cartella, profilo);
  } finally {
    fs.rmSync(cartella, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
  if (problemi.length) {
    console.log(`\nESTENSIONE: ${problemi.length} PROBLEMI`);
    process.exit(1);
  }
  console.log('\nOK: l\'estensione distingue il sito giusto da quello cambiato');
}

main().catch((e) => {
  console.error(`ERRORE: ${e.message}`);
  process.exit(1);
});
