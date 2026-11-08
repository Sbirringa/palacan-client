// tests/sicurezzaWeb.test.js  [palacan-l1a]
//
// L1a (Chiusura limiti): l'app web non e' piu' servita senza protezioni.
//   - nginx manda una Content-Security-Policy severa sulla pagina e le intestazioni di sicurezza su ogni risposta
//     (file generati a ogni build da sicurezza/intestazioni.mjs, copiati dal Dockerfile);
//   - nessuno script dentro la pagina (index.html): il controllo degli errori e' un file a parte;
//   - nessuna richiesta a Google Fonts (i caratteri sono gia' locali) e nessuna immagine emoji dal CDN.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MODULO = '../sicurezza/intestazioni.mjs';
let m = null;

beforeAll(async () => {
  m = await import(/* @vite-ignore */ MODULO).catch(() => null);
});

const leggi = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

function fileSorgenti(cartella) {
  const out = [];
  for (const nome of readdirSync(cartella)) {
    const p = join(cartella, nome);
    if (statSync(p).isDirectory()) out.push(...fileSorgenti(p));
    else if (/\.(js|jsx|css|html)$/.test(nome)) out.push(p);
  }
  return out;
}

function mappaCsp(testo) {
  return Object.fromEntries(testo.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [nome, ...valori] = d.split(/\s+/);
    return [nome, valori];
  }));
}

describe('L1a - intestazioni di sicurezza della pagina web', () => {
  it('il generatore delle intestazioni esiste', () => {
    expect(m, 'L1A: manca sicurezza/intestazioni.mjs: la pagina e\' servita senza Content-Security-Policy').not.toBeNull();
  });

  it('CSP severa: script solo dal sito (WebAssembly si), collegamenti solo al sito e all\'API', () => {
    const csp = mappaCsp(m.politicaContenuti('https://api.esempio.dev'));
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['script-src']).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(csp['connect-src']).toEqual(["'self'", 'https://api.esempio.dev', 'wss://api.esempio.dev']);
    for (const d of ['object-src', 'base-uri', 'frame-ancestors', 'frame-src']) expect(csp[d]).toEqual(["'none'"]);
    const tutto = m.politicaContenuti('https://api.esempio.dev');
    expect(tutto).not.toContain("'unsafe-eval'");
    expect(tutto).not.toMatch(/(^|\s)(\*|https:|http:)(\s|;|$)/);
    expect(mappaCsp(m.politicaContenuti(''))['connect-src']).toEqual(["'self'"]);
  });

  it('un indirizzo dell\'API sbagliato o pericoloso ferma la build', () => {
    expect(() => m.politicaContenuti('https://api.esempio.dev"; script-src *')).toThrow();
    expect(() => m.politicaContenuti('http://api.esempio.dev')).toThrow();
    expect(() => m.politicaContenuti('non un indirizzo')).toThrow();
    expect(mappaCsp(m.politicaContenuti('http://localhost:8000'))['connect-src']).toContain('ws://localhost:8000');
  });

  it('i file per nginx: intestazioni su ogni risposta, CSP sulla pagina, sempre con "always"', () => {
    const base = m.testoIntestazioni();
    for (const atteso of ['X-Content-Type-Options "nosniff"', 'X-Frame-Options "DENY"', 'Referrer-Policy "no-referrer"',
      'Strict-Transport-Security "max-age=31536000; includeSubDomains"', 'camera=(self), microphone=(self)']) {
      expect(base).toContain(atteso);
    }
    const csp = m.testoCsp('https://api.esempio.dev');
    expect(csp).toMatch(/^add_header Content-Security-Policy "[^"]+" always;$/m);
    for (const riga of (base + csp).split('\n').filter((r) => r.startsWith('add_header'))) expect(riga).toMatch(/ always;$/);
  });

  it('nginx usa i file: ogni blocco con add_header li include, la CSP sta sulla pagina', () => {
    const conf = leggi('nginx/nginx.conf');
    expect(conf, 'L1A: nginx serve la pagina senza intestazioni di sicurezza').toContain('include /etc/nginx/palacan-intestazioni.conf;');
    const blocchi = [...conf.matchAll(/location\s+([^{]+)\{([^}]*)\}/g)];
    for (const [, nome, corpo] of blocchi) {
      if (corpo.includes('add_header')) expect(corpo, `location ${nome.trim()}`).toContain('include /etc/nginx/palacan-intestazioni.conf;');
    }
    const pagina = blocchi.find(([, nome]) => nome.trim() === '= /index.html');
    expect(pagina?.[2]).toContain('include /etc/nginx/palacan-csp.conf;');
  });

  it('il Dockerfile copia i file generati in /etc/nginx e la build li genera', () => {
    const docker = leggi('Dockerfile');
    expect(docker, 'L1A: il Dockerfile non installa le intestazioni di sicurezza')
      .toContain('COPY --from=build /app/dist/palacan-csp.conf /etc/nginx/palacan-csp.conf');
    expect(docker).toContain('COPY --from=build /app/dist/palacan-intestazioni.conf /etc/nginx/palacan-intestazioni.conf');
    expect(leggi('vite.config.js')).toContain('intestazioniNginx()');
  });

  it('nessuno script dentro la pagina: il controllo degli errori e\' un file a parte', () => {
    const html = leggi('index.html');
    const interni = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].filter((x) => x[1].trim());
    expect(interni.length, 'L1A: script dentro index.html (una CSP severa lo blocca)').toBe(0);
    expect(html).toContain('<script src="/errori-pagina.js"></script>');
    expect(existsSync('public/errori-pagina.js')).toBe(true);
    expect(leggi('public/errori-pagina.js')).toContain('unhandledrejection');
  });

  it('nessuna richiesta a Google Fonts e nessuna immagine emoji dal CDN', () => {
    for (const p of fileSorgenti('src')) {
      expect(leggi(p), `L1A: ${p} chiede caratteri a Google`).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
      const testo = leggi(p);
      const picker = (testo.match(/<EmojiPicker\b/g) || []).length;
      const nativi = (testo.match(/<EmojiPicker emojiStyle="native"/g) || []).length;
      expect(nativi, `L1A: ${p}: EmojiPicker scarica le immagini da cdn.jsdelivr.net`).toBe(picker);
    }
  });
});
