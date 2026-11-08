// tests/oraMessaggioFuso.test.js
//
// CORREZIONE: gli orari del server senza fuso sono UTC (prima venivano letti come ora locale).
import { describe, it, expect } from 'vitest';
import { oraMessaggio, istanteServer } from '../src/utils/oraMessaggio';

describe('ora dei messaggi: orari del server senza fuso', () => {
  it('orario del server senza fuso letto come UTC', () => {
    expect(istanteServer('2026-09-27T22:00:00')).toBe(Date.parse('2026-09-27T22:00:00Z'));
    expect(istanteServer('2026-09-27 22:00:00')).toBe(Date.parse('2026-09-27T22:00:00Z'));
  });

  it('il caso del bug: ora esatta 22:36 UTC, server arrotondato 22:00 senza fuso -> si mostra 22:36', () => {
    expect(oraMessaggio({ ts: '2026-09-27T22:36:43.000Z' }, '2026-09-27T22:00:00')).toBe('2026-09-27T22:36:43.000Z');
  });

  it('orari del server con fuso invariati', () => {
    expect(oraMessaggio({ ts: '2026-09-27T22:36:43.000Z' }, '2026-09-27T22:00:00+00:00')).toBe('2026-09-27T22:36:43.000Z');
  });

  it('senza ora nel messaggio: ora del server, sempre come UTC', () => {
    expect(oraMessaggio({ text: 'vecchio' }, '2026-09-27T22:37:00')).toBe('2026-09-27T22:37:00.000Z');
  });
});
