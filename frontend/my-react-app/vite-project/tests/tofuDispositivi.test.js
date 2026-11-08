// tests/tofuDispositivi.test.js  [palacan-l4a]
//
// L4a (Chiusura limiti): TOFU per DISPOSITIVO e blocco dell'invio per i contatti verificati.
//   - Prima: si ricordava UNA chiave per contatto. Con due dispositivi i messaggi arrivano da due chiavi e ogni
//     alternanza dava "l'identita' e' cambiata" (avvisi falsi) e faceva decadere la verifica. Ora si ricordano tutte
//     le chiavi gia' viste di quel contatto: alternare tra dispositivi noti non avvisa; una chiave MAI vista si'.
//   - Numeri di sicurezza verificati per dispositivo: verificare il secondo non cancella il primo.
//   - Contatto VERIFICATO con una chiave mai vista: l'avviso lo dice (verificato: true) e l'invio nella chat 1:1 e'
//     bloccato finche' non si conferma (come Signal). Olm VERA.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../src/apiService.js', () => ({
  getKeyBundle: vi.fn(),
}));

import * as apiService from '../src/apiService.js';
import * as olmService from '../src/olmService.js';
import {
  initOlm,
  createOlmAccount,
  generateAndGetOTKs,
  getOrCreateOutboundSession,
  getPeerIdentityChangeWarning,
  acknowledgePeerIdentityChange,
  computeSafetyNumber,
  saveSafetyNumberVerified,
  isSafetyNumberVerified,
} from '../src/olmService.js';

beforeEach(async () => {
  localStorage.clear();
  vi.clearAllMocks();
  await initOlm();
});

function dispositivo(nome) {
  const conto = createOlmAccount(nome);
  return { conto, chiave: JSON.parse(conto.identity_keys()).curve25519, nome };
}

// alice apre una sessione verso "bob" usando il dispositivo d (bundle dal server finto)
async function scriveA(alice, io, bob, d) {
  const otk = generateAndGetOTKs(d.conto, d.nome, 1);
  apiService.getKeyBundle.mockResolvedValue({ identity_key: d.chiave, one_time_key: Object.values(otk)[0], one_time_key_id: 'id' });
  await getOrCreateOutboundSession({ account: alice, username: io, targetUsername: bob, sessions: {}, token: 't' });
}

describe('L4a - TOFU per dispositivo', () => {
  it('alternare tra due dispositivi gia\' visti dello stesso contatto non da\' avvisi', async () => {
    const alice = createOlmAccount('alice_l4a1');
    const telefono = dispositivo('bob_l4a1_telefono');
    const pc = dispositivo('bob_l4a1_pc');
    await scriveA(alice, 'alice_l4a1', 'bob_l4a1', telefono);
    await scriveA(alice, 'alice_l4a1', 'bob_l4a1', pc); // dispositivo nuovo: avviso (giusto)
    expect(getPeerIdentityChangeWarning('alice_l4a1', 'bob_l4a1')).not.toBeNull();
    acknowledgePeerIdentityChange('alice_l4a1', 'bob_l4a1');
    await scriveA(alice, 'alice_l4a1', 'bob_l4a1', telefono);
    expect(getPeerIdentityChangeWarning('alice_l4a1', 'bob_l4a1'), 'avviso falso: il telefono era gia\' noto').toBeNull();
    await scriveA(alice, 'alice_l4a1', 'bob_l4a1', pc);
    expect(getPeerIdentityChangeWarning('alice_l4a1', 'bob_l4a1'), 'avviso falso: il pc era gia\' noto').toBeNull();
    const intruso = dispositivo('bob_l4a1_intruso');
    await scriveA(alice, 'alice_l4a1', 'bob_l4a1', intruso);
    expect(getPeerIdentityChangeWarning('alice_l4a1', 'bob_l4a1').newKey).toBe(intruso.chiave);
  });

  it('numeri di sicurezza verificati per dispositivo: il secondo non cancella il primo', async () => {
    const n1 = await computeSafetyNumber('alice', 'CHIAVE_A', 'bob', 'CHIAVE_B1');
    const n2 = await computeSafetyNumber('alice', 'CHIAVE_A', 'bob', 'CHIAVE_B2');
    saveSafetyNumberVerified('alice', 'bob', n1);
    saveSafetyNumberVerified('alice', 'bob', n2);
    expect(isSafetyNumberVerified('alice', 'bob', n1), 'la verifica del primo dispositivo e\' sparita').toBe(true);
    expect(isSafetyNumberVerified('alice', 'bob', n2)).toBe(true);
    expect(isSafetyNumberVerified('alice', 'bob', await computeSafetyNumber('alice', 'CHIAVE_A', 'bob', 'ALTRA'))).toBe(false);
  });
});

describe('L4a - contatto verificato con una chiave mai vista: invio bloccato', () => {
  it('l\'avviso dice "verificato" e l\'invio e\' bloccato finche\' non si conferma', async () => {
    expect(typeof olmService.invioBloccatoPerIdentita, 'manca il blocco dell\'invio per i contatti verificati').toBe('function');
    const alice = createOlmAccount('alice_l4a2');
    const io = JSON.parse(alice.identity_keys()).curve25519;
    const telefono = dispositivo('bob_l4a2_telefono');
    await scriveA(alice, 'alice_l4a2', 'bob_l4a2', telefono);
    saveSafetyNumberVerified('alice_l4a2', 'bob_l4a2', await computeSafetyNumber('alice_l4a2', io, 'bob_l4a2', telefono.chiave));
    expect(olmService.invioBloccatoPerIdentita('alice_l4a2', 'bob_l4a2')).toBe(false);
    const nuovo = dispositivo('bob_l4a2_nuovo');
    await scriveA(alice, 'alice_l4a2', 'bob_l4a2', nuovo);
    const avviso = getPeerIdentityChangeWarning('alice_l4a2', 'bob_l4a2');
    expect(avviso && avviso.verificato, 'l\'avviso non dice che il contatto era verificato').toBe(true);
    expect(olmService.invioBloccatoPerIdentita('alice_l4a2', 'bob_l4a2'), 'invio non bloccato').toBe(true);
    acknowledgePeerIdentityChange('alice_l4a2', 'bob_l4a2');
    expect(olmService.invioBloccatoPerIdentita('alice_l4a2', 'bob_l4a2')).toBe(false);
  });

  it('contatto mai verificato: avviso normale, invio non bloccato', async () => {
    const alice = createOlmAccount('alice_l4a3');
    await scriveA(alice, 'alice_l4a3', 'bob_l4a3', dispositivo('bob_l4a3_a'));
    await scriveA(alice, 'alice_l4a3', 'bob_l4a3', dispositivo('bob_l4a3_b'));
    expect(getPeerIdentityChangeWarning('alice_l4a3', 'bob_l4a3').verificato).toBeFalsy();
    expect(olmService.invioBloccatoPerIdentita('alice_l4a3', 'bob_l4a3')).toBe(false);
  });

  it('collegamenti: la chat blocca l\'invio e il banner rosso c\'e\'', () => {
    const dash = readFileSync('src/pages/Dashboard.jsx', 'utf8');
    const invio = dash.slice(dash.indexOf('const handleSend = (e) => {'), dash.indexOf('const handleRoomClick = async'));
    expect(invio, 'handleSend non controlla il blocco per identita\'').toContain('olmService.invioBloccatoPerIdentita(');
    const banner = readFileSync('src/components/IdentityChangeWarningBanner.jsx', 'utf8');
    expect(banner).toContain('warning.verificato');
    expect(banner).toContain("'palacan:identita-cambiata'");
  });
});
