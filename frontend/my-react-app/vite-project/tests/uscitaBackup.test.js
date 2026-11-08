// tests/uscitaBackup.test.js  [palacan-n1]
//
// All'uscita il backup forzato porta sul server anche i dati personali (nomi dei gruppi, segreti di stanza), che
// legge dalla cronologia del dispositivo: quindi la cronologia si cancella DOPO il backup, non prima.
// Prima si cancellava prima: il backup sul server perdeva nomi e segreti e al recupero il gruppo diventava
// "Conversation".
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { salvaDato, cancellaCronologia, _usaArchivio } from '../src/utils/cronologiaLocale';
import { esportaDatiPersonali } from '../src/utils/datiPersonali';

function corpoPerformLogout() {
  const app = readFileSync('src/App.jsx', 'utf8').replace(/\r\n/g, '\n');
  const inizio = app.indexOf('const performLogout = useCallback(');
  expect(inizio).toBeGreaterThan(-1);
  const fine = app.indexOf('window.location.href', inizio);
  return app.slice(inizio, fine);
}

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

describe('uscita: backup forzato prima di cancellare la cronologia', () => {
  beforeEach(() => _usaArchivio(archivioInMemoria()));

  it('il motivo: dopo la cancellazione i dati personali sono vuoti, prima ci sono', async () => {
    await salvaDato('alice', 'nomi_stanze', { g1: { nome: 'calcio', ordine: 1 } });
    const prima = await esportaDatiPersonali('alice');
    expect(prima.nomi_stanze).toEqual({ g1: { nome: 'calcio', ordine: 1 } });
    await cancellaCronologia('alice');
    const dopo = await esportaDatiPersonali('alice');
    expect(dopo.nomi_stanze).toBeUndefined();
  });

  it('App: in performLogout la cronologia si cancella dopo il caricamento del backup, aspettando che finisca', () => {
    const corpo = corpoPerformLogout();
    // [palacan-n6] il backup all'uscita passa per caricaBackupUnito (unito al server, dati personali compresi)
    const backup = corpo.indexOf('await caricaBackupUnito({ username, token: tokenToFlush,');
    const cancella = corpo.indexOf('if (username) await cancellaCronologia(username);');
    expect(corpo).toContain('esportaDati: esportaDatiPersonali');
    expect(backup).toBeGreaterThan(-1);
    expect(cancella).toBeGreaterThan(backup);
    const chiamate = corpo.split('\n').filter((r) => !r.trim().startsWith('//') && r.includes('cancellaCronologia('));
    expect(chiamate).toHaveLength(1);
  });
});
