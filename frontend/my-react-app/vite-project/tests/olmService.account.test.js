// tests/olmService.account.test.js
//
// Test reali (Olm vera, non finta) sulla creazione dell'account e
// delle chiavi - il livello piu' fondamentale della crittografia
// dell'app. Ogni assert verifica valori crittografici VERI generati
// dalla libreria, non placeholder.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  initOlm,
  createOlmAccount,
  getOrCreateOlmAccount,
  getIdentityKeys,
  getCurve25519Key,
  getEd25519Key,
  generateAndGetOTKs,
} from '../src/olmService.js';

beforeEach(async () => {
  // Isolamento tra test - ogni test parte da un localStorage vuoto,
  // altrimenti un account creato in un test "sopravvivrebbe" al
  // successivo che usa lo stesso username.
  localStorage.clear();
  await initOlm();
});

describe('createOlmAccount - creazione account con chiavi vere', () => {
  it('crea un account con identity key Curve25519 ed Ed25519 valide', () => {
    const account = createOlmAccount('alice_test');
    const chiavi = getIdentityKeys(account);

    expect(chiavi.curve25519).toBeTruthy();
    expect(chiavi.ed25519).toBeTruthy();
    // Le chiavi Curve25519/Ed25519 di Olm sono sempre stringhe base64
    // di 43 caratteri (32 byte codificati) - una lunghezza diversa
    // significherebbe una chiave non valida o troncata.
    expect(chiavi.curve25519.length).toBe(43);
    expect(chiavi.ed25519.length).toBe(43);
  });

  it('due account diversi hanno sempre chiavi diverse', () => {
    const accountAlice = createOlmAccount('alice_test');
    const accountBob = createOlmAccount('bob_test');

    const chiaviAlice = getIdentityKeys(accountAlice);
    const chiaviBob = getIdentityKeys(accountBob);

    expect(chiaviAlice.curve25519).not.toBe(chiaviBob.curve25519);
    expect(chiaviAlice.ed25519).not.toBe(chiaviBob.ed25519);
  });

  it('getCurve25519Key/getEd25519Key restituiscono le stesse chiavi di getIdentityKeys', () => {
    const account = createOlmAccount('alice_test');
    const chiavi = getIdentityKeys(account);

    expect(getCurve25519Key(account)).toBe(chiavi.curve25519);
    expect(getEd25519Key(account)).toBe(chiavi.ed25519);
  });
});

describe('getOrCreateOlmAccount - persistenza tramite localStorage', () => {
  it('la seconda chiamata restituisce lo STESSO account salvato, non uno nuovo', () => {
    const primoAccount = getOrCreateOlmAccount('alice_test');
    const chiaviPrimoAccount = getIdentityKeys(primoAccount);

    const secondoAccount = getOrCreateOlmAccount('alice_test');
    const chiaviSecondoAccount = getIdentityKeys(secondoAccount);

    expect(chiaviSecondoAccount.curve25519).toBe(chiaviPrimoAccount.curve25519);
    expect(chiaviSecondoAccount.ed25519).toBe(chiaviPrimoAccount.ed25519);
  });
});

describe('generateAndGetOTKs - chiavi monouso vere', () => {
  it('genera esattamente il numero richiesto di one-time key, tutte valide', () => {
    const account = createOlmAccount('alice_test');
    const otks = generateAndGetOTKs(account, 'alice_test', 10);

    const idChiavi = Object.keys(otks);
    expect(idChiavi.length).toBe(10);

    // Ogni valore deve essere una chiave Curve25519 vera (43 caratteri base64),
    // non un placeholder o una stringa vuota.
    for (const id of idChiavi) {
      expect(otks[id]).toBeTruthy();
      expect(otks[id].length).toBe(43);
    }
  });

  it('due chiamate consecutive generano OTK sempre diverse (mai riusate)', () => {
    const account = createOlmAccount('alice_test');
    const primaBatch = generateAndGetOTKs(account, 'alice_test', 5);
    const secondaBatch = generateAndGetOTKs(account, 'alice_test', 5);

    const valoriPrimaBatch = new Set(Object.values(primaBatch));
    const valoriSecondaBatch = new Set(Object.values(secondaBatch));

    // Nessuna chiave della seconda batch deve comparire nella prima -
    // se fosse cosi', significherebbe che una OTK e' stata riusata,
    // una violazione grave delle garanzie di sicurezza di Olm.
    for (const valore of valoriSecondaBatch) {
      expect(valoriPrimaBatch.has(valore)).toBe(false);
    }
  });
});