// tests/chiaviPq.test.js  [palacan-pq3]
//
// Chiavi post-quantum del dispositivo con crittografia VERA (ML-KEM-768 e firme ed25519 del modulo WASM) e un server
// finto con le stesse regole del backend (/keys/pq/count e /keys/pq/upload).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import Olm from '../src/crypto/olm.js';
import { _usaArchivio } from '../src/utils/chiaveDispositivo';
import {
  assicuraChiaviPq, semePq, consumaSemePq, testoFirmaPq, CHIAVE_ARCHIVIO_PQ, MIN_UNA, LOTTO, MAX_SERVER,
  VITA_RISERVA_MS, CONSERVA_RISERVA_MS,
} from '../src/utils/chiaviPq';

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
});

function archivioInMemoria() {
  const m = new Map();
  return () => ({
    leggi: async (v) => m.get(v),
    prendiOCrea: async (v, nuovo) => {
      if (!m.has(v)) m.set(v, nuovo);
      return m.get(v);
    },
  });
}

const daB64 = (t) => Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));

function serverFinto() {
  const s = { una: [], riserva: null, caricamenti: 0, errore: null };
  s.api = {
    getPqCount: async () => {
      if (s.errore) throw s.errore;
      return { una: s.una.length, riserva: Boolean(s.riserva) };
    },
    uploadPqKeys: async ({ una, riserva }) => {
      for (const k of [...una, ...(riserva ? [riserva] : [])]) {
        if (daB64(k.chiave).length !== 1184 || daB64(k.firma).length !== 64) throw new Error('422');
      }
      s.una.push(...una.slice(0, MAX_SERVER - s.una.length));
      if (riserva) s.riserva = riserva;
      s.caricamenti += 1;
    },
  };
  s.preleva = () => (s.una.length ? { ...s.una.shift(), tipo: 'una' } : { ...s.riserva, tipo: 'riserva' });
  return s;
}

let conto;
let ed;
const firma = (t) => conto.sign(t);
const verifica = (testo, f) => {
  const u = new Olm.Utility();
  try {
    u.ed25519_verify(ed, testo, f);
    return true;
  } catch (_) {
    return false;
  } finally {
    u.free();
  }
};

describe('chiavi post-quantum del dispositivo (PQ3)', () => {
  beforeEach(() => {
    localStorage.clear();
    _usaArchivio(archivioInMemoria());
    conto = new Olm.Account();
    conto.create();
    ed = JSON.parse(conto.identity_keys()).ed25519;
  });

  it('prima volta: 50 usa e getta + riserva, firmate e con il loro seme sul dispositivo (cifrato)', async () => {
    const s = serverFinto();
    const esito = await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api });
    expect(esito).toEqual({ caricate: LOTTO, riservaNuova: true });
    expect(s.una.length).toBe(LOTTO);
    for (const k of [...s.una.slice(0, 5), s.riserva]) {
      const tipo = k === s.riserva ? 'riserva' : 'una';
      expect(verifica(testoFirmaPq('bob', 'D1', k.key_id, tipo, k.chiave, k.creata), k.firma)).toBe(true);  // [palacan-cl2h] testo v2
      expect(verifica(testoFirmaPq('bob', 'D2', k.key_id, tipo, k.chiave, k.creata), k.firma)).toBe(false);
      const seme = await semePq('bob', k.key_id);
      expect(Olm.pq_chiave_pubblica(seme)).toBe(k.chiave);
    }
    const grezzo = localStorage.getItem(CHIAVE_ARCHIVIO_PQ('bob'));
    expect(grezzo.startsWith('d1.')).toBe(true);
    expect(grezzo).not.toContain('seme');
  });

  it('una busta chiusa con una chiave prelevata si apre con il seme; quello usa e getta poi sparisce', async () => {
    const s = serverFinto();
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api });
    const k = s.preleva();
    const busta = Olm.pq_sigilla(k.chiave, 'alice|bob|stanza', 'chiave di stanza');
    expect(Olm.pq_apri(await semePq('bob', k.key_id), 'alice|bob|stanza', busta)).toBe('chiave di stanza');
    expect(await consumaSemePq('bob', k.key_id)).toBe(true);
    expect(await semePq('bob', k.key_id)).toBeNull();
    expect(await consumaSemePq('bob', s.riserva.key_id)).toBe(false); // la riserva non si consuma
    expect(await semePq('bob', s.riserva.key_id)).not.toBeNull();
  });

  it('ricarica solo sotto la soglia, e mai oltre il limite del server', async () => {
    const s = serverFinto();
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api });
    expect(await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api })).toEqual({ caricate: 0, riservaNuova: false });
    expect(s.caricamenti).toBe(1);
    while (s.una.length >= MIN_UNA) s.preleva();
    const prima = s.una.length;
    const esito = await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api });
    expect(esito.caricate).toBe(Math.min(LOTTO, MAX_SERVER - prima));
    expect(s.una.length).toBeLessThanOrEqual(MAX_SERVER);
  });

  it('riserva: nuova dopo una settimana, la vecchia resta 30 giorni e poi si cancella', async () => {
    const s = serverFinto();
    let t = 1_000_000;
    const ora = () => t;
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora });
    const prima = s.riserva.key_id;
    t += VITA_RISERVA_MS + 1;
    expect((await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora })).riservaNuova).toBe(true);
    expect(s.riserva.key_id).not.toBe(prima);
    expect(await semePq('bob', prima)).not.toBeNull();
    t += CONSERVA_RISERVA_MS + 1;
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora });
    expect(await semePq('bob', prima)).toBeNull();
  });

  it('server irraggiungibile: nessuna eccezione, nessun seme perso, si riprova dopo', async () => {
    const s = serverFinto();
    s.errore = Object.assign(new Error('404'), { status: 404 });
    expect((await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api })).errore).toBeTruthy();
    s.errore = null;
    expect((await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api })).caricate).toBe(LOTTO);
  });

  it('due controlli insieme non generano chiavi doppie', async () => {
    const s = serverFinto();
    await Promise.all([1, 2, 3].map(() => assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api })));
    expect(s.caricamenti).toBe(1);
    expect(s.una.length).toBe(LOTTO);
  });

  it('collegamenti nei file dell\'app', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).toContain("import { assicuraChiaviPq } from './utils/chiaviPq';");
    expect(app).toContain('assicuraChiaviPq({');
    const facciata = readFileSync('src/crypto/olm.js', 'utf8');
    for (const f of ['pq_nuovo_seme', 'pq_chiave_pubblica', 'pq_sigilla', 'pq_apri']) expect(facciata).toContain(f);
    const api = readFileSync('src/apiService.js', 'utf8');
    for (const f of ['export const uploadPqKeys', 'export const getPqCount', 'export const claimPqKeys', "'/keys/pq/upload'"]) expect(api).toContain(f);
  });
});
