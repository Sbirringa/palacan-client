// tests/segretiStanze.test.js
//
// METADATI A4.1b: segreto di stanza, gettone calcolato dall'app (formule identiche al backend A4.1a).
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto, createHmac, createHash } from 'node:crypto';

vi.mock('../src/utils/cronologiaLocale', () => ({ salvaDato: vi.fn(async () => true), leggiDato: vi.fn(async () => null) }));
vi.mock('../src/apiService', () => ({ getRoomToken: vi.fn(), sendAnonMessage: vi.fn(), setRoomVerifier: vi.fn() }));
import * as apiService from '../src/apiService';
import {
  nuovoSegretoStanza, gettoneDa, verificatoreDa, registraStanzaSegreto, imparaSegretoStanza, segretoConfermato,
  daGenerare, dimenticaSegreti,
} from '../src/utils/segretiStanze';
import { inviaAnonimo, dimenticaGettoni } from '../src/utils/invioAnonimo';

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

const aspetta = () => new Promise((r) => setTimeout(r, 20));

async function invia(roomId) {
  try {
    await inviaAnonimo({ roomId, token: 't', username: 'alice', cipherBody: 'X' });
  } catch (_) { /* conta solo il gettone usato */ }
  return apiService.sendAnonMessage.mock.calls.at(-1)?.[1];
}

describe('segreto di stanza (metadati A4.1b)', () => {
  beforeEach(() => {
    dimenticaSegreti(); dimenticaGettoni(); localStorage.clear(); vi.clearAllMocks();
    apiService.getRoomToken.mockResolvedValue({ room_token: 'GETTONE_DI_SEMPRE' });
    apiService.sendAnonMessage.mockResolvedValue({ id: 'm1', seq: 1 });
  });

  it('gettone e verificatore identici alle formule del backend', async () => {
    const segreto = nuovoSegretoStanza();
    const grezzo = Buffer.from(segreto, 'base64');
    const atteso = createHmac('sha256', grezzo).update('palacan-accesso-v1').digest('hex');
    expect(await gettoneDa(segreto)).toBe(atteso);
    expect(await verificatoreDa(segreto)).toBe(createHash('sha256').update(atteso, 'utf8').digest('hex'));
  });

  it('segreto ricevuto: confermato solo se coincide col verificatore della stanza', async () => {
    const giusto = nuovoSegretoStanza();
    registraStanzaSegreto('r1', { verificatore_accesso: await verificatoreDa(giusto) });
    await imparaSegretoStanza('r1', nuovoSegretoStanza());
    expect(segretoConfermato('r1')).toBeNull();
    await imparaSegretoStanza('r1', giusto);
    expect(segretoConfermato('r1')).toBe(giusto);
  });

  it('segreto non valido ignorato', async () => {
    expect(await imparaSegretoStanza('r1', 'corto')).toBe(false);
  });

  it('tocca a noi generarlo solo in una chat privata senza verificatore', () => {
    registraStanzaSegreto('p', { is_corporate: false, verificatore_accesso: null });
    registraStanzaSegreto('c', { is_corporate: true, verificatore_accesso: null });
    registraStanzaSegreto('v', { is_corporate: false, verificatore_accesso: 'a'.repeat(64) });
    expect([daGenerare('p'), daGenerare('c'), daGenerare('v'), daGenerare('sconosciuta')]).toEqual([true, false, false, false]);
  });

  it('primo invio: genera il segreto, registra il verificatore, usa il gettone calcolato (niente GET /room-token)', async () => {
    registraStanzaSegreto('r2', { is_corporate: false, verificatore_accesso: null });
    apiService.setRoomVerifier.mockResolvedValue({ ok: true });
    const usato = await invia('r2');
    expect(apiService.getRoomToken).not.toHaveBeenCalled();
    const [, verificatore] = apiService.setRoomVerifier.mock.calls[0];
    expect(createHash('sha256').update(usato, 'utf8').digest('hex')).toBe(verificatore);
    expect(segretoConfermato('r2')).toBeTruthy();
  });

  it('verificatore gia\u0027 impostato da un altro membro: gettone di sempre, niente altri tentativi', async () => {
    registraStanzaSegreto('r3', { is_corporate: false, verificatore_accesso: null });
    apiService.setRoomVerifier.mockRejectedValue(Object.assign(new Error('occupato'), { status: 409 }));
    expect(await invia('r3')).toBe('GETTONE_DI_SEMPRE');
    expect(await invia('r3')).toBe('GETTONE_DI_SEMPRE');
    expect(apiService.setRoomVerifier).toHaveBeenCalledTimes(1);
  });

  it('segreto gia\u0027 confermato: gettone calcolato senza nessuna richiesta', async () => {
    const segreto = nuovoSegretoStanza();
    registraStanzaSegreto('r4', { verificatore_accesso: await verificatoreDa(segreto) });
    await imparaSegretoStanza('r4', segreto);
    await aspetta();
    expect(await invia('r4')).toBe(await gettoneDa(segreto));
    expect(apiService.getRoomToken).not.toHaveBeenCalled();
    expect(apiService.setRoomVerifier).not.toHaveBeenCalled();
  });

  it('stanza sconosciuta (come nei test di sempre): il gettone di sempre', async () => {
    expect(await invia('ignota')).toBe('GETTONE_DI_SEMPRE');
    expect(apiService.setRoomVerifier).not.toHaveBeenCalled();
  });

  it('olmService, App e apiService usano il segreto', () => {
    const olm = readFileSync('src/olmService.js', 'utf8');
    expect(olm.split('...(normalizedRoomKey.room_secret ? { room_secret: normalizedRoomKey.room_secret } : {}),').length - 1).toBe(2);
    expect(olm).toContain('room_secret: roomKeyContent.room_secret ?? null');
    const app = readFileSync('src/App.jsx', 'utf8');
    for (const pezzo of ['segretoDaCondividere(normalizedRoom)', 'imparaSegretoStanza(roomKeyContent.room_id', 'impostaUtenteSegreti(currentUsername)', 'dimenticaSegreti();']) expect(app).toContain(pezzo);
    const api = readFileSync('src/apiService.js', 'utf8');
    expect(api).toContain('registraStanzaSegreto(id, room)');
    expect(api).toContain('export const setRoomVerifier');
  });
});
