// tests/v4bDocumenti.test.js  [palacan-v4b]
//
// V4b: tutti i PDF da scaricare stanno nella pagina "Documenti" (/documenti), solo in inglese, e corrispondono ai file
// veri in public/whitepapers. Niente PDF sparsi: nessun'altra parte del sito li linka, le pagine rimandano a /documenti.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));
import { TESTI_PAGINE, DOCUMENTI, DATA_DOCUMENTI } from '../src/public/testiPagine';
import { TESTI } from '../src/components/testiHome';

const LINGUE = ['en', 'it', 'fr', 'es', 'de'];
const CARTELLA_PDF = join('public', 'whitepapers');
const leggi = (...p) => readFileSync(join(...p), 'utf8');

function fileSorgente(cartella, out = []) {
  for (const nome of readdirSync(cartella)) {
    const p = join(cartella, nome);
    if (statSync(p).isDirectory()) fileSorgente(p, out);
    else if (/\.(jsx?|tsx?|html|css)$/.test(nome)) out.push(p);
  }
  return out;
}

describe('V4b - pagina Documenti', () => {
  it('ogni PDF dell\'elenco esiste, e\' un PDF vero, e pagine e dimensione sono quelle dichiarate', () => {
    expect(DOCUMENTI.length).toBe(5);
    expect(DOCUMENTI[0].key).toBe('whitepaper');
    for (const d of DOCUMENTI) {
      expect(d.file, d.key).toMatch(/^\/whitepapers\/palacan-[a-z-]+\.pdf$/);
      const p = join('public', d.file);
      expect(existsSync(p), d.file).toBe(true);
      const byte = readFileSync(p);
      expect(byte.subarray(0, 5).toString('latin1'), d.file).toBe('%PDF-');
      const pagine = (byte.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
      expect(pagine, d.file).toBe(d.pagine);
      expect(Math.round(byte.length / 1024), d.file).toBe(d.kb);
    }
  });

  it('nessun PDF orfano: ogni file in public/whitepapers e\' nella pagina Documenti', () => {
    const elencati = new Set(DOCUMENTI.map((d) => d.file.split('/').pop()));
    for (const f of readdirSync(CARTELLA_PDF)) expect(elencati.has(f), f).toBe(true);
  });

  it('i PDF sono generati da file veri del repository pubblico', () => {
    const radice = join(process.cwd(), '..', '..', '..');
    for (const d of DOCUMENTI) {
      expect(d.fonti.length, d.key).toBeGreaterThan(0);
      for (const f of d.fonti) {
        expect(existsSync(join(radice, f)), f).toBe(true);
        expect(f, f).toMatch(/^(docs\/[A-Z]+\.md|SECURITY\.md)$/);
      }
    }
    expect(DATA_DOCUMENTI).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('ogni lingua ha i testi della pagina per ogni documento, e dice che i PDF sono in inglese', () => {
    for (const l of LINGUE) {
      const d = TESTI_PAGINE[l].documents;
      for (const doc of DOCUMENTI) {
        expect(d.items[doc.key].title.trim().length, `${l} ${doc.key}`).toBeGreaterThan(0);
        expect(d.items[doc.key].description.trim().length, `${l} ${doc.key}`).toBeGreaterThan(0);
      }
      expect(Object.keys(d.items).sort()).toEqual(DOCUMENTI.map((x) => x.key).sort());
      expect(() => new Date(0).toLocaleDateString(d.locale), l).not.toThrow();
      expect(d.english.trim().length, l).toBeGreaterThan(0);
    }
    expect(TESTI_PAGINE.it.documents.title).toBe('Documenti');
    expect(TESTI_PAGINE.en.documents.title).toBe('Documents');
  });

  it('la voce "Documenti" e\' nel menu in 5 lingue e porta a /documenti, con la rotta in App.jsx', () => {
    const attese = { en: 'Documents', it: 'Documenti', fr: 'Documents', es: 'Documentos', de: 'Dokumente' };
    for (const l of LINGUE) expect(TESTI[l].nav.documents, l).toBe(attese[l]);
    for (const f of [['src', 'public', 'PublicLayout.jsx'], ['src', 'components', 'LandingPage.jsx']]) {
      expect(leggi(...f), f.join('/')).toContain("{ label: t.nav.documents, href: '/documenti' }");
    }
    const app = leggi('src', 'App.jsx');
    expect(app).toContain("import DocumentsPage from './public/DocumentsPage.jsx';");
    expect(app.match(/<Route path="\/documenti" element={<DocumentsPage \/>} \/>/g) || []).toHaveLength(2);
  });

  it('niente PDF sparsi: solo la pagina Documenti (e il suo elenco) nomina i PDF, le altre rimandano a /documenti', () => {
    const ammessi = new Set([join('src', 'public', 'testiPagine.js')]);
    for (const f of fileSorgente('src')) {
      if (ammessi.has(f)) continue;
      expect(leggi(f), f).not.toMatch(/\.pdf\b|whitepapers\//i);
    }
    const riquadro = leggi('src', 'public', 'SezioniPubbliche.jsx');
    expect(riquadro).toContain('<Link to="/documenti"');
    expect(riquadro).not.toContain('/tree/main/docs');
    for (const pagina of ['SecurityPage.jsx', 'OpenSourcePage.jsx', 'TechnologyPage.jsx']) {
      expect(leggi('src', 'public', pagina), pagina).toContain('<RiquadroDocumentazione');
    }
    const pagina = leggi('src', 'public', 'DocumentsPage.jsx');
    expect(pagina).toContain('useTestiPagine()');
    expect(pagina).toContain('DOCUMENTI');
    expect(pagina).not.toMatch(/>\s*[A-ZÀ-Ú][a-zà-ú]+ [a-zà-ú]+[^<{]*</);
  });
});
