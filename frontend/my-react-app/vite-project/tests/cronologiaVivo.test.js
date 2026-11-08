// tests/cronologiaVivo.test.js
//
// Correzione: solo il ricaricamento della cronologia piu' recente chiude il caricamento e svuota la coda dal vivo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.jsx', 'utf8');
const inizio = app.indexOf('const fetchHistory = useCallback(');
const fine = app.indexOf('}, [decryptIncomingLegacyMessage, decryptMegolmRoomMessage]);', inizio);
const fetchHistory = app.slice(inizio, fine);

describe('cronologia e messaggi dal vivo', () => {
  it('il numero del ricaricamento e\' dichiarato prima del try (visibile nel finally)', () => {
    expect(inizio).toBeGreaterThan(-1);
    expect(fine).toBeGreaterThan(inizio);
    const dichiarazione = fetchHistory.indexOf('const requestId = ++fetchHistoryRequestIdRef.current;');
    expect(dichiarazione).toBeGreaterThan(-1);
    expect(dichiarazione).toBeLessThan(fetchHistory.indexOf('try {'));
  });

  it('nel finally solo il ricaricamento piu\' recente chiude il caricamento e svuota la coda', () => {
    const finallyBlocco = fetchHistory.slice(fetchHistory.lastIndexOf('} finally {'));
    const condizione = finallyBlocco.indexOf('if (fetchHistoryRequestIdRef.current === requestId) {');
    expect(condizione).toBeGreaterThan(-1);
    expect(finallyBlocco.indexOf('historyLoadInProgressRef.current = false;')).toBeGreaterThan(condizione);
    expect(finallyBlocco.indexOf('liveMessagesDuringHistoryRef.current = [];')).toBeGreaterThan(condizione);
  });

  it('le due uscite prima silenziose ora scrivono in console', () => {
    expect(app).toContain('[DIAG-ANON] messaggio ${messageId} in attesa di una chiave della stanza');
    expect(app).toContain('[DIAG-ANON] messaggio ${messageId} in coda: la cronologia si sta ricaricando');
  });
});
