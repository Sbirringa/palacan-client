// tests/chiaviPqSempreIbride.test.js  [palacan-pq7c]
//
// Guasto visto dal vivo dopo PQ7b: ogni chiave di stanza veniva rifiutata ("chiave post-quantum ... senza una firma
// ibrida valida: non si manda niente a quel dispositivo"). Sul server i dispositivi avevano 41-42 chiavi ML-KEM "una"
// SENZA firma ibrida. Causa: all'apertura dell'app il primo giro di assicuraChiaviPq arriva PRIMA che la chiave
// ML-DSA-65 sia pronta in questa visita (assicuraFirmaPq viene dopo): con le "una" finite ne pubblicava 50 nuove con
// la sola ed25519, mentre il dispositivo aveva gia' annunciato "pqh". Chi scrive (giustamente) le rifiutava.
// Qui, con crittografia VERA: un dispositivo che ha gia' annunciato la firma ibrida non pubblica MAI chiavi senza
// (aspetta il giro dopo), e chi le aveva gia' pubblicate cosi' (archivio di prima) le ripubblica tutte ibride.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import Olm from '../src/crypto/olm.js';
import { _usaArchivio, cifraConDispositivo, decifraConDispositivo } from '../src/utils/chiaveDispositivo';
import { impostaFirmatario, _azzeraFirmaAutore } from '../src/utils/firmaAutore';
import { assicuraFirmaPq, _azzeraFirmaPq } from '../src/utils/firmaPq';
import { assicuraChiaviPq, LOTTO, CHIAVE_ARCHIVIO_PQ } from '../src/utils/chiaviPq';

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
});

function archivioInMemoria() {
  const m = new Map();
  return () => ({ leggi: async (v) => m.get(v), prendiOCrea: async (v, n) => { if (!m.has(v)) m.set(v, n); return m.get(v); } });
}

const impronta = (b64) => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');

// server finto di bob con le regole di PQ2 + PQ5b + PQ5d (sostituisci toglie le "una" di quel dispositivo)
function server() {
  const s = { una: [], riserva: null, firme: new Map(), caricamenti: [] };
  s.api = {
    getPqCount: async () => ({ una: s.una.length, riserva: Boolean(s.riserva) }),
    uploadPqKeys: async ({ una, riserva, sostituisci }) => {
      s.caricamenti.push({ quante: una.length, sostituisci: Boolean(sostituisci), ibride: una.every((k) => k.firma_ibrida) && (!riserva || Boolean(riserva.firma_ibrida)) });
      if (sostituisci) s.una = [];
      s.una.push(...una);
      if (riserva) s.riserva = riserva;
    },
    putPqFirma: async ({ chiave, legameEd, legamePq }) => { s.firme.set(impronta(chiave), { chiave, legame_ed: legameEd, legame_pq: legamePq }); },
    getPqFirma: async (u, i) => ({ ...s.firme.get(i) }),
  };
  return s;
}

describe('PQ7c - chiavi ML-KEM sempre con la firma ibrida, anche all\'apertura dell\'app', () => {
  let bob;
  let s;
  let base;
  let firmaPq;

  // il giro dell'app all'apertura: chiavi ML-KEM, chiave ML-DSA-65, di nuovo chiavi ML-KEM
  async function apertura() {
    await assicuraChiaviPq(base);
    await assicuraFirmaPq(firmaPq);
    await assicuraChiaviPq(base);
  }

  beforeEach(async () => {
    localStorage.clear();
    _usaArchivio(archivioInMemoria());
    _azzeraFirmaAutore();
    _azzeraFirmaPq();
    const conto = new Olm.Account();
    conto.create();
    const k = JSON.parse(conto.identity_keys());
    bob = { ed: k.ed25519, curva: k.curve25519, firma: (t) => conto.sign(t) };
    impostaFirmatario({ io: 'bob', chiave: bob.ed, curva: bob.curva, firma: bob.firma });
    s = server();
    base = { io: 'bob', token: 't', dispositivo: 'D-bob', firma: bob.firma, api: s.api };
    firmaPq = { io: 'bob', token: 't', dispositivo: 'D-bob', ed: bob.ed, curva: bob.curva, firmaEd: bob.firma, api: s.api };
    await apertura(); // prima visita: tutto pubblicato con la firma ibrida e annunciato
    expect(s.una.length).toBe(LOTTO);
    expect(s.una.every((c) => c.firma_ibrida)).toBe(true);
  });

  it('riapertura con le "una" finite: mai chiavi senza firma ibrida, si ricaricano al giro dopo con la firma ibrida', async () => {
    _azzeraFirmaPq(); // F5: la chiave ML-DSA-65 non e' ancora pronta in questa visita
    s.una = []; // consumate da chi scriveva
    await assicuraChiaviPq(base); // primo giro, prima di assicuraFirmaPq
    expect(s.una.filter((c) => !c.firma_ibrida).length, 'pubblicate chiavi "una" senza firma ibrida').toBe(0);
    await assicuraFirmaPq(firmaPq);
    await assicuraChiaviPq(base);
    expect(s.una.length).toBeGreaterThan(0);
    expect(s.una.every((c) => c.firma_ibrida && c.firma_ibrida.q)).toBe(true);
  });

  it('archivio di prima (chiavi senza firma ibrida gia\' sul server): si ripubblica tutto con la firma ibrida, una volta', async () => {
    // come oggi in produzione: il server ha anche "una" senza firma ibrida, l'archivio e' quello scritto da PQ5d
    const grezzo = localStorage.getItem(CHIAVE_ARCHIVIO_PQ('bob'));
    const dati = JSON.parse(await decifraConDispositivo(grezzo, 'palacan-pq-semi:bob'));
    delete dati.ibrideV2;
    localStorage.setItem(CHIAVE_ARCHIVIO_PQ('bob'), await cifraConDispositivo(JSON.stringify(dati), 'palacan-pq-semi:bob'));
    s.una.unshift({ key_id: 'vecchia', chiave: 'x', firma: 'y' });
    const prima = s.caricamenti.length;
    await assicuraChiaviPq(base);
    expect(s.una.every((c) => c.firma_ibrida), 'restano chiavi "una" senza firma ibrida sul server').toBe(true);
    expect(s.caricamenti[prima]).toEqual({ quante: LOTTO, sostituisci: true, ibride: true });
    await assicuraChiaviPq(base);
    expect(s.caricamenti.length).toBe(prima + 1); // una volta sola
  });
});
