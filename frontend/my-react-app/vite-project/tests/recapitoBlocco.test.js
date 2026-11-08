// tests/recapitoBlocco.test.js
//
// METADATI A4.4c-3: cambio della chiave di recapito al blocco.
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto, createHash } from 'node:crypto';

const archivio = new Map();
vi.mock('../src/utils/cronologiaLocale', () => ({
  salvaDato: vi.fn(async (u, n, v) => { archivio.set(`${u}:${n}`, JSON.parse(JSON.stringify(v))); return true; }),
  leggiDato: vi.fn(async (u, n) => archivio.get(`${u}:${n}`) ?? null),
}));
vi.mock('../src/apiService', () => ({ setRecapitoImpronta: vi.fn(async () => ({ ok: true })), sendAvvisoRecapito: vi.fn(async () => true) }));
import * as apiService from '../src/apiService';
import {
  impostaUtenteRecapito, recapitoDaCondividere, recapitoDaRinnovare, ruotaRecapito, segnaSbloccato, dimenticaRecapito,
} from '../src/utils/recapito';

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});
const chat = (...nomi) => nomi.map((username) => ({ username }));

describe('chiave di recapito al blocco (metadati A4.4c-3)', () => {
  beforeEach(() => { archivio.clear(); dimenticaRecapito(); vi.clearAllMocks(); });

  it('al blocco la chiave cambia e il server riceve la nuova impronta', async () => {
    const vecchia = await impostaUtenteRecapito('alice');
    expect(await ruotaRecapito('JWT', { id: 'id-molesto', username: 'Molesto' })).toBe(true);
    const nuova = recapitoDaCondividere(chat('bob')).chiave;
    expect(nuova).not.toBe(vecchia);
    expect(apiService.setRecapitoImpronta).toHaveBeenLastCalledWith(createHash('sha256').update(nuova).digest('hex'), 'JWT');
  });

  it('la chiave non viaggia mai in una chat in cui c\'e\' un bloccato', async () => {
    await impostaUtenteRecapito('alice');
    await ruotaRecapito('JWT', { id: 'id-molesto', username: 'molesto' });
    expect(recapitoDaCondividere(chat('molesto'))).toBeNull();
    expect(recapitoDaCondividere(chat('bob', 'molesto'))).toBeNull();
    expect(recapitoDaCondividere(chat('bob'))).not.toBeNull();
  });

  it('dopo il cambio la chiave di stanza delle altre chat si rinnova una volta sola', async () => {
    await impostaUtenteRecapito('alice');
    expect(recapitoDaRinnovare('s1', chat('bob'))).toBe(false);
    await ruotaRecapito('JWT', { id: 'id-molesto', username: 'molesto' });
    expect(recapitoDaRinnovare('s1', chat('bob'))).toBe(true);
    expect(recapitoDaRinnovare('s1', chat('bob'))).toBe(false);
    expect(recapitoDaRinnovare('diretta', chat('molesto'))).toBe(false);
  });

  it('dopo un riavvio: chiave, generazione e chat gia\' rinnovate restano', async () => {
    await impostaUtenteRecapito('alice');
    await ruotaRecapito('JWT', { id: 'id-molesto', username: 'molesto' });
    recapitoDaRinnovare('s1', chat('bob'));
    const chiave = recapitoDaCondividere(chat('bob')).chiave;
    await new Promise((r) => setTimeout(r, 10));
    dimenticaRecapito();
    await impostaUtenteRecapito('alice');
    expect(recapitoDaCondividere(chat('bob')).chiave).toBe(chiave);
    expect(recapitoDaRinnovare('s1', chat('bob'))).toBe(false);
    expect(recapitoDaRinnovare('s2', chat('carol'))).toBe(true);
  });

  it('bloccati caricati dalla copia cifrata sul dispositivo; lo sblocco li toglie', async () => {
    archivio.set('alice:specchio_bloccati', { aggiornato: 'x', dati: [{ id: 'id-molesto', username: 'molesto' }] });
    await impostaUtenteRecapito('alice');
    expect(recapitoDaCondividere(chat('molesto'))).toBeNull();
    segnaSbloccato('id-molesto');
    expect(recapitoDaCondividere(chat('molesto'))).not.toBeNull();
  });

  it('App e Dashboard collegati', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).toContain('recapitoDaCondividere(peers)');
    expect(app).toContain('if (recapitoDaRinnovare(normalizedRoom, peers))');
    const dash = readFileSync('src/pages/Dashboard.jsx', 'utf8');
    expect(dash).toContain('ruotaRecapito(authToken, callTargetUser).catch(() => {});');
    expect(dash.split('segnaSbloccato(').length - 1).toBe(2);
  });
});
