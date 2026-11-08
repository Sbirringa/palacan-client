// tests/Sidebar.formatRelativeTime.test.jsx
//
// Test sulla logica delle soglie temporali di formatRelativeTime -
// export nominato aggiunto apposta (l'export di default Sidebar resta
// invariato) per poter testare questa logica pura senza dover
// renderizzare l'intero componente.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatRelativeTime } from '../src/components/Sidebar.jsx';

const ORA_FISSA = new Date('2026-06-15T12:00:00.000Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(ORA_FISSA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('formatRelativeTime — casi limite', () => {
  it('restituisce null per un valore assente', () => {
    expect(formatRelativeTime(null)).toBeNull();
    expect(formatRelativeTime(undefined)).toBeNull();
    expect(formatRelativeTime('')).toBeNull();
  });

  it('restituisce null per una data non valida, senza mai lanciare un\'eccezione', () => {
    expect(() => formatRelativeTime('non-e-una-data')).not.toThrow();
    expect(formatRelativeTime('non-e-una-data')).toBeNull();
  });

  it('sotto i 30 secondi: "ora"', () => {
    const data = new Date(ORA_FISSA - 29_000).toISOString();
    expect(formatRelativeTime(data)).toBe('ora');
  });

  it('esattamente al confine dei 30 secondi: passa a "X sec fa"', () => {
    const data = new Date(ORA_FISSA - 30_000).toISOString();
    expect(formatRelativeTime(data)).toBe('30 sec fa');
  });

  it('tra 30 e 59 secondi: "X sec fa"', () => {
    const data = new Date(ORA_FISSA - 45_000).toISOString();
    expect(formatRelativeTime(data)).toBe('45 sec fa');
  });

  it('esattamente al confine di 1 minuto: passa a "1 minuto fa" (singolare corretto)', () => {
    const data = new Date(ORA_FISSA - 60_000).toISOString();
    expect(formatRelativeTime(data)).toBe('1 minuto fa');
  });

  it('minuti multipli: plurale corretto', () => {
    const data = new Date(ORA_FISSA - 5 * 60_000).toISOString();
    expect(formatRelativeTime(data)).toBe('5 minuti fa');
  });

  it('esattamente al confine di 1 ora: "1 ora fa" (singolare)', () => {
    const data = new Date(ORA_FISSA - 60 * 60_000).toISOString();
    expect(formatRelativeTime(data)).toBe('1 ora fa');
  });

  it('ore multiple: plurale corretto', () => {
    const data = new Date(ORA_FISSA - 4 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(data)).toBe('4 ore fa');
  });

  it('esattamente al confine di 1 giorno: "1 giorno fa" (singolare)', () => {
    const data = new Date(ORA_FISSA - 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(data)).toBe('1 giorno fa');
  });

  it('giorni multipli, sotto la settimana: plurale corretto', () => {
    const data = new Date(ORA_FISSA - 5 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(data)).toBe('5 giorni fa');
  });

  it('esattamente al confine di 1 settimana: "1 settimana fa" (singolare)', () => {
    const data = new Date(ORA_FISSA - 7 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(data)).toBe('1 settimana fa');
  });

  it('settimane multiple, sotto 5: plurale corretto', () => {
    const data = new Date(ORA_FISSA - 3 * 7 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(data)).toBe('3 settimane fa');
  });

  it('oltre 5 settimane: passa a una data assoluta (giorno + mese), non piu\' un formato relativo', () => {
    const data = new Date(ORA_FISSA - 6 * 7 * 24 * 60 * 60_000).toISOString();
    const risultato = formatRelativeTime(data);
    expect(risultato).not.toMatch(/fa$/); // non deve piu' finire con "fa"
    expect(risultato).not.toBeNull();
  });
});
