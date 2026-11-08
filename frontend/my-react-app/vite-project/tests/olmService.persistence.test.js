// tests/olmService.persistence.test.js
//
// Test reali sulla persistenza dell'account Olm (pickle/unpickle via
// localStorage) - verificato prima con esecuzione reale isolata che
// il meccanismo di fondo di Olm sia solido (chiave sbagliata e dati
// corrotti falliscono sempre in modo pulito, mai un account
// silenziosamente danneggiato), poi con le funzioni esportate vere.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  initOlm,
  createOlmAccount,
  saveOlmAccount,
  loadOlmAccount,
  clearOlmAccount,
  getIdentityKeys,
} from '../src/olmService.js';

beforeEach(async () => {
  localStorage.clear();
  await initOlm();
});

describe('Persistenza account Olm — andata e ritorno tramite localStorage', () => {
  it('un account creato, poi ricaricato, ha le stesse identity key', () => {
    const accountOriginale = createOlmAccount('alice_persist');
    const chiaviOriginali = getIdentityKeys(accountOriginale);

    const accountRicaricato = loadOlmAccount('alice_persist');
    const chiaviRicaricate = getIdentityKeys(accountRicaricato);

    expect(chiaviRicaricate.curve25519).toBe(chiaviOriginali.curve25519);
    expect(chiaviRicaricate.ed25519).toBe(chiaviOriginali.ed25519);
  });

  it('due chiamate consecutive a loadOlmAccount riusano lo STESSO oggetto (cache, evita perdite di memoria WASM)', () => {
    createOlmAccount('alice_persist_cache');

    const primaChiamata = loadOlmAccount('alice_persist_cache');
    const secondaChiamata = loadOlmAccount('alice_persist_cache');

    expect(secondaChiamata).toBe(primaChiamata);
  });

  it('loadOlmAccount restituisce null se non esiste nessun account salvato per quell\'username', () => {
    const risultato = loadOlmAccount('utente_mai_esistito');
    expect(risultato).toBeNull();
  });

  it('un pickle CORROTTO in localStorage viene ripulito automaticamente, mai un crash', () => {
    // Simula un dato corrotto scrivendo direttamente in localStorage,
    // come potrebbe capitare per un bug di storage o una versione
    // precedente incompatibile - il codice reale deve gestirlo con
    // garbo, non mandare in crash l'intera app.
    // Formato verificato direttamente nel codice sorgente (accountStorageKey):
    // `olm_account_${username}`.
    localStorage.setItem('olm_account_bob_corrotto', 'questo-non-e-affatto-un-pickle-valido-XYZ');

    let risultato;
    expect(() => {
      risultato = loadOlmAccount('bob_corrotto');
    }).not.toThrow();

    expect(risultato).toBeNull();
    // Il dato corrotto deve essere stato rimosso, non lasciato lì per
    // fallire di nuovo identico al prossimo avvio dell'app.
    expect(localStorage.getItem('olm_account_bob_corrotto')).toBeNull();
  });

  it('clearOlmAccount rimuove davvero l\'account - una chiamata successiva a loadOlmAccount restituisce null', () => {
    createOlmAccount('alice_persist_clear');
    expect(loadOlmAccount('alice_persist_clear')).not.toBeNull();

    clearOlmAccount('alice_persist_clear');

    expect(loadOlmAccount('alice_persist_clear')).toBeNull();
  });

  it('account di utenti diversi restano completamente isolati tra loro', () => {
    const accountAlice = createOlmAccount('alice_isolamento');
    const accountBob = createOlmAccount('bob_isolamento');

    clearOlmAccount('alice_isolamento');

    expect(loadOlmAccount('alice_isolamento')).toBeNull();
    // Bob non deve essere toccato dalla cancellazione di Alice.
    const bobRicaricato = loadOlmAccount('bob_isolamento');
    expect(bobRicaricato).not.toBeNull();
    expect(getIdentityKeys(bobRicaricato).curve25519).toBe(getIdentityKeys(accountBob).curve25519);
  });
});