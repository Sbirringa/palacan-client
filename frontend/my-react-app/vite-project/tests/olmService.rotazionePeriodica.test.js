// tests/olmService.rotazionePeriodica.test.js
//
// Rotazione periodica Megolm per eta' (7 giorni) - completa il
// meccanismo esistente basato solo su cambio di composizione del
// gruppo (ensureRoomKeyShared in App.jsx). Verificato con Olm vero,
// non finto.
import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import * as olmService from '../src/olmService.js';

beforeAll(async () => {
  await olmService.initOlm();
});

beforeEach(() => {
  localStorage.clear();
});

describe('shouldRotateOutboundSessionByAge', () => {
  it('senza nessuna sessione di invio esistente, restituisce false (nulla da ruotare)', () => {
    const username = 'alice_rotazione_nessuna_sessione';
    const risultato = olmService.shouldRotateOutboundSessionByAge(username, 'stanza1', 1000);
    expect(risultato).toBe(false);
  });

  it('una sessione appena creata NON viene mai segnata per la rotazione', () => {
    const username = 'alice_rotazione_appena_creata';
    olmService.createOlmAccount(username);
    olmService.getOrCreateOutboundGroupSession(username, 'stanza1');

    const risultato = olmService.shouldRotateOutboundSessionByAge(username, 'stanza1', 7 * 24 * 60 * 60 * 1000);
    expect(risultato).toBe(false);
  });

  it('una sessione più vecchia della soglia VIENE segnata per la rotazione', () => {
    const username = 'alice_rotazione_vecchia';
    olmService.createOlmAccount(username);
    olmService.getOrCreateOutboundGroupSession(username, 'stanza1');

    // Simuliamo il passare del tempo avanzando l'orologio finto DOPO
    // che la sessione e' stata creata (la marca temporale e' gia'
    // stata salvata con Date.now() vero al momento della creazione).
    vi.useFakeTimers();
    vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000); // 8 giorni avanti

    const risultato = olmService.shouldRotateOutboundSessionByAge(username, 'stanza1', 7 * 24 * 60 * 60 * 1000);
    expect(risultato).toBe(true);

    vi.useRealTimers();
  });

  it('una sessione creata PRIMA di questo fix (senza marca temporale salvata) ora va cambiata (L3a: prima restava attiva per sempre)', () => {
    const username = 'alice_rotazione_senza_marca_temporale';
    olmService.createOlmAccount(username);
    const session = olmService.getOrCreateOutboundGroupSession(username, 'stanza1');

    // Simuliamo una sessione "vecchio stile": rimuoviamo la marca
    // temporale dallo snapshot salvato, come se fosse stata creata
    // prima che questo fix esistesse.
    const chiaveSnapshot = `palacan_initial_room_key_snapshot_${username}`;
    const snapshot = JSON.parse(localStorage.getItem(chiaveSnapshot));
    delete snapshot[session.session_id()].created_at;
    localStorage.setItem(chiaveSnapshot, JSON.stringify(snapshot));

    const risultato = olmService.shouldRotateOutboundSessionByAge(username, 'stanza1', 1); // soglia minima, quasi tutto scadrebbe
    expect(risultato).toBe(true);  // [palacan-l3a] sessione senza data di creazione: si cambia
  });

  it('dopo la rotazione (clearOutboundGroupSession + una nuova sessione), la nuova sessione NON è più segnata per la rotazione', () => {
    const username = 'alice_rotazione_ciclo_completo';
    olmService.createOlmAccount(username);
    olmService.getOrCreateOutboundGroupSession(username, 'stanza1');

    vi.useFakeTimers();
    vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);

    const sogliaSetteGiorni = 7 * 24 * 60 * 60 * 1000;
    expect(olmService.shouldRotateOutboundSessionByAge(username, 'stanza1', sogliaSetteGiorni)).toBe(true);

    // Simula la rotazione vera (stesso meccanismo di App.jsx)
    olmService.clearOutboundGroupSession(username, 'stanza1');
    olmService.getOrCreateOutboundGroupSession(username, 'stanza1');

    expect(olmService.shouldRotateOutboundSessionByAge(username, 'stanza1', sogliaSetteGiorni)).toBe(false);

    vi.useRealTimers();
  });
});