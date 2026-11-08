// tests/estensioneVerifica.test.js  [palacan-l1d]
//
// L1d (Chiusura limiti): estensione "Palacan Verifica". Si prova che:
//   - la verifica della firma dell'estensione (WebCrypto, per il browser) da' ESATTAMENTE gli stessi esiti di
//     sicurezza/rilascio.mjs (L1c), con il motore vero: firma giusta, elenco/commit/numero cambiati, altra chiave,
//     chiave mista, versione vecchia, formato sbagliato;
//   - i file caricati dalla pagina si confrontano con l'elenco firmato (le pagine dell'app = index.html);
//   - la CSP vera di Palacan e' riconosciuta sicura, e una indebolita no;
//   - l'esito complessivo: verde solo se tutto torna; rosso vince sempre;
//   - la cartella dell'estensione ha la chiave PUBBLICA del repository, il motore dell'app e permessi minimi.
// La prova nel browser vero (con gli attacchi simulati) e' scripts/verificaEstensione.mjs.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as motore from '../src/crypto/pkg/palacan_crypto.js';
import * as r from '../sicurezza/rilascio.mjs';
import { politicaContenuti } from '../sicurezza/intestazioni.mjs';

const MODULO = '../estensione/controllo.js';
const PREPARA = '../scripts/preparaEstensione.mjs';
let c = null;
let prep = null;
let chiave = null;
let altra = null;
const IMPRONTA = 'a'.repeat(64);
const DATI = { impronta: IMPRONTA, commit: '633eb7b', numero: 1794078585, quando: '2026-11-07T19:09:45.341Z' };
const leggi = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

beforeAll(async () => {
  c = await import(/* @vite-ignore */ MODULO).catch(() => null);
  prep = await import(/* @vite-ignore */ PREPARA).catch(() => null);
  if (c) c.usaCrypto(webcrypto.subtle);
  chiave = r.nuovaChiaveRilascio(motore);
  altra = r.nuovaChiaveRilascio(motore);
});

describe('L1d - estensione Palacan Verifica', () => {
  it('i moduli esistono', () => {
    expect(c, 'L1D: manca estensione/controllo.js: nessuna verifica automatica nel browser').not.toBeNull();
    expect(prep, 'L1D: manca scripts/preparaEstensione.mjs').not.toBeNull();
  });

  it('la verifica dell\'estensione da\' gli stessi esiti di sicurezza/rilascio.mjs (motore vero)', async () => {
    const f = r.firmaRilascio(motore, chiave.privata, DATI);
    const g = r.firmaRilascio(motore, altra.privata, DATI);
    const casi = [
      [chiave.pubblica, f, { improntaElenco: IMPRONTA }],
      [chiave.pubblica, f, { improntaElenco: 'b'.repeat(64) }],
      [chiave.pubblica, { ...f, impronta_elenco: 'b'.repeat(64) }, {}],
      [chiave.pubblica, { ...f, commit: '0'.repeat(40) }, {}],
      [chiave.pubblica, { ...f, numero: f.numero + 1 }, {}],
      [chiave.pubblica, { ...f, quando: '2030-01-01T00:00:00.000Z' }, {}],
      [chiave.pubblica, g, { improntaElenco: IMPRONTA }],
      [chiave.pubblica, { ...g, chiave_ed: chiave.pubblica.ed }, {}],
      [chiave.pubblica, { ...f, firma_pq: g.firma_pq }, {}],
      [chiave.pubblica, f, { ultimoNumero: DATI.numero + 1 }],
      [chiave.pubblica, f, { ultimoNumero: DATI.numero }],
      [chiave.pubblica, { ...f, v: 2 }, {}],
      [chiave.pubblica, null, {}],
      [altra.pubblica, g, { improntaElenco: IMPRONTA }],
    ];
    const visti = new Set();
    for (const [pub, firma, opz] of casi) {
      const atteso = r.verificaRilascio(motore, pub, firma, opz);
      expect(await c.verificaRilascio(motore, pub, firma, opz), JSON.stringify(opz)).toEqual(atteso);
      visti.add(atteso.valida ? 'valida' : atteso.motivo);
    }
    expect([...visti].sort()).toEqual(['chiave_diversa', 'elenco_diverso', 'firma_falsa', 'formato', 'valida', 'versione_vecchia']);
  });

  it('file della pagina contro l\'elenco firmato', () => {
    const sito = 'https://palacan.example';
    expect(c.percorsoDaUrl(`${sito}/`, sito)).toBe('index.html');
    expect(c.percorsoDaUrl(`${sito}/assets/a.js?x=1#y`, sito)).toBe('assets/a.js');
    expect(c.percorsoDaUrl('https://altro.example/assets/a.js', sito)).toBeNull();
    expect(c.percorsoDaUrl(`blob:${sito}/1234-5678`, sito)).toBeNull();
    expect(c.assenteInnocuo('favicon.ico', 'http_404')).toBe(true);
    expect(c.assenteInnocuo('assets/a.js', 'http_404')).toBe(false);
    expect(c.assenteInnocuo('favicon.ico', 'rete')).toBe(false);
    const elenco = { file: { 'index.html': 'i'.repeat(64), 'assets/a.js': 'a'.repeat(64) } };
    expect(c.valutaFile(elenco, 'assets/a.js', 'a'.repeat(64))).toBe('ok');
    expect(c.valutaFile(elenco, 'assets/a.js', 'b'.repeat(64))).toBe('diverso');
    expect(c.valutaFile(elenco, 'assets/nuovo.js', 'b'.repeat(64))).toBe('sconosciuto');
    expect(c.valutaFile(elenco, 'chat', 'i'.repeat(64))).toBe('ok');  // pagina dell'app = index.html
    expect(c.valutaFile(elenco, 'palacan-impronte.json', 'x')).toBe('escluso');
    expect(c.valutaFile(elenco, 'constructor', 'x')).toBe('sconosciuto');
    expect(c.valutaDocumento(elenco, 'i'.repeat(64))).toBe('ok');
    expect(c.valutaDocumento(elenco, 'a'.repeat(64))).toBe('diverso');
    expect(c.peggiore('diverso', 'ok')).toBe('diverso');
    expect(c.peggiore('ok', 'sconosciuto')).toBe('sconosciuto');
  });

  it('CSP: quella vera di Palacan e\' sicura, una indebolita no', () => {
    const vera = politicaContenuti('https://api.palacan.example');
    expect(c.cspSicura(vera)).toBe(true);
    expect(c.cspSicura(`${vera}, default-src *`)).toBe(true);  // due politiche: valgono entrambe
    expect(c.cspSicura(vera.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"))).toBe(false);
    expect(c.cspSicura(vera.replace("script-src 'self'", "script-src 'self' https://cdn.example"))).toBe(false);
    expect(c.cspSicura(vera.replace("script-src 'self' 'wasm-unsafe-eval'", "script-src 'self' 'unsafe-eval'"))).toBe(false);
    expect(c.cspSicura(vera.replace("object-src 'none'", "object-src *"))).toBe(false);
    expect(c.cspSicura(vera.replace(/base-uri [^;]+;/, ''))).toBe(false);
    expect(c.cspSicura("default-src 'self'")).toBe(false);
    expect(c.cspSicura(null)).toBe(false);
  });

  it('esito: verde solo se tutto torna, il rosso vince sempre', () => {
    const tutto = { firma: { esito: 'valida' }, csp: true, documento: 'ok', esiti: { 'assets/a.js': 'ok' } };
    expect(c.esitoComplessivo(tutto)).toEqual({ stato: 'verde', motivi: [] });
    expect(c.esitoComplessivo({ ...tutto, esiti: { 'assets/a.js': 'diverso' } })).toEqual({ stato: 'rosso', motivi: ['file_diverso:assets/a.js'] });
    expect(c.esitoComplessivo({ ...tutto, firma: { esito: 'firma_mancante' } }).stato).toBe('rosso');
    expect(c.esitoComplessivo({ ...tutto, csp: false }).motivi).toEqual(['csp_debole']);
    expect(c.esitoComplessivo({ ...tutto, firma: { esito: 'rete' } }).stato).toBe('grigio');
    expect(c.esitoComplessivo({ ...tutto, firma: { esito: 'rete' }, esiti: { x: 'sconosciuto' } }).stato).toBe('rosso');
    expect(c.esitoComplessivo({ ...tutto, documento: undefined }).stato).toBe('grigio');
    expect(c.esitoComplessivo({}).stato).toBe('grigio');
    expect(c.descriviMotivo('file_diverso:assets/a.js')).toContain('assets/a.js');
  });

  it('cartella dell\'estensione: chiave del repository, motore dell\'app, permessi minimi', () => {
    const dir = mkdtempSync(join(tmpdir(), 'palacan-l1d-'));
    try {
      const uscita = join(dir, 'estensione');
      prep.preparaEstensione({ uscita });
      const m = JSON.parse(readFileSync(join(uscita, 'manifest.json'), 'utf8'));
      expect(m.manifest_version).toBe(3);
      expect(m.permissions).toEqual(['storage']);
      expect(m.host_permissions).toEqual([`${prep.SITO_PREDEFINITO}/*`]);
      expect(m.content_scripts[0].matches).toEqual([`${prep.SITO_PREDEFINITO}/*`]);
      expect(JSON.stringify(m)).not.toMatch(/<all_urls>|webRequest|"tabs"|scripting|cookies|debugger|nativeMessaging/);
      expect(m.content_security_policy.extension_pages).toBe("script-src 'self' 'wasm-unsafe-eval'; object-src 'self'");
      const pub = JSON.parse(readFileSync('sicurezza/chiave-rilascio-pubblica.json', 'utf8'));
      const conf = readFileSync(join(uscita, 'configurazione.js'), 'utf8');
      expect(conf).toContain(pub.ed);
      expect(conf).toContain(pub.pq);
      expect(readFileSync(join(uscita, 'palacan_crypto_bg.wasm')).equals(readFileSync('src/crypto/pkg/palacan_crypto_bg.wasm'))).toBe(true);
      for (const nome of prep.FILE_ESTENSIONE) expect(existsSync(join(uscita, nome)), nome).toBe(true);
      const estranea = join(dir, 'altro');
      mkdirSync(estranea);
      writeFileSync(join(estranea, 'mio.txt'), 'x');
      expect(() => prep.preparaEstensione({ uscita: estranea })).toThrow(/non la tocco/);
      expect(() => prep.preparaEstensione({ uscita: join(dir, 'e2'), sito: 'http://sito.example' })).toThrow(/sito non valido/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('la chiave e\' quella fissata (non quella del sito), i file dalla cache della pagina, niente nel repository', () => {
    const sfondo = leggi('estensione/sfondo.js');
    expect(sfondo).toContain('verificaRilascio(m, CHIAVE_RILASCIO, fi');
    expect(sfondo).toContain("chrome.storage.local.set({ ultimoNumero");
    const pagina = leggi('estensione/pagina.js');
    expect(pagina).toContain("cache: 'force-cache'");
    expect(pagina).toContain('buffered: true');
    expect(leggi('.gitignore')).toContain('estensione-pronta/');
  });
});
