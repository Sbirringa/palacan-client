// tests/olmService.initOlm.test.js
//
// Primo test "spia" - verifica SOLO che Olm vera si carichi davvero
// dentro Vitest (vedi tests/setup.js per come). Se questo fallisce,
// nessun altro test su olmService.js ha senso costruirci sopra:
// meglio scoprirlo subito, isolato, che in mezzo a test più complessi.
import { describe, it, expect } from 'vitest';
import { initOlm } from '../src/olmService.js';

describe('initOlm - il caricamento vero della libreria Olm', () => {
  it('carica davvero Olm (WASM vero, non finto) e restituisce true', async () => {
    const risultato = await initOlm();
    expect(risultato).toBe(true);
  });

  it('chiamate successive non ricaricano Olm da capo (idempotente)', async () => {
    const primaChiamata = await initOlm();
    const secondaChiamata = await initOlm();
    expect(primaChiamata).toBe(true);
    expect(secondaChiamata).toBe(true);
  });
});