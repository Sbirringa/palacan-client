// tests/secureStorage.dispositivo.test.js  [palacan-9a]
//
// Dati di accesso cifrati con la chiave del dispositivo (non piu' con VITE_STORAGE_KEY, pubblica nel codice).
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { _usaArchivio } from '../src/utils/chiaveDispositivo';
import { setSecureItem, getSecureItem, removeSecureItem, migrateLegacyPlaintextKey } from '../src/secureStorage';

function browser() {
  const dati = new Map();
  let guasto = false;
  const fabbrica = () => ({
    leggi: async (k) => { if (guasto) throw new Error('guasto'); return dati.get(k); },
    prendiOCrea: async (k, v) => { if (guasto) throw new Error('guasto'); if (!dati.has(k)) dati.set(k, v); return dati.get(k); },
  });
  return { fabbrica, guasta: (s) => { guasto = s; } };
}

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

describe('secureStorage con la chiave del dispositivo', () => {
  let b;
  beforeEach(() => { localStorage.clear(); b = browser(); _usaArchivio(b.fabbrica); });

  it('salva cifrato, rilegge dopo un ricaricamento della pagina', async () => {
    await setSecureItem('token', 'eyJ-token-vero');
    const grezzo = localStorage.getItem('token');
    expect(grezzo.startsWith('d1.')).toBe(true);
    expect(grezzo).not.toContain('eyJ-token-vero');
    _usaArchivio(b.fabbrica);
    await migrateLegacyPlaintextKey('token');
    expect(await getSecureItem('token')).toBe('eyJ-token-vero');
  });

  it('un valore spostato sotto un altro nome non si legge (e si toglie)', async () => {
    await setSecureItem('user_role', 'admin');
    localStorage.setItem('username', localStorage.getItem('user_role'));
    expect(await getSecureItem('username')).toBeNull();
    expect(localStorage.getItem('username')).toBeNull();
  });

  it('formato di prima (in chiaro o con la chiave pubblica): si toglie, si rientra con la password', async () => {
    localStorage.setItem('token', 'eyJ-in-chiaro');
    localStorage.setItem('username', 'QUJDREVGR0g=');
    await migrateLegacyPlaintextKey('token');
    await migrateLegacyPlaintextKey('username');
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('username')).toBeNull();
    localStorage.setItem('refresh_token', 'vecchio');
    expect(await getSecureItem('refresh_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });

  it('chiave momentaneamente illeggibile: null, ma il valore resta per il prossimo caricamento', async () => {
    await setSecureItem('token', 'eyJ-token');
    b.guasta(true);
    _usaArchivio(b.fabbrica);
    expect(await getSecureItem('token')).toBeNull();
    await migrateLegacyPlaintextKey('token');
    expect(localStorage.getItem('token')).not.toBeNull();
    b.guasta(false);
    _usaArchivio(b.fabbrica);
    expect(await getSecureItem('token')).toBe('eyJ-token');
  });

  it('removeSecureItem toglie il valore', async () => {
    await setSecureItem('user_id', '42');
    removeSecureItem('user_id');
    expect(await getSecureItem('user_id')).toBeNull();
  });

  it('il codice non usa più VITE_STORAGE_KEY nè una chiave di riserva scritta nel codice', () => {
    const codice = readFileSync('src/secureStorage.js', 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(codice).not.toMatch(/import\.meta\.env/);
    expect(codice).not.toMatch(/FALLBACK_SECRET/);
  });
});
