// tests/codaUscita.test.js
//
// METADATI fase 3.4d-ter: i messaggi non inviati restano in coda sul dispositivo e si possono ritentare.
import { describe, it, expect, beforeEach } from 'vitest';
import { leggiUscita, mettiInUscita, togliDaUscita } from '../src/utils/invioAnonimo';

describe('coda di uscita (metadati 3.4d-ter)', () => {
  beforeEach(() => localStorage.clear());

  it('un messaggio non inviato resta in coda (sopravvive a un ricaricamento)', () => {
    mettiInUscita('carol', { clientMsgId: 'cm-1', roomId: 'r1', cipherBody: 'cifrato' });
    expect(leggiUscita('carol')).toMatchObject([{ clientMsgId: 'cm-1', roomId: 'r1', cipherBody: 'cifrato' }]);
  });

  it('lo stesso messaggio non compare due volte in coda', () => {
    mettiInUscita('carol', { clientMsgId: 'cm-1', roomId: 'r1', cipherBody: 'a' });
    mettiInUscita('carol', { clientMsgId: 'cm-1', roomId: 'r1', cipherBody: 'b' });
    expect(leggiUscita('carol')).toHaveLength(1);
  });

  it('inviato con successo: tolto dalla coda', () => {
    mettiInUscita('carol', { clientMsgId: 'cm-1', roomId: 'r1' });
    mettiInUscita('carol', { clientMsgId: 'cm-2', roomId: 'r1' });
    togliDaUscita('carol', 'cm-1');
    expect(leggiUscita('carol').map((v) => v.clientMsgId)).toEqual(['cm-2']);
  });

  it('code separate per utente; dati mancanti ignorati', () => {
    mettiInUscita('carol', { clientMsgId: 'cm-1', roomId: 'r1' });
    mettiInUscita('dave', { roomId: 'r1' });
    expect(leggiUscita('dave')).toEqual([]);
    expect(leggiUscita('carol')).toHaveLength(1);
  });
});
