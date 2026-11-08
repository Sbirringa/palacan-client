// tests/olmService.roomKeyRequest.test.js
//
// Test reali (Olm vera) su m.room_key_request/forwarded_room_key -
// il meccanismo per sincronizzare le chiavi di una stanza tra i
// PROPRI dispositivi (mai tra persone diverse - vedi memoria del
// progetto). Usa API diverse da receiveRoomKeyEvent apposta:
// export_session()/import_session() invece di session_key()/create().
//
// SCOPERTA verificata con esecuzione reale prima di scrivere questo
// test: in questa libreria, first_known_index() di una sessione
// InboundGroupSession resta sempre fissato al valore con cui e' stata
// creata/importata - NON avanza mai solo perche' si chiama decrypt()
// su messaggi successivi. Questo significa che export_session()
// esporta sempre dall'inizio della sessione, non da "dove sono
// arrivato a decifrare io ora" - comportamento CORRETTO per il caso
// d'uso reale (un nuovo dispositivo dello stesso utente deve vedere
// TUTTA la cronologia della stanza, non solo i messaggi futuri).
import { describe, it, expect, beforeEach } from 'vitest';
import Olm from '../src/crypto/olm.js';
import {
  initOlm,
  getOrCreateOutboundGroupSession,
  createRoomKeyEventContent,
  receiveRoomKeyEvent,
  exportRoomKeyForForwarding,
  receiveForwardedRoomKey,
  encryptGroupMessage,
  decryptGroupMessage,
} from '../src/olmService.js';

beforeEach(async () => {
  localStorage.clear();
  await initOlm();
});

describe('m.room_key_request — sincronizzazione chiave tra i propri dispositivi', () => {
  it('un secondo dispositivo, dopo l\'inoltro, vede TUTTA la cronologia della stanza (anche i messaggi precedenti l\'inoltro)', () => {
    const roomId = 'stanza_multidispositivo';

    // Alice (mittente reale nella stanza) crea la sessione e la condivide
    // normalmente con il Dispositivo A dell'utente "bob".
    const sessioneAlice = getOrCreateOutboundGroupSession('alice_multidispositivo', roomId);
    const roomKeyContent = createRoomKeyEventContent(roomId, sessioneAlice, 'alice_multidispositivo');

    const sessioniDispositivoA = {};
    const dispositivoA = receiveRoomKeyEvent({
      username: 'bob_dispositivo_a',
      roomKeyContent,
      inboundGroupSessions: sessioniDispositivoA,
    });

    // Alice manda 3 messaggi, il Dispositivo A li decifra tutti (normale).
    const msg1 = encryptGroupMessage(sessioneAlice, 'Messaggio 1');
    const msg2 = encryptGroupMessage(sessioneAlice, 'Messaggio 2');
    const msg3 = encryptGroupMessage(sessioneAlice, 'Messaggio 3');
    decryptGroupMessage(dispositivoA, msg1);
    decryptGroupMessage(dispositivoA, msg2);
    decryptGroupMessage(dispositivoA, msg3);

    // Ora l'utente "bob" accede da un NUOVO dispositivo (Dispositivo B) e
    // il Dispositivo A gli inoltra la chiave della stanza.
    const sessionId = dispositivoA.session_id();
    const chiaveEsportata = exportRoomKeyForForwarding(sessioniDispositivoA, sessionId);
    expect(chiaveEsportata).toBeTruthy();

    const sessioniDispositivoB = {};
    const dispositivoB = receiveForwardedRoomKey({
      username: 'bob_dispositivo_b',
      roomKeyContent: { session_id: sessionId, session_key: chiaveEsportata },
      inboundGroupSessions: sessioniDispositivoB,
    });

    // Il Dispositivo B deve vedere TUTTA la cronologia, inclusi i 3
    // messaggi precedenti l'inoltro - comportamento corretto per una
    // vera sincronizzazione multi-dispositivo dello stesso utente.
    expect(decryptGroupMessage(dispositivoB, msg1).plaintext).toBe('Messaggio 1');
    expect(decryptGroupMessage(dispositivoB, msg2).plaintext).toBe('Messaggio 2');
    expect(decryptGroupMessage(dispositivoB, msg3).plaintext).toBe('Messaggio 3');

    // E continua a funzionare anche per i messaggi futuri.
    const msg4 = encryptGroupMessage(sessioneAlice, 'Messaggio 4 - dopo l\'inoltro');
    expect(decryptGroupMessage(dispositivoB, msg4).plaintext).toBe('Messaggio 4 - dopo l\'inoltro');
  });

  it('receiveForwardedRoomKey è idempotente - se la sessione esiste già, non la ricrea', () => {
    // FIX (bug nel test, non nel codice - scoperto lanciando il test
    // vero, non assumendo): session_key() e export_session() sono
    // DUE FORMATI DIVERSI, incompatibili in entrambe le direzioni
    // (verificato: prefissi binari diversi, Ag... contro Aq...) -
    // receiveForwardedRoomKey si aspetta SEMPRE il formato di
    // export_session(), mai session_key() diretta.
    const roomId = 'stanza_idempotente';
    const sessioneAlice = getOrCreateOutboundGroupSession('alice_idempotente', roomId);
    const roomKeyContent = createRoomKeyEventContent(roomId, sessioneAlice, 'alice_idempotente');

    const sessioniDispositivoA = {};
    const dispositivoA = receiveRoomKeyEvent({
      username: 'bob_idempotente_a',
      roomKeyContent,
      inboundGroupSessions: sessioniDispositivoA,
    });

    const sessionId = dispositivoA.session_id();
    const chiaveEsportata = exportRoomKeyForForwarding(sessioniDispositivoA, sessionId);

    const sessioniEsistenti = {};
    const primaVolta = receiveForwardedRoomKey({
      username: 'bob_idempotente_b',
      roomKeyContent: { session_id: sessionId, session_key: chiaveEsportata },
      inboundGroupSessions: sessioniEsistenti,
    });

    const secondaVolta = receiveForwardedRoomKey({
      username: 'bob_idempotente_b',
      roomKeyContent: { session_id: sessionId, session_key: chiaveEsportata },
      inboundGroupSessions: sessioniEsistenti,
    });

    // Deve essere lo STESSO oggetto sessione, non uno nuovo.
    expect(secondaVolta).toBe(primaVolta);
  });

  it('exportRoomKeyForForwarding restituisce null se la sessione non esiste', () => {
    const risultato = exportRoomKeyForForwarding({}, 'session_id_inesistente');
    expect(risultato).toBeNull();
  });
});