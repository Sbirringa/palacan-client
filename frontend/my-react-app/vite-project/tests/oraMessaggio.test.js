// tests/oraMessaggio.test.js
//
// METADATI fase 3.4a: l'ora esatta viaggia dentro il messaggio cifrato.
import { describe, it, expect } from 'vitest';
import { aggiungiOra, oraMessaggio } from '../src/utils/oraMessaggio';
import { encryptGroupMessage } from '../src/olmService';

const byte = (t) => new TextEncoder().encode(t).length;

describe('ora dentro il messaggio (metadati 3.4a)', () => {
  it('aggiunge l\u0027ora di invio senza sovrascrivere quella gia\u0300 presente', () => {
    expect(typeof aggiungiOra({ text: 'ok' }).ts).toBe('string');
    expect(aggiungiOra({ text: 'ok', ts: '2026-01-01T10:00:00.000Z' }).ts).toBe('2026-01-01T10:00:00.000Z');
    expect(aggiungiOra('testo')).toBe('testo');
  });

  it('mostra l\u0027ora del messaggio se vicina a quella del server (anche arrotondata all\u0027ora)', () => {
    expect(oraMessaggio({ ts: '2026-09-27T10:37:12.000Z' }, '2026-09-27T10:00:00+00:00')).toBe('2026-09-27T10:37:12.000Z');
  });

  it('non si fida di un\u0027ora troppo lontana da quella del server (retrodatazione)', () => {
    expect(oraMessaggio({ ts: '2026-01-01T10:00:00.000Z' }, '2026-09-27T10:00:00+00:00')).toBe('2026-09-27T10:00:00+00:00');
  });

  it('messaggi vecchi senza ora dentro: ora del server come oggi', () => {
    expect(oraMessaggio({ text: 'vecchio' }, '2026-09-27T10:37:00+00:00')).toBe('2026-09-27T10:37:00+00:00');
    expect(oraMessaggio({ ts: 'non-una-data' }, '2026-09-27T10:37:00+00:00')).toBe('2026-09-27T10:37:00+00:00');
  });

  it('encryptGroupMessage mette l\u0027ora dentro il contenuto e mantiene lo scaglione del padding', () => {
    const cifrato = encryptGroupMessage({ encrypt: (t) => t }, { text: 'ok' });
    expect(typeof JSON.parse(cifrato).ts).toBe('string');
    expect(byte(cifrato)).toBe(256);
  });

  it('senza ora del server si usa l\u0027ora del messaggio', () => {
    expect(oraMessaggio({ ts: '2026-09-27T10:37:12.000Z' }, null)).toBe('2026-09-27T10:37:12.000Z');
  });
});
