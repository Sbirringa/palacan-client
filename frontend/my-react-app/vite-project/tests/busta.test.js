// tests/busta.test.js
//
// METADATI A2.1: chiave busta (X25519) con privata non esportabile, pubblicata una volta per sessione.
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import { bustaSupportata, bustaPubblica, chiavePrivataBusta, pubblicaBustaSeServe, _usaArchivio } from '../src/utils/busta';

let dati;
function archivioInMemoria() {
  dati = new Map();
  return (utente) => ({
    leggi: async (k) => dati.get(`${utente}:${k}`),
    scrivi: async (k, v) => { dati.set(`${utente}:${k}`, v); },
  });
}

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

describe('chiave busta (metadati A2.1)', () => {
  beforeEach(() => _usaArchivio(archivioInMemoria()));

  it('X25519 disponibile', async () => {
    expect(await bustaSupportata()).toBe(true);
  });

  it('chiave pubblica di 32 byte, stabile per lo stesso utente', async () => {
    const a = await bustaPubblica('alice');
    expect(atob(a).length).toBe(32);
    expect(await bustaPubblica('alice')).toBe(a);
  });

  it('riletta dall\u0027archivio dopo un riavvio dell\u0027app', async () => {
    const prima = await bustaPubblica('alice');
    const fabbrica = archivioInMemoria;
    const conservati = dati;
    _usaArchivio((utente) => ({ leggi: async (k) => conservati.get(`${utente}:${k}`), scrivi: async (k, v) => { conservati.set(`${utente}:${k}`, v); } }));
    expect(await bustaPubblica('alice')).toBe(prima);
    expect(fabbrica).toBeTruthy();
  });

  it('utenti diversi, buste diverse', async () => {
    expect(await bustaPubblica('alice')).not.toBe(await bustaPubblica('bob'));
  });

  it('la chiave privata non si puo\u0300 esportare', async () => {
    const privata = await chiavePrivataBusta('alice');
    await expect(crypto.subtle.exportKey('pkcs8', privata)).rejects.toBeTruthy();
  });

  it('due buste ricavano lo stesso segreto (base del sigillo A2.2)', async () => {
    const importa = async (b64) => crypto.subtle.importKey('raw', Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), { name: 'X25519' }, false, []);
    const ab = await crypto.subtle.deriveBits({ name: 'X25519', public: await importa(await bustaPubblica('bob')) }, await chiavePrivataBusta('alice'), 256);
    const ba = await crypto.subtle.deriveBits({ name: 'X25519', public: await importa(await bustaPubblica('alice')) }, await chiavePrivataBusta('bob'), 256);
    expect(new Uint8Array(ab)).toEqual(new Uint8Array(ba));
  });

  it('pubblicata una volta per sessione; se l\u0027invio fallisce si riprova', async () => {
    const inviate = [];
    const invia = async (k) => { inviate.push(k); };
    expect(await pubblicaBustaSeServe('alice', 't', invia)).toBe(true);
    expect(await pubblicaBustaSeServe('alice', 't', invia)).toBe(false);
    expect(inviate).toHaveLength(1);
    expect(await pubblicaBustaSeServe('bob', 't', async () => { throw new Error('rete'); })).toBe(false);
    expect(await pubblicaBustaSeServe('bob', 't', invia)).toBe(true);
  });
});
