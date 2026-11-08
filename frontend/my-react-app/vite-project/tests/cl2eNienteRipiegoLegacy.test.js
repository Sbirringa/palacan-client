// tests/cl2eNienteRipiegoLegacy.test.js  [palacan-cl2e]
//
// CL2e: niente ripiego "legacy". Prima, se l'invio Megolm falliva in una stanza NON privata (gruppi aziendali), l'app
// mandava il TESTO del messaggio direttamente via Olm a ogni membro: senza la busta post-quantum (leggibile un domani
// da chi registra il traffico, con un computer quantistico) e con il mittente visibile al server. Ora in ogni stanza
// il messaggio resta "non inviato" nella coda di uscita, che lo ritenta sul canale della sua stanza.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../src/apiService', () => ({ getRoomToken: vi.fn(), sendAnonMessage: vi.fn() }));
import * as invio from '../src/utils/invioAnonimo';

const app = () => readFileSync('src/App.jsx', 'utf8');

describe('CL2e - niente ripiego legacy senza busta post-quantum', () => {
  beforeEach(() => localStorage.clear());

  it('App.jsx non manda mai il testo via Olm (niente sendLegacyMessage, niente olmService.encryptMessage)', () => {
    const a = app();
    expect(a, 'CL2E: App.jsx usa ancora sendLegacyMessage').not.toMatch(/sendLegacyMessage/);
    expect(a, 'CL2E: App.jsx cifra ancora del testo con Olm').not.toMatch(/olmService\.encryptMessage\(/);
  });

  it('invio fallito: in ogni stanza il messaggio va nella coda di uscita, con il canale della sua stanza', () => {
    expect(app()).toContain('mettiInUscita(username, { clientMsgId: tempId, roomId, cipherBody: null, canale: canaleDi(currentRoomRef.current) })');
  });

  it('la coda di uscita si ritenta con ritentaVoce (canale giusto), non sempre sul canale anonimo', () => {
    const a = app();
    expect(a).toContain('const esito = await ritentaVoce(voce, {');
    expect(a).not.toContain('await inviaAnonimoConTentativi({ roomId: voce.roomId, token, username, cipherBody: cifrato, clientMsgId: voce.clientMsgId }, []);');
  });

  it('canale: anonimo per le chat private, della stanza per le aziende', () => {
    expect(invio.canaleDi({ id: 'a' })).toBe('anonimo');
    expect(invio.canaleDi({ id: 'b', workspace_id: 'w' })).toBe('stanza');
    expect(invio.canaleDi({ id: 'c', is_corporate: true })).toBe('stanza');
    expect(invio.canaleDi(null)).toBe('stanza');
  });

  it('la coda ricorda il canale; valori sconosciuti diventano anonimo', () => {
    invio.mettiInUscita('carol', { clientMsgId: 'cm-1', roomId: 'r1', canale: 'stanza' });
    invio.mettiInUscita('carol', { clientMsgId: 'cm-2', roomId: 'r2' });
    invio.mettiInUscita('carol', { clientMsgId: 'cm-3', roomId: 'r3', canale: 'legacy' });
    expect(invio.leggiUscita('carol').map((v) => v.canale)).toEqual(['stanza', 'anonimo', 'anonimo']);
  });

  it('ritentaVoce, stanza aziendale: canale della stanza, cifrato di nuovo, mai il canale anonimo', async () => {
    const cifra = vi.fn().mockResolvedValue({ cipherBody: 'C', sessionId: 'S', senderKey: 'K' });
    const inviaAnonimo = vi.fn();
    const inviaStanza = vi.fn();
    const esito = await invio.ritentaVoce({ clientMsgId: 'cm', roomId: 'r', canale: 'stanza', cipherBody: 'vecchio' }, { cifra, inviaAnonimo, inviaStanza });
    expect(esito).toBe('stanza');
    expect(inviaStanza).toHaveBeenCalledWith({ roomId: 'r', cipherBody: 'C', sessionId: 'S', senderKey: 'K', clientMsgId: 'cm' });
    expect(inviaAnonimo).not.toHaveBeenCalled();
  });

  it('ritentaVoce, chat privata (anche voci di prima senza canale): canale anonimo, con il cifrato salvato', async () => {
    const cifra = vi.fn();
    const inviaAnonimo = vi.fn();
    const inviaStanza = vi.fn();
    expect(await invio.ritentaVoce({ clientMsgId: 'cm', roomId: 'r', cipherBody: 'X' }, { cifra, inviaAnonimo, inviaStanza })).toBe('anonimo');
    expect(inviaAnonimo).toHaveBeenCalledWith({ roomId: 'r', cipherBody: 'X', clientMsgId: 'cm' });
    expect(cifra).not.toHaveBeenCalled();
    expect(inviaStanza).not.toHaveBeenCalled();
  });

  it('ritentaVoce, chat privata senza cifrato salvato: cifra di nuovo e manda sul canale anonimo', async () => {
    const inviaAnonimo = vi.fn();
    expect(await invio.ritentaVoce({ clientMsgId: 'cm', roomId: 'r', cipherBody: null, canale: 'anonimo' }, {
      cifra: async () => ({ cipherBody: 'N', sessionId: 'S', senderKey: 'K' }), inviaAnonimo, inviaStanza: vi.fn(),
    })).toBe('anonimo');
    expect(inviaAnonimo).toHaveBeenCalledWith({ roomId: 'r', cipherBody: 'N', clientMsgId: 'cm' });
  });

  it('ritentaVoce: testo non piu\' disponibile -> senza_testo, niente invio', async () => {
    const inviaAnonimo = vi.fn();
    const inviaStanza = vi.fn();
    expect(await invio.ritentaVoce({ clientMsgId: 'cm', roomId: 'r', canale: 'stanza' }, { cifra: async () => null, inviaAnonimo, inviaStanza })).toBe('senza_testo');
    expect(await invio.ritentaVoce({ clientMsgId: 'cm', roomId: 'r' }, { cifra: async () => null, inviaAnonimo, inviaStanza })).toBe('senza_testo');
    expect(inviaStanza).not.toHaveBeenCalled();
    expect(inviaAnonimo).not.toHaveBeenCalled();
  });

  it('un errore di invio risale (la voce resta in coda e si ritenta al giro dopo)', async () => {
    await expect(invio.ritentaVoce({ clientMsgId: 'cm', roomId: 'r', cipherBody: 'X' }, {
      cifra: vi.fn(), inviaAnonimo: vi.fn().mockRejectedValue(new Error('rete')), inviaStanza: vi.fn(),
    })).rejects.toThrow('rete');
    await expect(invio.ritentaVoce({ clientMsgId: 'cm', roomId: 'r', canale: 'stanza' }, {
      cifra: async () => ({ cipherBody: 'C' }), inviaAnonimo: vi.fn(), inviaStanza: vi.fn().mockRejectedValue(new Error('rete')),
    })).rejects.toThrow('rete');
  });
});
