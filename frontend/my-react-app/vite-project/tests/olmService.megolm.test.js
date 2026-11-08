// tests/olmService.megolm.test.js
//
// Test reali (Olm vera) sulle sessioni di gruppo Megolm - usate per i
// messaggi di stanza (non 1:1). Include un test di REGRESSIONE
// permanente per il bug storico "primi messaggi Megolm persi" (vedi
// changelog in testa a olmService.js e memoria del progetto): la
// chiave di sessione avanza a ogni messaggio cifrato (forward
// secrecy voluta), quindi condividerla "dal vivo" con un peer che si
// unisce dopo alcuni messaggi gli farebbe perdere per sempre quelli
// precedenti. Il fix cattura uno SNAPSHOT al momento della creazione
// della sessione (ratchet zero) e lo riusa sempre, invece di
// richiedere la chiave corrente ogni volta.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  initOlm,
  getOrCreateOutboundGroupSession,
  createRoomKeyEventContent,
  receiveRoomKeyEvent,
  encryptGroupMessage,
  decryptGroupMessage,
} from '../src/olmService.js';

beforeEach(async () => {
  localStorage.clear();
  await initOlm();
});

describe('Sessione di gruppo Megolm - andata e ritorno base', () => {
  it('Alice cifra un messaggio di gruppo, Bob lo decifra correttamente', () => {
    const roomId = 'stanza_test_1';
    const sessioneAlice = getOrCreateOutboundGroupSession('alice_megolm', roomId);
    const roomKeyContent = createRoomKeyEventContent(roomId, sessioneAlice, 'alice_megolm');

    const inboundSessionsBob = {};
    const sessioneBob = receiveRoomKeyEvent({
      username: 'bob_megolm',
      roomKeyContent,
      inboundGroupSessions: inboundSessionsBob,
    });

    const testoOriginale = 'Messaggio di gruppo per tutti!';
    const cifrato = encryptGroupMessage(sessioneAlice, testoOriginale);
    const risultato = decryptGroupMessage(sessioneBob, cifrato);

    expect(risultato.plaintext).toBe(testoOriginale);
  });

  it('getOrCreateOutboundGroupSession è idempotente - la seconda chiamata riusa la stessa sessione', () => {
    const roomId = 'stanza_test_2';
    const primaSessione = getOrCreateOutboundGroupSession('alice_megolm', roomId);
    const secondaSessione = getOrCreateOutboundGroupSession('alice_megolm', roomId);

    expect(secondaSessione.session_id()).toBe(primaSessione.session_id());
  });
});

describe('REGRESSIONE PERMANENTE — bug storico "primi messaggi Megolm persi"', () => {
  it('Bob riceve la room key DOPO che Alice ha già cifrato dei messaggi, e li decifra TUTTI, compreso il primo', () => {
    const roomId = 'stanza_test_regressione';
    const sessioneAlice = getOrCreateOutboundGroupSession('alice_regressione', roomId);

    // Alice cifra messaggi PRIMA di condividere la chiave con Bob -
    // esattamente lo scenario del bug storico (nuovo membro che si
    // unisce dopo che la conversazione e' gia' iniziata, o un ritardo
    // nella consegna del to-device event).
    const primoMessaggio = encryptGroupMessage(sessioneAlice, 'Messaggio 1 - prima della condivisione');
    const secondoMessaggio = encryptGroupMessage(sessioneAlice, 'Messaggio 2 - ratchet già avanzato');

    // SOLO ORA Alice condivide la chiave - createRoomKeyEventContent
    // deve restituire lo SNAPSHOT iniziale (ratchet zero), non quella
    // corrente (gia' avanzata di 2 posizioni).
    const roomKeyContent = createRoomKeyEventContent(roomId, sessioneAlice, 'alice_regressione');

    const inboundSessionsBob = {};
    const sessioneBob = receiveRoomKeyEvent({
      username: 'bob_regressione',
      roomKeyContent,
      inboundGroupSessions: inboundSessionsBob,
    });

    // Il punto centrale del test: Bob DEVE riuscire a decifrare
    // ENTRAMBI i messaggi, incluso il primo - se questo fallisse,
    // il bug storico sarebbe tornato.
    const decifrato1 = decryptGroupMessage(sessioneBob, primoMessaggio);
    const decifrato2 = decryptGroupMessage(sessioneBob, secondoMessaggio);

    expect(decifrato1.plaintext).toBe('Messaggio 1 - prima della condivisione');
    expect(decifrato2.plaintext).toBe('Messaggio 2 - ratchet già avanzato');
  });

  it('messaggi cifrati DOPO la condivisione della chiave continuano a funzionare normalmente', () => {
    const roomId = 'stanza_test_dopo_condivisione';
    const sessioneAlice = getOrCreateOutboundGroupSession('alice_dopo', roomId);
    const roomKeyContent = createRoomKeyEventContent(roomId, sessioneAlice, 'alice_dopo');

    const inboundSessionsBob = {};
    const sessioneBob = receiveRoomKeyEvent({
      username: 'bob_dopo',
      roomKeyContent,
      inboundGroupSessions: inboundSessionsBob,
    });

    // Ora Alice cifra DOPO che Bob ha gia' la chiave - il caso normale.
    const messaggio = encryptGroupMessage(sessioneAlice, 'Messaggio normale dopo la condivisione');
    const risultato = decryptGroupMessage(sessioneBob, messaggio);

    expect(risultato.plaintext).toBe('Messaggio normale dopo la condivisione');
  });
});