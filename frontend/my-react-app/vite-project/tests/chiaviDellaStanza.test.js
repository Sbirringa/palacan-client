// tests/chiaviDellaStanza.test.js
//
// METADATI fase 3.4b: il registro ricorda la stanza di ogni chiave; senza session_id si provano le chiavi della stanza.
import { describe, it, expect, beforeEach } from 'vitest';
import { registraCreatore, sessioniDellaStanza, trovaChiaveDellaStanza, mittenteVerificato } from '../src/utils/creatoriChiavi';

// sessione finta: decifra solo i testi che "le appartengono"
const sessione = (nome) => ({ decrypt: (t) => { if (!t.startsWith(nome)) throw new Error('BAD_MESSAGE_MAC'); return { plaintext: t }; } });

describe('chiavi per stanza (metadati 3.4b)', () => {
  beforeEach(() => localStorage.clear());

  it('il registro ricorda la stanza di ogni chiave', () => {
    registraCreatore('carol', 's1', { utente: 'alice', stanza: 'stanza-A' });
    registraCreatore('carol', 's2', { utente: 'bob', stanza: 'stanza-B' });
    registraCreatore('carol', 's3', { utente: 'bob', stanza: 'stanza-A' });
    expect(sessioniDellaStanza('carol', 'stanza-A').sort()).toEqual(['s1', 's3']);
  });

  it('trova la chiave giusta della stanza senza session_id', () => {
    registraCreatore('carol', 's1', { utente: 'alice', stanza: 'A' });
    registraCreatore('carol', 's2', { utente: 'bob', stanza: 'A' });
    const sessioni = { s1: sessione('s1'), s2: sessione('s2') };
    expect(trovaChiaveDellaStanza('carol', 'A', 's2:testo-cifrato', sessioni)).toBe('s2');
  });

  it('non usa mai chiavi di altre stanze', () => {
    registraCreatore('carol', 'x1', { utente: 'alice', stanza: 'ALTRA' });
    expect(trovaChiaveDellaStanza('carol', 'A', 'x1:testo', { x1: sessione('x1') })).toBeNull();
  });

  it('chiave non ancora arrivata: nessuna trovata (il messaggio va in attesa)', () => {
    registraCreatore('carol', 's1', { utente: 'alice', stanza: 'A' });
    expect(trovaChiaveDellaStanza('carol', 'A', 's1:testo', {})).toBeNull();
  });

  it('messaggio anonimo: il mittente e\u0300 il creatore della chiave trovata', () => {
    registraCreatore('carol', 's9', { utente: 'alice', stanza: 'A' });
    expect(mittenteVerificato('carol', 's9', null)).toMatchObject({ mittente: 'alice', verificato: true, discrepanza: false });
  });

  it('nessun autore verificabile: mittente vuoto (il messaggio non viene mostrato)', () => {
    expect(mittenteVerificato('carol', 'sconosciuta', null).mittente).toBeNull();
  });
});
