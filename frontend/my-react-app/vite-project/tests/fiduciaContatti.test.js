// tests/fiduciaContatti.test.js  [palacan-l4c3]
//
// L4c3 (Chiusura limiti): firma incrociata ibrida, lato contatti, con crittografia VERA (ed25519 + ML-DSA-65).
//   - contatto senza chiave principale (app vecchia): regole di prima, tutti i dispositivi ammessi;
//   - con chiave principale: ricevono le chiavi solo i dispositivi FIRMATI; quelli non firmati si contano e restano
//     fuori; le chiavi dei firmati diventano "note" (nessun avviso TOFU per un telefono nuovo firmato);
//   - TOFU sulla chiave principale: se cambia, avviso (con "verificato" se la si era verificata);
//   - declassamento: chiave ricordata e server che non la consegna o la consegna rotta -> vale quella ricordata;
//   - olmService: nessuna chiave ai non firmati e nessun ripiego sul bundle singolo che lo aggirerebbe;
//   - numero di sicurezza v2 (60 cifre, uguale dai due lati, non cambia con i dispositivi) e QR v2.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

vi.mock('../src/apiService.js', () => ({
  getDeviceBundles: vi.fn(),
  getKeyBundle: vi.fn(),
}));

import * as apiService from '../src/apiService.js';
import * as olmService from '../src/olmService.js';
import Olm from '../src/crypto/olm.js';
import {
  nuovaChiavePrincipale, firmaConPrincipale, testoAutofirma, testoFirmaDispositivo, CONTESTO_PRINCIPALE, CONTESTO_DISPOSITIVO,
} from '../src/utils/chiavePrincipale';
import { creaContenutoQr, creaContenutoQrV2, confrontaQr, leggiContenutoQr, ESITI_QR } from '../src/utils/verificaQr';

const MODULO = '../src/utils/fiduciaContatti.js';
const MODULO_NON_FIRMATI = '../src/utils/dispositiviNonFirmati.js';
let fc = null;
let nf = null;

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
  await olmService.initOlm();  // l'account Olm vero di olmService
  fc = await import(/* @vite-ignore */ MODULO).catch(() => null);
  nf = await import(/* @vite-ignore */ MODULO_NON_FIRMATI).catch(() => null);
});

function carica() {
  expect(fc, 'manca la fiducia sulla chiave principale dei contatti').not.toBeNull();
  return fc;
}

// chiave principale di "nome" com'e' sul server (con l'autofirma) + firma dei suoi dispositivi
async function persona(nome) {
  const m = await nuovaChiavePrincipale();
  const auto = firmaConPrincipale(m, CONTESTO_PRINCIPALE, testoAutofirma(nome, m.ed, m.impronta));
  const vista = { ed: m.ed, pq: m.pq, impronta: m.impronta, firma_ed: auto.fe, firma_pq: auto.fq, versione: 1 };
  const firmato = (deviceId, curva) => {
    const f = firmaConPrincipale(m, CONTESTO_DISPOSITIVO, testoFirmaDispositivo(nome, deviceId, curva));
    return { device_id: deviceId, identity_key: curva, one_time_key: 'otk', firma_principale: { impronta: m.impronta, firma_ed: f.fe, firma_pq: f.fq } };
  };
  const nonFirmato = (deviceId, curva) => ({ device_id: deviceId, identity_key: curva, one_time_key: 'otk', firma_principale: null });
  return { m, vista, firmato, nonFirmato };
}

const conPrincipale = (lista, principale) => Object.assign([...lista], { principale });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('L4c3 - dispositivi dei contatti e chiave principale', () => {
  it('contatto senza chiave principale (app vecchia): tutti ammessi, niente ricordato', async () => {
    const f = carica();
    const lista = [{ device_id: 'a', identity_key: 'A' }, { device_id: 'b', identity_key: 'B' }];
    const r = await f.filtraDispositiviFirmati({ io: 'alice', utente: 'bob', bundles: lista });
    expect(r.ammessi).toEqual(lista);
    expect(f.principaleDelContatto('alice', 'bob')).toBeNull();
  });

  it('solo i dispositivi firmati ricevono; i non firmati si contano; le chiavi dei firmati diventano note', async () => {
    const f = carica();
    const bob = await persona('bob');
    const tel = bob.firmato('tel', 'CURVA_TEL');
    const pc = bob.firmato('pc', 'CURVA_PC');
    const intruso = bob.nonFirmato('intruso', 'CURVA_INTRUSO');
    const note = vi.fn();
    const r = await f.filtraDispositiviFirmati({ io: 'alice', utente: 'bob', bundles: conPrincipale([tel, intruso, pc], bob.vista), aggiungiNote: note });
    expect(r.ammessi.map((b) => b.device_id), 'un dispositivo non firmato riceve le chiavi').toEqual(['tel', 'pc']);
    expect(r.esclusi.map((b) => b.device_id)).toEqual(['intruso']);
    expect(nf.contaNonFirmati('alice', 'bob')).toBe(1);
    expect(note).toHaveBeenCalledWith('alice', 'bob', ['CURVA_TEL', 'CURVA_PC']);
    // firma di bob spostata su un altro dispositivo: esclusa
    const spostata = { ...intruso, firma_principale: tel.firma_principale };
    expect((await f.filtraDispositiviFirmati({ io: 'alice', utente: 'bob', bundles: conPrincipale([spostata], bob.vista) })).ammessi).toEqual([]);
  });

  it('TOFU sulla chiave principale: se cambia, avviso; "verificato" se la si era verificata', async () => {
    const f = carica();
    const bob = await persona('bob');
    const segnala = vi.fn();
    expect((await f.valutaPrincipale({ io: 'alice', utente: 'bob', principale: bob.vista, segnalaCambio: segnala })).stato).toBe('nuova');
    expect((await f.valutaPrincipale({ io: 'alice', utente: 'bob', principale: bob.vista, segnalaCambio: segnala })).stato).toBe('nota');
    expect(segnala).not.toHaveBeenCalled();
    f.segnaPrincipaleVerificata('alice', 'bob', bob.vista.impronta);
    const nuovo = await persona('bob');
    expect((await f.valutaPrincipale({ io: 'alice', utente: 'bob', principale: nuovo.vista, segnalaCambio: segnala })).stato).toBe('cambiata');
    expect(segnala).toHaveBeenCalledWith('alice', 'bob', { previousKey: bob.vista.impronta, newKey: nuovo.vista.impronta, tipo: 'principale', verificato: true });
    expect(f.principaleDelContatto('alice', 'bob').impronta).toBe(nuovo.vista.impronta);
  });

  it('declassamento: chiave ricordata e server che non la consegna o la consegna rotta -> vale quella ricordata', async () => {
    const f = carica();
    const bob = await persona('bob');
    await f.valutaPrincipale({ io: 'alice', utente: 'bob', principale: bob.vista });
    const tel = bob.firmato('tel', 'CURVA_TEL');
    const falso = { device_id: 'falso', identity_key: 'CURVA_FALSA', firma_principale: null };
    const senza = await f.filtraDispositiviFirmati({ io: 'alice', utente: 'bob', bundles: [tel, falso] });
    expect(senza.ammessi.map((b) => b.device_id), 'senza chiave principale si torna alle regole vecchie').toEqual(['tel']);
    const zed = await persona('zed');
    const rotta = { ...bob.vista, firma_pq: zed.vista.firma_pq };
    const conRotta = await f.filtraDispositiviFirmati({ io: 'alice', utente: 'bob', bundles: conPrincipale([tel, falso], rotta) });
    expect(conRotta.ammessi.map((b) => b.device_id)).toEqual(['tel']);
    expect(f.principaleDelContatto('alice', 'bob').impronta).toBe(bob.vista.impronta);
    // chiave principale di un altro (con la sua autofirma valida per "zed") presentata come quella di bob: rifiutata
    expect((await f.valutaPrincipale({ io: 'alice', utente: 'bob', principale: zed.vista })).stato).toBe('non_valida');
  });

  it('olmService: nessuna chiave ai dispositivi non firmati e nessun ripiego sul bundle singolo', async () => {
    carica();
    expect(typeof olmService.segnalaCambioIdentita, 'manca segnalaCambioIdentita').toBe('function');
    const bob = await persona('bob');
    const alice = olmService.createOlmAccount('alice_l4c3');
    apiService.getDeviceBundles.mockResolvedValue(conPrincipale([bob.nonFirmato('intruso', 'CURVA_INTRUSO')], bob.vista));
    const roomKeyContent = { algorithm: 'm.megolm.v1.aes-sha2', room_id: 'r', session_id: 's', session_key: 'k' };
    const r = await olmService.encryptRoomKeyForAllDevices({ account: alice, username: 'alice_l4c3', targetUsername: 'bob', sessions: {}, token: 't', roomKeyContent });
    expect(r, 'chiave mandata a un dispositivo non firmato').toEqual([]);
    expect(apiService.getKeyBundle, 'ripiego sul bundle singolo').not.toHaveBeenCalled();
    // il server non risponde: con una chiave principale ricordata niente ripiego sul bundle singolo
    apiService.getDeviceBundles.mockRejectedValue(new Error('giu'));
    const r2 = await olmService.encryptRoomKeyForAllDevices({ account: alice, username: 'alice_l4c3', targetUsername: 'bob', sessions: {}, token: 't', roomKeyContent });
    expect(r2).toEqual([]);
    expect(apiService.getKeyBundle).not.toHaveBeenCalled();
  });

  it('cambio della chiave principale di un contatto verificato: invio bloccato (come L4a)', async () => {
    carica();
    olmService.segnalaCambioIdentita('alice', 'bob', { previousKey: 'a'.repeat(64), newKey: 'b'.repeat(64), tipo: 'principale', verificato: true });
    expect(olmService.invioBloccatoPerIdentita('alice', 'bob')).toBe(true);
    expect(olmService.getPeerIdentityChangeWarning('alice', 'bob').tipo).toBe('principale');
    olmService.acknowledgePeerIdentityChange('alice', 'bob');
    expect(olmService.invioBloccatoPerIdentita('alice', 'bob')).toBe(false);
  });

  it('i dispositivi firmati diventano chiavi note: nessun avviso TOFU quando si incontrano', () => {
    carica();
    olmService.aggiungiChiaviNoteDelContatto('alice', 'bob', ['CURVA_1', 'CURVA_2']);
    expect(olmService.chiaviNoteDelContatto('alice', 'bob').sort()).toEqual(['CURVA_1', 'CURVA_2']);
  });
});

describe('L4c3 - numero di sicurezza v2 e QR v2', () => {
  it('60 cifre, uguale dai due lati, cambia se cambia una chiave principale', async () => {
    const f = carica();
    const a = await persona('alice');
    const b = await persona('bob');
    const n1 = await f.numeroSicurezzaV2('alice', a.m, 'bob', b.m);
    expect(n1).toMatch(/^(\d{5} ){11}\d{5}$/);
    expect(await f.numeroSicurezzaV2('Bob', b.m, 'alice', a.m)).toBe(n1);
    const b2 = await persona('bob');
    expect(await f.numeroSicurezzaV2('alice', a.m, 'bob', b2.m)).not.toBe(n1);
  }, 60000);  // 5200 SHA-512 per persona: con tutti i test in parallelo puo' superare i 5 secondi

  it('QR v2: giusto, chiave principale sostituita da una parte o dall\'altra, e v1 ancora letto', async () => {
    carica();
    const ia = 'a'.repeat(64);
    const ib = 'b'.repeat(64);
    // codice mostrato da bob: "io sono bob con ib, per alice ho ia"
    const qr = creaContenutoQrV2({ io: 'bob', improntaIo: ib, contatto: 'alice', improntaContatto: ia });
    expect(leggiContenutoQr(qr)).toEqual({ v: 2, a: 'bob', ma: ib, b: 'alice', mb: ia });
    const alice = { io: 'alice', contatto: 'bob', improntaMia: ia, improntaContatto: ib };
    expect(confrontaQr(qr, alice)).toEqual({ esito: ESITI_QR.OK, versione: 2, improntaContatto: ib });
    expect(confrontaQr(qr, { ...alice, improntaMia: 'c'.repeat(64) }).esito).toBe(ESITI_QR.TUA_CHIAVE_DIVERSA);
    expect(confrontaQr(qr, { ...alice, improntaContatto: 'c'.repeat(64) }).esito).toBe(ESITI_QR.CHIAVE_MAI_VISTA);
    expect(confrontaQr(qr, { ...alice, improntaMia: null }).esito).toBe(ESITI_QR.SENZA_PRINCIPALE);
    expect(leggiContenutoQr(qr.replace('"v":2', '"v":1'))).toBeNull();
    const v1 = creaContenutoQr({ io: 'bob', chiaveIo: 'KB', contatto: 'alice', chiaveContatto: 'KA' });
    expect(confrontaQr(v1, { io: 'alice', chiaveIo: 'KA', contatto: 'bob', chiaviNoteContatto: ['KB'] })).toEqual({ esito: ESITI_QR.OK, chiaveContatto: 'KB' });
    expect(/^[\x20-\x7e]+$/.test(creaContenutoQr({ io: 'Nicolò', chiaveIo: 'K', contatto: 'bob', chiaveContatto: 'K' }))).toBe(true);
  });

  it('collegamenti: olmService, App, apiService, pannello e banner', () => {
    carica();
    const svc = readFileSync('src/olmService.js', 'utf8');
    for (const pezzo of ['filtraDispositiviFirmati({', 'export function segnalaCambioIdentita(', 'export function aggiungiChiaviNoteDelContatto(']) {
      expect(svc, `olmService: manca ${pezzo}`).toContain(pezzo);
    }
    expect(readFileSync('src/App.jsx', 'utf8')).toContain('ammessoDaChiavePrincipale({');
    const api = readFileSync('src/apiService.js', 'utf8');
    expect(api.slice(api.indexOf('export const getDeviceBundles'))).toContain('bundles.principale =');
    expect(readFileSync('src/components/SafetyNumberPanel.jsx', 'utf8')).toContain('numeroSicurezzaV2(');
    expect(readFileSync('src/components/IdentityChangeWarningBanner.jsx', 'utf8')).toContain('contaNonFirmati(');
  });
});
