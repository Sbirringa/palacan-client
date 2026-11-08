// tests/chiaviPqRipristino.test.js  [palacan-pq7g]
//
// Visto dal vivo dopo il deploy di fine PQ6 (31 ottobre): account RIPRISTINATO in un browser nuovo (archivio delle
// chiavi post-quantum vuoto, dispositivo nuovo da registrare). Il primo giro di assicuraChiaviPq arriva prima che la
// chiave ML-DSA-65 sia pronta e, non trovando nell'archivio il segno "ibride" (archivio nuovo), pubblicava 50 chiavi
// ML-KEM con la sola ed25519. Chi conosceva gia' la firma ibrida di quell'utente le rifiutava ("senza una firma ibrida
// valida") e per qualche secondo il dispositivo era "non raggiungibile", finche' il giro dopo le ripubblicava ibride.
// Qui, con crittografia VERA: con soloConFirmaIbrida (come chiede l'app) il primo giro registra il dispositivo ma NON
// pubblica niente; dopo la chiave ML-DSA-65 tutte le chiavi partono con la firma ibrida, e solo allora si annuncia.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import Olm from '../src/crypto/olm.js';
import { _usaArchivio } from '../src/utils/chiaveDispositivo';
import { impostaFirmatario, conChiaviMittente, _azzeraFirmaAutore } from '../src/utils/firmaAutore';
import { assicuraFirmaPq, _azzeraFirmaPq } from '../src/utils/firmaPq';
import { assicuraChiaviPq, LOTTO } from '../src/utils/chiaviPq';

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
});

function archivioInMemoria() {
  const m = new Map();
  return () => ({ leggi: async (v) => m.get(v), prendiOCrea: async (v, n) => { if (!m.has(v)) m.set(v, n); return m.get(v); } });
}

const impronta = (b64) => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');

// server finto: dispositivo nuovo NON registrato (404 finche' non si registra), regole di PQ2 + PQ5b + PQ5d
function server() {
  const s = { registrato: false, una: [], riserva: null, firme: new Map(), caricamenti: [] };
  s.api = {
    getPqCount: async () => {
      if (!s.registrato) throw Object.assign(new Error('Dispositivo non trovato'), { status: 404 });
      return { una: s.una.length, riserva: Boolean(s.riserva) };
    },
    uploadIdentityKey: async () => { s.registrato = true; },
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

describe('PQ7g - account ripristinato in un browser nuovo: mai chiavi ML-KEM senza firma ibrida', { timeout: 30000 }, () => {
  let s;
  let base;
  let firmaPq;

  beforeEach(() => {
    localStorage.clear(); // browser nuovo: archivio delle chiavi post-quantum vuoto
    _usaArchivio(archivioInMemoria());
    _azzeraFirmaAutore();
    _azzeraFirmaPq(); // chiave ML-DSA-65 non ancora pronta in questa visita
    const conto = new Olm.Account();
    conto.create();
    const k = JSON.parse(conto.identity_keys());
    const firma = (t) => conto.sign(t);
    impostaFirmatario({ io: 'bob', chiave: k.ed25519, curva: k.curve25519, firma });
    s = server();
    base = { io: 'bob', token: 't', dispositivo: 'D-nuovo', firma, curva: k.curve25519, soloConFirmaIbrida: true, api: s.api };
    firmaPq = { io: 'bob', token: 't', dispositivo: 'D-nuovo', ed: k.ed25519, curva: k.curve25519, firmaEd: firma, api: s.api };
  });

  it('primo giro: il dispositivo si registra ma non pubblica niente; dopo la chiave ML-DSA-65 tutto con la firma ibrida', async () => {
    await assicuraChiaviPq(base); // primo giro dell'app, prima di assicuraFirmaPq
    expect(s.registrato, 'il dispositivo deve registrarsi comunque').toBe(true);
    expect(s.caricamenti.filter((c) => !c.ibride).length, 'pubblicate chiavi senza firma ibrida').toBe(0);
    expect(s.una.length).toBe(0);
    expect(JSON.parse(conChiaviMittente('{"type":"x"}')).chiavi_mittente.pqh).toBeUndefined();
    await assicuraFirmaPq(firmaPq);
    await assicuraChiaviPq(base); // giro dopo: chiave ML-DSA-65 pronta
    expect(s.una.length).toBe(LOTTO);
    expect(s.una.every((c) => c.firma_ibrida && c.firma_ibrida.q), 'pubblicate chiavi senza firma ibrida').toBe(true);
    expect(Boolean(s.riserva && s.riserva.firma_ibrida), 'riserva senza firma ibrida').toBe(true);
    expect(s.caricamenti.every((c) => c.ibride), 'pubblicate chiavi senza firma ibrida').toBe(true);
    expect(JSON.parse(conChiaviMittente('{"type":"x"}')).chiavi_mittente.pqh).toBe(1);
  });

  it('collegamenti: l\'app chiede soloConFirmaIbrida gia\' al primo giro, prima di assicuraFirmaPq', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    const inizio = app.indexOf('const controlla = () => assicuraChiaviPq({');
    expect(inizio, 'giro delle chiavi post-quantum non trovato in App.jsx').toBeGreaterThan(-1);
    const firma = app.indexOf('assicuraFirmaPq({', inizio);
    expect(app.slice(inizio, firma), 'primo giro senza soloConFirmaIbrida: pubblicherebbe chiavi senza firma ibrida').toContain('soloConFirmaIbrida: true');
  });
});
