// tests/autoriVecchi.test.js
//
// Verifica del database, D1b: l'autore dichiarato dal server per le chiavi vecchie resta sul dispositivo.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { registraCreatore, mittenteVerificato, leggiCreatore } from '../src/utils/creatoriChiavi';

describe('autori dei messaggi vecchi (verifica D1b)', () => {
  beforeEach(() => localStorage.clear());

  it('oggi: chiave vecchia con creatore sconosciuto, autore solo dal server', () => {
    const esito = mittenteVerificato('io', 'vecchia', 'alice');
    expect(esito).toMatchObject({ mittente: 'alice', verificato: false });
    expect(mittenteVerificato('io', 'vecchia', null).mittente).toBeNull();
  });

  it('dopo la registrazione: autore noto anche senza il dato del server', () => {
    registraCreatore('io', 'vecchia', { utente: 'alice', verifica: 'server', stanza: 's1' });
    expect(mittenteVerificato('io', 'vecchia', null)).toMatchObject({ mittente: 'alice', verificato: true });
    expect(leggiCreatore('io', 'vecchia').verifica).toBe('server');
  });

  it('un creatore gia\u0027 noto (via Olm) non viene mai sostituito da quello dichiarato dal server', () => {
    registraCreatore('io', 'nuova', { utente: 'bob', verifica: 'coincide', stanza: 's1' });
    registraCreatore('io', 'nuova', { utente: 'mallory', verifica: 'server', stanza: 's1' });
    expect(mittenteVerificato('io', 'nuova', null).mittente).toBe('bob');
  });

  it('App registra l\u0027autore dichiarato solo quando il creatore e\u0027 sconosciuto', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).toContain("if (!verificaMittente.verificato && verificaMittente.mittente && sessionId) registraCreatore(username, sessionId, { utente: verificaMittente.mittente, verifica: 'server', stanza: normalizedRoom });");
  });
});
