// tests/ripristinoMemoria.test.js
//
// Correzione: dopo il recupero dal backup, i nomi dei gruppi entrano subito in memoria (e la lista viene avvisata).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const salvataggio = new Map();
vi.mock('../src/utils/cronologiaLocale', () => ({
  salvaDato: vi.fn(async (utente, voce, dati) => { salvataggio.set(`${utente}:${voce}`, JSON.parse(JSON.stringify(dati))); }),
  leggiDato: vi.fn(async (utente, voce) => salvataggio.get(`${utente}:${voce}`) ?? null),
}));

const { impostaUtenteNomi, nomeLocale, dimenticaNomi } = await import('../src/utils/nomiStanze');
const { importaDatiPersonali } = await import('../src/utils/datiPersonali');

describe('memoria dopo il recupero dal backup', () => {
  beforeEach(() => { salvataggio.clear(); dimenticaNomi(); });

  it('senza ricaricare la memoria il nome ripristinato non si vede (il difetto)', async () => {
    await impostaUtenteNomi('gigi');
    await importaDatiPersonali('gigi', { nomi_stanze: { stanza1: { nome: 'calcetto2', ordine: 1 } } });
    expect(nomeLocale('stanza1')).toBeNull();
  });

  it('ricaricando la memoria dopo il ripristino il nome si vede e la lista viene avvisata', async () => {
    await impostaUtenteNomi('gigi');
    await importaDatiPersonali('gigi', { nomi_stanze: { stanza1: { nome: 'calcetto2', ordine: 1 }, stanza2: { nome: 'lavoro', ordine: 1 } } });
    const avvisi = [];
    const ascolta = () => avvisi.push(1);
    window.addEventListener('palacan:stanze-cambiate', ascolta);
    await impostaUtenteNomi('gigi');
    window.removeEventListener('palacan:stanze-cambiate', ascolta);
    expect(nomeLocale('stanza1')).toBe('calcetto2');
    expect(nomeLocale('stanza2')).toBe('lavoro');
    expect(avvisi.length).toBeGreaterThan(0);
  });

  it('App: dopo ciascun ripristino ricarica nomi, segreti e caselle', () => {
    const righe = readFileSync('src/App.jsx', 'utf8').split(/\r?\n/);
    const punti = righe.map((r, i) => (r.includes('await importaDatiPersonali(bundle.username, bundle.datiPersonali);') ? i : -1)).filter((i) => i >= 0);
    expect(punti.length).toBeGreaterThan(0);
    for (const i of punti) {
      const dopo = righe[i + 1];
      expect(dopo).toContain('impostaUtenteNomi(bundle.username)');
      expect(dopo).toContain('impostaUtenteSegreti(bundle.username)');
      expect(dopo).toContain('impostaUtenteRecapito(bundle.username)');
    }
  });
});
