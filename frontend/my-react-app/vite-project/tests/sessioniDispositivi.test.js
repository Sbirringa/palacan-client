// tests/sessioniDispositivi.test.js  [palacan-pq7b]
//
// Guasto visto dal vivo dopo PQ7a: i messaggi (chat 1:1 e gruppi) non arrivavano in nessuno dei due versi. Le chiavi di
// stanza partono da encryptRoomKeyForAllDevices con una sessione Olm per OGNI dispositivo ("<persona>::device::<id>"),
// ma session_reset (ritiraSessioniPerInvio) e "sessione incastrata" (dropStaleSessionForPeer) toccavano solo la
// sessione "<persona>". Una sessione per dispositivo aperta con una OTK che il destinatario non ha restava in uso per
// sempre: lui rispondeva "unknown one-time key" con la STESSA OTK ogni volta. Qui, con sessioni Olm VERE: anche quelle
// per dispositivo si ritirano (restano per decifrare), la sessione nuova si usa, una raffica di errori non le ritira
// a ripetizione, e le funzioni di invio per dispositivo non usano mai una sessione ritirata.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import Olm from '../src/crypto/olm.js';
import * as svc from '../src/olmService';

let alice;
let curvaBob;
let otkBob = [];

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
  alice = new Olm.Account();
  alice.create();
  const bob = new Olm.Account();
  bob.create();
  bob.generate_one_time_keys(40);
  otkBob = Object.values(JSON.parse(bob.one_time_keys()).curve25519);
  curvaBob = JSON.parse(bob.identity_keys()).curve25519;
});

// una sessione Olm in uscita vera, ogni volta con una OTK diversa
function nuova() {
  const s = new Olm.Session();
  s.create_outbound(alice, curvaBob, otkBob.shift());
  return s;
}

function funzione(testo, nome) {
  const i = testo.search(new RegExp(`function ${nome}\\s*\\(`));
  expect(i, `funzione ${nome} non trovata`).toBeGreaterThan(-1);
  const resto = testo.slice(i + 10);
  const j = resto.search(/\n(export\s+)?(async\s+)?function\s/);
  return testo.slice(i, j < 0 ? undefined : i + 10 + j);
}

describe('PQ7b - sessioni Olm verso i singoli dispositivi', () => {
  beforeEach(() => localStorage.clear());

  it('session_reset: si ritirano anche le sessioni verso i dispositivi della persona (solo i suoi)', () => {
    const m = { bob: [nuova()], 'bob::device::D1': [nuova()], 'bob::device::D2': [nuova()], 'carla::device::C1': [nuova()] };
    const vecchiaD1 = m['bob::device::D1'][0];
    svc.ritiraSessioniPerInvio('alice_r1', 'bob', m);
    expect(svc.sessioneDaUsare('alice_r1', 'bob::device::D1', m['bob::device::D1']), 'sessione verso il dispositivo D1 non ritirata').toBeNull();
    expect(svc.sessioneDaUsare('alice_r1', 'bob::device::D2', m['bob::device::D2']), 'sessione verso il dispositivo D2 non ritirata').toBeNull();
    expect(svc.sessioneDaUsare('alice_r1', 'bob', m.bob)).toBeNull();
    expect(svc.sessioneDaUsare('alice_r1', 'carla::device::C1', m['carla::device::C1'])).toBe(m['carla::device::C1'][0]);
    const fresca = nuova(); // quella che encryptRoomKeyForAllDevices mette in testa
    m['bob::device::D1'] = [fresca, ...m['bob::device::D1']];
    expect(svc.sessioneDaUsare('alice_r1', 'bob::device::D1', m['bob::device::D1'])).toBe(fresca);
    expect(m['bob::device::D1']).toContain(vecchiaD1); // la vecchia resta per decifrare
  });

  it('session_reset senza sessione "persona": le sessioni per dispositivo si ritirano lo stesso e si contano', () => {
    const m = { 'bob::device::D1': [nuova()] };
    expect(svc.ritiraSessioniPerInvio('alice_r2', 'bob', m), 'sessioni per dispositivo non ritirate').toBe(1);
    expect(svc.sessioneDaUsare('alice_r2', 'bob::device::D1', m['bob::device::D1'])).toBeNull();
  });

  it('sessione incastrata (dropStaleSessionForPeer): anche quelle per dispositivo si ritirano', () => {
    const m = { bob: [nuova()], 'bob::device::D1': [nuova()] };
    svc.dropStaleSessionForPeer('alice_r3', 'bob', m);
    expect(m.bob).toBeUndefined();
    expect(svc.sessioneDaUsare('alice_r3', 'bob::device::D1', m['bob::device::D1']), 'sessione verso il dispositivo D1 non ritirata').toBeNull();
  });

  it('una raffica di errori non le ritira a ripetizione (al massimo una volta ogni 30 secondi per persona)', () => {
    const m = { 'bob::device::D1': [nuova()] };
    expect(svc.ritiraSessioniDispositivi('alice_r4', 'bob', m, 1000)).toBe(1);
    m['bob::device::D1'] = [nuova(), ...m['bob::device::D1']];
    expect(svc.ritiraSessioniDispositivi('alice_r4', 'bob', m, 1000 + 29999)).toBe(0);
    expect(svc.sessioneDaUsare('alice_r4', 'bob::device::D1', m['bob::device::D1'])).toBe(m['bob::device::D1'][0]);
    expect(svc.ritiraSessioniDispositivi('alice_r4', 'bob', m, 1000 + 30000)).toBe(2);
    expect(svc.sessioneDaUsare('alice_r4', 'bob::device::D1', m['bob::device::D1'])).toBeNull();
  });

  it('collegamenti: l\'invio per dispositivo non usa mai una sessione ritirata', () => {
    const testo = readFileSync('src/olmService.js', 'utf8');
    expect(testo.includes('session = existingList[0];'), 'l\'invio per dispositivo usa ancora sempre la prima sessione').toBe(false);
    expect(funzione(testo, 'encryptRoomKeyForAllDevices')).toContain('sessioneDaUsare(normalizedUsername, deviceSessionPeerKey, existingList)');
    expect(funzione(testo, 'encryptForwardedRoomKeyForDevice')).toContain('sessioneDaUsare(normalizedUsername, deviceSessionPeerKey, existingList)');
  });
});
