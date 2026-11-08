// tests/contoOlm.test.js  [palacan-pq7]
//
// Guasto visto dal vivo dopo il deploy di PQ5 (messaggi "Not sent" in chat e nel gruppo):
//   1) account restaurato dal backup in un browser nuovo: le chiavi usa e getta (OTK) sul server erano di un'altra
//      copia dell'account ("unknown one-time key"), e quelle nuove venivano scartate come doppioni dal server;
//   2) removeUsedOTK passava al WASM una sessione gia' liberata: "null pointer passed to rust" e l'account restava
//      bloccato per sempre ("recursive use of an object"), quindi niente piu' Megolm.
// Qui, con la crittografia VERA (WASM): vodozemac consuma la OTK gia' in create_inbound (remove_one_time_keys non
// serve); un account bloccato o liberato si riconosce; dopo il ripristino le OTK si sostituiscono, e la richiesta
// al server porta davvero "sostituisci".
import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import Olm from '../src/crypto/olm.js';
import { contoUsabile, segnaOtkDaSostituire, otkDaSostituire, otkSostituite } from '../src/utils/contoOlm';
import * as api from '../src/apiService';

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
});

function conto() {
  const c = new Olm.Account();
  c.create();
  return c;
}

// il corpo di una funzione di olmService (da "function nome(" fino alla prossima funzione di primo livello)
function funzione(testo, nome) {
  const i = testo.search(new RegExp(`function ${nome}\\s*\\(`));
  expect(i, `funzione ${nome} non trovata`).toBeGreaterThan(-1);
  const resto = testo.slice(i + 10);
  const j = resto.search(/\n(export\s+)?(async\s+)?function\s/);
  return testo.slice(i, j < 0 ? undefined : i + 10 + j);
}

describe('PQ7 - account Olm e chiavi usa e getta (OTK)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('vodozemac consuma la OTK gia\' quando nasce la sessione in entrata: remove_one_time_keys non serve', () => {
    const alice = conto();
    const bob = conto();
    bob.generate_one_time_keys(1);
    const otk = Object.values(JSON.parse(bob.one_time_keys()).curve25519)[0];
    bob.mark_keys_as_published();
    const uscita = new Olm.Session();
    uscita.create_outbound(alice, JSON.parse(bob.identity_keys()).curve25519, otk);
    const m = uscita.encrypt('ciao');
    expect(m.type).toBe(0);
    const prima = new Olm.Session();
    prima.create_inbound(bob, m.body);
    expect(prima.decrypt(0, m.body)).toBe('ciao');
    const seconda = new Olm.Session();
    expect(() => seconda.create_inbound(bob, m.body)).toThrow(); // OTK gia' consumata, senza remove_one_time_keys
    expect(contoUsabile(bob)).toBe(true);
  });

  it('account bloccato dal WASM: non usabile (si rilegge dal salvataggio)', () => {
    expect(contoUsabile(conto())).toBe(true);
    const bloccato = { identity_keys: () => { throw new Error('recursive use of an object detected which would lead to unsafe aliasing in rust'); } };
    expect(contoUsabile(bloccato)).toBe(false);
    expect(contoUsabile(null)).toBe(false);
  });

  it('OTK da sostituire: dopo il ripristino, e una volta sola per gli account di prima', () => {
    expect(otkDaSostituire('anna')).toBe(true); // account di prima di questa correzione
    otkSostituite('anna');
    expect(otkDaSostituire('anna')).toBe(false);
    segnaOtkDaSostituire('anna'); // ripristino dal backup
    expect(otkDaSostituire('anna')).toBe(true);
    expect(otkDaSostituire('bruno')).toBe(true);
    otkSostituite('anna');
    expect(otkDaSostituire('anna')).toBe(false);
    expect(otkDaSostituire('')).toBe(false);
  });

  it('la richiesta VERA al server porta "sostituisci" solo quando chiesto', async () => {
    const chiamate = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opzioni) => {
      chiamate.push({ url: String(url), corpo: JSON.parse((opzioni && opzioni.body) || '{}') });
      return new Response(JSON.stringify({ message: 'ok', count: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    await api.uploadOneTimeKeys({ AAAAAQ: 'k1' }, 'gettone-di-prova', 'D1', { sostituisci: true }).catch(() => {});
    await api.uploadOneTimeKeys({ AAAAAg: 'k2' }, 'gettone-di-prova', 'D1').catch(() => {});
    const otk = chiamate.filter((c) => c.url.includes('/keys/upload-otks'));
    expect(otk.length, 'nessuna richiesta a /keys/upload-otks').toBe(2);
    expect(otk[0].corpo).toMatchObject({ one_time_keys: { AAAAAQ: 'k1' }, device_id: 'D1', sostituisci: true });
    expect(otk[1].corpo.sostituisci).toBeUndefined();
  });

  it('collegamenti in olmService: niente remove_one_time_keys, account bloccato riletto, OTK sostituite dopo il ripristino', () => {
    const svc = readFileSync('src/olmService.js', 'utf8');
    expect(svc.match(/\.remove_one_time_keys\(/g), 'olmService chiama ancora remove_one_time_keys').toBeNull();
    expect(funzione(svc, 'loadOlmAccount')).toContain('contoUsabile(cached.account)');
    expect(funzione(svc, 'restoreBackupBundleToLocalStorage')).toContain('segnaOtkDaSostituire(normalizedUsername)');
    const riempi = funzione(svc, 'ensureEnoughOTKs');
    expect(riempi).toContain('{ sostituisci: true }');
    expect(riempi.indexOf('otkDaSostituire(')).toBeLessThan(riempi.indexOf('getOtkCount('));
  });
});
