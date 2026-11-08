// tests/olmService.chiaveDispositivo.test.js  [palacan-9a]
//
// olmService con la chiave del dispositivo (Olm vero, archivio in memoria al posto di IndexedDB):
// dati salvati prima della 9a letti e riscritti, backup nel formato di sempre, recupero su un altro browser.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import Olm from '../src/crypto/olm.js';

vi.mock('../src/apiService', () => ({ API_URL: 'http://prova.invalid' }));
import { _usaArchivio, statoChiaveDispositivo } from '../src/utils/chiaveDispositivo';
import {
  initOlm, saveOlmAccount, loadOlmAccount, saveSessions, loadSessions, saveInboundGroupSessions,
  loadInboundGroupSessions, saveOutboundGroupSession, loadOutboundGroupSession, buildBackupBundlePayload,
  restoreBackupBundleToLocalStorage,
} from '../src/olmService';

const memoria = new Map();
beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  localStorage.clear();
  _usaArchivio(() => ({
    leggi: async (k) => memoria.get(k),
    prendiOCrea: async (k, v) => { if (!memoria.has(k)) memoria.set(k, v); return memoria.get(k); },
  }));
  await initOlm();
});

function nuovoAccount() {
  const a = new Olm.Account();
  a.create();
  return a;
}

describe('olmService con la chiave del dispositivo', () => {
  beforeEach(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('olm_') || k.startsWith('megolm_')) localStorage.removeItem(k);
  });

  it('Olm parte solo dopo aver preparato la chiave del dispositivo', () => {
    expect(statoChiaveDispositivo()).toBe('dispositivo');
  });

  it('account: il backup è nel formato di sempre, diverso da come si salva sul dispositivo', () => {
    const a = nuovoAccount();
    saveOlmAccount('alice9a', a);
    const salvato = localStorage.getItem('olm_account_alice9a');
    const bundle = buildBackupBundlePayload('alice9a');
    expect(bundle.account).toBeTruthy();
    expect(bundle.account).not.toBe(salvato);
  });

  it('account salvato prima della 9a: si legge e si riscrive con la chiave del dispositivo', () => {
    const a = nuovoAccount();
    const identita = a.identity_keys();
    saveOlmAccount('alice9b', a);
    const formatoVecchio = buildBackupBundlePayload('alice9b').account; // = come lo salvava l'app prima
    localStorage.setItem('olm_account_bob9b', formatoVecchio);
    const letto = loadOlmAccount('bob9b');
    expect(letto.identity_keys()).toBe(identita);
    const riscritto = localStorage.getItem('olm_account_bob9b');
    expect(riscritto).not.toBe(formatoVecchio);
    expect(loadOlmAccount('bob9b').identity_keys()).toBe(identita);
  });

  it('recupero dal backup: account e Megolm tornano leggibili, le sessioni 1:1 no (come prima)', () => {
    const a = nuovoAccount();
    const identita = a.identity_keys();
    saveOlmAccount('carol9', a);
    const uscita = new Olm.OutboundGroupSession();
    uscita.create();
    const entrata = new Olm.InboundGroupSession();
    entrata.create(uscita.session_key());
    saveInboundGroupSessions('carol9', { [entrata.session_id()]: entrata });
    const b = nuovoAccount();
    b.generate_one_time_keys(1);
    const otk = Object.values(JSON.parse(b.one_time_keys()).curve25519)[0];
    const s = new Olm.Session();
    s.create_outbound(a, JSON.parse(b.identity_keys()).curve25519, otk);
    saveSessions('carol9', { dave: s });

    const bundle = buildBackupBundlePayload('carol9');
    bundle.username = 'carol9bis';
    restoreBackupBundleToLocalStorage(bundle);
    expect(loadOlmAccount('carol9bis').identity_keys()).toBe(identita);
    const ripristinate = loadInboundGroupSessions('carol9bis');
    const cifrato = uscita.encrypt('messaggio vecchio');
    expect(ripristinate[entrata.session_id()].decrypt(cifrato).plaintext).toBe('messaggio vecchio');
    expect(localStorage.getItem('olm_sessions_carol9bis')).toBeNull();
  });

  it('sessioni 1:1 e Megolm salvate prima della 9a: lette e riscritte', () => {
    const a = nuovoAccount();
    const b = nuovoAccount();
    b.generate_one_time_keys(1);
    const otk = Object.values(JSON.parse(b.one_time_keys()).curve25519)[0];
    const s = new Olm.Session();
    s.create_outbound(a, JSON.parse(b.identity_keys()).curve25519, otk);
    const uscita = new Olm.OutboundGroupSession();
    uscita.create();
    const entrata = new Olm.InboundGroupSession();
    entrata.create(uscita.session_key());
    saveOlmAccount('erin9', a);
    saveSessions('erin9', { frank: s });
    saveInboundGroupSessions('erin9', { [entrata.session_id()]: entrata });
    const vecchio = buildBackupBundlePayload('erin9');
    localStorage.setItem('olm_sessions_gina9', vecchio.sessions);
    localStorage.setItem('megolm_inbound_gina9', vecchio.inboundGroupSessions);

    const sessioni = loadSessions('gina9');
    expect(sessioni.frank.session_id()).toBe(s.session_id());
    expect(localStorage.getItem('olm_sessions_gina9')).not.toBe(vecchio.sessions);
    expect(loadSessions('gina9').frank.session_id()).toBe(s.session_id());
    const megolm = loadInboundGroupSessions('gina9');
    expect(megolm[entrata.session_id()]).toBeTruthy();
    expect(localStorage.getItem('megolm_inbound_gina9')).not.toBe(vecchio.inboundGroupSessions);
    expect(Object.keys(loadInboundGroupSessions('gina9'))).toEqual([entrata.session_id()]);
  });

  it('sessione Megolm in uscita: andata e ritorno', () => {
    const uscita = new Olm.OutboundGroupSession();
    uscita.create();
    saveOutboundGroupSession('hal9', 'stanza-1', uscita);
    expect(loadOutboundGroupSession('hal9', 'stanza-1').session_id()).toBe(uscita.session_id());
  });

  it('backup con dati non validi: si scrivono com\'erano (come prima), le sessioni 1:1 mai', () => {
    restoreBackupBundleToLocalStorage({ username: 'lia9', account: 'finto', sessions: 'sessioni_finte', inboundGroupSessions: 'gruppi_finti' });
    expect(localStorage.getItem('olm_account_lia9')).toBe('finto');
    expect(localStorage.getItem('megolm_inbound_lia9')).toBe('gruppi_finti');
    expect(Object.keys(localStorage).some((k) => localStorage.getItem(k) === 'sessioni_finte')).toBe(false);
    expect(loadOlmAccount('lia9')).toBeNull();
  });

  it('dati rovinati: si tolgono come prima', () => {
    localStorage.setItem('olm_account_ivo9', 'rovinato');
    expect(loadOlmAccount('ivo9')).toBeNull();
    expect(localStorage.getItem('olm_account_ivo9')).toBeNull();
  });

  it('nel codice nessun pickle usa più la chiave pubblica direttamente', () => {
    const codice = readFileSync('src/olmService.js', 'utf8').split(/\r?\n/).filter((r) => !/^\s*\/\//.test(r)).join('\n');
    expect(codice).not.toMatch(/\bPICKLE_KEY\b/);
    expect(codice).not.toMatch(/\.(un)?pickle\(\s*CHIAVE_PICKLE_VECCHIA/);
    expect(codice).toMatch(/preparaChiaveDispositivo\(\)/);
  });
});
