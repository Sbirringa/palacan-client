// tests/statoGruppo.test.js
//
// METADATI A4.2b: stato del gruppo cifrato e firmato. Firme Ed25519 vere (Node) al posto di Olm; server finto
// con la stessa regola del backend (scrittura solo alla versione attesa, altrimenti 409).
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto, generateKeyPairSync, sign, verify } from 'node:crypto';

vi.mock('../src/crypto/olm.js', () => ({ default: { Utility: class { ed25519_verify() { throw new Error('non usato nei test'); } free() {} } } }));
vi.mock('../src/utils/cronologiaLocale', () => ({ salvaDato: vi.fn(async () => true), leggiDato: vi.fn(async () => null) }));
vi.mock('../src/apiService', () => ({ getRoomState: vi.fn(), putRoomState: vi.fn(), queryMatrixKeys: vi.fn() }));
import { confermaSegreto, nuovoSegretoStanza, dimenticaSegreti } from '../src/utils/segretiStanze';
import { nomeLocale, dimenticaNomi } from '../src/utils/nomiStanze';
import {
  cifraStato, decifraStato, transizioneValida, sincronizzaStatoGruppo, aggiornaNomeStatoGruppo, statoConosciuto, dimenticaStati, canonico,
} from '../src/utils/statoGruppo';

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

const chiaviPubbliche = new Map();
const pubblicate = new Set();
function persona(nome) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const chiave = publicKey.export({ format: 'jwk' }).x;
  chiaviPubbliche.set(chiave, publicKey);
  pubblicate.add(`${nome}|${chiave}`);
  return { nome, chiave, firmatore: (testo) => sign(null, Buffer.from(testo), privateKey).toString('base64') };
}
const verifica = (chiave, testo, firma) => {
  const k = chiaviPubbliche.get(chiave);
  return Boolean(k) && verify(null, Buffer.from(testo), k, Buffer.from(firma, 'base64'));
};
const chiavePubblicata = async (utente, chiave) => pubblicate.has(`${utente}|${chiave}`);

let server;
const leggi = async () => ({ stato: server.stato, versione: server.versione });
const scrivi = async (stanza, gettone, stato, attesa) => {
  if (attesa !== server.versione) throw Object.assign(new Error('conflitto'), { status: 409 });
  server.stato = stato;
  server.versione += 1;
  return { versione: server.versione };
};

const STANZA = 'stanza-1';
let segreto;
let alice;
let bob;
let carol;
const utenti = (nomi, creatore = 'alice') => Object.assign(nomi.map((n) => ({ username: n })), { creatore });
const da = (p) => ({ roomId: STANZA, io: p.nome, token: 't', firmatore: p.firmatore, miaChiave: p.chiave, leggi, scrivi, verifica, chiavePubblicata });

describe('stato del gruppo cifrato e firmato (metadati A4.2b)', () => {
  beforeEach(() => {
    dimenticaStati(); dimenticaSegreti(); dimenticaNomi();
    server = { stato: null, versione: 0 };
    segreto = nuovoSegretoStanza();
    confermaSegreto(STANZA, segreto, 'v'.repeat(64));
    alice = persona('alice'); bob = persona('bob'); carol = persona('carol');
  });

  it('cifrato: si apre solo con il segreto giusto e sulla stanza giusta', async () => {
    const blob = await cifraStato(segreto, STANZA, { a: 1 });
    expect(await decifraStato(segreto, STANZA, blob)).toEqual({ a: 1 });
    await expect(decifraStato(segreto, 'altra-stanza', blob)).rejects.toBeTruthy();
    await expect(decifraStato(nuovoSegretoStanza(), STANZA, blob)).rejects.toBeTruthy();
  });

  it('regole: solo il creatore rinomina e toglie altri; ciascuno esce per se\'; chiunque aggiunge', () => {
    const base = { v: 1, stanza: STANZA, versione: 1, creatore: 'alice', membri: ['alice', 'bob', 'carol'], nome: 'A', autore: 'alice' };
    const poi = (campi) => ({ ...base, versione: 2, ...campi });
    expect(transizioneValida(base, poi({ autore: 'bob', nome: 'B' }), STANZA)).toBe(false);
    expect(transizioneValida(base, poi({ autore: 'alice', nome: 'B' }), STANZA)).toBe(true);
    expect(transizioneValida(base, poi({ autore: 'bob', membri: ['alice', 'bob'] }), STANZA)).toBe(false);
    expect(transizioneValida(base, poi({ autore: 'bob', membri: ['alice', 'carol'] }), STANZA)).toBe(true);
    expect(transizioneValida(base, poi({ autore: 'bob', membri: ['alice', 'bob', 'carol', 'dave'] }), STANZA)).toBe(true);
    expect(transizioneValida(base, poi({ autore: 'bob', creatore: 'bob' }), STANZA)).toBe(false);
    expect(transizioneValida(base, { ...base, autore: 'alice' }, STANZA)).toBe(false);
  });

  it('primo stato creato dai partecipanti, leggibile e verificabile da un altro membro', async () => {
    expect(await sincronizzaStatoGruppo({ ...da(alice), utenti: utenti(['alice', 'bob']) })).toBe(true);
    expect(server.versione).toBe(1);
    const dentro = await decifraStato(segreto, STANZA, server.stato);
    expect(dentro).toMatchObject({ creatore: 'alice', membri: ['alice', 'bob'], autore: 'alice', versione: 1 });
    dimenticaStati();
    expect(await sincronizzaStatoGruppo({ ...da(bob), utenti: utenti(['alice', 'bob']) })).toBe(true);
    expect(statoConosciuto(STANZA).creatore).toBe('alice');
  });

  it('firma con una chiave non pubblicata per l\'autore: stato respinto', async () => {
    await sincronizzaStatoGruppo({ ...da(alice), utenti: utenti(['alice', 'bob']) });
    dimenticaStati();
    pubblicate.delete(`alice|${alice.chiave}`);
    expect(await sincronizzaStatoGruppo({ ...da(bob), utenti: utenti(['alice', 'bob']) })).toBe(false);
    expect(statoConosciuto(STANZA)).toBeNull();
  });

  it('allineamento: un membro aggiunge chi manca, solo il creatore toglie chi non c\'e\' piu\'', async () => {
    await sincronizzaStatoGruppo({ ...da(alice), utenti: utenti(['alice', 'bob']) });
    await sincronizzaStatoGruppo({ ...da(bob), utenti: utenti(['alice', 'bob', 'carol']) });
    expect(statoConosciuto(STANZA).membri).toEqual(['alice', 'bob', 'carol']);
    await sincronizzaStatoGruppo({ ...da(bob), utenti: utenti(['alice', 'bob']) });
    expect(statoConosciuto(STANZA).membri).toEqual(['alice', 'bob', 'carol']);
    await sincronizzaStatoGruppo({ ...da(alice), utenti: utenti(['alice', 'bob']) });
    expect(statoConosciuto(STANZA).membri).toEqual(['alice', 'bob']);
    expect(server.versione).toBe(3);
  });

  it('rinomina: solo il creatore; il nome si impara sul dispositivo', async () => {
    await sincronizzaStatoGruppo({ ...da(alice), utenti: utenti(['alice', 'bob']) });
    expect(await aggiornaNomeStatoGruppo({ ...da(bob), nome: 'Nome di bob' })).toBe(false);
    expect(await aggiornaNomeStatoGruppo({ ...da(alice), nome: 'Calcetto' })).toBe(true);
    expect(statoConosciuto(STANZA).nome).toBe('Calcetto');
    expect(nomeLocale(STANZA)).toBe('Calcetto');
  });

  it('un membro che si finge creatore per rinominare: respinto da chi legge', async () => {
    await sincronizzaStatoGruppo({ ...da(alice), utenti: utenti(['alice', 'bob']) });
    const vero = await decifraStato(segreto, STANZA, server.stato);
    const falso = { ...vero, versione: 2, nome: 'Rinomina abusiva', autore: 'bob', chiave_firma: bob.chiave, modificato_il: new Date().toISOString() };
    delete falso.firma;
    falso.firma = bob.firmatore(canonico(falso));
    server = { stato: await cifraStato(segreto, STANZA, falso), versione: 2 };
    expect(await sincronizzaStatoGruppo({ ...da(alice), utenti: utenti(['alice', 'bob']) })).toBe(false);
    expect(statoConosciuto(STANZA).nome).toBeNull();
  });

  it('conflitto di versione (409): nessun errore, si riprova alla prossima sincronizzazione', async () => {
    const scriviInConflitto = async () => { throw Object.assign(new Error('conflitto'), { status: 409 }); };
    expect(await sincronizzaStatoGruppo({ ...da(alice), scrivi: scriviInConflitto, utenti: utenti(['alice', 'bob']) })).toBe(false);
    expect(statoConosciuto(STANZA)).toBeNull();
  });

  it('App e apiService collegati', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    for (const pezzo of ['sincronizzaStatoGruppo({ roomId: normalizedRoom, utenti: users', 'aggiornaNomeStatoGruppo({ roomId: stanza, nome: pulito', 'dimenticaStati();']) expect(app).toContain(pezzo);
    const api = readFileSync('src/apiService.js', 'utf8');
    for (const pezzo of ['export const getRoomState', 'export const putRoomState', 'users.creatore =']) expect(api).toContain(pezzo);
  });
});
