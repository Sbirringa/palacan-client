// tests/v4PaginePubbliche.test.js  [palacan-v4]
//
// V4: le pagine pubbliche Sicurezza, Codice (Open Source) e Tecnologia sono in 5 lingue, con le stesse voci in ogni
// lingua, rimandano al repository pubblico vero e non dicono cose che non sono vere (niente "il client e' open
// source": la licenza e' di sola lettura e verifica; niente PDF che non esistono; niente indirizzi segnaposto).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'it' } }) }));
import { TESTI_PAGINE, REPOSITORY_PUBBLICO, suGitHub, useTestiPagine } from '../src/public/testiPagine';

const LINGUE = ['en', 'it', 'fr', 'es', 'de'];
const PAGINE = ['SecurityPage.jsx', 'OpenSourcePage.jsx', 'TechnologyPage.jsx', 'SezioniPubbliche.jsx'];
const sorgente = (f) => readFileSync(join('src', 'public', f), 'utf8');

// forma di un oggetto: le chiavi e, per le liste, la lunghezza e la forma di ogni voce
function forma(v) {
  if (Array.isArray(v)) return v.map(forma);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, forma(v[k])]));
  return typeof v;
}

function testi(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => testi(x, out));
  return out;
}

describe('V4 - pagine pubbliche in 5 lingue', () => {
  it('ogni lingua ha esattamente le stesse voci dell\'inglese, nessuna vuota', () => {
    for (const l of LINGUE) {
      expect(forma(TESTI_PAGINE[l]), l).toEqual(forma(TESTI_PAGINE.en));
      for (const s of testi(TESTI_PAGINE[l])) expect(s.trim().length, l).toBeGreaterThan(0);
    }
  });

  it('le lingue sono davvero tradotte (i testi non sono quelli inglesi)', () => {
    for (const l of LINGUE.filter((x) => x !== 'en')) {
      expect(TESTI_PAGINE[l].security.title).not.toBe(TESTI_PAGINE.en.security.title);
      expect(TESTI_PAGINE[l].openSource.intro).not.toBe(TESTI_PAGINE.en.openSource.intro);
      expect(TESTI_PAGINE[l].technology.sections[0].items[0]).not.toBe(TESTI_PAGINE.en.technology.sections[0].items[0]);
    }
  });

  it('la lingua scelta decide i testi (riserva: inglese)', () => {
    expect(useTestiPagine()).toBe(TESTI_PAGINE.it);
  });

  it('i collegamenti puntano a file veri del repository pubblico', () => {
    expect(REPOSITORY_PUBBLICO).toBe('https://github.com/Sbirringa/palacan-client');
    const radice = join(process.cwd(), '..', '..', '..');
    const collegamenti = new Set();
    for (const l of LINGUE) {
      for (const pagina of ['security', 'openSource', 'technology']) {
        for (const s of TESTI_PAGINE[l][pagina].sections) if (s.link) collegamenti.add(s.link.href);
      }
    }
    expect(collegamenti.size).toBeGreaterThan(3);
    for (const href of collegamenti) {
      expect(existsSync(join(radice, href)), href).toBe(true);
      expect(href, href).not.toMatch(/^(backend|strumenti)\//);
      expect(suGitHub(href)).toBe(`https://github.com/Sbirringa/palacan-client/blob/main/${href}`);
    }
  });

  it('niente affermazioni false: "open source" solo per dire che NON lo e\', niente PDF inesistenti o segnaposto', () => {
    for (const f of PAGINE) {
      const s = sorgente(f);
      expect(s, f).not.toContain('tuo-utente');
      expect(s, f).not.toMatch(/whitepapers\/palacan-technology-whitepaper\.pdf/);
      expect(s, f).not.toMatch(/Il client è open source/);
    }
    const tutti = LINGUE.flatMap((l) => testi(TESTI_PAGINE[l])).join('\n');
    expect(tutti).not.toMatch(/\bis open source\b|\bè open source\b/i);
    expect(TESTI_PAGINE.en.openSource.sections.find((s) => s.key === 'licence').title).toMatch(/not open source/);
    expect(TESTI_PAGINE.it.openSource.sections.find((s) => s.key === 'licence').title).toMatch(/non open source/);
  });

  it('le pagine prendono i testi dal modulo delle lingue (nessun testo italiano scritto dentro le pagine)', () => {
    for (const f of ['SecurityPage.jsx', 'OpenSourcePage.jsx', 'TechnologyPage.jsx']) {
      const s = sorgente(f);
      expect(s, f).toContain('useTestiPagine()');
      expect(s, f).not.toMatch(/>\s*[A-ZÀ-Ú][a-zà-ú]+ [a-zà-ú]+[^<{]*</);
    }
  });
});
