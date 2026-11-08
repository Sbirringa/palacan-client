// tests/cl2fBusteIbride.test.js  [palacan-cl2f]
//
// CL2f: buste sigillate IBRIDE. Le buste sigillate nascondono al server chi manda una chiave di stanza (A2.2) e il
// nome dei gruppi negli inviti (A3.2b). Prima usavano solo X25519: chi registra oggi il traffico, con un computer
// quantistico domani, avrebbe letto mittenti e nomi. Ora la busta X25519 di sempre viaggia DENTRO una busta ML-KEM-768
// legata alla chiave X25519 del destinatario: per aprirla bisogna rompere entrambe. Crittografia VERA (motore WASM).
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

vi.mock('../src/wsClient', () => ({ sendToDevice: vi.fn(() => true), sendMessage: vi.fn(() => true) }));
vi.mock('../src/utils/cronologiaLocale', () => ({ salvaDato: vi.fn(async () => true), leggiDato: vi.fn(async () => null) }));
vi.mock('../src/apiService', () => ({
  getBustaKeys: vi.fn(), getBustaKey: vi.fn(), queryMatrixKeys: vi.fn(), publishBustaKeys: vi.fn(), publishBustaKey: vi.fn(),
  inviteUserToRoom: vi.fn(async () => ({ ok: true })),
}));
import * as ws from '../src/wsClient';
import * as apiService from '../src/apiService';
import Olm from '../src/crypto/olm.js';
import { bustaPubblica, bustaPqPubblica, semeBustaPq, pubblicaBustaSeServe, _usaArchivio } from '../src/utils/busta';
import { sigilla, apriSigillo, inviaChiaveDiStanza, apriBustaRicevuta, _azzeraCache, PREFISSO_V2 } from '../src/utils/busteSigillate';
import { invitaConNome, apriNomiInviti } from '../src/utils/nomiInviti';
import { imparaNomeStanza, dimenticaNomi } from '../src/utils/nomiStanze';

let dati;
function archivioInMemoria() {
  dati = new Map();
  return (u) => ({ leggi: async (k) => dati.get(`${u}:${k}`), scrivi: async (k, v) => { dati.set(`${u}:${k}`, v); } });
}
const daB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const PARAMETRI = {
  eventType: 'm.room_key', targetUsername: 'bob', roomId: 'stanza-segreta',
  clientMsgId: 'roomkey-stanza-segreta-sess-bob', algorithm: 'm.olm.v1.curve25519-aes-sha2', senderKey: 'CHIAVE_ALICE',
  content: { algorithm: 'm.olm.v1.curve25519-aes-sha2', sender_key: 'CHIAVE_ALICE', ciphertext: { CHIAVE_BOB: { type: 0, body: 'OLM' } } },
};

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
});

describe('CL2f - buste sigillate ibride X25519 + ML-KEM-768', () => {
  beforeEach(() => { _usaArchivio(archivioInMemoria()); _azzeraCache(); dimenticaNomi(); vi.clearAllMocks(); });

  it('chiave ML-KEM della busta: 1184 byte, stabile, diversa per ogni utente; il seme non e\' mai in chiaro nell\'archivio', async () => {
    const pq = await bustaPqPubblica('bob');
    expect(daB64(pq).length).toBe(1184);
    expect(await bustaPqPubblica('bob')).toBe(pq);
    expect(await bustaPqPubblica('alice')).not.toBe(pq);
    const seme = await semeBustaPq('bob');
    expect(Olm.pq_chiave_pubblica(seme)).toBe(pq);
    const salvato = dati.get('bob:seme_pq');
    expect(salvato && salvato.iv && salvato.dati).toBeTruthy();
    expect(new TextDecoder('latin1').decode(new Uint8Array(salvato.dati))).not.toContain(seme);
    await expect(crypto.subtle.exportKey('raw', dati.get('bob:chiave_seme_pq'))).rejects.toBeTruthy();
  });

  it('il seme si rilegge dall\'archivio dopo un riavvio dell\'app (stessa chiave ML-KEM)', async () => {
    const pq = await bustaPqPubblica('bob');
    const conservati = dati;
    _usaArchivio((u) => ({ leggi: async (k) => conservati.get(`${u}:${k}`), scrivi: async (k, v) => { conservati.set(`${u}:${k}`, v); } }));
    expect(await bustaPqPubblica('bob')).toBe(pq);
  });

  it('busta v2: si apre solo con X25519 E ML-KEM del destinatario', async () => {
    const b = await sigilla(await bustaPubblica('bob'), { segreto: 42 }, await bustaPqPubblica('bob'));
    expect(b.startsWith(PREFISSO_V2)).toBe(true);
    expect(await apriSigillo('bob', b)).toEqual({ segreto: 42 });
    await expect(apriSigillo('carol', b)).rejects.toBeTruthy();
  });

  it('busta v2 legata alla chiave X25519 del destinatario: mescolare le chiavi di due persone non funziona', async () => {
    const b = await sigilla(await bustaPubblica('carol'), { x: 1 }, await bustaPqPubblica('bob'));
    await expect(apriSigillo('bob', b)).rejects.toBeTruthy();
    await expect(apriSigillo('carol', b)).rejects.toBeTruthy();
  });

  it('dentro la busta ML-KEM c\'e\' la busta X25519 intera: rompere uno solo dei due strati non basta', async () => {
    const x = await bustaPubblica('bob');
    const b = await sigilla(x, { s: 'segreto-di-prova' }, await bustaPqPubblica('bob'));
    expect(atob(b.slice(PREFISSO_V2.length))).not.toContain('segreto-di-prova');
    const interno = Olm.pq_apri(await semeBustaPq('bob'), `palacan-busta-v2|${x}`, b.slice(PREFISSO_V2.length));
    expect(daB64(interno)[0]).toBe(1);
    expect(atob(interno)).not.toContain('segreto-di-prova');
    expect(await apriSigillo('bob', interno)).toEqual({ s: 'segreto-di-prova' });
  });

  it('busta v2 alterata: non si apre', async () => {
    const b = await sigilla(await bustaPubblica('bob'), { x: 1 }, await bustaPqPubblica('bob'));
    const byte = daB64(b.slice(PREFISSO_V2.length));
    byte[byte.length - 1] ^= 1;
    let s = '';
    for (const x of byte) s += String.fromCharCode(x);
    await expect(apriSigillo('bob', PREFISSO_V2 + btoa(s))).rejects.toBeTruthy();
  });

  it('destinatario senza chiave ML-KEM: busta v1, come prima', async () => {
    const b = await sigilla(await bustaPubblica('bob'), { x: 2 });
    expect(b.startsWith(PREFISSO_V2)).toBe(false);
    expect(await apriSigillo('bob', b)).toEqual({ x: 2 });
  });

  it('pubblicazione: la chiave X25519 e quella ML-KEM partono insieme', async () => {
    const inviate = [];
    expect(await pubblicaBustaSeServe('alice', 't', async (p, t, pq) => { inviate.push([p, t, pq]); })).toBe(true);
    expect(inviate).toEqual([[await bustaPubblica('alice'), 't', await bustaPqPubblica('alice')]]);
  });

  it('chiave di stanza a mittente nascosto: busta v2, e chi riceve la apre e verifica il mittente', async () => {
    apiService.getBustaKeys.mockResolvedValue({ chiave: await bustaPubblica('bob'), pq: await bustaPqPubblica('bob') });
    await inviaChiaveDiStanza('alice', 't', PARAMETRI);
    expect(ws.sendToDevice).not.toHaveBeenCalled();
    const inviato = ws.sendMessage.mock.calls[0][0];
    expect(inviato.content.busta.startsWith(PREFISSO_V2)).toBe(true);
    for (const segreto of ['alice', 'stanza-segreta', 'CHIAVE_ALICE', 'OLM']) expect(JSON.stringify(inviato)).not.toContain(segreto);
    apiService.queryMatrixKeys.mockResolvedValue({ device_keys: { alice: { curve25519: 'CHIAVE_ALICE' } } });
    const evento = await apriBustaRicevuta('bob', 't', { id: 'e1', type: 'to_device', event_type: 'm.sealed', content: inviato.content });
    expect(evento.sender).toBe('alice');
    expect(evento.content.ciphertext.CHIAVE_BOB.body).toBe('OLM');
  });

  it('destinatario senza ML-KEM: la chiave di stanza parte comunque sigillata (v1)', async () => {
    apiService.getBustaKeys.mockResolvedValue({ chiave: await bustaPubblica('bob'), pq: null });
    await inviaChiaveDiStanza('alice', 't', PARAMETRI);
    const inviato = ws.sendMessage.mock.calls[0][0];
    expect(inviato.event_type).toBe('m.sealed');
    expect(inviato.content.busta.startsWith(PREFISSO_V2)).toBe(false);
  });

  it('nome del gruppo negli inviti: busta v2, sotto i 4000 caratteri del server, aperta solo dall\'invitato', async () => {
    imparaNomeStanza('g1', 'Amici del calcetto');
    apiService.getBustaKeys.mockResolvedValue({ chiave: await bustaPubblica('bob'), pq: await bustaPqPubblica('bob') });
    await invitaConNome('g1', 'bob', 't');
    const b = apiService.inviteUserToRoom.mock.calls[0][3];
    expect(b.startsWith(PREFISSO_V2)).toBe(true);
    expect(b.length).toBeLessThan(4000);
    expect(b).not.toContain('calcetto');
    dimenticaNomi();
    const [aperto] = await apriNomiInviti([{ id: 'i1', room_id: 'g1', room_name: '', busta_nome: b }], 'bob');
    expect(aperto.room_name).toBe('Amici del calcetto');
    const [perAltri] = await apriNomiInviti([{ id: 'i1', room_id: 'g1', room_name: '', busta_nome: b }], 'carol');
    expect(perAltri.room_name).toBe('');
  });
});

// [palacan-cl2f2] Se il server rifiuta la chiave ML-KEM (server vecchio, formato diverso), la busta X25519 si pubblica
// lo stesso: prima di CL2f2 l'utente restava SENZA busta (niente nomi dei gruppi, chiavi di stanza solo via Olm).
describe('CL2f2 - chiave ML-KEM rifiutata dal server: la busta X25519 parte lo stesso', () => {
  beforeEach(() => { _usaArchivio(archivioInMemoria()); _azzeraCache(); vi.clearAllMocks(); });

  it('primo invio con le due chiavi rifiutato -> secondo invio con la sola X25519, busta pubblicata', async () => {
    const inviate = [];
    const invia = async (p, t, pq) => {
      inviate.push({ p, pq });
      if (pq) throw new Error('422');
    };
    expect(await pubblicaBustaSeServe('dora', 't', invia)).toBe(true);
    expect(inviate).toHaveLength(2);
    expect(inviate[0].pq).toBe(await bustaPqPubblica('dora'));
    expect(inviate[1]).toEqual({ p: await bustaPubblica('dora'), pq: null });
  });

  it('se fallisce anche la sola X25519: nessuna busta, nessun errore lanciato, si riprova alla sessione dopo', async () => {
    const invia = async () => { throw new Error('rete'); };
    expect(await pubblicaBustaSeServe('ezio', 't', invia)).toBe(false);
    expect(await pubblicaBustaSeServe('ezio', 't', async () => {})).toBe(true);
  });
});
