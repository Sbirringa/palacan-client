// tests/recapito.test.js
//
// METADATI A4.4c-2: caselle di recapito nell'app.
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
import { registraCreatore } from '../src/utils/creatoriChiavi';
import {
  impostaUtenteRecapito, pubblicaImprontaSeServe, recapitoDaCondividere, imparaRecapito, ricordaMembri, avvisaStanza, dimenticaRecapito,
} from '../src/utils/recapito';
import { VOCI_DATI_PERSONALI } from '../src/utils/datiPersonali';

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});
const aspetta = () => new Promise((r) => setTimeout(r, 10));
const CHIAVE_BOB = 'b'.repeat(64);

describe('caselle di recapito nell\'app (metadati A4.4c-2)', () => {
  beforeEach(() => { archivio.clear(); localStorage.clear(); dimenticaRecapito(); vi.clearAllMocks(); });

  it('chiave propria: generata una volta, conservata e riusata', async () => {
    const prima = await impostaUtenteRecapito('alice');
    expect(prima).toMatch(/^[0-9a-f]{64}$/);
    dimenticaRecapito();
    expect(await impostaUtenteRecapito('alice')).toBe(prima);
    expect(recapitoDaCondividere()).toEqual({ utente: 'alice', chiave: prima });
  });

  it('al server va solo l\'impronta, una volta per sessione', async () => {
    const chiave = await impostaUtenteRecapito('alice');
    expect(await pubblicaImprontaSeServe('JWT')).toBe(true);
    expect(await pubblicaImprontaSeServe('JWT')).toBe(false);
    expect(apiService.setRecapitoImpronta).toHaveBeenCalledTimes(1);
    expect(apiService.setRecapitoImpronta.mock.calls[0][0]).toBe(createHash('sha256').update(chiave).digest('hex'));
  });

  it('chiave altrui accettata solo dal creatore verificato della chiave di stanza', async () => {
    await impostaUtenteRecapito('alice');
    registraCreatore('alice', 'sessione-bob', { utente: 'bob', verifica: 'coincide', stanza: 's1' });
    expect(imparaRecapito('sessione-bob', { utente: 'mallory', chiave: CHIAVE_BOB })).toBe(false);
    expect(imparaRecapito('sessione-bob', { utente: 'bob', chiave: 'corta' })).toBe(false);
    expect(imparaRecapito('sessione-bob', { utente: 'bob', chiave: CHIAVE_BOB })).toBe(true);
    await aspetta();
    expect(archivio.get('alice:recapito_contatti')).toEqual({ bob: CHIAVE_BOB });
  });

  it('avvisi solo agli altri membri con casella nota, al massimo uno ogni 3 secondi', async () => {
    await impostaUtenteRecapito('alice');
    registraCreatore('alice', 'sessione-bob', { utente: 'bob', verifica: 'coincide', stanza: 's1' });
    imparaRecapito('sessione-bob', { utente: 'bob', chiave: CHIAVE_BOB });
    ricordaMembri('s1', [{ username: 'alice' }, { username: 'bob' }, { username: 'carol' }], 'alice');
    expect(avvisaStanza('s1')).toBe(1);
    expect(avvisaStanza('s1')).toBe(0);
    await aspetta();
    expect(apiService.sendAvvisoRecapito).toHaveBeenCalledTimes(1);
    expect(apiService.sendAvvisoRecapito).toHaveBeenCalledWith('bob', CHIAVE_BOB);
  });

  it('senza utente o senza membri noti: nessun avviso', async () => {
    expect(avvisaStanza('s1')).toBe(0);
    await impostaUtenteRecapito('alice');
    expect(avvisaStanza('sconosciuta')).toBe(0);
  });

  it('chiave propria e chiavi imparate entrano nel backup cifrato', () => {
    expect(VOCI_DATI_PERSONALI).toEqual(expect.arrayContaining(['recapito_mia', 'recapito_contatti']));
  });

  it('olmService, App e invioAnonimo collegati', () => {
    const olm = readFileSync('src/olmService.js', 'utf8');
    expect(olm.split('...(normalizedRoomKey.recapito ? { recapito: normalizedRoomKey.recapito } : {}),').length - 1).toBe(2);
    const app = readFileSync('src/App.jsx', 'utf8');
    for (const pezzo of ['recapitoDaCondividere(', 'imparaRecapito(roomKeyContent.session_id', 'impostaUtenteRecapito(currentUsername)', 'dimenticaRecapito();', 'ricordaMembri(normalizedRoom, users, username)']) expect(app).toContain(pezzo);
    const invio = readFileSync('src/utils/invioAnonimo.js', 'utf8');
    expect(invio.split('avvisaStanza(roomId);').length - 1).toBe(2);
  });
});
