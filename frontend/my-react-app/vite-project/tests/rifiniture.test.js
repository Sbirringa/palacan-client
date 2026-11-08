// tests/rifiniture.test.js  [palacan-r1]
//
// L4e-bis: durante una chiamata la chiave della chat si condivide una volta ogni 30 secondi per chat, non a ogni
// candidato ICE. Se la condivisione fallisce non si ricorda niente (si riprova al segnale dopo).
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../src/apiService.js', () => ({ getDeviceBundles: vi.fn(), getKeyBundle: vi.fn() }));

let sc = null;
beforeAll(async () => {
  sc = await import('../src/utils/segnaliChiamata.js');
});
beforeEach(() => sc._azzeraSegnali());

const funzione = () => {
  expect(typeof sc.condividiUnaVolta, 'R1-CHIAMATA: la chiave della chat si ricondivide a ogni candidato ICE').toBe('function');
  return sc.condividiUnaVolta;
};

describe('L4e-bis - chiave della chat condivisa una volta per chiamata', () => {
  it('una sola condivisione per 30 secondi nella stessa chat; dopo si rifa\'', async () => {
    const condividi = funzione();
    const fatta = vi.fn(async () => {});
    const t0 = 1_000_000;
    expect(await condividi('stanza_1', fatta, t0)).toBe(true);
    for (let i = 1; i <= 10; i += 1) expect(await condividi('stanza_1', fatta, t0 + i * 500)).toBe(false);
    expect(fatta).toHaveBeenCalledTimes(1);
    expect(await condividi('stanza_1', fatta, t0 + sc.CONDIVISIONE_CHIAMATA_MS + 1)).toBe(true);
    expect(fatta).toHaveBeenCalledTimes(2);
  });

  it('chat diverse non si influenzano', async () => {
    const condividi = funzione();
    const fatta = vi.fn(async () => {});
    await condividi('stanza_a', fatta, 5000);
    await condividi('stanza_b', fatta, 5001);
    expect(fatta).toHaveBeenCalledTimes(2);
  });

  it('se la condivisione fallisce non si ricorda niente: il segnale dopo riprova', async () => {
    const condividi = funzione();
    const rotta = vi.fn(async () => { throw new Error('rete'); });
    await expect(condividi('stanza_x', rotta, 9000)).rejects.toThrow('rete');
    const buona = vi.fn(async () => {});
    expect(await condividi('stanza_x', buona, 9100)).toBe(true);
    expect(buona).toHaveBeenCalledTimes(1);
  });

  it('App.jsx la usa nella cifratura dei segnali', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app, 'R1-CHIAMATA: App.jsx ricondivide la chiave a ogni segnale')
      .toContain('await condividiChiaveUnaVoltaPerChiamata(normalizeRoomId(stanza), () => sessioneCondivisaPerInviare(stanza));');
  });
});
