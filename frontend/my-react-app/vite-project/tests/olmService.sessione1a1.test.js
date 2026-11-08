// tests/olmService.sessione1a1.test.js
//
// Test reale (Olm vera) dello scambio di messaggi cifrati 1:1 completo
// e bidirezionale - il cuore della crittografia dell'app. Usa le
// funzioni ESPORTATE reali encryptMessage/decryptMessage (quelle che
// l'app usa davvero), stabilendo la sessione con l'API diretta di Olm
// per evitare la dipendenza di rete di createOutboundSessionForUser
// (che chiama il backend per il key bundle) - lo scambio di chiavi in
// se' e' gia' verificato lato backend (test_concorrenza_otk_reale.py),
// qui il bersaglio e' la cifratura/decifratura vera.
import { describe, it, expect, beforeEach } from 'vitest';
import Olm from '../src/crypto/olm.js';
import {
  initOlm,
  createOlmAccount,
  generateAndGetOTKs,
  encryptMessage,
  decryptMessage,
} from '../src/olmService.js';

beforeEach(async () => {
  localStorage.clear();
  await initOlm();
});

/** Stabilisce una sessione outbound vera, come farebbe
 * createOutboundSessionForUser ma senza la chiamata di rete - usa le
 * chiavi VERE del destinatario, generate dalla stessa libreria Olm. */
function stabilisciSessioneOutbound(accountMittente, chiaveIdentitaDestinatario, otkDestinatario) {
  const sessione = new Olm.Session();
  sessione.create_outbound(accountMittente, chiaveIdentitaDestinatario, otkDestinatario);
  return sessione;
}

/** Stabilisce una sessione inbound vera dal primo messaggio ricevuto,
 * come farebbe getOrCreateInboundSession. */
function stabilisciSessioneInbound(accountDestinatario, corpoMessaggioCifrato) {
  const sessione = new Olm.Session();
  sessione.create_inbound(accountDestinatario, corpoMessaggioCifrato);
  accountDestinatario.remove_one_time_keys(sessione);
  return sessione;
}

describe('Scambio di messaggi cifrati 1:1 - andata e ritorno completo', () => {
  it('Alice cifra, Bob decifra, e il testo corrisponde ESATTAMENTE all\'originale', () => {
    const alice = createOlmAccount('alice_scambio');
    const bob = createOlmAccount('bob_scambio');

    const bobOtks = generateAndGetOTKs(bob, 'bob_scambio', 1);
    const bobOtkValue = Object.values(bobOtks)[0];
    const bobIdentityKey = JSON.parse(bob.identity_keys()).curve25519;

    const sessioneAlice = stabilisciSessioneOutbound(alice, bobIdentityKey, bobOtkValue);

    const testoOriginale = 'Ciao Bob, questo è un messaggio segreto!';
    const cifrato = encryptMessage(sessioneAlice, testoOriginale);

    const sessioneBob = stabilisciSessioneInbound(bob, cifrato.body);
    const risultato = decryptMessage(sessioneBob, cifrato.type, cifrato.body);

    expect(risultato.plaintext).toBe(testoOriginale);
  });

  it('la risposta di Bob viaggia correttamente anche nella direzione opposta', () => {
    const alice = createOlmAccount('alice_scambio2');
    const bob = createOlmAccount('bob_scambio2');

    const bobOtks = generateAndGetOTKs(bob, 'bob_scambio2', 1);
    const bobOtkValue = Object.values(bobOtks)[0];
    const bobIdentityKey = JSON.parse(bob.identity_keys()).curve25519;

    const sessioneAlice = stabilisciSessioneOutbound(alice, bobIdentityKey, bobOtkValue);
    const primoMessaggio = encryptMessage(sessioneAlice, 'primo messaggio');
    const sessioneBob = stabilisciSessioneInbound(bob, primoMessaggio.body);
    decryptMessage(sessioneBob, primoMessaggio.type, primoMessaggio.body);

    // Ora la sessione e' stabilita in entrambe le direzioni - Bob risponde.
    const testoRisposta = 'Ricevuto, Alice! Anche questo è cifrato.';
    const cifratoRisposta = encryptMessage(sessioneBob, testoRisposta);
    const risultatoRisposta = decryptMessage(sessioneAlice, cifratoRisposta.type, cifratoRisposta.body);

    expect(risultatoRisposta.plaintext).toBe(testoRisposta);
  });

  it('un messaggio cifrato per Bob NON puo essere decifrato da un terzo account estraneo', () => {
    const alice = createOlmAccount('alice_scambio3');
    const bob = createOlmAccount('bob_scambio3');
    const eve = createOlmAccount('eve_scambio3'); // account estraneo, non il destinatario vero

    const bobOtks = generateAndGetOTKs(bob, 'bob_scambio3', 1);
    const bobOtkValue = Object.values(bobOtks)[0];
    const bobIdentityKey = JSON.parse(bob.identity_keys()).curve25519;

    const sessioneAlice = stabilisciSessioneOutbound(alice, bobIdentityKey, bobOtkValue);
    const cifrato = encryptMessage(sessioneAlice, 'messaggio segreto solo per Bob');

    // Eve prova a creare una sessione inbound con la SUA identita', non quella di Bob -
    // deve fallire, perche' il messaggio pre-key e' cifrato specificamente per Bob.
    expect(() => {
      const sessioneEve = new Olm.Session();
      sessioneEve.create_inbound(eve, cifrato.body);
    }).toThrow();
  });
});