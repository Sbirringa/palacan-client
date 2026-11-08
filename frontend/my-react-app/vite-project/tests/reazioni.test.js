// tests/reazioni.test.js
//
// METADATI fase 3.6: reazioni come messaggi cifrati, raccolte sul dispositivo.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/apiService', () => ({ getRoomToken: vi.fn(), sendAnonMessage: vi.fn() }));
import * as apiService from '../src/apiService';
import { applicaReazione, reazioniDel, dimenticaReazioni } from '../src/utils/reazioni';
import { inviaAnonimo, dimenticaGettoni } from '../src/utils/invioAnonimo';

describe('reazioni come messaggi cifrati (metadati 3.6)', () => {
  beforeEach(() => { dimenticaReazioni(); localStorage.clear(); dimenticaGettoni(); vi.clearAllMocks(); });

  it('una reazione per persona: vale l\u0027ultima', () => {
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: '\ud83d\udc4d', ordine: 1 });
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: '\u2764\ufe0f', ordine: 2 });
    expect(reazioniDel('r', ['m1'])).toEqual([{ id: 'reazione-alice', username: 'alice', emoji: '\u2764\ufe0f' }]);
  });

  it('una reazione arrivata in ritardo non sovrascrive quella piu\u0300 recente', () => {
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: 'B', ordine: 5 });
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: 'A', ordine: 3 });
    expect(reazioniDel('r', ['m1'])[0].emoji).toBe('B');
  });

  it('emoji vuota: reazione tolta', () => {
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: 'A', ordine: 1 });
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: null, ordine: 2 });
    expect(reazioniDel('r', ['m1'])).toEqual([]);
  });

  it('piu\u0300 persone sullo stesso messaggio', () => {
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: 'A', ordine: 1 });
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'bob', emoji: 'A', ordine: 2 });
    expect(reazioniDel('r', ['m1']).map((x) => x.username).sort()).toEqual(['alice', 'bob']);
  });

  it('id del server e id provvisorio dello stesso messaggio si uniscono', () => {
    applicaReazione({ roomId: 'r', bersaglio: 'cm-1', autore: 'alice', emoji: 'A', ordine: 1 });
    applicaReazione({ roomId: 'r', bersaglio: 'srv-1', autore: 'bob', emoji: 'B', ordine: 2 });
    expect(reazioniDel('r', ['srv-1', 'cm-1'])).toHaveLength(2);
  });

  it('stanze separate', () => {
    applicaReazione({ roomId: 'r1', bersaglio: 'm1', autore: 'alice', emoji: 'A', ordine: 1 });
    expect(reazioniDel('r2', ['m1'])).toEqual([]);
  });

  it('sul canale anonimo la reazione viaggia come evento di tipo reaction', async () => {
    apiService.getRoomToken.mockResolvedValue({ room_token: 'G' });
    apiService.sendAnonMessage.mockResolvedValue({ id: 'srv-9' });
    await inviaAnonimo({ roomId: 'r', token: 't', username: 'carol', cipherBody: 'x', clientMsgId: 'rz-1', eventKind: 'reaction' });
    expect(apiService.sendAnonMessage.mock.calls[0][2].event_kind).toBe('reaction');
  });
});
