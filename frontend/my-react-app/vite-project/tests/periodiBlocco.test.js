// tests/periodiBlocco.test.js
//
// CORREZIONE: i messaggi scritti durante un periodo di blocco non si mostrano, nemmeno dopo lo sblocco.
import { describe, it, expect, beforeEach } from 'vitest';
import { impostaBloccati, messaggioDaBloccato, eBloccato } from '../src/utils/bloccati';

describe('periodi di blocco', () => {
  beforeEach(() => impostaBloccati([
    { username: 'bob', blocked_at: '2026-09-28T10:00:00+00:00', unblocked_at: '2026-09-28T11:00:00+00:00' },
  ]));

  it('scritto durante il blocco: nascosto anche dopo lo sblocco', () => {
    expect(messaggioDaBloccato('bob', '2026-09-28T10:30:00.000Z', true)).toBe(true);
  });

  it('scritto prima o dopo il blocco: visibile', () => {
    expect(messaggioDaBloccato('bob', '2026-09-28T09:59:00.000Z', true)).toBe(false);
    expect(messaggioDaBloccato('bob', '2026-09-28T11:01:00.000Z', true)).toBe(false);
  });

  it('sbloccato: non risulta bloccato adesso', () => {
    expect(eBloccato('bob')).toBe(false);
  });

  it('piu\u0300 periodi dello stesso contatto', () => {
    impostaBloccati([
      { username: 'bob', blocked_at: '2026-09-28T10:00:00+00:00', unblocked_at: '2026-09-28T11:00:00+00:00' },
      { username: 'bob', blocked_at: '2026-09-28T12:00:00+00:00', unblocked_at: null },
    ]);
    expect(messaggioDaBloccato('bob', '2026-09-28T11:30:00.000Z', true)).toBe(false);
    expect(messaggioDaBloccato('bob', '2026-09-28T12:30:00.000Z', true)).toBe(true);
    expect(eBloccato('bob')).toBe(true);
  });

  it('ora sconosciuta: nascosto solo se bloccato adesso', () => {
    expect(messaggioDaBloccato('bob', null, true)).toBe(false);
    impostaBloccati([{ username: 'bob', blocked_at: '2026-09-28T10:00:00+00:00' }]);
    expect(messaggioDaBloccato('bob', null, true)).toBe(true);
  });
});
