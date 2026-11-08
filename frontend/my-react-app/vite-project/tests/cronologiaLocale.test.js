// tests/cronologiaLocale.test.js
//
// Cronologia cifrata sul dispositivo: crittografia vera (WebCrypto), archivio in memoria al posto di IndexedDB.
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import { salvaStanza, leggiStanza, cancellaCronologia, daSalvare, _usaArchivio, MAX_PER_CHAT } from '../src/utils/cronologiaLocale';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
let dati;

function archivioInMemoria() {
  dati = { stanze: new Map(), chiavi: new Map() };
  return () => ({
    leggi: async (s, k) => dati[s].get(k),
    scrivi: async (s, k, v) => { dati[s].set(k, v); },
    cancella: async () => { dati.stanze.clear(); dati.chiavi.clear(); return true; },
  });
}

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

describe('cronologia cifrata sul dispositivo', () => {
  beforeEach(() => _usaArchivio(archivioInMemoria()));

  it('salva e rilegge i messaggi della chat', async () => {
    const msgs = [{ id: U1, text: 'ciao', sender: 'alice' }, { id: U2, text: 'come va', sender: 'bob' }];
    expect(await salvaStanza('alice', 'stanza-1', msgs)).toBe(true);
    expect(await leggiStanza('alice', 'stanza-1')).toEqual(msgs);
  });

  it('sul dispositivo il testo non e\u0300 in chiaro', async () => {
    await salvaStanza('alice', 'stanza-1', [{ id: U1, text: 'segretissimo' }]);
    const record = dati.stanze.get('stanza-1');
    expect(new TextDecoder().decode(new Uint8Array(record.dati))).not.toContain('segretissimo');
  });

  it('la chiave non si puo\u0300 esportare', async () => {
    await salvaStanza('alice', 'stanza-1', [{ id: U1, text: 'x' }]);
    await expect(crypto.subtle.exportKey('raw', dati.chiavi.get('principale'))).rejects.toBeTruthy();
  });

  it('solo i messaggi confermati dal server (niente provvisori o non inviati)', () => {
    const tenuti = daSalvare([{ id: U1 }, { id: '1727000000000-0.123' }, { id: U2, failed: true }]);
    expect(tenuti.map((m) => m.id)).toEqual([U1]);
  });

  it('al massimo gli ultimi MAX_PER_CHAT messaggi', () => {
    const molti = Array.from({ length: MAX_PER_CHAT + 20 }, (_, i) => ({ id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111` }));
    const tenuti = daSalvare(molti);
    expect(tenuti).toHaveLength(MAX_PER_CHAT);
    expect(tenuti[0].id.startsWith('00000020')).toBe(true);
  });

  it('il contenuto di una chat non si puo\u0300 spacciare per un\u0027altra', async () => {
    await salvaStanza('alice', 'stanza-1', [{ id: U1, text: 'x' }]);
    dati.stanze.set('stanza-2', dati.stanze.get('stanza-1'));
    expect(await leggiStanza('alice', 'stanza-2')).toBeNull();
  });

  it('un dato alterato non si legge (e l\u0027app va avanti)', async () => {
    await salvaStanza('alice', 'stanza-1', [{ id: U1, text: 'x' }]);
    const record = dati.stanze.get('stanza-1');
    const alterato = new Uint8Array(record.dati.slice(0));
    alterato[0] ^= 1;
    dati.stanze.set('stanza-1', { ...record, dati: alterato.buffer });
    expect(await leggiStanza('alice', 'stanza-1')).toBeNull();
  });

  it('all\u0027uscita dall\u0027account la cronologia sparisce', async () => {
    await salvaStanza('alice', 'stanza-1', [{ id: U1, text: 'x' }]);
    await cancellaCronologia('alice');
    expect(await leggiStanza('alice', 'stanza-1')).toBeNull();
  });

  it('chat mai salvata: nessuna cronologia', async () => {
    expect(await leggiStanza('alice', 'mai-vista')).toBeNull();
  });
});
