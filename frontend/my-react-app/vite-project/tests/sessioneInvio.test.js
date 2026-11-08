// tests/sessioneInvio.test.js
//
// Correzione: nessun punto cifra con una sessione presa prima di ensureRoomKeyShared (che puo' ruotarla).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const righe = readFileSync('src/App.jsx', 'utf8').split(/\r?\n/);

describe('sessione di invio gia\' condivisa', () => {
  it('nessuna sessione viene tenuta mentre si aspetta ensureRoomKeyShared', () => {
    const sbagliati = [];
    righe.forEach((riga, i) => {
      if (!riga.includes('olmService.getOrCreateOutboundGroupSession(')) return;
      const fine = righe.slice(i, i + 25).findIndex((r) => r.includes('encryptGroupMessage('));
      if (fine < 0) return;
      const inMezzo = righe.slice(i, i + fine).join('\n');
      if (inMezzo.includes('await ensureRoomKeyShared(')) sbagliati.push(i + 1);
    });
    expect(sbagliati).toEqual([]);
  });

  it('la funzione condivide prima, poi prende la sessione e verifica che sia quella condivisa', () => {
    const testo = righe.join('\n');
    const inizio = testo.indexOf('const sessioneCondivisaPerInviare = useCallback(');
    expect(inizio).toBeGreaterThan(-1);
    const corpo = testo.slice(inizio, inizio + 1500);
    expect(corpo.indexOf('await ensureRoomKeyShared(stanzaDaUsare);')).toBeLessThan(corpo.indexOf('olmService.getOrCreateOutboundGroupSession(utente, stanzaDaUsare);'));
    expect(corpo).toContain('voce.sessionId === sessione.session_id()');
    expect(corpo).toContain('tentativo < 3');
  });

  it('i punti che cifrano usano la funzione', () => {
    const usi = righe.filter((r) => r.includes('await sessioneCondivisaPerInviare(')).length;
    expect(usi).toBeGreaterThanOrEqual(1);
  });
});
