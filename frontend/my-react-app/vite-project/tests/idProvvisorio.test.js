// tests/idProvvisorio.test.js  [palacan-m1c]
// L'identificativo provvisorio non porta l'ora al server, e si comporta come quello vecchio in ogni classificatore.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ID_PROVVISORIO, nuovoIdProvvisorio } from '../src/utils/idProvvisorio.js';
import { isOptimisticPendingId, isOptimisticPendingMessage } from '../src/App.jsx';
import { isRealMessageId } from '../src/pages/Dashboard.jsx';
import { daSalvare } from '../src/utils/cronologiaLocale.js';

const VECCHIO = '1727000000000-0.123';

afterEach(() => vi.restoreAllMocks());

describe('nuovoIdProvvisorio', () => {
  it('non usa mai l\'ora', () => {
    const ora = vi.spyOn(Date, 'now');
    const id = nuovoIdProvvisorio();
    expect(ora).not.toHaveBeenCalled();
    expect(id).toMatch(ID_PROVVISORIO);
  });

  it('e\' sempre diverso', () => {
    const visti = new Set(Array.from({ length: 2000 }, () => nuovoIdProvvisorio()));
    expect(visti.size).toBe(2000);
  });

  it('non sembra mai un UUID del server', () => {
    expect(nuovoIdProvvisorio()).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });
});

describe('riconoscimento: forma nuova e forma vecchia', () => {
  it('isOptimisticPendingId riconosce entrambe, mai un UUID', () => {
    expect(isOptimisticPendingId(nuovoIdProvvisorio())).toBe(true);
    expect(isOptimisticPendingId(VECCHIO)).toBe(true);
    expect(isOptimisticPendingId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
    expect(isOptimisticPendingId('c123')).toBe(false);
  });

  it('un messaggio appena inviato con la forma nuova e\' "in invio"', () => {
    const msg = { type: 'self', id: nuovoIdProvvisorio(), created_at: new Date().toISOString() };
    expect(isOptimisticPendingMessage(msg)).toBe(true);
  });

  it('isRealMessageId tratta la forma nuova come quella vecchia', () => {
    expect(isRealMessageId(nuovoIdProvvisorio())).toBe(isRealMessageId(VECCHIO));
  });

  it('la cronologia locale tratta la forma nuova come quella vecchia', () => {
    expect(daSalvare([{ id: nuovoIdProvvisorio() }]).length).toBe(daSalvare([{ id: VECCHIO }]).length);
  });
});

describe('nel CRYPTO LAYER non resta nessun identificativo con l\'ora', () => {
  it('App.jsx crea gli identificativi con nuovoIdProvvisorio', () => {
    const app = readFileSync(resolve(process.cwd(), 'src', 'App.jsx'), 'utf8');
    expect(app).not.toMatch(/const tempId = `\$\{Date\.now\(\)\}/);
    expect(app).not.toMatch(/(reazione|nome)-\$\{Date\.now\(\)\}/);
    expect((app.match(/nuovoIdProvvisorio\(\)/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});
