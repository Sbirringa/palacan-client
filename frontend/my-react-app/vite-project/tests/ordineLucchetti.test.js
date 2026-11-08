// tests/ordineLucchetti.test.js  [palacan-ordine-lucchetti]
// Regola dei lucchetti della cifratura: mai il lucchetto dell'ACCOUNT dentro quello di COPPIA. ensureRoomKeyShared
// prende account -> coppia; se la ricezione di una chiave prendesse coppia -> account (rimozione della OTK dentro
// decryptOlmEvent) i due si bloccherebbero a vicenda (visto nella prova "invito": chiave persa, pagina in crash).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// percorso dalla cartella del progetto (in jsdom import.meta.url non e' un file://)
const sorgente = readFileSync(resolve(process.cwd(), 'src', 'olmService.js'), 'utf8');

function corpo(nome) {
  const inizio = sorgente.search(new RegExp(`(async\\s+)?function\\s+${nome}\\s*\\(`));
  expect(inizio, `funzione ${nome} non trovata`).toBeGreaterThanOrEqual(0);
  const prossima = sorgente.slice(inizio + 10).search(/\n(export\s+)?(async\s+)?function\s+\w+\s*\(/);
  return prossima < 0 ? sorgente.slice(inizio) : sorgente.slice(inizio, inizio + 10 + prossima);
}

describe('ordine dei lucchetti della cifratura', () => {
  it('la creazione di una sessione in arrivo non rimuove la OTK sotto il lucchetto di coppia', () => {
    expect(corpo('getOrCreateInboundSessionInternal')).not.toMatch(/await\s+removeUsedOTK\s*\(/);
    expect(corpo('getOrCreateInboundSessionInternal')).toContain('otkDaRimuovere');
  });

  it('decryptOlmEvent rimuove la OTK solo dopo aver rilasciato il lucchetto di coppia', () => {
    const c = corpo('decryptOlmEvent');
    const fineLucchetto = c.lastIndexOf('});');
    const rimozione = c.indexOf('rimuoviOtkDopo(esito');
    expect(rimozione).toBeGreaterThan(fineLucchetto);
  });

  it('anche il wrapper pubblico getOrCreateInboundSession rimuove la OTK fuori dal lucchetto', () => {
    expect(corpo('getOrCreateInboundSession')).toContain('rimuoviOtkDopo(esito');
  });

  it('rimuoviOtkDopo usa removeUsedOTK e restituisce l\'account aggiornato', () => {
    const c = corpo('rimuoviOtkDopo');
    expect(c).toContain('await removeUsedOTK(');
    expect(c).toContain('esito.account = aggiornato');
  });
});
