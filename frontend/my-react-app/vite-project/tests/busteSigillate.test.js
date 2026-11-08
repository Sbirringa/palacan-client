// tests/busteSigillate.test.js
//
// METADATI A2.2-A2.4: chiavi di stanza in busta sigillata (crittografia vera), verifica del mittente.
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

vi.mock('../src/wsClient', () => ({ sendToDevice: vi.fn(() => true), sendMessage: vi.fn(() => true) }));
vi.mock('../src/apiService', () => ({ getBustaKey: vi.fn(), queryMatrixKeys: vi.fn(), publishBustaKey: vi.fn() }));
import * as ws from '../src/wsClient';
import * as apiService from '../src/apiService';
import { bustaPubblica, _usaArchivio } from '../src/utils/busta';
import { sigilla, apriSigillo, inviaChiaveDiStanza, apriBustaRicevuta, idOriginaleConferma, _azzeraCache } from '../src/utils/busteSigillate';

function archivioInMemoria() {
  const dati = new Map();
  return (u) => ({ leggi: async (k) => dati.get(`${u}:${k}`), scrivi: async (k, v) => { dati.set(`${u}:${k}`, v); } });
}

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

const PARAMETRI = {
  eventType: 'm.room_key', targetUsername: 'bob', roomId: 'stanza-segreta',
  clientMsgId: 'roomkey-stanza-segreta-sess-bob-legacy', algorithm: 'm.olm.v1.curve25519-aes-sha2', senderKey: 'CHIAVE_ALICE',
  content: { algorithm: 'm.olm.v1.curve25519-aes-sha2', sender_key: 'CHIAVE_ALICE', ciphertext: { CHIAVE_BOB: { type: 0, body: 'OLM' } } },
};

describe('chiavi di stanza in busta sigillata (metadati A2.2-A2.4)', () => {
  beforeEach(() => { _usaArchivio(archivioInMemoria()); _azzeraCache(); vi.clearAllMocks(); });

  it('sigillo aperto solo dal destinatario', async () => {
    const sigillata = await sigilla(await bustaPubblica('bob'), { segreto: 42 });
    expect(await apriSigillo('bob', sigillata)).toEqual({ segreto: 42 });
    await expect(apriSigillo('carol', sigillata)).rejects.toBeTruthy();
  });

  it('una busta alterata non si apre', async () => {
    const byte = Uint8Array.from(atob(await sigilla(await bustaPubblica('bob'), { x: 1 })), (c) => c.charCodeAt(0));
    byte[byte.length - 1] ^= 1;
    let s = ''; for (const b of byte) s += String.fromCharCode(b);
    await expect(apriSigillo('bob', btoa(s))).rejects.toBeTruthy();
  });

  it('con la busta del destinatario: fuori solo il destinatario (niente stanza, mittente, identificativo)', async () => {
    apiService.getBustaKey.mockResolvedValue(await bustaPubblica('bob'));
    await inviaChiaveDiStanza('alice', 't', PARAMETRI);
    expect(ws.sendToDevice).not.toHaveBeenCalled();
    const inviato = ws.sendMessage.mock.calls[0][0];
    expect(inviato.event_type).toBe('m.sealed');
    expect(inviato.target_username).toBe('bob');
    const visibile = JSON.stringify(inviato);
    for (const segreto of ['alice', 'stanza-segreta', 'roomkey', 'CHIAVE_ALICE', 'OLM']) expect(visibile).not.toContain(segreto);
  });

  it('senza busta del destinatario, o verso i propri dispositivi: il modo di oggi', async () => {
    apiService.getBustaKey.mockResolvedValue(null);
    await inviaChiaveDiStanza('alice', 't', { ...PARAMETRI, targetUsername: 'dave' });
    await inviaChiaveDiStanza('alice', 't', { ...PARAMETRI, targetUsername: 'alice' });
    await inviaChiaveDiStanza('alice', 't', { ...PARAMETRI, eventType: 'm.room_key_request', targetUsername: 'erin' });
    expect(ws.sendToDevice).toHaveBeenCalledTimes(3);
    expect(ws.sendMessage).not.toHaveBeenCalled();
  });

  it('chi riceve apre la busta e verifica il mittente: evento identico a quelli di sempre', async () => {
    apiService.getBustaKey.mockResolvedValue(await bustaPubblica('bob'));
    await inviaChiaveDiStanza('alice', 't', PARAMETRI);
    const arrivato = { id: 'ev-1', type: 'to_device', event_type: 'm.sealed', content: ws.sendMessage.mock.calls[0][0].content };
    apiService.queryMatrixKeys.mockResolvedValue({ device_keys: { alice: { curve25519: 'CHIAVE_ALICE' } } });
    const evento = await apriBustaRicevuta('bob', 't', arrivato);
    expect(evento.sender).toBe('alice');
    expect(evento.event_type).toBe('m.room_key');
    expect(evento.sender_key).toBe('CHIAVE_ALICE');
    expect(evento.content.ciphertext.CHIAVE_BOB.body).toBe('OLM');
    expect(evento.id).toBe('ev-1');
    expect(evento._sigillata).toBe(true);
  });

  it('mittente che si spaccia per un altro: busta scartata', async () => {
    apiService.getBustaKey.mockResolvedValue(await bustaPubblica('bob'));
    await inviaChiaveDiStanza('alice', 't', PARAMETRI);
    const arrivato = { id: 'ev-2', event_type: 'm.sealed', content: ws.sendMessage.mock.calls[0][0].content };
    apiService.queryMatrixKeys.mockResolvedValue({ device_keys: { alice: { curve25519: 'LA_VERA_CHIAVE_DI_ALICE' } } });
    expect(await apriBustaRicevuta('bob', 't', arrivato)).toBeNull();
  });

  it('la conferma torna con l\u0027identificativo di sempre (una volta sola)', async () => {
    apiService.getBustaKey.mockResolvedValue(await bustaPubblica('bob'));
    await inviaChiaveDiStanza('alice', 't', PARAMETRI);
    apiService.queryMatrixKeys.mockResolvedValue({ k: 'CHIAVE_ALICE' });
    const evento = await apriBustaRicevuta('bob', 't', { id: 'ev-3', event_type: 'm.sealed', content: ws.sendMessage.mock.calls[0][0].content });
    expect(evento.client_msg_id.startsWith('k-')).toBe(true);
    expect(idOriginaleConferma(evento.client_msg_id)).toBe(PARAMETRI.clientMsgId);
    expect(idOriginaleConferma(evento.client_msg_id)).toBeNull();
    expect(idOriginaleConferma('roomkey-qualsiasi')).toBeNull();
  });

  it('se il destinatario cambia busta, chi gli scrive usa subito quella nuova', async () => {
    apiService.getBustaKey.mockResolvedValue(await bustaPubblica('bob'));
    await inviaChiaveDiStanza('alice', 't', PARAMETRI);
    _usaArchivio(archivioInMemoria());
    apiService.getBustaKey.mockResolvedValue(await bustaPubblica('bob'));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 20000);
    await inviaChiaveDiStanza('alice', 't', PARAMETRI);
    vi.useRealTimers();
    apiService.queryMatrixKeys.mockResolvedValue({ k: 'CHIAVE_ALICE' });
    const evento = await apriBustaRicevuta('bob', 't', { id: 'ev-4', event_type: 'm.sealed', content: ws.sendMessage.mock.calls[1][0].content });
    expect(evento && evento.sender).toBe('alice');
  });

  it('busta non valida o di tipo inatteso: scartata senza errori', async () => {
    expect(await apriBustaRicevuta('bob', 't', { content: { busta: 'AAAA' } })).toBeNull();
    const altro = await sigilla(await bustaPubblica('bob'), { event_type: 'm.qualcosa', sender: 'alice', sender_key: 'K' });
    expect(await apriBustaRicevuta('bob', 't', { content: { busta: altro } })).toBeNull();
  });
});
