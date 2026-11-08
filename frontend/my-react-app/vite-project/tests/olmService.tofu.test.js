// tests/olmService.tofu.test.js
//
// Test reali sul meccanismo TOFU (Trust On First Use, stile Signal
// Safety Number) - rileva quando la identity key di un contatto
// cambia (reinstallazione legittima, cambio dispositivo, O un
// attacco).
//
// SCOPERTA IMPORTANTE fatta scrivendo questi test (l'utente ha chiesto
// di indagare a fondo, non fermarsi al primo test verde): un mio primo
// tentativo chiamava createOutboundSessionForUser direttamente, che
// NON fa il controllo TOFU - quello vive in getOrCreateOutboundSession
// (il wrapper che la chiama). Il test e' fallito con l'assert sbagliato
// (non un errore), il che ha portato a scoprire un GAP REALE: il
// controllo TOFU esisteva SOLO lato invio, mai lato ricezione - un
// contatto compromesso a meta' conversazione non veniva mai segnalato
// se era LUI a mandare per primo. Corretto in olmService.js
// (getOrCreateInboundSessionInternal ora chiama savePeerIdentityKey
// anche quando riceve), verificato qui in entrambe le direzioni.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Olm from '../src/crypto/olm.js';

vi.mock('../src/apiService.js', () => ({
  getKeyBundle: vi.fn(),
}));

import * as apiService from '../src/apiService.js';
import {
  initOlm,
  createOlmAccount,
  generateAndGetOTKs,
  getOrCreateOutboundSession,
  getOrCreateInboundSession,
  encryptMessage,
  getPeerIdentityChangeWarning,
  acknowledgePeerIdentityChange,
} from '../src/olmService.js';

beforeEach(async () => {
  localStorage.clear();
  vi.clearAllMocks();
  await initOlm();
});

function creaBundleFinto(identityKey, otkValue) {
  return {
    identity_key: identityKey,
    one_time_key: otkValue,
    one_time_key_id: 'finto_id_1',
  };
}

describe('TOFU lato INVIO — rilevamento cambio identità quando SEI TU a scrivere per primo', () => {
  it('nessun avviso al primo scambio con un nuovo contatto', async () => {
    const alice = createOlmAccount('alice_tofu_invio1');
    const bob = createOlmAccount('bob_tofu_invio1');
    const bobOtks = generateAndGetOTKs(bob, 'bob_tofu_invio1', 1);
    const bobIdentityKey = JSON.parse(bob.identity_keys()).curve25519;

    apiService.getKeyBundle.mockResolvedValue(creaBundleFinto(bobIdentityKey, Object.values(bobOtks)[0]));

    await getOrCreateOutboundSession({
      account: alice, username: 'alice_tofu_invio1', targetUsername: 'bob_tofu_invio1',
      sessions: {}, token: 'token_finto',
    });

    expect(getPeerIdentityChangeWarning('alice_tofu_invio1', 'bob_tofu_invio1')).toBeNull();
  });

  it('un avviso APPARE quando la identity key del contatto cambia tra due sessioni nuove', async () => {
    const alice = createOlmAccount('alice_tofu_invio2');

    const bob1 = createOlmAccount('bob_tofu_invio2_a');
    const otk1 = generateAndGetOTKs(bob1, 'bob_tofu_invio2_a', 1);
    const primaIdentityKey = JSON.parse(bob1.identity_keys()).curve25519;
    apiService.getKeyBundle.mockResolvedValue(creaBundleFinto(primaIdentityKey, Object.values(otk1)[0]));
    await getOrCreateOutboundSession({
      account: alice, username: 'alice_tofu_invio2', targetUsername: 'bob_tofu_invio2',
      sessions: {}, token: 'token_finto',
    });

    const bob2 = createOlmAccount('bob_tofu_invio2_b');
    const otk2 = generateAndGetOTKs(bob2, 'bob_tofu_invio2_b', 1);
    const secondaIdentityKey = JSON.parse(bob2.identity_keys()).curve25519;
    apiService.getKeyBundle.mockResolvedValue(creaBundleFinto(secondaIdentityKey, Object.values(otk2)[0]));
    // sessions: {} nuovo di zecca - simula "nessuna sessione cache" per
    // testare il ramo che chiama davvero il bundle una seconda volta.
    await getOrCreateOutboundSession({
      account: alice, username: 'alice_tofu_invio2', targetUsername: 'bob_tofu_invio2',
      sessions: {}, token: 'token_finto',
    });

    const avviso = getPeerIdentityChangeWarning('alice_tofu_invio2', 'bob_tofu_invio2');
    expect(avviso).not.toBeNull();
    expect(avviso.previousKey).toBe(primaIdentityKey);
    expect(avviso.newKey).toBe(secondaIdentityKey);
  });
});

describe('TOFU lato RICEZIONE — FIX per il gap trovato: rilevamento anche quando è l\'ALTRO a scrivere per primo', () => {
  it('nessun avviso al primo messaggio ricevuto da un nuovo contatto', async () => {
    const alice = createOlmAccount('alice_tofu_ricezione1');
    const bob = createOlmAccount('bob_tofu_ricezione1');
    const aliceOtks = generateAndGetOTKs(alice, 'alice_tofu_ricezione1', 1);
    const aliceIdentityKey = JSON.parse(alice.identity_keys()).curve25519;
    const bobIdentityKey = JSON.parse(bob.identity_keys()).curve25519;

    // Bob manda il primo messaggio ad Alice (stabilisce lui la sessione outbound, con l'API diretta di Olm).
    const sessioneBob = new Olm.Session();
    sessioneBob.create_outbound(bob, aliceIdentityKey, Object.values(aliceOtks)[0]);
    const messaggioCifrato = sessioneBob.encrypt('primo messaggio da Bob');

    await getOrCreateInboundSession({
      account: alice, username: 'alice_tofu_ricezione1', senderUsername: 'bob_tofu_ricezione1',
      senderIdentityKey: bobIdentityKey, messageType: messaggioCifrato.type,
      messageBody: messaggioCifrato.body, existingSessions: {}, token: 'token_finto',
    });

    expect(getPeerIdentityChangeWarning('alice_tofu_ricezione1', 'bob_tofu_ricezione1')).toBeNull();
  });

  it('un avviso APPARE quando ricevi il PRIMO messaggio da un\'identità diversa da quella conosciuta - il gap corretto', async () => {
    const alice = createOlmAccount('alice_tofu_ricezione2');

    // Passo 1: Alice manda per prima ad un Bob "originale" - questo registra la sua identity key.
    const bobOriginale = createOlmAccount('bob_tofu_ricezione2_originale');
    const otkOriginale = generateAndGetOTKs(bobOriginale, 'bob_tofu_ricezione2_originale', 1);
    const identityOriginale = JSON.parse(bobOriginale.identity_keys()).curve25519;
    apiService.getKeyBundle.mockResolvedValue(creaBundleFinto(identityOriginale, Object.values(otkOriginale)[0]));
    await getOrCreateOutboundSession({
      account: alice, username: 'alice_tofu_ricezione2', targetUsername: 'bob_tofu_ricezione2',
      sessions: {}, token: 'token_finto',
    });
    expect(getPeerIdentityChangeWarning('alice_tofu_ricezione2', 'bob_tofu_ricezione2')).toBeNull();

    // Passo 2: ORA arriva un messaggio da "Bob" ma con un'identity key DIVERSA
    // (l'account di Bob compromesso, o un impostore) - PRIMA del fix,
    // questo non veniva mai rilevato perché arriva in RICEZIONE.
    const bobImpostore = createOlmAccount('bob_tofu_ricezione2_impostore');
    const aliceOtksPerImpostore = generateAndGetOTKs(alice, 'alice_tofu_ricezione2', 1);
    const identityImpostore = JSON.parse(bobImpostore.identity_keys()).curve25519;
    expect(identityImpostore).not.toBe(identityOriginale);

    const sessioneImpostore = new Olm.Session();
    sessioneImpostore.create_outbound(bobImpostore, JSON.parse(alice.identity_keys()).curve25519, Object.values(aliceOtksPerImpostore)[0]);
    const messaggioImpostore = sessioneImpostore.encrypt('messaggio da un\'identità diversa');

    await getOrCreateInboundSession({
      account: alice, username: 'alice_tofu_ricezione2', senderUsername: 'bob_tofu_ricezione2',
      senderIdentityKey: identityImpostore, messageType: messaggioImpostore.type,
      messageBody: messaggioImpostore.body, existingSessions: {}, token: 'token_finto',
    });

    const avviso = getPeerIdentityChangeWarning('alice_tofu_ricezione2', 'bob_tofu_ricezione2');
    expect(avviso).not.toBeNull();
    expect(avviso.previousKey).toBe(identityOriginale);
    expect(avviso.newKey).toBe(identityImpostore);
  });
});

describe('acknowledgePeerIdentityChange', () => {
  it('rimuove l\'avviso senza toccare la identity key salvata', async () => {
    const alice = createOlmAccount('alice_tofu_ack');

    const bob1 = createOlmAccount('bob_tofu_ack_a');
    const otk1 = generateAndGetOTKs(bob1, 'bob_tofu_ack_a', 1);
    apiService.getKeyBundle.mockResolvedValue(creaBundleFinto(JSON.parse(bob1.identity_keys()).curve25519, Object.values(otk1)[0]));
    await getOrCreateOutboundSession({
      account: alice, username: 'alice_tofu_ack', targetUsername: 'bob_tofu_ack', sessions: {}, token: 'token_finto',
    });

    const bob2 = createOlmAccount('bob_tofu_ack_b');
    const otk2 = generateAndGetOTKs(bob2, 'bob_tofu_ack_b', 1);
    apiService.getKeyBundle.mockResolvedValue(creaBundleFinto(JSON.parse(bob2.identity_keys()).curve25519, Object.values(otk2)[0]));
    await getOrCreateOutboundSession({
      account: alice, username: 'alice_tofu_ack', targetUsername: 'bob_tofu_ack', sessions: {}, token: 'token_finto',
    });

    expect(getPeerIdentityChangeWarning('alice_tofu_ack', 'bob_tofu_ack')).not.toBeNull();
    acknowledgePeerIdentityChange('alice_tofu_ack', 'bob_tofu_ack');
    expect(getPeerIdentityChangeWarning('alice_tofu_ack', 'bob_tofu_ack')).toBeNull();
  });
});