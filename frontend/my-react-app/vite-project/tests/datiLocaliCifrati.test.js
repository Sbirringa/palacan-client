// tests/datiLocaliCifrati.test.js  [palacan-9a2]
//
// Cache dei messaggi inviati e bozze cifrate con la chiave del dispositivo (WebCrypto vera, archivio della
// chiave in memoria al posto di IndexedDB). Ogni "ricaricamento" azzera la memoria e rilegge da localStorage.
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { _usaArchivio } from '../src/utils/chiaveDispositivo';
import {
  preparaDatiLocali, leggiLocale, salvaLocale, chiaviDatiLocali, _attendiScritture, _azzera,
} from '../src/utils/datiLocaliCifrati';
import { getSentCacheKey, loadSentMessagesCache, saveSentMessagesCache } from '../src/App.jsx';
import { getDraftsStorageKey, loadDraftsFromStorage, saveDraftsToStorage } from '../src/pages/Dashboard.jsx';

function browser() {
  const dati = new Map();
  let guasto = false;
  const fabbrica = () => ({
    leggi: async (k) => { if (guasto) throw new Error('guasto'); return dati.get(k); },
    prendiOCrea: async (k, v) => { if (guasto) throw new Error('guasto'); if (!dati.has(k)) dati.set(k, v); return dati.get(k); },
  });
  return { fabbrica, guasta: (s) => { guasto = s; } };
}

let b;
async function ricarica() {
  await _attendiScritture();
  _azzera();
  _usaArchivio(b.fabbrica);
}

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

beforeEach(async () => {
  await _attendiScritture();
  localStorage.clear();
  b = browser();
  _azzera();
  _usaArchivio(b.fabbrica);
});

describe('dati locali cifrati', () => {
  it('le chiavi sono quelle di sempre (cache inviati di App, bozze di Dashboard)', () => {
    expect(chiaviDatiLocali('mario')).toEqual([getSentCacheKey('mario'), getDraftsStorageKey('mario')]);
  });

  it('cache inviati: salvata cifrata, ritrovata dopo un ricaricamento della pagina', async () => {
    saveSentMessagesCache('mario', { c1: { text: 'messaggio segreto', replyTo: null } });
    await _attendiScritture();
    const grezzo = localStorage.getItem('sent_msg_cache_mario');
    expect(grezzo.startsWith('d1.')).toBe(true);
    expect(grezzo).not.toContain('segreto');
    await ricarica();
    expect(loadSentMessagesCache('mario')).toEqual({});
    await preparaDatiLocali('mario');
    expect(loadSentMessagesCache('mario')).toEqual({ c1: { text: 'messaggio segreto', replyTo: null } });
  });

  it('bozze: salvate cifrate, ritrovate dopo un ricaricamento della pagina', async () => {
    saveDraftsToStorage('mario', { stanza1: 'bozza riservata' });
    await _attendiScritture();
    expect(localStorage.getItem('chat_drafts_mario')).not.toContain('riservata');
    await ricarica();
    await preparaDatiLocali('mario');
    expect(loadDraftsFromStorage('mario')).toEqual({ stanza1: 'bozza riservata' });
  });

  it('formato di prima (in chiaro): letto una volta e riscritto cifrato', async () => {
    localStorage.setItem('sent_msg_cache_luca', JSON.stringify({ c1: 'vecchio testo' }));
    localStorage.setItem('chat_drafts_luca', JSON.stringify({ s1: 'vecchia bozza' }));
    await preparaDatiLocali('luca');
    expect(loadSentMessagesCache('luca')).toEqual({ c1: 'vecchio testo' });
    expect(loadDraftsFromStorage('luca')).toEqual({ s1: 'vecchia bozza' });
    await _attendiScritture();
    expect(localStorage.getItem('sent_msg_cache_luca')).not.toContain('vecchio testo');
    expect(localStorage.getItem('chat_drafts_luca')).not.toContain('vecchia bozza');
    await ricarica();
    await preparaDatiLocali('luca');
    expect(loadSentMessagesCache('luca')).toEqual({ c1: 'vecchio testo' });
  });

  it('formato di prima rovinato: tolto, niente crash', async () => {
    localStorage.setItem('chat_drafts_ugo', '{{{rotto');
    await preparaDatiLocali('ugo');
    expect(loadDraftsFromStorage('ugo')).toEqual({});
    expect(localStorage.getItem('chat_drafts_ugo')).toBeNull();
  });

  it('un dato non si può spostare sotto un altro nome', async () => {
    salvaLocale('sent_msg_cache_eva', { c1: 'x' });
    await _attendiScritture();
    localStorage.setItem('chat_drafts_eva', localStorage.getItem('sent_msg_cache_eva'));
    await ricarica();
    await preparaDatiLocali('eva');
    expect(leggiLocale('chat_drafts_eva')).toBeNull();
    expect(leggiLocale('sent_msg_cache_eva')).toEqual({ c1: 'x' });
  });

  it('chiave del dispositivo illeggibile per un momento: niente si legge e niente si sovrascrive', async () => {
    saveSentMessagesCache('ada', { c1: 'tenuto' });
    await _attendiScritture();
    const prima = localStorage.getItem('sent_msg_cache_ada');
    b.guasta(true);
    await ricarica();
    await preparaDatiLocali('ada');
    expect(loadSentMessagesCache('ada')).toEqual({});
    saveSentMessagesCache('ada', { c2: 'nuovo' });
    await _attendiScritture();
    expect(localStorage.getItem('sent_msg_cache_ada')).toBe(prima);
    b.guasta(false);
    await ricarica();
    await preparaDatiLocali('ada');
    expect(loadSentMessagesCache('ada')).toEqual({ c1: 'tenuto' });
  });

  it('salvataggi ravvicinati (si scrive una bozza): resta l\'ultimo', async () => {
    for (let i = 1; i <= 30; i += 1) saveDraftsToStorage('ivo', { s1: `bozza ${i}` });
    await ricarica();
    await preparaDatiLocali('ivo');
    expect(loadDraftsFromStorage('ivo')).toEqual({ s1: 'bozza 30' });
  });

  it('salvataggio prima del caricamento: non si perde quello che era già salvato', async () => {
    saveSentMessagesCache('teo', { vecchio: 'a' });
    await ricarica();
    saveSentMessagesCache('teo', { nuovo: 'b' });
    await ricarica();
    await preparaDatiLocali('teo');
    expect(loadSentMessagesCache('teo')).toEqual({ vecchio: 'a', nuovo: 'b' });
  });

  it('la lettura restituisce una copia: modificarla non cambia il salvato senza un salvataggio', async () => {
    saveSentMessagesCache('pia', { c1: 'a' });
    const copia = loadSentMessagesCache('pia');
    copia.c2 = 'b';
    expect(loadSentMessagesCache('pia')).toEqual({ c1: 'a' });
  });

  it('App prepara i dati locali prima di usarli: all\'avvio e a ogni accesso', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app.split('await preparaDatiLocali(').length - 1).toBe(3);
    expect(app).not.toMatch(/localStorage\.(get|set)Item\(getSentCacheKey/);
    const dash = readFileSync('src/pages/Dashboard.jsx', 'utf8');
    expect(dash).not.toMatch(/localStorage\.(get|set)Item\(getDraftsStorageKey/);
  });
});
