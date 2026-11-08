// tests/cronologiaReazioni.test.js
//
// Cronologia cifrata sul dispositivo, passo 2: le reazioni.
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import { applicaReazione, reazioniDel, dimenticaReazioni, esportaStanza, importaStanza } from '../src/utils/reazioni';
import { salvaDato, leggiDato, salvaStanza, leggiStanza, _usaArchivio } from '../src/utils/cronologiaLocale';

const U1 = '11111111-1111-4111-8111-111111111111';
let dati;
function archivioInMemoria() {
  dati = { stanze: new Map(), chiavi: new Map() };
  return () => ({
    leggi: async (s, k) => dati[s].get(k),
    scrivi: async (s, k, v) => { dati[s].set(k, v); },
    cancella: async () => { dati.stanze.clear(); dati.chiavi.clear(); return true; },
  });
}

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

describe('reazioni salvate sul dispositivo', () => {
  beforeEach(() => { dimenticaReazioni(); _usaArchivio(archivioInMemoria()); });

  it('esporta e reimporta le reazioni di una chat', () => {
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: 'A', ordine: 1 });
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'bob', emoji: 'B', ordine: 2 });
    const salvate = esportaStanza('r');
    dimenticaReazioni();
    expect(importaStanza('r', salvate)).toBe(2);
    expect(reazioniDel('r', ['m1']).map((x) => x.emoji).sort()).toEqual(['A', 'B']);
  });

  it('una reazione salvata vecchia non sovrascrive quella piu\u0300 recente in memoria', () => {
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: 'VECCHIA', ordine: 1 });
    const salvate = esportaStanza('r');
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: 'NUOVA', ordine: 5 });
    importaStanza('r', salvate);
    expect(reazioniDel('r', ['m1'])[0].emoji).toBe('NUOVA');
  });

  it('una reazione tolta resta tolta dopo la reimportazione', () => {
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: 'A', ordine: 1 });
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: null, ordine: 2 });
    const salvate = esportaStanza('r');
    dimenticaReazioni();
    importaStanza('r', salvate);
    expect(reazioniDel('r', ['m1'])).toEqual([]);
  });

  it('la reimportazione avvisa l\u0027interfaccia una volta sola', () => {
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: 'A', ordine: 1 });
    applicaReazione({ roomId: 'r', bersaglio: 'm2', autore: 'bob', emoji: 'B', ordine: 2 });
    const salvate = esportaStanza('r');
    dimenticaReazioni();
    let avvisi = 0;
    const conta = () => { avvisi += 1; };
    window.addEventListener('palacan:reazioni-cambiate', conta);
    importaStanza('r', salvate);
    window.removeEventListener('palacan:reazioni-cambiate', conta);
    expect(avvisi).toBe(1);
  });

  it('dati non validi: nessun cambiamento', () => {
    expect(importaStanza('r', null)).toBe(0);
    expect(importaStanza('r', { m1: { alice: { emoji: 'A' } } })).toBe(0);
  });

  it('cifrate sul dispositivo e rilette', async () => {
    applicaReazione({ roomId: 'r', bersaglio: 'm1', autore: 'alice', emoji: 'SEGRETA', ordine: 1 });
    expect(await salvaDato('alice', 'reazioni:r', esportaStanza('r'))).toBe(true);
    const record = dati.stanze.get('dato:reazioni:r');
    expect(new TextDecoder().decode(new Uint8Array(record.dati))).not.toContain('SEGRETA');
    expect(await leggiDato('alice', 'reazioni:r')).toEqual(esportaStanza('r'));
  });

  it('una voce di reazioni non si puo\u0300 spacciare per una chat (e i messaggi del passo 1 restano leggibili)', async () => {
    await salvaStanza('alice', 'r', [{ id: U1, text: 'ciao' }]);
    await salvaDato('alice', 'reazioni:r', { m1: {} });
    dati.stanze.set('r2', dati.stanze.get('dato:reazioni:r'));
    expect(await leggiStanza('alice', 'r2')).toBeNull();
    expect(await leggiStanza('alice', 'r')).toEqual([{ id: U1, text: 'ciao' }]);
  });
});
