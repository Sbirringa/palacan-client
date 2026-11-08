// tests/chiaviIbride.test.js  [palacan-pq5d]
//
// Chiavi post-quantum ML-KEM con la FIRMA IBRIDA (ed25519 + ML-DSA-65) del dispositivo, con crittografia VERA (WASM):
//   - con la chiave ML-DSA-65 pronta, il dispositivo ripubblica TUTTE le sue chiavi ML-KEM firmate in modo ibrido
//     ("sostituisci") e solo dopo lo annuncia nei messaggi Olm ("pqh");
//   - chi gli manda una chiave di stanza scarica la sua chiave ML-DSA-65 e chiude la busta solo se la firma ibrida
//     regge; firma ibrida tolta, alterata, con un'impronta mai annunciata o chiave ML-DSA-65 negata dal server ->
//     a quel dispositivo non si manda niente;
//   - dispositivi che non l'hanno annunciato (non ancora aggiornati): come prima, basta la ed25519.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import Olm from '../src/crypto/olm.js';
import { _usaArchivio } from '../src/utils/chiaveDispositivo';
import { impostaFirmatario, conChiaviMittente, imparaDaPayloadOlm, supportoPqIbridoAnnunciato, _azzeraFirmaAutore } from '../src/utils/firmaAutore';
import { assicuraFirmaPq, _azzeraFirmaPq } from '../src/utils/firmaPq';
import { assicuraChiaviPq, LOTTO } from '../src/utils/chiaviPq';
import { chiaviPqPer, chiudiPerDispositivo, apriSeBusta, TIPO_BUSTA } from '../src/utils/bustePq';

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
});

function archivioInMemoria() {
  const m = new Map();
  return () => ({ leggi: async (v) => m.get(v), prendiOCrea: async (v, n) => { if (!m.has(v)) m.set(v, n); return m.get(v); } });
}

function persona(nome) {
  const conto = new Olm.Account();
  conto.create();
  const k = JSON.parse(conto.identity_keys());
  return { nome, conto, ed: k.ed25519, curva: k.curve25519, firma: (t) => conto.sign(t) };
}

const comeFirmatario = (p) => impostaFirmatario({ io: p.nome, chiave: p.ed, curva: p.curva, firma: p.firma });
const impronta = (b64) => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');

// server finto di bob con le regole di PQ2 + PQ5b + PQ5d
function server(bob) {
  const s = { una: [], riserva: null, firme: new Map(), caricamenti: [], rompi: null, negaFirma: false };
  s.api = {
    getPqCount: async () => ({ una: s.una.length, riserva: Boolean(s.riserva) }),
    uploadPqKeys: async ({ una, riserva, sostituisci }) => {
      if (s.rifiutaCaricamento) throw Object.assign(new Error('Errore interno'), { status: 500 });
      s.caricamenti.push({ quante: una.length, sostituisci: Boolean(sostituisci), ibride: una.every((k) => k.firma_ibrida) && (!riserva || Boolean(riserva.firma_ibrida)) });
      if (sostituisci) s.una = [];
      s.una.push(...una);
      if (riserva) s.riserva = riserva;
    },
    claimPqKeys: async () => {
      const v = s.una.length ? { ...s.una.shift(), tipo: 'una' } : { ...s.riserva, tipo: 'riserva' };
      if (s.rompi) s.rompi(v);
      return [{ ...v, device_id: 'D-bob', identity_key: bob.curva }];
    },
    putPqFirma: async ({ chiave, legameEd, legamePq }) => { s.firme.set(impronta(chiave), { chiave, legame_ed: legameEd, legame_pq: legamePq }); },
    getPqFirma: async (u, i) => {
      if (s.negaFirma || !s.firme.has(i)) throw Object.assign(new Error('Chiave non trovata'), { status: 404 });
      return { ...s.firme.get(i) };
    },
  };
  return s;
}

// il giro dell'app per bob: chiavi ML-KEM, chiave ML-DSA-65, di nuovo chiavi ML-KEM (ora con la firma ibrida)
async function giroDiBob(bob, s) {
  comeFirmatario(bob);
  const base = { io: 'bob', token: 't', dispositivo: 'D-bob', firma: bob.firma, api: s.api };
  await assicuraChiaviPq(base);
  await assicuraFirmaPq({ io: 'bob', token: 't', dispositivo: 'D-bob', ed: bob.ed, curva: bob.curva, firmaEd: bob.firma, api: s.api });
  await assicuraChiaviPq(base);
  return conChiaviMittente(JSON.stringify({ type: 'm.room_key', content: {} }));
}

const chiaveDiStanza = JSON.stringify({ type: 'm.room_key', content: { room_id: 'R', session_id: 'S', session_key: 'segreto-megolm' } });

describe('PQ5d - chiavi ML-KEM con firma ibrida (ed25519 + ML-DSA-65)', { timeout: 30000 }, () => {  // [palacan-pq7b] crittografia vera (ML-DSA-65): con tutta la suite in parallelo 5 secondi non bastano
  let alice;
  let bob;
  let s;
  beforeEach(() => {
    localStorage.clear();
    _usaArchivio(archivioInMemoria());
    _azzeraFirmaAutore();
    _azzeraFirmaPq();
    alice = persona('alice');
    bob = persona('bob');
    s = server(bob);
  });

  it('con la chiave ML-DSA-65 pronta tutte le chiavi si ripubblicano con la firma ibrida, poi lo si annuncia', async () => {
    comeFirmatario(bob);
    const base = { io: 'bob', token: 't', dispositivo: 'D-bob', firma: bob.firma, api: s.api };
    await assicuraChiaviPq(base);
    expect(s.caricamenti).toEqual([{ quante: LOTTO, sostituisci: false, ibride: false }]);
    expect(JSON.parse(conChiaviMittente('{"type":"x"}')).chiavi_mittente.pqh).toBeUndefined();
    await assicuraFirmaPq({ io: 'bob', token: 't', dispositivo: 'D-bob', ed: bob.ed, curva: bob.curva, firmaEd: bob.firma, api: s.api });
    expect(JSON.parse(conChiaviMittente('{"type":"x"}')).chiavi_mittente.pqh).toBeUndefined(); // non ancora ripubblicate
    await assicuraChiaviPq(base);
    expect(s.caricamenti[1]).toEqual({ quante: LOTTO, sostituisci: true, ibride: true });
    expect(s.una.length).toBe(LOTTO);
    expect(s.una.every((k) => k.firma_ibrida && k.firma_ibrida.q)).toBe(true);
    expect(JSON.parse(conChiaviMittente('{"type":"x"}')).chiavi_mittente.pqh).toBe(1);
    await assicuraChiaviPq(base);
    expect(s.caricamenti.length).toBe(2); // gia' tutte ibride: niente da ripubblicare
  });

  it('ripubblicazione non riuscita: niente annuncio, e al giro dopo si riprova', async () => {
    comeFirmatario(bob);
    const base = { io: 'bob', token: 't', dispositivo: 'D-bob', firma: bob.firma, api: s.api };
    await assicuraChiaviPq(base);
    await assicuraFirmaPq({ io: 'bob', token: 't', dispositivo: 'D-bob', ed: bob.ed, curva: bob.curva, firmaEd: bob.firma, api: s.api });
    s.rifiutaCaricamento = true;
    expect((await assicuraChiaviPq(base)).errore).toBeTruthy();
    expect(JSON.parse(conChiaviMittente('{"type":"x"}')).chiavi_mittente.pqh).toBeUndefined();
    s.rifiutaCaricamento = false;
    await assicuraChiaviPq(base);
    expect(s.caricamenti[s.caricamenti.length - 1]).toEqual({ quante: LOTTO, sostituisci: true, ibride: true });
    expect(JSON.parse(conChiaviMittente('{"type":"x"}')).chiavi_mittente.pqh).toBe(1);
  });

  it('chi manda una chiave di stanza scarica la chiave ML-DSA-65 e chiude la busta: la firma ibrida regge', async () => {
    const messaggio = await giroDiBob(bob, s);
    comeFirmatario(alice);
    imparaDaPayloadOlm('alice', 'bob', bob.curva, messaggio);
    expect(supportoPqIbridoAnnunciato('alice', 'bob', bob.curva)).toBe(true);
    const chiavi = await chiaviPqPer('bob', 't', s.api);
    const chiuso = chiudiPerDispositivo({ payload: chiaveDiStanza, io: 'alice', curvaMia: alice.curva, destinatario: 'bob', curvaDest: bob.curva, chiaviPq: chiavi });
    expect(JSON.parse(chiuso).type).toBe(TIPO_BUSTA);
    comeFirmatario(bob);
    expect(await apriSeBusta({ io: 'bob', mittente: 'alice', curvaMittente: alice.curva, curvaMia: bob.curva, plaintext: chiuso })).toBe(chiaveDiStanza);
  });

  it('firma ibrida tolta, alterata, con un\'impronta mai annunciata o chiave ML-DSA-65 negata: non si manda niente', async () => {
    const messaggio = await giroDiBob(bob, s);
    comeFirmatario(alice);
    imparaDaPayloadOlm('alice', 'bob', bob.curva, messaggio);
    const prova = async () => {
      const chiavi = await chiaviPqPer('bob', 't', s.api);
      return () => chiudiPerDispositivo({ payload: chiaveDiStanza, io: 'alice', curvaMia: alice.curva, destinatario: 'bob', curvaDest: bob.curva, chiaviPq: chiavi });
    };
    s.rompi = (v) => { delete v.firma_ibrida; };
    expect(await prova()).toThrow(/firma ibrida/);
    s.rompi = (v) => { v.firma_ibrida = { ...v.firma_ibrida, fq: s.una[0].firma_ibrida.fq }; }; // ML-DSA di un'altra chiave
    expect(await prova()).toThrow(/firma ibrida/);
    s.rompi = (v) => { v.firma_ibrida = { ...v.firma_ibrida, fe: s.una[0].firma_ibrida.fe }; }; // ed25519 di un'altra chiave
    expect(await prova()).toThrow(/firma ibrida/);
    s.rompi = (v) => { v.firma_ibrida = { ...v.firma_ibrida, q: 'e'.repeat(64) }; };
    expect(await prova()).toThrow(/firma ibrida/);
    s.rompi = null;
    s.negaFirma = true; // il server nega la chiave ML-DSA-65 (alice non l'ha ancora: storage pulito)
    localStorage.removeItem('palacan_pqfirma_note_alice');
    expect(await prova()).toThrow(/firma ibrida/);
    s.negaFirma = false;
    expect((await prova())()).toContain(TIPO_BUSTA);
  });

  it('dispositivo che non l\'ha annunciato (non ancora aggiornato): basta la ed25519, come prima', async () => {
    comeFirmatario(bob);
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D-bob', firma: bob.firma, api: s.api });
    const messaggio = conChiaviMittente(JSON.stringify({ type: 'm.room_key', content: {} }));
    expect(JSON.parse(messaggio).chiavi_mittente.pqh).toBeUndefined();
    comeFirmatario(alice);
    imparaDaPayloadOlm('alice', 'bob', bob.curva, messaggio);
    expect(supportoPqIbridoAnnunciato('alice', 'bob', bob.curva)).toBe(false);
    const chiavi = await chiaviPqPer('bob', 't', s.api);
    expect(JSON.parse(chiudiPerDispositivo({ payload: chiaveDiStanza, io: 'alice', curvaMia: alice.curva, destinatario: 'bob', curvaDest: bob.curva, chiaviPq: chiavi })).type).toBe(TIPO_BUSTA);
  });

  it('collegamenti: App ripubblica le chiavi dopo la chiave ML-DSA-65', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).toContain("})).then(() => assicuraChiaviPq({  // [palacan-pq5d]");
    expect(app.indexOf('assicuraFirmaPq({')).toBeLessThan(app.indexOf("})).then(() => assicuraChiaviPq({  // [palacan-pq5d]"));
  });
});
