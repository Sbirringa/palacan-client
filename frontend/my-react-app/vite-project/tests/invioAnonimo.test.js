// tests/invioAnonimo.test.js
//
// METADATI fase 3.4c: invio sul canale anonimo; al server va solo l'impronta del segreto di cancellazione.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/apiService', () => ({ getRoomToken: vi.fn(), sendAnonMessage: vi.fn() }));
import * as apiService from '../src/apiService';
import { stanzaPrivata, nuovoSegreto, impronta, salvaSegreto, leggiSegreto, daAttivare, segnaAttivato, inviaAnonimo, dimenticaGettoni } from '../src/utils/invioAnonimo';

describe('invio anonimo (metadati 3.4c)', () => {
  beforeEach(() => { localStorage.clear(); dimenticaGettoni(); vi.clearAllMocks(); });

  it('solo le chat senza azienda sono private', () => {
    expect(stanzaPrivata({ id: 'a' })).toBe(true);
    expect(stanzaPrivata({ id: 'b', workspace_id: 'ws' })).toBe(false);
    expect(stanzaPrivata({ id: 'c', is_corporate: true })).toBe(false);
    expect(stanzaPrivata(null)).toBe(false);
  });

  it('segreto casuale e impronta SHA-256 corretta', async () => {
    expect(nuovoSegreto()).toMatch(/^[0-9a-f]{64}$/);
    expect(nuovoSegreto()).not.toBe(nuovoSegreto());
    expect(await impronta('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('il segreto si ritrova per id del server o per client_msg_id', () => {
    salvaSegreto('carol', ['m-1', 'cm-1'], 'segreto');
    expect(leggiSegreto('carol', 'sconosciuto', 'cm-1')).toBe('segreto');
    expect(leggiSegreto('dave', 'm-1')).toBeNull();
  });

  it('attivazione per stanza, una volta sola', () => {
    expect(daAttivare('carol', 'r1')).toBe(true);
    segnaAttivato('carol', 'r1');
    expect(daAttivare('carol', 'r1')).toBe(false);
    expect(daAttivare('carol', 'r2')).toBe(true);
  });

  it('al server va l\u0027impronta del segreto, mai il segreto', async () => {
    apiService.getRoomToken.mockResolvedValue({ room_token: 'G1' });
    apiService.sendAnonMessage.mockResolvedValue({ id: 'srv-1', seq: 1 });
    await inviaAnonimo({ roomId: 'r1', token: 't', username: 'carol', cipherBody: 'cifrato', sessionId: 's', clientMsgId: 'cm-9' });
    const [stanza, gettone, corpo] = apiService.sendAnonMessage.mock.calls[0];
    const segreto = leggiSegreto('carol', 'srv-1');
    expect(stanza).toBe('r1');
    expect(gettone).toBe('G1');
    expect(corpo.delete_token_hash).toBe(await impronta(segreto));
    expect(JSON.stringify(corpo)).not.toContain(segreto);
  });

  it('gettone scaduto (403): lo richiede e riprova una volta', async () => {
    apiService.getRoomToken.mockResolvedValueOnce({ room_token: 'VECCHIO' }).mockResolvedValueOnce({ room_token: 'NUOVO' });
    apiService.sendAnonMessage.mockRejectedValueOnce(Object.assign(new Error('403'), { status: 403 })).mockResolvedValueOnce({ id: 'srv-2' });
    const r = await inviaAnonimo({ roomId: 'r1', token: 't', username: 'carol', cipherBody: 'x', clientMsgId: 'cm-2' });
    expect(r.id).toBe('srv-2');
    expect(apiService.sendAnonMessage.mock.calls[1][1]).toBe('NUOVO');
  });

  it('altri errori non vengono nascosti (il chiamante usa il canale di riserva)', async () => {
    apiService.getRoomToken.mockResolvedValue({ room_token: 'G' });
    apiService.sendAnonMessage.mockRejectedValue(Object.assign(new Error('rete'), { status: 0 }));
    await expect(inviaAnonimo({ roomId: 'r1', token: 't', username: 'carol', cipherBody: 'x' })).rejects.toThrow('rete');
  });
});
