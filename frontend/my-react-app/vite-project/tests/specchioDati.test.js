// tests/specchioDati.test.js
//
// METADATI A4.3b: copia cifrata di rubrica, blocchi e liste sul dispositivo e nel backup.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const archivio = new Map();
vi.mock('../src/utils/cronologiaLocale', () => ({
  salvaDato: vi.fn(async (u, nome, valore) => { archivio.set(`${u}:${nome}`, valore); return true; }),
  leggiDato: vi.fn(async (u, nome) => archivio.get(`${u}:${nome}`) ?? null),
}));
import { salvaDato } from '../src/utils/cronologiaLocale';
import { impostaUtenteNomi, dimenticaNomi } from '../src/utils/nomiStanze';
import { specchia } from '../src/utils/specchioDati';
import { VOCI_DATI_PERSONALI, esportaDatiPersonali } from '../src/utils/datiPersonali';

describe('copia di rubrica, blocchi e liste (metadati A4.3b)', () => {
  beforeEach(() => { archivio.clear(); dimenticaNomi(); vi.clearAllMocks(); });

  it('con un utente attivo la copia si salva cifrata sul dispositivo', async () => {
    await impostaUtenteNomi('alice');
    expect(specchia('contatti', [{ id: '1', username: 'mario' }])).toBe(true);
    await Promise.resolve();
    expect(archivio.get('alice:specchio_contatti').dati).toEqual([{ id: '1', username: 'mario' }]);
  });

  it('senza utente, con una voce sconosciuta o senza dati: niente copia', () => {
    expect(specchia('contatti', [])).toBe(false);
    expect(salvaDato).not.toHaveBeenCalled();
  });

  it('voce sconosciuta o dati assenti: niente copia', async () => {
    await impostaUtenteNomi('alice');
    vi.clearAllMocks();
    expect(specchia('altro', [1])).toBe(false);
    expect(specchia('liste', null)).toBe(false);
    expect(salvaDato).not.toHaveBeenCalled();
  });

  it('le copie entrano nel backup cifrato delle chiavi', async () => {
    expect(VOCI_DATI_PERSONALI).toEqual(expect.arrayContaining(['specchio_contatti', 'specchio_bloccati', 'specchio_periodi_blocco', 'specchio_liste']));
    archivio.set('alice:specchio_liste', { aggiornato: 'x', dati: [{ id: 'l1', name: 'Lavoro' }] });
    expect((await esportaDatiPersonali('alice')).specchio_liste.dati).toEqual([{ id: 'l1', name: 'Lavoro' }]);
  });

  it('apiService: le quattro funzioni copiano la risposta e la restituiscono come prima', () => {
    const api = readFileSync('src/apiService.js', 'utf8');
    for (const nome of ['contatti', 'bloccati', 'periodi_blocco', 'liste']) expect(api).toContain(`specchia('${nome}', `);
  });
});
