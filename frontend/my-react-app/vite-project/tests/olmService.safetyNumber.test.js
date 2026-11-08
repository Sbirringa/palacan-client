// tests/olmService.safetyNumber.test.js
//
// Numero di sicurezza (safety number) tra due utenti - nuova
// funzionalita' per difendersi da un backend compromesso che
// sostituisse identity key/OTK al PRIMISSIMO scambio, prima che TOFU
// abbia una storia da confrontare. Stesso principio dei "numeri di
// sicurezza" di Signal. Verificato con Web Crypto vera, non finta.
import { describe, it, expect } from 'vitest';
import { computeSafetyNumber } from '../src/olmService.js';

describe('computeSafetyNumber', () => {
  it('senza uno qualunque dei quattro parametri, restituisce null', async () => {
    expect(await computeSafetyNumber(null, 'chiave', 'bob', 'chiave2')).toBeNull();
    expect(await computeSafetyNumber('alice', null, 'bob', 'chiave2')).toBeNull();
    expect(await computeSafetyNumber('alice', 'chiave', null, 'chiave2')).toBeNull();
    expect(await computeSafetyNumber('alice', 'chiave', 'bob', null)).toBeNull();
  });

  it('restituisce un formato di 6 gruppi da 5 cifre, separati da spazio', async () => {
    const numero = await computeSafetyNumber('alice', 'CHIAVE_ALICE_XYZ', 'bob', 'CHIAVE_BOB_ABC');
    expect(numero).toMatch(/^\d{5} \d{5} \d{5} \d{5} \d{5} \d{5}$/);
  });

  it('PROPRIETÀ FONDAMENTALE: Alice e Bob ottengono lo STESSO numero, indipendentemente da chi lo calcola per primo', async () => {
    const numeroCalcolatoDaAlice = await computeSafetyNumber('alice', 'CHIAVE_ALICE_XYZ', 'bob', 'CHIAVE_BOB_ABC');
    const numeroCalcolatoDaBob = await computeSafetyNumber('bob', 'CHIAVE_BOB_ABC', 'alice', 'CHIAVE_ALICE_XYZ');
    expect(numeroCalcolatoDaAlice).toBe(numeroCalcolatoDaBob);
  });

  it('lo stesso vale con maiuscole/minuscole diverse nello username (normalizzato)', async () => {
    const numero1 = await computeSafetyNumber('Alice', 'CHIAVE_ALICE_XYZ', 'BOB', 'CHIAVE_BOB_ABC');
    const numero2 = await computeSafetyNumber('alice', 'CHIAVE_ALICE_XYZ', 'bob', 'CHIAVE_BOB_ABC');
    expect(numero1).toBe(numero2);
  });

  it('PROPRIETÀ DI SICUREZZA: una identity key diversa (es. sostituita da un MITM) produce un numero DIVERSO', async () => {
    const numeroOriginale = await computeSafetyNumber('alice', 'CHIAVE_ALICE_VERA', 'bob', 'CHIAVE_BOB_VERA');
    const numeroConChiaveSostituita = await computeSafetyNumber('alice', 'CHIAVE_ALICE_VERA', 'bob', 'CHIAVE_BOB_FALSA_DA_MITM');
    expect(numeroOriginale).not.toBe(numeroConChiaveSostituita);
  });

  it('coppie di persone diverse producono numeri diversi (nessuna collisione banale)', async () => {
    const numeroAliceBob = await computeSafetyNumber('alice', 'CHIAVE_A', 'bob', 'CHIAVE_B');
    const numeroAliceCarol = await computeSafetyNumber('alice', 'CHIAVE_A', 'carol', 'CHIAVE_C');
    expect(numeroAliceBob).not.toBe(numeroAliceCarol);
  });

  it('è deterministico: la stessa coppia di chiavi produce sempre lo stesso numero', async () => {
    const numero1 = await computeSafetyNumber('alice', 'CHIAVE_A', 'bob', 'CHIAVE_B');
    const numero2 = await computeSafetyNumber('alice', 'CHIAVE_A', 'bob', 'CHIAVE_B');
    expect(numero1).toBe(numero2);
  });
});