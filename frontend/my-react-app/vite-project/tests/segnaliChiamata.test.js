// tests/segnaliChiamata.test.js  [palacan-l4e]
//
// L4e (Chiusura limiti): offerta, risposta e candidati ICE delle chiamate cifrati end-to-end con la chiave Megolm
// della chat, con crittografia VERA (sessioni Megolm di vodozemac, cifratura di olmService). Si prova che:
//   - il server vede solo una busta: niente SDP, niente indirizzi, niente "video";
//   - chi riceve scarta: segnali in chiaro, chiavi sconosciute o nostre, chat/tipo/mittente diversi da quelli dentro,
//     ciphertext alterati, doppioni e segnali vecchi;
//   - la chiave della chat che arriva un attimo dopo il segnale non perde la chiamata;
//   - App.jsx collega davvero cifratura e apertura (nessun segnale da cifrare consegnato senza aprirlo).
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

vi.mock('../src/apiService.js', () => ({
  getDeviceBundles: vi.fn(),
  getKeyBundle: vi.fn(),
}));

import * as olmService from '../src/olmService.js';
import Olm from '../src/crypto/olm.js';
import { registraCreatore } from '../src/utils/creatoriChiavi';

const MODULO = '../src/utils/segnaliChiamata.js';
let sc = null;

const IO = 'bob_l4e';
const LUI = 'alice_l4e';
const STANZA = 'stanza_l4e_1';
const OFFERTA = { sdp: { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 203.0.113.7\r\na=fingerprint:sha-256 AA:BB:CC\r\n' }, video: true };

function coppia(creatore, { stanza = STANZA, verifica = 'coerente' } = {}) {
  const uscita = new Olm.OutboundGroupSession();
  uscita.create();
  const entrata = new Olm.InboundGroupSession();
  entrata.create(uscita.session_key());
  const sid = entrata.session_id();
  if (creatore) registraCreatore(IO, sid, { utente: creatore, stanza, verifica });
  return { uscita, entrata, sid, sessioni: { [sid]: entrata } };
}

function evento(busta, { tipo = 'invite', stanza = STANZA, da = LUI } = {}) {
  return { signal_type: tipo, room_id: stanza, from_user_id: 'id_alice', from_username: da, data: busta };
}

function cifra(c, { tipo = 'invite', stanza = STANZA, da = LUI, dati = OFFERTA, ora } = {}) {
  return sc.cifraSegnale({ olm: olmService, sessione: c.uscita, stanza, tipo, mittente: da, dati, ...(ora ? { ora } : {}) });
}

const apri = (c, ev, extra = {}) => sc.apriSegnale({ olm: olmService, evento: ev, sessioni: c.sessioni, io: IO, ...extra });

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
  await olmService.initOlm();
  sc = await import(/* @vite-ignore */ MODULO).catch(() => null);
});

beforeEach(() => {
  localStorage.clear();
  sc?._azzeraSegnali();
});

describe('L4e - segnali di chiamata cifrati end-to-end (crittografia vera)', () => {
  it('il modulo esiste', () => {
    expect(sc, 'manca src/utils/segnaliChiamata.js: i segnali di chiamata vanno in chiaro verso il server').not.toBeNull();
  });

  it('al server arriva solo una busta: niente SDP, niente indirizzi, niente "video"; chi riceve la apre', () => {
    const c = coppia(LUI);
    const busta = cifra(c);
    expect(Object.keys(busta).sort()).toEqual(['ciphertext', 'e2e', 'session_id']);
    const visto = JSON.stringify(busta);
    for (const segreto of ['v=0', '203.0.113.7', 'fingerprint', 'offer', 'video']) expect(visto).not.toContain(segreto);
    const esito = apri(c, evento(busta));
    expect(esito).toEqual({ stato: 'ok', dati: OFFERTA });
  });

  it('risposta e candidati ICE: stesso giro', () => {
    const c = coppia(LUI);
    const risposta = { sdp: { type: 'answer', sdp: 'v=0\r\na=fingerprint:sha-256 DD:EE\r\n' } };
    expect(apri(c, evento(cifra(c, { tipo: 'answer', dati: risposta }), { tipo: 'answer' }))).toEqual({ stato: 'ok', dati: risposta });
    const ice = { candidate: 'candidate:1 1 udp 2122260223 198.51.100.4 54400 typ relay', sdpMid: '0', sdpMLineIndex: 0 };
    const busta = cifra(c, { tipo: 'ice_candidate', dati: ice });
    expect(JSON.stringify(busta)).not.toContain('198.51.100.4');
    expect(apri(c, evento(busta, { tipo: 'ice_candidate' }))).toEqual({ stato: 'ok', dati: ice });
  });

  it('in chiaro: scartato (offerta, risposta e candidati); rifiuto e fine passano come prima', () => {
    const c = coppia(LUI);
    for (const tipo of ['invite', 'answer', 'ice_candidate']) {
      expect(apri(c, evento(OFFERTA, { tipo }))).toEqual({ stato: 'scartato', motivo: 'in_chiaro' });
      expect(apri(c, evento(null, { tipo })).stato).toBe('scartato');
    }
    expect(apri(c, evento(null, { tipo: 'reject' }))).toEqual({ stato: 'ok', dati: null });
    expect(apri(c, evento(null, { tipo: 'end' }))).toEqual({ stato: 'ok', dati: null });
  });

  it('chiave della chat non ancora arrivata: "manca_chiave" (si riprova), non scartato', () => {
    const c = coppia(LUI);
    const busta = cifra(c);
    expect(apri(c, evento(busta), { sessioni: {} })).toEqual({ stato: 'manca_chiave' });
    expect(apri(c, evento(busta)).stato).toBe('ok');
  });

  it('il server non puo\' cambiare chat, tipo o mittente fuori dalla busta', () => {
    const c = coppia(LUI);
    expect(apri(c, evento(cifra(c), { stanza: 'altra_stanza' })).motivo).toBe('altra_chat');
    expect(apri(c, evento(cifra(c), { tipo: 'answer' })).motivo).toBe('tipo_diverso');
    expect(apri(c, evento(cifra(c), { da: 'carol_l4e' })).motivo).toBe('mittente_diverso');
  });

  it('la chiave deve essere del contatto che chiama: chiave di un altro, nostra o sconosciuta -> scartato', () => {
    const diCarol = coppia('carol_l4e');
    expect(apri(diCarol, evento(cifra(diCarol))).motivo).toBe('autore_diverso');
    const nostra = coppia(IO, { verifica: 'propria' });
    expect(apri(nostra, evento(cifra(nostra))).motivo).toBe('chiave_nostra');
    const ignota = coppia(null);
    expect(apri(ignota, evento(cifra(ignota))).motivo).toBe('autore_sconosciuto');
    const altraChat = coppia(LUI, { stanza: 'altra_stanza' });
    expect(apri(altraChat, evento(cifra(altraChat))).motivo).toBe('altra_chat');
    const giusta = coppia(LUI);
    expect(apri(giusta, evento(cifra(giusta), { da: IO })).motivo).toBe('da_noi');
  });

  it('ciphertext alterato: non decifrabile', () => {
    const c = coppia(LUI);
    const busta = cifra(c);
    const meta = Math.floor(busta.ciphertext.length / 2);
    const rotto = { ...busta, ciphertext: busta.ciphertext.slice(0, meta) + (busta.ciphertext[meta] === 'A' ? 'B' : 'A') + busta.ciphertext.slice(meta + 1) };
    expect(apri(c, evento(rotto)).stato).toBe('scartato');
  });

  it('doppioni e segnali vecchi: scartati (un\'offerta registrata non si riusa)', () => {
    const c = coppia(LUI);
    const busta = cifra(c);
    expect(apri(c, evento(busta)).stato).toBe('ok');
    expect(apri(c, evento(busta)).stato).toBe('scartato');  // 'ripetuto' (o rifiutato gia' da vodozemac)
    const vecchia = cifra(c, { ora: Date.now() - sc.VALIDITA_MS - 1000 });
    expect(apri(c, evento(vecchia)).motivo).toBe('scaduto');
  });

  it('riceviConAttesa: la chiave arriva dopo -> consegnato una volta; non arriva mai -> scartato', () => {
    vi.useFakeTimers();
    try {
      const consegna = vi.fn();
      const scarta = vi.fn();
      let giri = 0;
      sc.riceviConAttesa({ apri: () => (++giri < 3 ? { stato: 'manca_chiave' } : { stato: 'ok', dati: 'x' }), consegna, scarta });
      vi.advanceTimersByTime(sc.INTERVALLO_ATTESA_MS * 5);
      expect(consegna).toHaveBeenCalledTimes(1);
      expect(consegna).toHaveBeenCalledWith('x');
      expect(scarta).not.toHaveBeenCalled();

      const consegna2 = vi.fn();
      const scarta2 = vi.fn();
      sc.riceviConAttesa({ apri: () => ({ stato: 'manca_chiave' }), consegna: consegna2, scarta: scarta2 });
      vi.advanceTimersByTime(sc.INTERVALLO_ATTESA_MS * (sc.TENTATIVI_ATTESA + 2));
      expect(consegna2).not.toHaveBeenCalled();
      expect(scarta2).toHaveBeenCalledWith('chiave_mai_arrivata');
    } finally {
      vi.useRealTimers();
    }
  });

  it('inCoda: una cifratura alla volta', async () => {
    const ordine = [];
    const lenta = () => new Promise((r) => setTimeout(() => { ordine.push('a'); r(); }, 20));
    await Promise.all([sc.inCoda(lenta), sc.inCoda(async () => { ordine.push('b'); })]);
    expect(ordine).toEqual(['a', 'b']);
  });

  it('App.jsx collega cifratura e apertura dei segnali', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app, 'App.jsx: i segnali di chiamata vanno in chiaro verso il server').toContain('cifraSegnale: (...argomenti) => cifraSegnaleChiamataRef.current');
    expect(app).toContain('apriSegnaleChiamataRef.current(data);');
    expect(app).toContain('if (!segnaleDaCifrare(data?.signal_type)) setCallSignalEvent({ ...data, _receivedAt: Date.now() });');
    expect(app).not.toMatch(/\n {4}setCallSignalEvent\(\{ \.\.\.data, _receivedAt: Date\.now\(\) \}\);\n {2}\}, \[\]\);/);
  });
});
