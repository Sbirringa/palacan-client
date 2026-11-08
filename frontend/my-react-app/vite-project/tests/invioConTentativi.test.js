// tests/invioConTentativi.test.js
//
// METADATI fase 3.4d-bis: nuovi tentativi sul canale anonimo; nessun canale di riserva identificato.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/apiService', () => ({ getRoomToken: vi.fn(), sendAnonMessage: vi.fn() }));
import * as apiService from '../src/apiService';
import { inviaAnonimoConTentativi, erroreTemporaneo, dimenticaGettoni } from '../src/utils/invioAnonimo';

const parametri = { roomId: 'r1', token: 't', username: 'carol', cipherBody: 'x', clientMsgId: 'cm-1' };
const errore = (status) => Object.assign(new Error(`errore ${status}`), { status });

describe('invio con nuovi tentativi (metadati 3.4d-bis)', () => {
  beforeEach(() => { localStorage.clear(); dimenticaGettoni(); vi.clearAllMocks(); apiService.getRoomToken.mockResolvedValue({ room_token: 'G' }); });

  it('errori temporanei: rete assente, 5xx, 429', () => {
    expect(erroreTemporaneo(new TypeError('Failed to fetch'))).toBe(true);
    expect(erroreTemporaneo(errore(502))).toBe(true);
    expect(erroreTemporaneo(errore(429))).toBe(true);
    expect(erroreTemporaneo(errore(400))).toBe(false);
  });

  it('server che si riavvia: riprova e il messaggio parte', async () => {
    apiService.sendAnonMessage.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockRejectedValueOnce(errore(503)).mockResolvedValueOnce({ id: 'srv-1' });
    const r = await inviaAnonimoConTentativi(parametri, [0, 0, 0]);
    expect(r.id).toBe('srv-1');
    expect(apiService.sendAnonMessage).toHaveBeenCalledTimes(3);
  });

  it('errore non temporaneo: nessun nuovo tentativo', async () => {
    apiService.sendAnonMessage.mockRejectedValue(errore(413));
    await expect(inviaAnonimoConTentativi(parametri, [0, 0, 0])).rejects.toThrow('413');
    expect(apiService.sendAnonMessage).toHaveBeenCalledTimes(1);
  });

  it('se tutti i tentativi falliscono l\u0027errore risale (il messaggio sara\u0300 \"non inviato\")', async () => {
    apiService.sendAnonMessage.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(inviaAnonimoConTentativi(parametri, [0, 0, 0])).rejects.toThrow('Failed to fetch');
    expect(apiService.sendAnonMessage).toHaveBeenCalledTimes(4);
  });

  it('attese crescenti tra i tentativi (1, 3, 7 secondi)', async () => {
    const attese = [];
    const orologio = vi.spyOn(globalThis, 'setTimeout').mockImplementation((funzione, ms) => { attese.push(ms); funzione(); return 0; });
    apiService.sendAnonMessage.mockRejectedValue(errore(502));
    await expect(inviaAnonimoConTentativi(parametri)).rejects.toThrow('502');
    orologio.mockRestore();
    expect(attese.filter((ms) => ms > 0)).toEqual([1000, 3000, 7000]);  // le attese da 0 ms sono dell'ambiente di prova
    expect(apiService.sendAnonMessage).toHaveBeenCalledTimes(4);
  });
});
