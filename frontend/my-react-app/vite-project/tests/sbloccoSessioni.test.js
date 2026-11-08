// tests/sbloccoSessioni.test.js
//
// Correzione: sblocco delle sessioni Olm incastrate, al massimo una volta ogni 10 minuti per persona.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { puoSbloccare, dimenticaSblocchi, PAUSA_SBLOCCO_MS } from '../src/utils/sbloccoSessioni';

describe('sblocco delle sessioni Olm incastrate', () => {
  beforeEach(() => dimenticaSblocchi());

  it('la prima volta si sblocca, poi si aspetta 10 minuti', () => {
    const t = 1_000_000;
    expect(puoSbloccare('hola2005', t)).toBe(true);
    expect(puoSbloccare('hola2005', t + 60_000)).toBe(false);
    expect(puoSbloccare('hola2005', t + PAUSA_SBLOCCO_MS - 1)).toBe(false);
    expect(puoSbloccare('hola2005', t + PAUSA_SBLOCCO_MS)).toBe(true);
  });

  it('ogni persona ha la sua attesa (maiuscole e spazi non contano)', () => {
    expect(puoSbloccare(' Hola2005 ', 0)).toBe(true);
    expect(puoSbloccare('hola2005', 1)).toBe(false);
    expect(puoSbloccare('gigi2003', 1)).toBe(true);
  });

  it('senza persona nessuno sblocco', () => {
    expect(puoSbloccare('', 0)).toBe(false);
    expect(puoSbloccare(null, 0)).toBe(false);
  });

  it('App: dopo l\'ultimo tentativo attende la conferma, poi butta la sessione e ne apre una nuova', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    const i = app.indexOf('mi fermo fino al prossimo giro');
    const dopo = app.slice(i, i + 2500);
    expect(dopo).toContain('puoSbloccare(peer.username)');
    expect(dopo).toContain('olmService.dropStaleSessionForPeer(username, peer.username, peerSessionsRef.current)');
    expect(dopo).toContain('delete roomKeySharedWithRef.current[normalizedRoom][peer.username];');
    expect(dopo).toContain('ensureRoomKeyShared(normalizedRoom)');
    // si sblocca solo se la stessa chiave di stanza non e' stata confermata nel frattempo
    expect(dopo).toContain('entry.sessionId !== sessionId || entry.confirmed ||');
  });
});
