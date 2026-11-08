// tests/sessioneRicevuta.test.js
//
// Correzione: per mandare a una persona si usa la sessione su cui si e' decifrato il suo ultimo messaggio.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { ricordaSessioneRicevuta, sessioneDaUsare } from '../src/olmService';

const sessione = (id) => ({ session_id: () => id });

describe('sessione su cui si e\' decifrato l\'ultimo messaggio', () => {
  beforeEach(() => localStorage.clear());

  it('senza ricordo: la prima della lista, come prima', () => {
    const lista = [sessione('vecchia'), sessione('nuova')];
    expect(sessioneDaUsare('hola', 'gigi', lista).session_id()).toBe('vecchia');
  });

  it('dopo aver decifrato sulla sessione nuova: si risponde su quella', () => {
    const lista = [sessione('vecchia'), sessione('nuova')];
    expect(ricordaSessioneRicevuta('hola', 'gigi', lista[1])).toBe(true);
    expect(sessioneDaUsare('hola', 'gigi', lista).session_id()).toBe('nuova');
  });

  it('il ricordo resta dopo un ricaricamento ed e\' per persona', () => {
    ricordaSessioneRicevuta('hola', 'gigi', sessione('nuova'));
    expect(sessioneDaUsare('hola', 'gigi', [sessione('vecchia'), sessione('nuova')]).session_id()).toBe('nuova');
    expect(sessioneDaUsare('hola', 'sara', [sessione('x'), sessione('nuova')]).session_id()).toBe('x');
  });

  it('se la sessione ricordata non c\'e\' piu\' (sblocco o reset): la prima della lista; lista vuota: null', () => {
    ricordaSessioneRicevuta('hola', 'gigi', sessione('sparita'));
    expect(sessioneDaUsare('hola', 'gigi', [sessione('a'), sessione('b')]).session_id()).toBe('a');
    expect(sessioneDaUsare('hola', 'gigi', [])).toBeNull();
  });

  it('olmService: la ricezione ricorda, i due invii 1:1 usano il ricordo, il percorso per dispositivo no', () => {
    const olm = readFileSync('src/olmService.js', 'utf8');
    expect(olm.split('ricordaSessioneRicevuta(username, normalizedSender,').length - 1).toBe(2);
    expect(olm.split('sessioneDaUsare(normalizedUsername, normalizedTarget, existingList)').length - 1).toBe(2);
    expect(olm).toContain('const existingList = getAllSessionsForPeer(sessions, deviceSessionPeerKey);');
  });
});
