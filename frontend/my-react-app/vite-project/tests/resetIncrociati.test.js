// tests/resetIncrociati.test.js  [palacan-reset-incrociati]
//
// Reset incrociati delle sessioni Olm 1:1. Crittografia VERA (vodozemac). Scenario reale: A manda a B la chiave della
// stanza su una sessione nuova (pre-key); B la apre e risponde su quella (tipo 1); intanto ad A arriva il session_reset
// di B (che ha appena recuperato le chiavi). Prima A cancellava tutto e la risposta di B era persa ("non e' pre-key");
// ora la sessione e' solo ritirata dall'invio: la risposta si legge, e per scrivere a B parte una sessione nuova.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import Olm from '../src/crypto/olm.js';

vi.mock('../src/apiService', async (importOriginal) => {
  const vero = await importOriginal();
  return { ...vero, getKeyBundle: vi.fn(), getDeviceBundles: vi.fn(async () => []) };
});

import * as apiService from '../src/apiService';
import {
  initOlm,
  createOlmAccount,
  generateAndGetOTKs,
  encryptMessage,
  sessioneDaUsare,
  ricordaSessioneRicevuta,
  ritiraSessioniPerInvio,
  encryptRoomKeyForDevice,
} from '../src/olmService.js';

beforeEach(async () => {
  localStorage.clear();
  await initOlm();
});

const finta = (id) => ({ session_id: () => id, free: vi.fn() });

function pacchettoChiavi(account, username) {
  const otk = Object.values(generateAndGetOTKs(account, username, 1))[0];
  const identita = JSON.parse(account.identity_keys()).curve25519;
  return {
    identity_key: identita, identityKey: identita,
    one_time_key: otk, oneTimeKey: otk, one_time_key_id: 'AAAAAQ', oneTimeKeyId: 'AAAAAQ',
    username,
  };
}

function decifraConLista(lista, tipo, corpo) {
  for (const s of lista) {
    try {
      return s.decrypt(tipo, corpo);
    } catch (_) {
      /* prossima */
    }
  }
  return null;
}

describe('sessioni ritirate dall\'invio', () => {
  it('ritirate: non si usano per scrivere, restano nella lista; una nuova si usa', () => {
    const mappa = { gigi: [finta('a'), finta('b')] };
    expect(ritiraSessioniPerInvio('hola', 'gigi', mappa)).toBe(2);
    expect(mappa.gigi.map((s) => s.session_id())).toEqual(['a', 'b']);
    expect(sessioneDaUsare('hola', 'gigi', mappa.gigi)).toBeNull();
    const nuova = finta('nuova');
    expect(sessioneDaUsare('hola', 'gigi', [nuova, ...mappa.gigi])).toBe(nuova);
  });

  it('decifrare su una ritirata la rimette in uso (esiste anche dall\'altra parte)', () => {
    const mappa = { gigi: [finta('a')] };
    ritiraSessioniPerInvio('hola', 'gigi', mappa);
    expect(sessioneDaUsare('hola', 'gigi', mappa.gigi)).toBeNull();
    ricordaSessioneRicevuta('hola', 'gigi', mappa.gigi[0]);
    expect(sessioneDaUsare('hola', 'gigi', mappa.gigi).session_id()).toBe('a');
  });

  it('per contatto e per persona; al massimo 5 sessioni tenute (le altre liberate)', () => {
    const sette = ['1', '2', '3', '4', '5', '6', '7'].map(finta);
    const mappa = { gigi: sette, sara: [finta('s')] };
    expect(ritiraSessioniPerInvio('hola', 'gigi', mappa)).toBe(5);
    expect(mappa.gigi).toHaveLength(5);
    expect(sette[5].free).toHaveBeenCalled();
    expect(sette[6].free).toHaveBeenCalled();
    expect(sette[0].free).not.toHaveBeenCalled();
    expect(sessioneDaUsare('hola', 'sara', mappa.sara).session_id()).toBe('s');
    expect(sessioneDaUsare('altro', 'gigi', mappa.gigi).session_id()).toBe('1');
    expect(ritiraSessioniPerInvio('hola', 'nessuno', mappa)).toBe(0);
  });
});

describe('recupero incrociato con crittografia vera', () => {
  it('la risposta su una sessione appena nata si legge ancora dopo il reset dell\'altro', () => {
    const a = createOlmAccount('reset_a');
    const b = createOlmAccount('reset_b');
    const pb = pacchettoChiavi(b, 'reset_b');

    const sa = new Olm.Session();
    sa.create_outbound(a, pb.identity_key, pb.one_time_key);
    const chiave = encryptMessage(sa, 'chiave della stanza da A');
    const sb = new Olm.Session();
    sb.create_inbound(b, chiave.body);
    b.remove_one_time_keys(sb);
    expect(sb.decrypt(chiave.type, chiave.body)).toBe('chiave della stanza da A');
    const risposta = encryptMessage(sb, 'risposta di B sulla sessione nuova');
    expect(risposta.type).toBe(1);

    // PRIMA della correzione: al session_reset di B si cancellava tutto -> la risposta non si decifra piu'
    expect(decifraConLista([], risposta.type, risposta.body)).toBeNull();

    // ORA: le sessioni sono solo ritirate dall'invio -> la risposta si legge
    const sessioniA = { reset_b: [sa] };
    expect(ritiraSessioniPerInvio('reset_a', 'reset_b', sessioniA)).toBe(1);
    expect(decifraConLista(sessioniA.reset_b, risposta.type, risposta.body)).toBe('risposta di B sulla sessione nuova');
    expect(sessioneDaUsare('reset_a', 'reset_b', sessioniA.reset_b)).toBeNull();
  });

  it('dopo il reset, la chiave della stanza parte su una sessione NUOVA pre-key che l\'altro apre', async () => {
    const a = createOlmAccount('reset_a2');
    const b = createOlmAccount('reset_b2');
    const vecchia = new Olm.Session();
    const pb1 = pacchettoChiavi(b, 'reset_b2');
    vecchia.create_outbound(a, pb1.identity_key, pb1.one_time_key);
    const sessioniA = { reset_b2: [vecchia] };
    ritiraSessioniPerInvio('reset_a2', 'reset_b2', sessioniA);

    apiService.getKeyBundle.mockResolvedValue(pacchettoChiavi(b, 'reset_b2'));
    const gruppo = new Olm.OutboundGroupSession();
    gruppo.create();
    const r = await encryptRoomKeyForDevice({
      account: a,
      username: 'reset_a2',
      targetUsername: 'reset_b2',
      sessions: sessioniA,
      token: 'gettone-di-prova',
      roomKeyContent: {
        algorithm: 'm.megolm.v1.aes-sha2',
        room_id: 'stanza-reset',
        session_id: gruppo.session_id(),
        session_key: gruppo.session_key(),
      },
    });

    expect(apiService.getKeyBundle).toHaveBeenCalled();
    expect(Number(r.type)).toBe(0);
    expect(sessioniA.reset_b2).toHaveLength(2);
    expect(sessioniA.reset_b2[1]).toBe(vecchia);
    const nb = new Olm.Session();
    nb.create_inbound(b, r.body);
    expect(JSON.parse(nb.decrypt(0, r.body)).content.session_id).toBe(gruppo.session_id());
  });
});

describe('App.jsx', () => {
  const app = readFileSync('src/App.jsx', 'utf8').replace(/\r\n/g, '\n');
  it('il ramo session_reset ritira le sessioni invece di cancellarle', () => {
    const inizio = app.indexOf("if (messageType === 'session_reset') {");
    const ramo = app.slice(inizio, app.indexOf('/* ── v1.11-AB', inizio));
    expect(ramo).toContain('olmService.ritiraSessioniPerInvio(username, resetSender, current)');
    expect(ramo).not.toContain('delete current[resetSender]');
  });
});
