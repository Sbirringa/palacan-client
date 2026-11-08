// tests/verificaQr.test.jsx  [palacan-l4b]
//
// L4b (Chiusura limiti): verifica dell'identita' con codice QR (come Signal), tutto sul dispositivo.
//   - il codice si genera e si rilegge identico (anche con lettere accentate nel nome);
//   - chi inquadra accetta SOLO se la chiave del dispositivo che ha davanti e' una di quelle con cui parla davvero E
//     se l'altro vede la sua chiave vera: con Olm VERA si simula il server che sostituisce una chiave (in mezzo dalla
//     mia parte e dalla sua) e la verifica deve dire di no;
//   - il pannello "Verifica identita'" mostra il codice e ha il pulsante per inquadrare;
//   - i testi del pannello esistono nelle 5 lingue (prima non c'erano: si vedeva l'italiano a tutti).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../src/apiService.js', () => ({
  getKeyBundle: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => (typeof opts === 'object' && opts?.defaultValue) || (typeof opts === 'string' ? opts : key),
  }),
}));

import * as apiService from '../src/apiService.js';
import * as olmService from '../src/olmService.js';

const MODULO = '../src/utils/verificaQr.js';

async function carica() {
  const modulo = await import(/* @vite-ignore */ MODULO).catch(() => null);
  expect(modulo, 'manca la verifica con codice QR').not.toBeNull();
  return modulo;
}

// disegna la matrice come una foto in bianco e nero (6 pixel per modulo, bordo bianco) e la rilegge col lettore vero
function fotografa(matrice) {
  const lato = matrice.length;
  const scala = 6;
  const bordo = 4;
  const w = (lato + 2 * bordo) * scala;
  const px = new Uint8ClampedArray(w * w * 4).fill(255);
  matrice.forEach((riga, r) => riga.forEach((nero, c) => {
    if (!nero) return;
    for (let y = 0; y < scala; y += 1) {
      for (let x = 0; x < scala; x += 1) {
        const i = (((r + bordo) * scala + y) * w + ((c + bordo) * scala + x)) * 4;
        px[i] = 0; px[i + 1] = 0; px[i + 2] = 0;
      }
    }
  }));
  return { px, w };
}

beforeEach(async () => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('L4b - codice QR: si genera e si rilegge', () => {
  it('andata e ritorno, anche con lettere accentate', async () => {
    const m = await carica();
    for (const io of ['alice', 'Nicolò']) {
      const testo = m.creaContenutoQr({ io, chiaveIo: 'A'.repeat(43), contatto: 'bob', chiaveContatto: 'B'.repeat(43) });
      expect(testo.startsWith(m.PREFISSO_QR)).toBe(true);
      expect(/^[\x20-\x7e]+$/.test(testo), 'il codice deve restare ASCII').toBe(true);
      const { px, w } = fotografa(m.matriceQr(testo));
      const letto = m.decodificaQr(px, w, w);
      expect(letto, 'il lettore non rilegge il codice').toBe(testo);
      expect(m.leggiContenutoQr(letto)).toEqual({ a: io.toLowerCase(), ka: 'A'.repeat(43), b: 'bob', kb: 'B'.repeat(43) });
    }
  });

  it('rifiuta codici estranei, rotti o troppo lunghi', async () => {
    const m = await carica();
    for (const brutto of [null, '', 'https://esempio.it', `${m.PREFISSO_QR}{rotto`, `${m.PREFISSO_QR}${JSON.stringify({ v: 2, a: 'a', ka: 'k', b: 'b', kb: 'k' })}`,
      `${m.PREFISSO_QR}${JSON.stringify({ v: 1, a: 'a', ka: '', b: 'b', kb: 'k' })}`, m.PREFISSO_QR + 'x'.repeat(2000)]) {
      expect(m.leggiContenutoQr(brutto)).toBeNull();
    }
    expect(m.decodificaQr(new Uint8ClampedArray(40 * 40 * 4).fill(255), 40, 40)).toBeNull();
  });

  it('confronto: tutti i casi', async () => {
    const m = await carica();
    // codice mostrato da bob: "io sono bob con KB, per alice vedo KA"
    const qr = m.creaContenutoQr({ io: 'bob', chiaveIo: 'KB', contatto: 'alice', chiaveContatto: 'KA' });
    const alice = { io: 'alice', chiaveIo: 'KA', contatto: 'bob', chiaviNoteContatto: ['KB_PC', 'KB'] };
    expect(m.confrontaQr(qr, alice)).toEqual({ esito: m.ESITI_QR.OK, chiaveContatto: 'KB' });
    expect(m.confrontaQr('ciao', alice).esito).toBe(m.ESITI_QR.NON_VALIDO);
    expect(m.confrontaQr(qr, { ...alice, contatto: 'carlo' }).esito).toBe(m.ESITI_QR.ALTRO_CONTATTO);
    expect(m.confrontaQr(qr, { ...alice, io: 'dora' }).esito).toBe(m.ESITI_QR.NON_PER_TE);
    expect(m.confrontaQr(qr, { ...alice, chiaveIo: 'KA_ALTRA' }).esito).toBe(m.ESITI_QR.TUA_CHIAVE_DIVERSA);
    expect(m.confrontaQr(qr, { ...alice, chiaviNoteContatto: ['KB_FALSA'] }).esito).toBe(m.ESITI_QR.CHIAVE_MAI_VISTA);
    expect(m.confrontaQr(qr, { ...alice, chiaviNoteContatto: undefined }).esito).toBe(m.ESITI_QR.CHIAVE_MAI_VISTA);
  });
});

describe('L4b - Olm vera: il server che sostituisce una chiave viene scoperto', () => {
  function dispositivo(nome) {
    const conto = olmService.createOlmAccount(nome);
    return { conto, chiave: JSON.parse(conto.identity_keys()).curve25519, nome };
  }

  // "io" apre una sessione verso "contatto", e il server finto gli consegna la chiave di d
  async function riceveChiave(io, nomeIo, contatto, d) {
    const otk = olmService.generateAndGetOTKs(d.conto, d.nome, 1);
    apiService.getKeyBundle.mockResolvedValue({ identity_key: d.chiave, one_time_key: Object.values(otk)[0], one_time_key_id: 'id' });
    await olmService.getOrCreateOutboundSession({ account: io.conto, username: nomeIo, targetUsername: contatto, sessions: {}, token: 't' });
  }

  it('nessuno in mezzo: verificato; server che sostituisce la chiave da una parte o dall\'altra: rifiutato', async () => {
    const m = await carica();
    expect(typeof olmService.chiaviNoteDelContatto, 'manca chiaviNoteDelContatto').toBe('function');
    await olmService.initOlm();
    const alice = dispositivo('alice_l4b');
    const bob = dispositivo('bob_l4b');
    const intruso = dispositivo('intruso_l4b');

    // caso buono: ognuno vede la chiave vera dell'altro
    await riceveChiave(alice, 'alice_l4b', 'bob_l4b', bob);
    await riceveChiave(bob, 'bob_l4b', 'alice_l4b', alice);
    const qrBob = m.creaContenutoQr({ io: 'bob_l4b', chiaveIo: bob.chiave, contatto: 'alice_l4b', chiaveContatto: olmService.loadPeerIdentityKey('bob_l4b', 'alice_l4b') });
    const ok = m.confrontaQr(qrBob, { io: 'alice_l4b', chiaveIo: alice.chiave, contatto: 'bob_l4b', chiaviNoteContatto: olmService.chiaviNoteDelContatto('alice_l4b', 'bob_l4b') });
    expect(ok).toEqual({ esito: m.ESITI_QR.OK, chiaveContatto: bob.chiave });

    // in mezzo dalla parte di alice: il server le ha dato la chiave dell'intruso al posto di quella di bob
    localStorage.clear();
    await riceveChiave(alice, 'alice_l4b', 'bob_l4b', intruso);
    const mezzoAlice = m.confrontaQr(qrBob, { io: 'alice_l4b', chiaveIo: alice.chiave, contatto: 'bob_l4b', chiaviNoteContatto: olmService.chiaviNoteDelContatto('alice_l4b', 'bob_l4b') });
    expect(mezzoAlice.esito, 'chiave sostituita dalla parte di chi inquadra non scoperta').toBe(m.ESITI_QR.CHIAVE_MAI_VISTA);

    // in mezzo dalla parte di bob: bob vede per alice la chiave dell'intruso
    localStorage.clear();
    await riceveChiave(alice, 'alice_l4b', 'bob_l4b', bob);
    await riceveChiave(bob, 'bob_l4b', 'alice_l4b', intruso);
    const qrBobIngannato = m.creaContenutoQr({ io: 'bob_l4b', chiaveIo: bob.chiave, contatto: 'alice_l4b', chiaveContatto: olmService.loadPeerIdentityKey('bob_l4b', 'alice_l4b') });
    const mezzoBob = m.confrontaQr(qrBobIngannato, { io: 'alice_l4b', chiaveIo: alice.chiave, contatto: 'bob_l4b', chiaviNoteContatto: olmService.chiaviNoteDelContatto('alice_l4b', 'bob_l4b') });
    expect(mezzoBob.esito, 'chiave sostituita dalla parte di chi mostra il codice non scoperta').toBe(m.ESITI_QR.TUA_CHIAVE_DIVERSA);
  });

  it('chiaviNoteDelContatto: tutte le chiavi gia\' viste del contatto, nessuna se non ci si e\' mai scritti', async () => {
    expect(typeof olmService.chiaviNoteDelContatto, 'manca chiaviNoteDelContatto').toBe('function');
    await olmService.initOlm();
    const alice = dispositivo('alice_l4b2');
    const telefono = dispositivo('bob_l4b2_tel');
    const pc = dispositivo('bob_l4b2_pc');
    expect(olmService.chiaviNoteDelContatto('alice_l4b2', 'bob_l4b2')).toEqual([]);
    await riceveChiave(alice, 'alice_l4b2', 'bob_l4b2', telefono);
    await riceveChiave(alice, 'alice_l4b2', 'bob_l4b2', pc);
    expect(olmService.chiaviNoteDelContatto('alice_l4b2', 'bob_l4b2').sort()).toEqual([telefono.chiave, pc.chiave].sort());
  });
});

describe('L4b - pannello "Verifica identità"', () => {
  it('mostra il codice QR e ha il pulsante per inquadrare quello del contatto', async () => {
    await carica();
    const { default: SafetyNumberPanel } = await import('../src/components/SafetyNumberPanel.jsx');
    localStorage.setItem('olm_peer_identity_alice_l4b3', JSON.stringify({ bob_l4b3: 'CHIAVE_BOB_FINTA' }));
    render(<SafetyNumberPanel username="alice_l4b3" peerUsername="bob_l4b3" myIdentityKey="CHIAVE_ALICE_FINTA" />);
    const mostra = await screen.findByRole('button', { name: /Mostra il mio codice QR/ });
    expect(screen.getByRole('button', { name: /Inquadra il suo codice/ }), 'manca il pulsante per inquadrare').toBeInTheDocument();
    fireEvent.click(mostra);
    await waitFor(() => expect(screen.getByTestId('qr-verifica')).toBeInTheDocument());
    expect(screen.getByTestId('qr-verifica').querySelector('path').getAttribute('d').length).toBeGreaterThan(100);
  });
});

describe('L4b - testi nelle 5 lingue', () => {
  it('ogni testo usato dal pannello e dal lettore esiste in it, en, de, es, fr', () => {
    const sorgenti = ['src/components/SafetyNumberPanel.jsx', 'src/components/LettoreQr.jsx']
      .map((p) => { try { return readFileSync(p, 'utf8'); } catch (e) { return ''; } })
      .join('\n');
    const chiavi = [...new Set([...sorgenti.matchAll(/'safety_number\.([a-z_]+)'/g)].map((x) => x[1]))];
    expect(chiavi.length, 'manca la verifica con codice QR').toBeGreaterThan(15);
    for (const lingua of ['it', 'en', 'de', 'es', 'fr']) {
      const dati = JSON.parse(readFileSync(`src/locales/${lingua}.json`, 'utf8').replace(/^﻿/, ''));
      for (const chiave of chiavi) {
        expect(typeof dati.safety_number?.[chiave], `${lingua}.json: manca safety_number.${chiave}`).toBe('string');
      }
    }
  });

  it('le librerie del QR sono fissate a una versione esatta (niente aggiornamenti a sorpresa)', () => {
    const pacchetto = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pacchetto.dependencies['qrcode-generator']).toBe('2.0.4');
    expect(pacchetto.dependencies.jsqr).toBe('1.4.0');
  });
});
