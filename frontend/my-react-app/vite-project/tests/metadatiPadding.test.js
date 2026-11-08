// tests/metadatiPadding.test.js
//
// METADATI fase 2e: messaggi di lunghezze diverse hanno la stessa dimensione cifrata (scaglioni fissi).
import { describe, it, expect } from 'vitest';
import { aggiungiPadding, rimuoviPadding, scaglione, CAMPO_PADDING } from '../src/utils/paddingMessaggi';
import { encryptGroupMessage, safeParseOlmPayload } from '../src/olmService';

const byte = (t) => new TextEncoder().encode(t).length;
const SCAGLIONI = [256, 512, 1024, 2048, 4096, 8192, 16384];

describe('padding dei messaggi (metadati 2e)', () => {
  it('un messaggio breve e uno di 200 caratteri hanno la stessa dimensione', () => {
    const corto = aggiungiPadding(JSON.stringify({ text: 'ok' }));
    const lungo = aggiungiPadding(JSON.stringify({ text: 'x'.repeat(200) }));
    expect(byte(corto)).toBe(256);
    expect(byte(lungo)).toBe(256);
  });

  it('la dimensione e\u0300 sempre uno scaglione, anche con accenti ed emoji', () => {
    for (const testo of ['perché è così', '🔐'.repeat(90), 'a'.repeat(700), 'ü'.repeat(3000)]) {
      const riempito = aggiungiPadding(JSON.stringify({ text: testo, replyTo: { id: 'm1' } }));
      expect(SCAGLIONI).toContain(byte(riempito));
    }
    expect(scaglione(20000)).toBe(32768);
  });

  it('dopo la decifratura il messaggio torna identico', () => {
    const originale = { text: 'ciao 👋', replyTo: { id: 'm1', text: 'prima' }, emoji: '🔥' };
    const riletto = rimuoviPadding(JSON.parse(aggiungiPadding(JSON.stringify(originale))));
    expect(riletto).toEqual(originale);
    expect(CAMPO_PADDING in riletto).toBe(false);
  });

  it('testi che non sono oggetti JSON restano invariati', () => {
    expect(aggiungiPadding('testo semplice')).toBe('testo semplice');
    expect(aggiungiPadding('[1,2,3]')).toBe('[1,2,3]');
    expect(aggiungiPadding('{rotto')).toBe('{rotto');
  });

  it('i messaggi vecchi senza riempimento si leggono come prima', () => {
    expect(safeParseOlmPayload(JSON.stringify({ text: 'vecchio' }))).toEqual({ text: 'vecchio' });
  });

  it('encryptGroupMessage cifra il testo gia\u0300 allungato allo scaglione', () => {
    const sessioneFinta = { encrypt: (testoInChiaro) => testoInChiaro };
    const cifrato = encryptGroupMessage(sessioneFinta, { text: 'ok' });
    expect(byte(cifrato)).toBe(256);
    expect(JSON.parse(cifrato).text).toBe('ok');
  });

  it('safeParseOlmPayload toglie il riempimento', () => {
    const letto = safeParseOlmPayload(aggiungiPadding(JSON.stringify({ text: 'ok' })));
    expect(letto).toEqual({ text: 'ok' });
  });

  it('messaggi lunghi fino a 16 KB restano entro lo scaglione successivo', () => {
    const riempito = aggiungiPadding(JSON.stringify({ text: 'z'.repeat(9000) }));
    expect(byte(riempito)).toBe(16384);
  });
});
