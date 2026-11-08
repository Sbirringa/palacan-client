// tests/chiaviSenzaSessionId.test.js
//
// METADATI fase 3.4d: il session_id non va al server; la chiave si trova provando quelle della stanza.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/apiService', () => ({ getRoomToken: vi.fn(), sendAnonMessage: vi.fn() }));
import * as apiService from '../src/apiService';
import { inviaAnonimo, dimenticaGettoni } from '../src/utils/invioAnonimo';
import { registraCreatore, trovaChiaveDellaStanza, leggiCreatore, sessioniDellaStanza } from '../src/utils/creatoriChiavi';

const sessione = (nome) => ({ decrypt: (t) => { if (!t.startsWith(nome)) throw new Error('BAD_MESSAGE_MAC'); return { plaintext: t }; } });

describe('niente session_id al server (metadati 3.4d)', () => {
  beforeEach(() => { localStorage.clear(); dimenticaGettoni(); vi.clearAllMocks(); });

  it('il session_id non viene inviato, anche se l\u0027app lo conosce', async () => {
    apiService.getRoomToken.mockResolvedValue({ room_token: 'G' });
    apiService.sendAnonMessage.mockResolvedValue({ id: 'srv-1' });
    await inviaAnonimo({ roomId: 'r1', token: 't', username: 'carol', cipherBody: 'x', sessionId: 'SESSIONE-SEGRETA', clientMsgId: 'cm-1' });
    const corpo = apiService.sendAnonMessage.mock.calls[0][2];
    expect(corpo.session_id).toBeNull();
    expect(JSON.stringify(corpo)).not.toContain('SESSIONE-SEGRETA');
  });

  it('rete di sicurezza: chiave registrata prima del 3.4b (senza stanza) trovata comunque', () => {
    registraCreatore('carol', 'vecchia', { utente: 'alice' });
    expect(trovaChiaveDellaStanza('carol', 'A', 'vecchia:testo', { vecchia: sessione('vecchia') })).toBe('vecchia');
  });

  it('alla chiave trovata con la rete di sicurezza si associa la stanza', () => {
    registraCreatore('carol', 'vecchia', { utente: 'alice' });
    trovaChiaveDellaStanza('carol', 'A', 'vecchia:testo', { vecchia: sessione('vecchia') });
    expect(leggiCreatore('carol', 'vecchia').stanza).toBe('A');
    expect(sessioniDellaStanza('carol', 'A')).toEqual(['vecchia']);
    expect(leggiCreatore('carol', 'vecchia').utente).toBe('alice');
  });

  it('le chiavi di altre stanze restano escluse anche dalla rete di sicurezza', () => {
    registraCreatore('carol', 'x1', { utente: 'eve', stanza: 'ALTRA' });
    expect(trovaChiaveDellaStanza('carol', 'A', 'x1:testo', { x1: sessione('x1') })).toBeNull();
  });
});
