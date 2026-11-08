// tests/cl2hDataPrechiavi.test.js  [palacan-cl2h]
//
// CL2h: ogni chiave ML-KEM porta il momento di creazione, firmato dal dispositivo (testo v2). Chi scrive rifiuta le
// chiavi piu' vecchie di 21 giorni e quelle datate nel futuro: un server complice di chi ha rubato lo stato non puo'
// riproporre per sempre una chiave vecchia rubata (modello formale 6). Le chiavi senza data valgono fino alla fine del
// periodo di passaggio; un archivio di prima ripubblica tutto con la data, una volta sola. Crittografia VERA (WASM).
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import Olm from '../src/crypto/olm.js';
import { _usaArchivio, cifraConDispositivo } from '../src/utils/chiaveDispositivo';
import { assicuraChiaviPq, testoFirmaPq, prechiaviDaDatare, CHIAVE_ARCHIVIO_PQ, LOTTO, MAX_SERVER } from '../src/utils/chiaviPq';
import { chiudiPerDispositivo, testoFirmatoDellaVoce, _prechiaviSoloTest, ETA_MAX_PRECHIAVE_MS, TIPO_BUSTA } from '../src/utils/bustePq';

const GIORNO = 24 * 3600 * 1000;
const T = 1_794_160_000_000;  // 8 novembre 2026

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
});
afterAll(() => _prechiaviSoloTest({ fineV1: Infinity, controlloEta: false }));

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

function serverFinto() {
  const s = { una: [], riserva: null, caricamenti: [] };
  s.api = {
    getPqCount: async () => ({ una: s.una.length, riserva: Boolean(s.riserva) }),
    uploadPqKeys: async ({ una, riserva, sostituisci }) => {
      s.caricamenti.push({ quante: una.length, sostituisci: Boolean(sostituisci), riserva: Boolean(riserva) });
      if (sostituisci) s.una = [];
      s.una.push(...una.slice(0, MAX_SERVER - s.una.length));
      if (riserva) s.riserva = riserva;
    },
  };
  return s;
}

let conto;
let ed;
const firma = (testo) => conto.sign(testo);
function regge(messaggio, f) {
  const u = new Olm.Utility();
  try {
    u.ed25519_verify(ed, messaggio, f);
    return true;
  } catch (_) {
    return false;
  } finally {
    u.free();
  }
}

const CHIAVE_DI_STANZA = JSON.stringify({ type: 'm.room_key', content: { room_id: 'r', session_id: 's', session_key: 'k' } });
function chiudi(voce, ora) {
  const chiaviPq = new Map([['C-bob', { ...voce, device_id: 'D1', identity_key: 'C-bob' }]]);
  return chiudiPerDispositivo({ payload: CHIAVE_DI_STANZA, io: 'alice', curvaMia: 'C-alice', destinatario: 'bob', curvaDest: 'C-bob', chiaviPq, ora: () => ora });
}

describe('CL2h - data firmata delle chiavi ML-KEM', () => {
  beforeEach(() => {
    localStorage.clear();
    _usaArchivio(archivioInMemoria());
    _prechiaviSoloTest({ fineV1: Infinity, controlloEta: true });
    conto = new Olm.Account();
    conto.create();
    ed = JSON.parse(conto.identity_keys()).ed25519;
  });

  it('ogni chiave pubblicata ha la data, e la firma la copre (testo v2)', async () => {
    const s = serverFinto();
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora: () => T });
    for (const [k, tipo] of [...s.una.slice(0, 3).map((x) => [x, 'una']), [s.riserva, 'riserva']]) {
      expect(k.creata).toBe(T);
      expect(regge(testoFirmaPq('bob', 'D1', k.key_id, tipo, k.chiave, k.creata), k.firma)).toBe(true);
      expect(regge(testoFirmaPq('bob', 'D1', k.key_id, tipo, k.chiave, k.creata + 1), k.firma)).toBe(false);  // data cambiata
      expect(regge(testoFirmaPq('bob', 'D1', k.key_id, tipo, k.chiave), k.firma)).toBe(false);  // testo v1, senza data
    }
  });

  it('chi scrive verifica la firma sul testo v2: una data cambiata dal server non regge', async () => {
    const s = serverFinto();
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora: () => T });
    const voce = { ...s.una[0], tipo: 'una', device_id: 'D1' };
    expect(regge(testoFirmatoDellaVoce('bob', voce, T), voce.firma)).toBe(true);
    expect(regge(testoFirmatoDellaVoce('bob', { ...voce, creata: T + GIORNO }, T + GIORNO), voce.firma)).toBe(false);
    expect(regge(testoFirmatoDellaVoce('bob', { ...voce, creata: undefined }, T), voce.firma)).toBe(false);  // data tolta
  });

  it('chi scrive: chiave fresca -> busta; piu\' vecchia di 21 giorni o datata nel futuro -> niente', async () => {
    const s = serverFinto();
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora: () => T });
    const voce = { ...s.una[0], tipo: 'una' };
    expect(JSON.parse(chiudi(voce, T + GIORNO)).type).toBe(TIPO_BUSTA);
    expect(JSON.parse(chiudi(voce, T + ETA_MAX_PRECHIAVE_MS - GIORNO)).type).toBe(TIPO_BUSTA);
    expect(() => chiudi(voce, T + ETA_MAX_PRECHIAVE_MS + GIORNO)).toThrow(/troppo vecchia/);
    expect(() => chiudi(voce, T - 2 * GIORNO)).toThrow(/nel futuro/);
    expect(() => chiudi({ ...voce, creata: 'ieri' }, T)).toThrow(/data non valida/);
  });

  it('chiave senza data (di prima): vale fino alla fine del periodo di passaggio, poi mai piu\'', async () => {
    const s = serverFinto();
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora: () => T });
    const { creata, ...senzaData } = { ...s.una[0], tipo: 'una' };
    expect(creata).toBe(T);
    _prechiaviSoloTest({ fineV1: T + 10 * GIORNO });
    expect(JSON.parse(chiudi(senzaData, T)).type).toBe(TIPO_BUSTA);
    expect(() => chiudi(senzaData, T + 11 * GIORNO)).toThrow(/senza data/);
  });

  it('archivio di prima (chiavi senza data): alla prima apertura si ripubblica tutto con la data, una volta sola', async () => {
    const dati = {
      una: { vecchia: { seme: Olm.pq_nuovo_seme(), creata: T - GIORNO } },
      riserve: { r0: { seme: Olm.pq_nuovo_seme(), creata: T - GIORNO } },
      riservaAttuale: 'r0', ibride: null, ibrideV2: null, rinnovoUna: T - GIORNO,
    };
    localStorage.setItem(CHIAVE_ARCHIVIO_PQ('bob'), await cifraConDispositivo(JSON.stringify(dati), 'palacan-pq-semi:bob'));
    const s = serverFinto();
    s.una = [{ key_id: 'vecchia', chiave: 'x', firma: 'y' }];
    s.riserva = { key_id: 'r0', chiave: 'x', firma: 'y' };
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora: () => T });
    expect(s.caricamenti).toEqual([{ quante: LOTTO, sostituisci: true, riserva: true }]);
    expect(s.una.every((k) => k.creata === T)).toBe(true);
    expect(s.riserva.creata).toBe(T);
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora: () => T + GIORNO });
    expect(s.caricamenti).toHaveLength(1);
  });

  it('prechiaviDaDatare: archivio di prima con chiavi -> si\'; dispositivo nuovo o gia\' datato -> no', () => {
    expect(prechiaviDaDatare({ una: {}, riservaAttuale: null })).toBe(false);
    expect(prechiaviDaDatare({ una: { a: {} }, riservaAttuale: null })).toBe(true);
    expect(prechiaviDaDatare({ una: {}, riservaAttuale: 'r' })).toBe(true);
    expect(prechiaviDaDatare({ una: { a: {} }, riservaAttuale: 'r', datate: true })).toBe(false);
  });
});
