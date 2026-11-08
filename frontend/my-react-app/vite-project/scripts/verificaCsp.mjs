// scripts/verificaCsp.mjs  [palacan-l1a]
//
// Controllo nel browser vero (Chromium di Playwright) della Content-Security-Policy, prima del deploy:
//   - serve la cartella dist/ in locale con le STESSE intestazioni che mettera' nginx (lette da dist/palacan-*.conf);
//   - apre la pagina, aspetta che l'app parta e raccoglie ogni violazione della politica;
//   - prova che WebAssembly (vodozemac) si puo' avviare;
//   - nessuna richiesta esce dal computer: tutto cio' che non e' locale (API vera compresa) viene bloccato.
// Uscita: 0 = nessuna violazione; 1 = violazioni (elencate); 2 = Chromium di Playwright non disponibile (saltato).
//
// Uso (dopo npm run build):  node scripts/verificaCsp.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(process.argv[2] || 'dist');
const PAGINE = ['/', '/privacy', '/login'];
const TIPI = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json', '.pdf': 'application/pdf',
  '.txt': 'text/plain',
};

function leggiIntestazioni(file) {
  const testo = fs.readFileSync(path.join(DIST, file), 'utf8');
  return [...testo.matchAll(/^add_header\s+(\S+)\s+"([^"]*)"\s+always;$/gm)].map((m) => [m[1], m[2]]);
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('@playwright/test'));
  } catch (_) {
    console.log('SALTATO: @playwright/test non disponibile');
    process.exit(2);
  }
  const base = leggiIntestazioni('palacan-intestazioni.conf');
  const csp = leggiIntestazioni('palacan-csp.conf');
  if (!csp.length || csp[0][0] !== 'Content-Security-Policy') throw new Error('dist/palacan-csp.conf senza Content-Security-Policy');
  console.log(`CSP: ${csp[0][1]}`);

  const server = http.createServer((req, res) => {
    const percorso = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(DIST, percorso);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    const ext = path.extname(file).toLowerCase();
    const intestazioni = ext === '.html' ? [...base, ...csp] : base;
    for (const [n, v] of intestazioni) if (n !== 'Strict-Transport-Security') res.setHeader(n, v);
    res.setHeader('Content-Type', TIPI[ext] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origine = `http://127.0.0.1:${server.address().port}`;

  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    server.close();
    console.log(`SALTATO: Chromium di Playwright non installato (npx playwright install chromium): ${String(e.message).split('\n')[0]}`);
    process.exit(2);
  }
  const violazioni = [];
  try {
    const contesto = await browser.newContext();
    await contesto.route('**/*', (r) => (r.request().url().startsWith(origine) ? r.continue() : r.abort()));
    await contesto.addInitScript(() => {
      window.__violazioni = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__violazioni.push(`${e.violatedDirective} -> ${e.blockedURI || '(nella pagina)'} ${e.sourceFile || ''}:${e.lineNumber || ''}`);
      });
    });
    for (const pagina of PAGINE) {
      const p = await contesto.newPage();
      p.on('console', (m) => {
        if (/Content Security Policy/i.test(m.text())) violazioni.push(`${pagina}: ${m.text()}`);
      });
      await p.goto(origine + pagina, { waitUntil: 'load' });
      await p.waitForTimeout(2500);
      const radice = await p.evaluate(() => document.getElementById('root')?.childElementCount || 0);
      if (!radice) violazioni.push(`${pagina}: l'app non si e' disegnata (#root vuoto)`);
      const wasm = await p.evaluate(async () => {
        try {
          await WebAssembly.instantiate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
          return 'ok';
        } catch (e) {
          return String(e);
        }
      });
      if (wasm !== 'ok') violazioni.push(`${pagina}: WebAssembly bloccato: ${wasm}`);
      for (const v of await p.evaluate(() => window.__violazioni)) violazioni.push(`${pagina}: ${v}`);
      await p.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  const uniche = [...new Set(violazioni)];
  if (uniche.length) {
    console.log(`VIOLAZIONI (${uniche.length}):`);
    for (const v of uniche) console.log(`  ${v}`);
    process.exit(1);
  }
  console.log(`OK: nessuna violazione su ${PAGINE.join(', ')}; WebAssembly ammesso`);
}

main().catch((e) => {
  console.error(`ERRORE: ${e.message}`);
  process.exit(1);
});
