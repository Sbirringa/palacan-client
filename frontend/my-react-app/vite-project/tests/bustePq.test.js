// tests/bustePq.test.js  [palacan-pq4]
//
// Doppia busta delle chiavi di stanza (ML-KEM-768 dentro Olm) con crittografia VERA (WASM: ML-KEM e firme ed25519):
// bob pubblica le sue chiavi post-quantum (PQ3, server finto con le regole di PQ2), alice gli manda una chiave di
// stanza chiusa nella busta, bob la apre e il seme usa e getta sparisce. Poi i casi d'attacco: firma falsa, server
// che "non trova" le chiavi di chi le ha annunciate (downgrade), busta spostata su un altro mittente.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import Olm from '../src/crypto/olm.js';
import { _usaArchivio } from '../src/utils/chiaveDispositivo';
import { assicuraChiaviPq, semePq } from '../src/utils/chiaviPq';
import { impostaFirmatario, conChiaviMittente, imparaDaPayloadOlm, segnaPqPronto, supportoPqAnnunciato, _azzeraFirmaAutore } from '../src/utils/firmaAutore';
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

// server finto: chiavi post-quantum di bob (dispositivo D-bob, chiave d'identita' bob.curva)
function server(bob) {
  const s = { una: [], riserva: null, togli: false, sostituisci: null };
  s.api = {
    getPqCount: async () => ({ una: s.una.length, riserva: Boolean(s.riserva) }),
    uploadPqKeys: async ({ una, riserva }) => { s.una.push(...una); if (riserva) s.riserva = riserva; },
    claimPqKeys: async () => {
      if (s.togli) return [];
      const v = s.una.length ? { ...s.una.shift(), tipo: 'una' } : { ...s.riserva, tipo: 'riserva' };
      if (s.sostituisci) Object.assign(v, s.sostituisci);
      return [{ ...v, device_id: 'D-bob', identity_key: bob.curva }];
    },
  };
  return s;
}

const chiaveDiStanza = JSON.stringify({ type: 'm.room_key', content: { room_id: 'R', session_id: 'S', session_key: 'segreto-megolm' } });

// alice impara da un messaggio Olm di bob la sua chiave di firma e (se c'e') l'annuncio post-quantum
function aliceImparaDaBob(alice, bob) {
  comeFirmatario(bob);
  const esterno = conChiaviMittente(JSON.stringify({ type: 'm.room_key', content: {} }));
  comeFirmatario(alice);
  imparaDaPayloadOlm('alice', 'bob', bob.curva, esterno);
}

describe('PQ4 - doppia busta delle chiavi di stanza', () => {
  let alice;
  let bob;
  let s;
  beforeEach(async () => {
    localStorage.clear();
    _usaArchivio(archivioInMemoria());
    _azzeraFirmaAutore();
    alice = persona('alice');
    bob = persona('bob');
    s = server(bob);
    comeFirmatario(bob);
    await assicuraChiaviPq({ io: 'bob', token: 't', dispositivo: 'D-bob', firma: bob.firma, api: s.api });
    segnaPqPronto('bob');
  });

  it('andata e ritorno: alice chiude, bob apre, il seme usa e getta sparisce', async () => {
    aliceImparaDaBob(alice, bob);
    expect(supportoPqAnnunciato('alice', 'bob', bob.curva)).toBe(true);
    const chiavi = await chiaviPqPer('bob', 't', s.api);
    const keyId = chiavi.get(bob.curva).key_id;
    const chiuso = chiudiPerDispositivo({ payload: chiaveDiStanza, io: 'alice', curvaMia: alice.curva, destinatario: 'bob', curvaDest: bob.curva, chiaviPq: chiavi });
    expect(JSON.parse(chiuso).type).toBe(TIPO_BUSTA);
    expect(chiuso).not.toContain('segreto-megolm');
    expect(await semePq('bob', keyId)).not.toBeNull();
    const aperto = await apriSeBusta({ io: 'bob', mittente: 'alice', curvaMittente: alice.curva, curvaMia: bob.curva, plaintext: chiuso });
    expect(aperto).toBe(chiaveDiStanza);
    expect(await semePq('bob', keyId)).toBeNull();
  });

  it('busta presentata come di un altro mittente (o per un altro dispositivo): non si apre', async () => {
    const chiavi = await chiaviPqPer('bob', 't', s.api);
    const chiuso = chiudiPerDispositivo({ payload: chiaveDiStanza, io: 'alice', curvaMia: alice.curva, destinatario: 'bob', curvaDest: bob.curva, chiaviPq: chiavi });
    const zed = persona('zed');
    const aperto = await apriSeBusta({ io: 'bob', mittente: 'zed', curvaMittente: zed.curva, curvaMia: bob.curva, plaintext: chiuso });
    expect(JSON.parse(aperto).type).toBe('palacan.pq.non_apribile');
  });

  it('chiave post-quantum sostituita dal server (firma non valida): a quel dispositivo non si manda niente', async () => {
    aliceImparaDaBob(alice, bob);
    s.sostituisci = { chiave: Olm.pq_chiave_pubblica(Olm.pq_nuovo_seme()) }; // chiave del server, firma di bob vecchia
    const chiavi = await chiaviPqPer('bob', 't', s.api);
    expect(() => chiudiPerDispositivo({ payload: chiaveDiStanza, io: 'alice', curvaMia: alice.curva, destinatario: 'bob', curvaDest: bob.curva, chiaviPq: chiavi }))
      .toThrow(/firma non valida/);
  });

  it('niente downgrade: chi ha annunciato le chiavi post-quantum non riceve mai il formato vecchio', async () => {
    aliceImparaDaBob(alice, bob);
    s.togli = true; // il server "non trova" le chiavi di bob
    const chiavi = await chiaviPqPer('bob', 't', s.api);
    expect(() => chiudiPerDispositivo({ payload: chiaveDiStanza, io: 'alice', curvaMia: alice.curva, destinatario: 'bob', curvaDest: bob.curva, chiaviPq: chiavi }))
      .toThrow(/niente formato vecchio/);
  });

  it('dispositivo senza chiavi post-quantum e senza annuncio (non ancora aggiornato): si manda come prima', () => {
    const vecchio = chiudiPerDispositivo({ payload: chiaveDiStanza, io: 'alice', curvaMia: alice.curva, destinatario: 'carlo', curvaDest: 'C-carlo', chiaviPq: new Map() });
    expect(vecchio).toBe(chiaveDiStanza);
  });

  it('i messaggi che non sono chiavi restano come sono; un testo normale passa intatto in ricezione', async () => {
    const altro = JSON.stringify({ type: 'm.dummy', content: {} });
    expect(chiudiPerDispositivo({ payload: altro, io: 'alice', curvaMia: alice.curva, destinatario: 'bob', curvaDest: bob.curva, chiaviPq: await chiaviPqPer('bob', 't', s.api) })).toBe(altro);
    expect(await apriSeBusta({ io: 'bob', mittente: 'alice', curvaMittente: alice.curva, curvaMia: bob.curva, plaintext: chiaveDiStanza })).toBe(chiaveDiStanza);
  });

  it('riserva: si usa quando le usa e getta sono finite e il suo seme resta', async () => {
    s.una = [];
    const chiavi = await chiaviPqPer('bob', 't', s.api);
    const voce = chiavi.get(bob.curva);
    expect(voce.tipo).toBe('riserva');
    const chiuso = chiudiPerDispositivo({ payload: chiaveDiStanza, io: 'alice', curvaMia: alice.curva, destinatario: 'bob', curvaDest: bob.curva, chiaviPq: chiavi });
    expect(await apriSeBusta({ io: 'bob', mittente: 'alice', curvaMittente: alice.curva, curvaMia: bob.curva, plaintext: chiuso })).toBe(chiaveDiStanza);
    expect(await semePq('bob', voce.key_id)).not.toBeNull();
  });

  it('collegamenti in olmService, App e chiaviPq', () => {
    const svc = readFileSync('src/olmService.js', 'utf8');
    for (const pezzo of [
      "import { chiaviPqPer, chiudiPerDispositivo, apriSeBusta } from './utils/bustePq';",
      'const chiaviPqDestinatario = await chiaviPqPer(normalizedTarget, token);',
      'await apriSeBusta({',
      'chiudiPerDispositivo({',
    ]) expect(svc).toContain(pezzo);
    expect(svc.split('chiudiPerDispositivo({').length - 1).toBe(3);
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).toContain('curva: olmService.getCurve25519Key(olmAccountRef.current || olmAccount),');
    expect(app).toContain('token,  // [palacan-pq4]');
    expect(readFileSync('src/utils/chiaviPq.js', 'utf8')).toContain('segnaPqPronto(io);');
  });
});
