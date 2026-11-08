// tests/olmService.lock.test.js
//
// Test reali su withAccountLock - il lucchetto anti-race-condition
// globale sull'account Olm. Documentato nel changelog di olmService.js
// come fix di un bug reale in produzione (due peer diversi potevano
// rimuovere/rigenerare OTK in parallelo sullo stesso account, con un
// last-write-wins su localStorage che cancellava silenziosamente il
// lavoro dell'uno o dell'altro). Verificato prima con esecuzione reale
// isolata (Node puro) che le tre proprietà fondamentali di un lock
// vero reggano, poi qui con la funzione esportata reale.
import { describe, it, expect } from 'vitest';
import { withAccountLock } from '../src/olmService.js';

function attesa(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('withAccountLock — mutua esclusione vera', () => {
  it('due operazioni concorrenti eseguono in sequenza VERA, mai interfogliate, anche se la seconda sarebbe più veloce', async () => {
    const risultati = [];

    async function operazioneLenta(id, ritardoMs) {
      risultati.push(`inizio-${id}`);
      await attesa(ritardoMs);
      risultati.push(`fine-${id}`);
    }

    const p1 = withAccountLock(() => operazioneLenta('A', 30));
    const p2 = withAccountLock(() => operazioneLenta('B', 5));

    await Promise.all([p1, p2]);

    expect(risultati).toEqual(['inizio-A', 'fine-A', 'inizio-B', 'fine-B']);
  });

  it('un errore in una operazione non blocca MAI le operazioni successive (il lock non si "avvelena")', async () => {
    let secondaOperazioneEseguita = false;

    const p1 = withAccountLock(async () => {
      throw new Error('Errore finto nella prima operazione');
    });

    const p2 = withAccountLock(async () => {
      secondaOperazioneEseguita = true;
      return 'ok';
    });

    await expect(p1).rejects.toThrow('Errore finto nella prima operazione');
    await p2;

    expect(secondaOperazioneEseguita).toBe(true);
  });

  it('tre operazioni in coda rispettano SEMPRE l\'ordine di messa in coda, indipendentemente dalla velocità di ciascuna', async () => {
    const risultati = [];

    async function op(id, ms) {
      await attesa(ms);
      risultati.push(id);
    }

    await Promise.all([
      withAccountLock(() => op('primo', 20)),
      withAccountLock(() => op('secondo', 1)),
      withAccountLock(() => op('terzo', 1)),
    ]);

    expect(risultati).toEqual(['primo', 'secondo', 'terzo']);
  });
});