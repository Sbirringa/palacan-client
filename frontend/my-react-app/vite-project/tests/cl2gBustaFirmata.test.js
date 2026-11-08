// tests/cl2gBustaFirmata.test.js  [palacan-cl2g]
//
// CL2g: la busta di ogni persona (X25519 + ML-KEM-768) e' firmata dalla sua chiave principale (ed25519 + ML-DSA-65).
// Prima il server poteva sostituirla con una sua e leggere chi manda le chiavi di stanza e i nomi dei gruppi.
// Crittografia VERA (motore WASM): chiave principale creata da assicuraChiavePrincipale con un server finto.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

vi.mock('../src/wsClient', () => ({ sendToDevice: vi.fn(() => true), sendMessage: vi.fn(() => true) }));
vi.mock('../src/utils/cronologiaLocale', () => ({ salvaDato: vi.fn(async () => true), leggiDato: vi.fn(async () => null) }));
vi.mock('../src/apiService', () => ({
  getBustaKeys: vi.fn(), getBustaKey: vi.fn(), queryMatrixKeys: vi.fn(), publishBustaKeys: vi.fn(async () => ({ ok: true })),
  publishBustaKey: vi.fn(), inviteUserToRoom: vi.fn(async () => ({ ok: true })),
}));
import * as ws from '../src/wsClient';
import * as apiService from '../src/apiService';
import Olm from '../src/crypto/olm.js';
import { _usaArchivio as usaArchivioDispositivo } from '../src/utils/chiaveDispositivo';
import { assicuraChiavePrincipale, _azzeraChiavePrincipale, CHIAVE_ARCHIVIO_PRINCIPALE } from '../src/utils/chiavePrincipale';
import { valutaPrincipale } from '../src/utils/fiduciaContatti';
import { improntaDi } from '../src/utils/firmaPq';
import { bustaPubblica, bustaPqPubblica, pubblicaBustaSeServe, _usaArchivio as usaArchivioBusta } from '../src/utils/busta';
import { chiaviBustaDi, inviaChiaveDiStanza, _azzeraCache } from '../src/utils/busteSigillate';
import { firmaBusta, valutaBusta } from '../src/utils/bustaFirmata';

const PARAMETRI = {
  eventType: 'm.room_key', targetUsername: 'bob', roomId: 'stanza', clientMsgId: 'roomkey-stanza-bob',
  algorithm: 'm.olm.v1.curve25519-aes-sha2', senderKey: 'CHIAVE_ALICE',
  content: { algorithm: 'm.olm.v1.curve25519-aes-sha2', sender_key: 'CHIAVE_ALICE', ciphertext: { CHIAVE_BOB: { type: 0, body: 'OLM' } } },
};

function archivioBusta() {
  const m = new Map();
  return (u) => ({ leggi: async (k) => m.get(`${u}:${k}`), scrivi: async (k, v) => { m.set(`${u}:${k}`, v); } });
}
function archivioDispositivo() {
  const m = new Map();
  return () => ({ leggi: async (v) => m.get(v), prendiOCrea: async (v, n) => { if (!m.has(v)) m.set(v, n); return m.get(v); } });
}

// chiave principale di "io" creata davvero (server finto con le regole di L4c1); restituisce quella pubblicata
async function creaPrincipale(io) {
  let pubblicata = null;
  const api = {
    getChiavePrincipale: async () => {
      if (!pubblicata) throw Object.assign(new Error('Chiave principale non trovata'), { status: 404 });
      return pubblicata;
    },
    putChiavePrincipale: async (dati) => {
      pubblicata = { ...dati, impronta: await improntaDi(dati.pq), versione: 1 };
      return pubblicata;
    },
    putFirmaDispositivo: async () => ({ ok: true }),
  };
  const esito = await assicuraChiavePrincipale({ io, token: 't', dispositivo: `D-${io}`, curva: `CURVA-${io}`, api });
  expect(esito.stato).toBe('firmato');
  return pubblicata;
}

async function bustaDi(nome) {
  return { chiave: await bustaPubblica(nome), pq: await bustaPqPubblica(nome) };
}

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
});

describe('CL2g - busta firmata dalla chiave principale', () => {
  beforeEach(() => {
    localStorage.clear();
    _azzeraChiavePrincipale();
    usaArchivioDispositivo(archivioDispositivo());
    usaArchivioBusta(archivioBusta());
    _azzeraCache();
    vi.clearAllMocks();
  });

  it('la firma regge solo per quella busta, quella chiave ML-KEM e quella persona', async () => {
    const principale = await creaPrincipale('bob');
    const b = await bustaDi('bob');
    const firma = firmaBusta('bob', b.chiave, b.pq);
    expect(firma.impronta).toBe(principale.impronta);
    const base = { io: 'alice', utente: 'bob', firma, principale };
    expect(await valutaBusta({ ...base, ...b })).toBe('firmata');
    expect(await valutaBusta({ ...base, chiave: await bustaPubblica('mallory'), pq: b.pq })).toBe('rifiutata');
    expect(await valutaBusta({ ...base, chiave: b.chiave, pq: await bustaPqPubblica('mallory') })).toBe('rifiutata');
    expect(await valutaBusta({ ...base, chiave: b.chiave, pq: null })).toBe('rifiutata');  // ML-KEM tolta: busta v1
    expect(await valutaBusta({ ...base, ...b, utente: 'carol' })).toBe('rifiutata');
    expect(firmaBusta('carol', b.chiave, b.pq)).toBeNull();  // senza la chiave principale non si firma
  });

  it('pubblicazione: prima senza firma, poi firmata appena la chiave principale e\' pronta, una volta sola', async () => {
    expect(await pubblicaBustaSeServe('bob', 't')).toBe(true);
    expect(apiService.publishBustaKeys.mock.calls[0][3]).toBeNull();
    expect(await pubblicaBustaSeServe('bob', 't')).toBe(false);
    const principale = await creaPrincipale('bob');  // stato 'firmato' -> si ripubblica da sola
    await vi.waitFor(() => expect(apiService.publishBustaKeys).toHaveBeenCalledTimes(2));
    const [chiave, pq, token, firma] = apiService.publishBustaKeys.mock.calls[1];
    expect(token).toBe('t');
    expect(firma.impronta).toBe(principale.impronta);
    expect(await valutaBusta({ io: 'alice', utente: 'bob', chiave, pq, firma, principale })).toBe('firmata');
    expect(await pubblicaBustaSeServe('bob', 't')).toBe(false);
    expect(apiService.publishBustaKeys).toHaveBeenCalledTimes(2);
  });

  it('chi scrive: destinatario con chiave principale -> busta solo se firmata; il server non puo\' sostituirla', async () => {
    const principale = await creaPrincipale('bob');
    const b = await bustaDi('bob');
    const firma = firmaBusta('bob', b.chiave, b.pq);
    apiService.getBustaKeys.mockResolvedValue({ ...b, firma: null, principale });
    expect(await chiaviBustaDi('bob', 't', 'alice')).toBeNull();
    apiService.getBustaKeys.mockResolvedValue({ ...b, firma, principale });
    expect(await chiaviBustaDi('bob', 't', 'alice')).toEqual(b);
    apiService.getBustaKeys.mockResolvedValue({ ...(await bustaDi('server')), firma, principale });
    expect(await chiaviBustaDi('bob', 't', 'alice')).toBeNull();
  });

  it('chiave principale gia\' ricordata: se il server toglie chiave e firma, niente busta (nessun declassamento)', async () => {
    const principale = await creaPrincipale('bob');
    await valutaPrincipale({ io: 'alice', utente: 'bob', principale });  // L4c3 la ricorda
    const b = await bustaDi('bob');
    apiService.getBustaKeys.mockResolvedValue({ ...b, firma: null, principale: null });
    expect(await chiaviBustaDi('bob', 't', 'alice')).toBeNull();
    apiService.getBustaKeys.mockResolvedValue({ ...b, firma: firmaBusta('bob', b.chiave, b.pq), principale: null });
    expect(await chiaviBustaDi('bob', 't', 'alice')).toEqual(b);  // la firma si verifica con quella ricordata
  });

  it('chiave principale nuova al posto di quella ricordata (il server ne inventa una): niente busta', async () => {
    const vera = await creaPrincipale('bob');
    await valutaPrincipale({ io: 'alice', utente: 'bob', principale: vera });
    localStorage.removeItem(CHIAVE_ARCHIVIO_PRINCIPALE('bob'));
    _azzeraChiavePrincipale();
    const falsa = await creaPrincipale('bob');
    expect(falsa.impronta).not.toBe(vera.impronta);
    const b = await bustaDi('server');
    apiService.getBustaKeys.mockResolvedValue({ ...b, firma: firmaBusta('bob', b.chiave, b.pq), principale: falsa });
    expect(await chiaviBustaDi('bob', 't', 'alice')).toBeNull();
  });

  it('destinatario senza chiave principale (mai vista): busta come prima', async () => {
    const b = await bustaDi('bob');
    apiService.getBustaKeys.mockResolvedValue({ ...b, firma: null, principale: null });
    expect(await chiaviBustaDi('bob', 't', 'alice')).toEqual(b);
  });

  it('chiave di stanza: busta rifiutata -> parte nel modo di sempre; busta firmata -> sigillata', async () => {
    const principale = await creaPrincipale('bob');
    const b = await bustaDi('bob');
    apiService.getBustaKeys.mockResolvedValue({ ...b, firma: null, principale });
    await inviaChiaveDiStanza('alice', 't', PARAMETRI);
    expect(ws.sendToDevice).toHaveBeenCalledTimes(1);
    expect(ws.sendMessage).not.toHaveBeenCalled();
    _azzeraCache();
    apiService.getBustaKeys.mockResolvedValue({ ...b, firma: firmaBusta('bob', b.chiave, b.pq), principale });
    await inviaChiaveDiStanza('alice', 't', PARAMETRI);
    expect(ws.sendMessage).toHaveBeenCalledTimes(1);
    expect(ws.sendMessage.mock.calls[0][0].event_type).toBe('m.sealed');
  });
});

// [palacan-cl2g2] Invito a un dispositivo appena entrato (account ripristinato): la sua busta e' gia' sul server ma la
// firma arriva qualche secondo dopo, quando il dispositivo ha la chiave principale. Chi invita aspetta un poco e
// riprova, invece di mandare l'invito senza nome (prova end-to-end "account ripristinato in un secondo browser").
import { invitaConNome, _attesePerTest } from '../src/utils/nomiInviti';
import { imparaNomeStanza } from '../src/utils/nomiStanze';

describe('CL2g2 - invito a un dispositivo appena entrato: si aspetta la busta firmata', () => {
  beforeEach(() => {
    localStorage.clear();
    _azzeraChiavePrincipale();
    usaArchivioDispositivo(archivioDispositivo());
    usaArchivioBusta(archivioBusta());
    _azzeraCache();
    vi.clearAllMocks();
    _attesePerTest([5, 5]);
  });

  it('busta non ancora firmata, poi firmata: l\'invito parte con il nome', async () => {
    const principale = await creaPrincipale('bob');
    const b = await bustaDi('bob');
    imparaNomeStanza('g1', 'Gruppo dopo il ripristino');
    apiService.getBustaKeys
      .mockResolvedValueOnce({ ...b, firma: null, principale })
      .mockResolvedValue({ ...b, firma: firmaBusta('bob', b.chiave, b.pq), principale });
    await invitaConNome('g1', 'bob', 't');
    expect(apiService.getBustaKeys).toHaveBeenCalledTimes(2);
    expect(apiService.inviteUserToRoom.mock.calls[0][3]).toBeTruthy();
  });

  it('firma che non arriva mai: dopo le attese l\'invito parte senza nome, come prima', async () => {
    const principale = await creaPrincipale('bob');
    imparaNomeStanza('g2', 'Nome riservato');
    apiService.getBustaKeys.mockResolvedValue({ ...(await bustaDi('bob')), firma: null, principale });
    await invitaConNome('g2', 'bob', 't');
    expect(apiService.getBustaKeys).toHaveBeenCalledTimes(3);
    expect(apiService.inviteUserToRoom.mock.calls[0]).toHaveLength(3);
  });

  it('invitato senza busta: nessuna attesa', async () => {
    imparaNomeStanza('g3', 'Altro gruppo');
    apiService.getBustaKeys.mockResolvedValue(null);
    await invitaConNome('g3', 'carol', 't');
    expect(apiService.getBustaKeys).toHaveBeenCalledTimes(1);
  });
});
