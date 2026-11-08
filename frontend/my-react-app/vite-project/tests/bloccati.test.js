// tests/bloccati.test.js
//
// METADATI fase 3.4d (blocco): nelle chat dirette i messaggi del bloccato scritti dopo il blocco non si mostrano.
import { describe, it, expect, beforeEach } from 'vitest';
import { impostaBloccati, messaggioDaBloccato, eBloccato } from '../src/utils/bloccati';

describe('blocco sul dispositivo (metadati 3.4d)', () => {
  beforeEach(() => impostaBloccati([{ id: 'u-b', username: 'bob', blocked_at: '2026-09-28T10:00:00+00:00' }]));

  it('messaggio del bloccato scritto dopo il blocco: nascosto', () => {
    expect(messaggioDaBloccato('bob', '2026-09-28T10:05:00.000Z', true)).toBe(true);
  });

  it('messaggio del bloccato scritto prima del blocco: resta visibile', () => {
    expect(messaggioDaBloccato('bob', '2026-09-28T09:55:00.000Z', true)).toBe(false);
  });

  it('solo nelle chat dirette (nei gruppi il blocco non nasconde, come il server)', () => {
    expect(messaggioDaBloccato('bob', '2026-09-28T10:05:00.000Z', false)).toBe(false);
  });

  it('gli altri contatti non sono toccati', () => {
    expect(messaggioDaBloccato('alice', '2026-09-28T10:05:00.000Z', true)).toBe(false);
    expect(eBloccato('alice')).toBe(false);
  });

  it('istante sconosciuto: si nasconde (scelta prudente)', () => {
    impostaBloccati([{ id: 'u-b', username: 'bob' }]);
    expect(messaggioDaBloccato('bob', '2026-01-01T00:00:00.000Z', true)).toBe(true);
    impostaBloccati([{ id: 'u-b', username: 'bob', blocked_at: '2026-09-28T10:00:00+00:00' }]);
    expect(messaggioDaBloccato('bob', null, true)).toBe(true);
  });

  it('sbloccato (non piu\u0300 in elenco): di nuovo visibile; orari del server senza fuso letti come UTC', () => {
    impostaBloccati([{ id: 'u-b', username: 'bob', blocked_at: '2026-09-28T10:00:00' }]);
    expect(messaggioDaBloccato('bob', '2026-09-28T09:59:00.000Z', true)).toBe(false);
    impostaBloccati([]);
    expect(messaggioDaBloccato('bob', '2026-09-28T10:05:00.000Z', true)).toBe(false);
  });
});
