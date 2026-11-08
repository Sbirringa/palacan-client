// tests/olmService.chiaviInoltrate.test.js  [palacan-n5d]
//
// encryptForwardedRoomKeys con olmService vero e Olm vera: le chiavi inoltrate a un altro membro viaggiano sulla
// STESSA sessione Olm della condivisione normale (nessuna sessione in piu', niente "sessione stale"), in un solo
// messaggio, con l'autore di ogni chiave dentro la parte cifrata. L'm.room_key normale resta identico.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Olm from '../src/crypto/olm.js';

vi.mock('../src/apiService.js', () => ({
  getKeyBundle: vi.fn(),
  getDeviceBundles: vi.fn(),
}));

import * as apiService from '../src/apiService.js';
import {
  initOlm,
  createOlmAccount,
  generateAndGetOTKs,
  encryptRoomKeyForAllDevices,
  encryptForwardedRoomKeys,
} from '../src/olmService.js';

beforeEach(async () => {
  localStorage.clear();
  vi.clearAllMocks();
  await initOlm();
});

function chiaveDiStanza(stanza) {
  const uscente = new Olm.OutboundGroupSession();
  uscente.create();
  const copia = new Olm.InboundGroupSession();
  copia.create(uscente.session_key());
  return {
    uscente,
    roomKeyContent: { algorithm: 'm.megolm.v1.aes-sha2', room_id: stanza, session_id: uscente.session_id(), session_key: uscente.session_key() },
    esportata: copia.export_session(0),
  };
}

function preparaBob(nome) {
  const bob = createOlmAccount(nome);
  const otks = generateAndGetOTKs(bob, nome, 2);
  const ik = JSON.parse(bob.identity_keys()).curve25519;
  return { bob, ik, otks: Object.entries(otks) };
}

describe('encryptForwardedRoomKeys (olmService vero)', () => {
  it('usa la stessa sessione Olm della condivisione normale; bob decifra entrambi con quella sessione', async () => {
    const alice = createOlmAccount('alice_n5d');
    const { bob, ik: bobIk, otks } = preparaBob('bob_n5d');
    apiService.getDeviceBundles.mockResolvedValue([]);
    apiService.getKeyBundle.mockResolvedValue({ identity_key: bobIk, one_time_key: otks[0][1], one_time_key_id: otks[0][0] });

    const sessioniAlice = {};
    const normale = chiaveDiStanza('S');
    const [primo] = await encryptRoomKeyForAllDevices({
      account: alice, username: 'alice_n5d', targetUsername: 'bob_n5d', sessions: sessioniAlice, token: 't', roomKeyContent: normale.roomKeyContent,
    });

    const daInoltrare = chiaveDiStanza('S');
    const risultati = await encryptForwardedRoomKeys({
      account: alice, username: 'alice_n5d', targetUsername: 'bob_n5d', sessions: sessioniAlice, token: 't', roomId: 'S',
      chiavi: [{ session_id: daInoltrare.roomKeyContent.session_id, session_key: daInoltrare.esportata, creatore: 'alice_n5d' }],
    });
    expect(risultati).toHaveLength(1);
    const [secondo] = risultati;
    expect(secondo.peerIdentityKey).toBe(bobIk);

    // nessuna sessione in piu': solo quella verso bob, ed e' la stessa
    expect(Object.keys(sessioniAlice)).toEqual(['bob_n5d']);
    expect(apiService.getKeyBundle).toHaveBeenCalledTimes(1);
    expect(secondo.olmSessionId).toBe(primo.olmSessionId);

    // bob: una sola sessione in entrata decifra entrambi i messaggi
    const sessioneBob = new Olm.Session();
    const aliceIk = JSON.parse(alice.identity_keys()).curve25519;
    sessioneBob.create_inbound_from(bob, aliceIk, primo.body);
    const m1 = JSON.parse(sessioneBob.decrypt(primo.type, primo.body));
    const m2 = JSON.parse(sessioneBob.decrypt(secondo.type, secondo.body));

    expect(m1.type).toBe('m.room_key');
    expect(m1.content.session_id).toBe(normale.roomKeyContent.session_id);
    expect(m1.content.chiavi).toBeUndefined();

    expect(m2.type).toBe('m.forwarded_room_keys');
    expect(m2.content.room_id).toBe('S');
    expect(m2.content.chiavi).toEqual([{ session_id: daInoltrare.roomKeyContent.session_id, session_key: daInoltrare.esportata, creatore: 'alice_n5d' }]);

    // la chiave inoltrata funziona davvero
    const importata = new Olm.InboundGroupSession();
    importata.import_session(m2.content.chiavi[0].session_key);
    expect(importata.decrypt(daInoltrare.uscente.encrypt('ciao')).plaintext).toBe('ciao');
  });

  it('con l\'elenco dei dispositivi: stessa sessione per dispositivo della condivisione normale', async () => {
    const alice = createOlmAccount('alice_n5d_dev');
    const { ik: bobIk, otks } = preparaBob('bob_n5d_dev');
    apiService.getDeviceBundles.mockResolvedValue([{ device_id: 'D1', identity_key: bobIk, one_time_key: otks[0][1] }]);
    const sessioniAlice = {};
    const normale = chiaveDiStanza('S');
    const [primo] = await encryptRoomKeyForAllDevices({
      account: alice, username: 'alice_n5d_dev', targetUsername: 'bob_n5d_dev', sessions: sessioniAlice, token: 't', roomKeyContent: normale.roomKeyContent,
    });
    const [secondo] = await encryptForwardedRoomKeys({
      account: alice, username: 'alice_n5d_dev', targetUsername: 'bob_n5d_dev', sessions: sessioniAlice, token: 't', roomId: 'S',
      chiavi: [{ session_id: 'x', session_key: 'y', creatore: 'alice_n5d_dev' }],
    });
    expect(Object.keys(sessioniAlice)).toEqual(['bob_n5d_dev::device::D1']);
    expect(secondo.deviceId).toBe('D1');
    expect(secondo.olmSessionId).toBe(primo.olmSessionId);
  });

  it('chiavi mancanti o incomplete: errore, niente cifrato', async () => {
    const alice = createOlmAccount('alice_n5d_err');
    const base = { account: alice, username: 'alice_n5d_err', targetUsername: 'bob', sessions: {}, token: 't', roomId: 'S' };
    await expect(encryptForwardedRoomKeys({ ...base, chiavi: [] })).rejects.toThrow();
    await expect(encryptForwardedRoomKeys({ ...base, roomId: null, chiavi: [{ session_id: 'a', session_key: 'b' }] })).rejects.toThrow();
    await expect(encryptForwardedRoomKeys({ ...base, chiavi: [{ session_id: 'a' }] })).rejects.toThrow();
    expect(apiService.getKeyBundle).not.toHaveBeenCalled();
  });

  it('m.room_key normale senza il parametro nuovo: contenuto di sempre (con nome del gruppo)', async () => {
    const alice = createOlmAccount('alice_n5d_norm');
    const { bob, ik: bobIk, otks } = preparaBob('bob_n5d_norm');
    apiService.getDeviceBundles.mockResolvedValue([]);
    apiService.getKeyBundle.mockResolvedValue({ identity_key: bobIk, one_time_key: otks[0][1], one_time_key_id: otks[0][0] });
    const normale = chiaveDiStanza('S');
    const [r] = await encryptRoomKeyForAllDevices({
      account: alice, username: 'alice_n5d_norm', targetUsername: 'bob_n5d_norm', sessions: {}, token: 't',
      roomKeyContent: { ...normale.roomKeyContent, room_name: 'Pallone' },
    });
    const s = new Olm.Session();
    s.create_inbound_from(bob, JSON.parse(alice.identity_keys()).curve25519, r.body);
    const m = JSON.parse(s.decrypt(r.type, r.body));
    expect(m).toEqual({
      type: 'm.room_key',
      content: {
        algorithm: 'm.megolm.v1.aes-sha2',
        room_id: 'S',
        session_id: normale.roomKeyContent.session_id,
        session_key: normale.roomKeyContent.session_key,
        room_name: 'Pallone',
      },
    });
  });
});
