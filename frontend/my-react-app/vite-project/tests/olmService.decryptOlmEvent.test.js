// tests/olmService.decryptOlmEvent.test.js
//
// Test reali su decryptOlmEvent - il punto d'ingresso pubblico usato
// dall'app per decifrare un evento Olm in arrivo. Orchestra i pezzi
// gia' testati singolarmente (sessioni esistenti, creazione nuova
// sessione, TOFU) - qui li verifichiamo insieme, come li userebbe
// davvero l'app.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Olm from '../src/crypto/olm.js';

vi.mock('../src/apiService.js', () => ({
  getKeyBundle: vi.fn(),
}));

import {
  initOlm,
  createOlmAccount,
  generateAndGetOTKs,
  decryptOlmEvent,
} from '../src/olmService.js';

beforeEach(async () => {
  localStorage.clear();
  vi.clearAllMocks();
  await initOlm();
});

describe('decryptOlmEvent — punto d\'ingresso pubblico per la ricezione', () => {
  it('primo messaggio da un mittente nuovo: crea la sessione e decifra correttamente', async () => {
    const alice = createOlmAccount('alice_decrypt_event');
    const bob = createOlmAccount('bob_decrypt_event');
    const aliceOtks = generateAndGetOTKs(alice, 'alice_decrypt_event', 1);
    const aliceIdentityKey = JSON.parse(alice.identity_keys()).curve25519;
    const bobIdentityKey = JSON.parse(bob.identity_keys()).curve25519;

    const sessioneBob = new Olm.Session();
    sessioneBob.create_outbound(bob, aliceIdentityKey, Object.values(aliceOtks)[0]);
    const cifrato = sessioneBob.encrypt('primo messaggio da Bob');

    const sessions = {};
    const risultato = await decryptOlmEvent({
      account: alice,
      username: 'alice_decrypt_event',
      senderUsername: 'bob_decrypt_event',
      senderIdentityKey: bobIdentityKey,
      messageType: cifrato.type,
      messageBody: cifrato.body,
      sessions,
      token: 'token_finto',
    });

    expect(risultato.plaintext).toBe('primo messaggio da Bob');
    expect(risultato.repairedSession).toBeTruthy();
  });

  it('un secondo messaggio dallo stesso mittente riusa la sessione già stabilita (percorso "sessione esistente")', async () => {
    const alice = createOlmAccount('alice_decrypt_event2');
    const bob = createOlmAccount('bob_decrypt_event2');
    const aliceOtks = generateAndGetOTKs(alice, 'alice_decrypt_event2', 2);
    const aliceIdentityKey = JSON.parse(alice.identity_keys()).curve25519;
    const bobIdentityKey = JSON.parse(bob.identity_keys()).curve25519;

    const sessioneBob = new Olm.Session();
    sessioneBob.create_outbound(bob, aliceIdentityKey, Object.values(aliceOtks)[0]);

    const primoMessaggio = sessioneBob.encrypt('primo messaggio');
    const sessions = {};
    await decryptOlmEvent({
      account: alice, username: 'alice_decrypt_event2', senderUsername: 'bob_decrypt_event2',
      senderIdentityKey: bobIdentityKey, messageType: primoMessaggio.type,
      messageBody: primoMessaggio.body, sessions, token: 'token_finto',
    });

    // Secondo messaggio - la sessione ormai esiste in `sessions`, deve
    // riusarla. NOTA (scoperto con esecuzione reale, non assunto): una
    // sessione outbound continua a mandare tipo 0 (pre-key) finche' non
    // riceve una risposta dal destinatario - e' comportamento CORRETTO
    // del protocollo Olm, non un bug. Il riuso della sessione esistente
    // non dipende dal tipo del messaggio: decryptOlmEvent prova sempre
    // prima le sessioni gia' in memoria, qualunque sia il tipo.
    const secondoMessaggio = sessioneBob.encrypt('secondo messaggio, stessa sessione');

    const risultato = await decryptOlmEvent({
      account: alice, username: 'alice_decrypt_event2', senderUsername: 'bob_decrypt_event2',
      senderIdentityKey: bobIdentityKey, messageType: secondoMessaggio.type,
      messageBody: secondoMessaggio.body, sessions, token: 'token_finto',
    });

    expect(risultato.plaintext).toBe('secondo messaggio, stessa sessione');
  });

  it('lancia un errore chiaro se mancano i parametri richiesti', async () => {
    await expect(decryptOlmEvent({
      account: null, username: 'alice', senderUsername: 'bob',
      messageType: 0, messageBody: 'x', sessions: {},
    })).rejects.toThrow('Account Olm mancante.');

    const alice = createOlmAccount('alice_decrypt_event3');
    await expect(decryptOlmEvent({
      account: alice, username: null, senderUsername: 'bob',
      messageType: 0, messageBody: 'x', sessions: {},
    })).rejects.toThrow('Username locale mancante.');
  });
});