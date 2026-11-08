// tests/cl2cRinnovoPq.test.js  [palacan-cl2c]
//
// CL2c: rinnovo periodico delle chiavi ML-KEM usa e getta NON usate. Prima restavano valide per sempre: chi rubava lo
// stato del dispositivo prendeva anche i semi delle chiavi ancora sul server e poteva aprire le buste future finche'
// qualcuno le usava. Ora ogni 7 giorni si pubblica un lotto nuovo ("sostituisci": il server toglie le vecchie non
// usate), i semi vecchi restano 30 giorni per le buste gia' partite, poi si cancellano. Crittografia VERA (WASM).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import Olm from '../src/crypto/olm.js';
import { _usaArchivio } from '../src/utils/chiaveDispositivo';
import {
  assicuraChiaviPq, semePq, LOTTO, MAX_SERVER, VITA_UNA_MS, CONSERVA_UNA_MS, togliSemiScaduti, usaEGettaDaRinnovare,
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

// server finto con le regole del backend: "sostituisci" toglie le usa e getta non usate di quel dispositivo
function serverFinto() {
  const s = { una: [], riserva: null, caricamenti: [] };
  s.api = {
    getPqCount: async () => ({ una: s.una.length, riserva: Boolean(s.riserva) }),
    uploadPqKeys: async ({ una, riserva, sostituisci }) => {
      s.caricamenti.push({ quante: una.length, sostituisci: Boolean(sostituisci) });
      if (sostituisci) s.una = [];
      s.una.push(...una.slice(0, MAX_SERVER - s.una.length));
      if (riserva) s.riserva = riserva;
    },
  };
  return s;
}

let conto;
const firma = (testo) => conto.sign(testo);
const GIORNO = 24 * 3600 * 1000;

describe('CL2c - rinnovo periodico delle chiavi ML-KEM usa e getta', () => {
  beforeEach(() => {
    localStorage.clear();
    _usaArchivio(archivioInMemoria());
    conto = new Olm.Account();
    conto.create();
  });

  it('dispositivo nuovo: primo caricamento senza "sostituisci"; nei 7 giorni dopo niente da rinnovare', async () => {
    const s = serverFinto();
    let t = 5_000_000;
    const ora = () => t;
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora });
    expect(s.caricamenti).toEqual([{ quante: LOTTO, sostituisci: false }]);
    t += VITA_UNA_MS - GIORNO;
    expect(await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora })).toEqual({ caricate: 0, riservaNuova: false });
    expect(s.caricamenti).toHaveLength(1);
  });

  it('dopo 7 giorni: lotto nuovo con "sostituisci", il server non ha piu\' nessuna chiave vecchia', async () => {
    const s = serverFinto();
    let t = 5_000_000;
    const ora = () => t;
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora });
    const vecchie = s.una.map((k) => k.key_id);
    t += VITA_UNA_MS + 1;
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora });
    expect(s.caricamenti[1]).toEqual({ quante: LOTTO, sostituisci: true });
    expect(s.una).toHaveLength(LOTTO);
    expect(s.una.some((k) => vecchie.includes(k.key_id))).toBe(false);
  });

  it('busta partita prima del rinnovo verso una chiave vecchia: si apre ancora nei 30 giorni, poi il seme sparisce', async () => {
    const s = serverFinto();
    let t = 5_000_000;
    const ora = () => t;
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora });
    const vecchia = s.una[0];
    const busta = Olm.pq_sigilla(vecchia.chiave, 'alice|bob|stanza', 'chiave di stanza');  // partita, non ancora arrivata
    t += VITA_UNA_MS + 1;
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora });  // rinnovo
    t += CONSERVA_UNA_MS - GIORNO;
    expect(Olm.pq_apri(await semePq('bob', vecchia.key_id), 'alice|bob|stanza', busta)).toBe('chiave di stanza');
    t += 2 * GIORNO;  // ritirata da piu' di 30 giorni
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora });
    expect(await semePq('bob', vecchia.key_id)).toBeNull();
  });

  it('chi ruba lo stato oggi: dopo 7 + 30 giorni nessuno dei semi rubati apre piu\' le chiavi pubblicate', async () => {
    const s = serverFinto();
    let t = 5_000_000;
    const ora = () => t;
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora });
    const rubate = s.una.map((k) => k.key_id);
    for (let i = 0; i < 6; i += 1) {  // l'app gira ogni tanto per 37 giorni
      t += VITA_UNA_MS + 1;
      await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora });
    }
    expect(t - 5_000_000).toBeGreaterThan(VITA_UNA_MS + CONSERVA_UNA_MS);
    expect(s.una.some((k) => rubate.includes(k.key_id))).toBe(false);
    for (const id of rubate.slice(0, 5)) expect(await semePq('bob', id)).toBeNull();
  });

  it('dispositivo spento 40 giorni: le buste arrivate nel frattempo si aprono ancora al ritorno', async () => {
    const s = serverFinto();
    let t = 5_000_000;
    const ora = () => t;
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora });
    t += 40 * GIORNO;  // spento: le chiavi sul server sono ancora quelle di 40 giorni fa
    const vecchia = s.una[0];
    const busta = Olm.pq_sigilla(vecchia.chiave, 'alice|bob|stanza', 'chiave di stanza');
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D1', firma, api: s.api, ora });  // al ritorno: rinnovo
    expect(s.caricamenti[1].sostituisci).toBe(true);
    expect(Olm.pq_apri(await semePq('bob', vecchia.key_id), 'alice|bob|stanza', busta)).toBe('chiave di stanza');
  });

  it('togliSemiScaduti: via solo le ritirate da oltre 30 giorni; mai quelle ancora pubblicate', () => {
    const adesso = 100 * GIORNO;
    const dati = { una: {
      fresca: { seme: 'a', creata: adesso - GIORNO },
      ritirataDaPoco: { seme: 'b', creata: adesso - 10 * GIORNO, ritirata: adesso - 5 * GIORNO },
      ritirataDaTroppo: { seme: 'c', creata: adesso - 40 * GIORNO, ritirata: adesso - 31 * GIORNO },
      vecchiaPubblicata: { seme: 'd', creata: adesso - 60 * GIORNO },
    } };
    expect(togliSemiScaduti(dati, adesso)).toBe(1);
    expect(Object.keys(dati.una).sort()).toEqual(['fresca', 'ritirataDaPoco', 'vecchiaPubblicata']);
  });

  it('usaEGettaDaRinnovare: archivio di prima senza data con chiavi vecchie -> si\'; dispositivo nuovo -> no', () => {
    const adesso = 100 * GIORNO;
    expect(usaEGettaDaRinnovare({ una: {} }, adesso)).toBe(false);
    expect(usaEGettaDaRinnovare({ una: { a: { creata: adesso - GIORNO } } }, adesso)).toBe(false);
    expect(usaEGettaDaRinnovare({ una: { a: { creata: adesso - 8 * GIORNO } } }, adesso)).toBe(true);
    expect(usaEGettaDaRinnovare({ una: {}, rinnovoUna: adesso - 8 * GIORNO }, adesso)).toBe(true);
    expect(usaEGettaDaRinnovare({ una: {}, rinnovoUna: adesso - GIORNO }, adesso)).toBe(false);
  });
});
