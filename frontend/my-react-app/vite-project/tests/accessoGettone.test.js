// tests/accessoGettone.test.js
//
// METADATI A4.4b: cronologia e WebSocket con il gettone di stanza.
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

vi.mock('../src/utils/cronologiaLocale', () => ({ salvaDato: vi.fn(async () => true), leggiDato: vi.fn(async () => null) }));
import { confermaSegreto, nuovoSegretoStanza, gettoneDa, gettoneInMemoria, dimenticaSegreti } from '../src/utils/segretiStanze';
import { getRoomMessages } from '../src/apiService';

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

const aspetta = () => new Promise((r) => setTimeout(r, 20));
function rispostaFinta(corpo, ok = true) {
  return { ok, status: ok ? 200 : 403, headers: { get: () => 'application/json' }, json: async () => corpo, text: async () => JSON.stringify(corpo) };
}

describe('cronologia e WebSocket con il gettone (metadati A4.4b)', () => {
  beforeEach(() => { dimenticaSegreti(); vi.unstubAllGlobals(); });

  it('gettone in memoria: la prima volta si prepara, poi e\u0027 pronto e uguale a quello calcolato', async () => {
    const segreto = nuovoSegretoStanza();
    confermaSegreto('s1', segreto, 'v'.repeat(64));
    expect(gettoneInMemoria('s1')).toBeNull();
    await aspetta();
    expect(gettoneInMemoria('s1')).toBe(await gettoneDa(segreto));
  });

  it('chat senza segreto: nessun gettone', () => {
    expect(gettoneInMemoria('sconosciuta')).toBeNull();
  });

  it('chat con segreto: la cronologia viene da /storia con il gettone, senza accesso utente', async () => {
    const segreto = nuovoSegretoStanza();
    confermaSegreto('s2', segreto, 'v'.repeat(64));
    const chiamate = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opzioni = {}) => { chiamate.push({ url: String(url), opzioni }); return rispostaFinta([{ id: 'm1' }]); }));
    await getRoomMessages('s2', 'JWT');
    expect(chiamate).toHaveLength(1);
    expect(chiamate[0].url).toContain('/rooms/s2/storia');
    expect(chiamate[0].opzioni.headers['X-Palacan-Room-Token']).toBe(await gettoneDa(segreto));
    expect(JSON.stringify(chiamate[0].opzioni.headers)).not.toContain('JWT');
  });

  it('se /storia non risponde bene, la cronologia arriva da /messages come prima', async () => {
    confermaSegreto('s3', nuovoSegretoStanza(), 'v'.repeat(64));
    const chiamate = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      chiamate.push(String(url));
      return String(url).includes('/storia') ? rispostaFinta({ detail: 'no' }, false) : rispostaFinta([{ id: 'm2' }]);
    }));
    await getRoomMessages('s3', 'JWT');
    expect(chiamate.some((u) => u.includes('/storia'))).toBe(true);
    expect(chiamate.some((u) => u.includes('/rooms/s3/messages'))).toBe(true);
  });

  it('wsClient aggiunge il gettone solo se c\u0027e\u0027; App lo prepara prima della connessione', () => {
    const ws = readFileSync('src/wsClient.js', 'utf8');
    expect(ws).toContain("gettoneStanza ? { type: 'auth', token, gettone_stanza: gettoneStanza } : { type: 'auth', token }");
    expect(readFileSync('src/App.jsx', 'utf8')).toContain('gettoneInMemoria(roomId);');
  });
});
