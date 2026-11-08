// tests/datiPersonali.test.js
//
// METADATI A4.3a: nomi dei gruppi e segreti di stanza nel backup cifrato delle chiavi.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const archivio = new Map();
vi.mock('../src/utils/cronologiaLocale', () => ({
  salvaDato: vi.fn(async (u, nome, valore) => { archivio.set(`${u}:${nome}`, JSON.parse(JSON.stringify(valore))); return true; }),
  leggiDato: vi.fn(async (u, nome) => archivio.get(`${u}:${nome}`) ?? null),
}));
import { esportaDatiPersonali, importaDatiPersonali } from '../src/utils/datiPersonali';

describe('dati personali nel backup (metadati A4.3a)', () => {
  beforeEach(() => archivio.clear());

  it('esporta nomi e segreti del dispositivo', async () => {
    archivio.set('alice:nomi_stanze', { g1: { nome: 'Calcetto', ordine: 1 } });
    archivio.set('alice:segreti_stanze', { g1: { segreto: 'S', confermato: true } });
    expect(await esportaDatiPersonali('alice')).toEqual({
      v: 1, nomi_stanze: { g1: { nome: 'Calcetto', ordine: 1 } }, segreti_stanze: { g1: { segreto: 'S', confermato: true } },
    });
  });

  it('dispositivo nuovo: ripristina tutto', async () => {
    const dati = { v: 1, nomi_stanze: { g1: { nome: 'Calcetto', ordine: 1 } }, segreti_stanze: { g1: { segreto: 'S', confermato: true } } };
    expect(await importaDatiPersonali('alice', dati)).toBe(2);
    expect(archivio.get('alice:nomi_stanze')).toEqual(dati.nomi_stanze);
    expect(archivio.get('alice:segreti_stanze')).toEqual(dati.segreti_stanze);
  });

  it('dispositivo con dati suoi: vincono quelli locali, si aggiungono quelli mancanti', async () => {
    archivio.set('alice:nomi_stanze', { g1: { nome: 'Nome recente', ordine: 9 } });
    await importaDatiPersonali('alice', { nomi_stanze: { g1: { nome: 'Nome vecchio', ordine: 1 }, g2: { nome: 'Altro', ordine: 1 } } });
    expect(archivio.get('alice:nomi_stanze')).toEqual({ g1: { nome: 'Nome recente', ordine: 9 }, g2: { nome: 'Altro', ordine: 1 } });
  });

  it('backup vecchio senza dati personali, o dati non validi: nessun errore, niente ripristinato', async () => {
    expect(await importaDatiPersonali('alice', undefined)).toBe(0);
    expect(await importaDatiPersonali('alice', { nomi_stanze: 'rotto', segreti_stanze: [1, 2] })).toBe(0);
    expect(await importaDatiPersonali(null, { nomi_stanze: {} })).toBe(0);
  });

  it('App aggiunge i dati personali a ogni backup e li ripristina a ogni recupero', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app.split('esportaDati: esportaDatiPersonali').length - 1).toBe(2);  // [palacan-n6] i due caricamenti passano per caricaBackupUnito
    expect(app.split('await importaDatiPersonali(bundle.username, bundle.datiPersonali);').length - 1).toBe(2);
  });
});
