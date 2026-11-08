// tests/chiaveBackup.test.js  [palacan-n4] [palacan-n3b]
//
// Il backup continua dopo un ricaricamento della pagina: la chiave del backup (ricavata dalla passphrase con
// Argon2id, non esportabile) si conserva sul dispositivo e si cancella con la cronologia all'uscita.
// Crittografia vera (Argon2id + AES-GCM), archivio del dispositivo in memoria al posto di IndexedDB.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { _usaArchivio, cancellaCronologia } from '../src/utils/cronologiaLocale';
import { ricordaChiaveBackup, chiaveBackupSalvata } from '../src/utils/chiaveBackup';
import { preparaChiaveBackup, encryptBackupBundle, decryptBackupBundle } from '../src/olmService';

vi.setConfig({ testTimeout: 60000 });  // Argon2id e' lento apposta

const PASSPHRASE = 'frase di prova lunga abbastanza';
const BUNDLE = { version: 1, username: 'alice', account: 'pickle', datiPersonali: { v: 1 } };

function archivioPerUtente() {
  const utenti = new Map();
  return (u) => {
    if (!utenti.has(u)) utenti.set(u, { stanze: new Map(), chiavi: new Map() });
    const d = utenti.get(u);
    return {
      leggi: async (s, k) => d[s].get(k),
      scrivi: async (s, k, v) => { d[s].set(k, v); },
      cancella: async () => { utenti.delete(u); return true; },
    };
  };
}

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

describe('chiave del backup preparata dalla passphrase', () => {
  it('non si può esportare; il backup cifrato con lei si apre con la passphrase, come sempre', async () => {
    const pronta = await preparaChiaveBackup(PASSPHRASE);
    await expect(crypto.subtle.exportKey('raw', pronta.chiave)).rejects.toBeTruthy();
    const payload = await encryptBackupBundle(BUNDLE, pronta);
    expect(payload.salt).toBe(pronta.salt);
    expect(payload.kdf_iterations).toBe(pronta.kdf_iterations);
    expect(await decryptBackupBundle(payload, PASSPHRASE)).toEqual(BUNDLE);
    await expect(decryptBackupBundle(payload, 'una passphrase diversa e sbagliata')).rejects.toThrow();
  });

  it('con la passphrase in chiaro tutto resta come prima', async () => {
    const payload = await encryptBackupBundle(BUNDLE, PASSPHRASE);
    expect(await decryptBackupBundle(payload, PASSPHRASE)).toEqual(BUNDLE);
    await expect(encryptBackupBundle(BUNDLE, 'corta')).rejects.toThrow();
  });
});

describe('conservata sul dispositivo, cancellata all\'uscita', () => {
  beforeEach(() => _usaArchivio(archivioPerUtente()));

  it('dopo un "ricaricamento" la chiave conservata fa un backup che si apre con la passphrase', async () => {
    expect(await ricordaChiaveBackup('alice', PASSPHRASE, preparaChiaveBackup)).toBe(true);
    const salvata = await chiaveBackupSalvata('alice');
    expect(salvata).not.toBeNull();
    const payload = await encryptBackupBundle(BUNDLE, salvata);
    expect(await decryptBackupBundle(payload, PASSPHRASE)).toEqual(BUNDLE);
    expect(await chiaveBackupSalvata('bob')).toBeNull();
  });

  it('all\'uscita (cancellazione della cronologia) la chiave non c\'e\' piu\'', async () => {
    await ricordaChiaveBackup('alice', PASSPHRASE, preparaChiaveBackup);
    await cancellaCronologia('alice');
    expect(await chiaveBackupSalvata('alice')).toBeNull();
  });

  it('dati non validi: niente salvato, nessun errore', async () => {
    expect(await ricordaChiaveBackup(null, PASSPHRASE, preparaChiaveBackup)).toBe(false);
    expect(await ricordaChiaveBackup('alice', null, preparaChiaveBackup)).toBe(false);
    expect(await ricordaChiaveBackup('alice', { tipo: 'chiave-backup' }, preparaChiaveBackup)).toBe(false);
    expect(await ricordaChiaveBackup('alice', PASSPHRASE, async () => { throw new Error('x'); })).toBe(false);
    expect(await chiaveBackupSalvata('alice')).toBeNull();
  });
});

describe('App', () => {
  const app = readFileSync('src/App.jsx', 'utf8');

  it('ricava e conserva la chiave a ogni passphrase nuova o recuperata, e la rimette dopo un ricaricamento', () => {
    expect(app.split('ricordaChiaveBackup(').length - 1).toBe(8);  // [palacan-n4b] 6 punti + 2 in riattivaBackup
    expect(app.split('backupPassphraseRef.current = await chiaveBackupSalvata(usernameSalvato);').length - 1).toBe(1);
  });

  it('[palacan-n3b] session_reset anche quando la busta non porta la stanza: si usa quella aperta', () => {
    expect(app).toContain('const failedRoomId = data.room_id || data.roomId || wsRoomIdRef.current || null;');
  });
});
