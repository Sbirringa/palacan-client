// tests/mittenteVerificato.test.js
//
// METADATI fase 3.1: il mittente mostrato e' il creatore della chiave di stanza, non il nome dato dal server.
import { describe, it, expect, beforeEach } from 'vitest';
import { registraCreatore, leggiCreatore, mittenteVerificato, valutaChiave } from '../src/utils/creatoriChiavi';

describe('mittente verificato (metadati 3.1)', () => {
  beforeEach(() => localStorage.clear());

  it('senza creatore registrato resta il mittente dichiarato, non verificato', () => {
    expect(mittenteVerificato('carol', 'sess1', 'alice')).toMatchObject({ mittente: 'alice', verificato: false, discrepanza: false });
  });

  it('con creatore registrato e server onesto: verificato, nessuna discrepanza', () => {
    registraCreatore('carol', 'sess1', { utente: 'alice', chiave: 'K_A', verifica: 'coerente' });
    expect(mittenteVerificato('carol', 'sess1', 'alice')).toMatchObject({ mittente: 'alice', verificato: true, discrepanza: false });
  });

  it('server che rietichetta il messaggio: si mostra il creatore e si segnala', () => {
    registraCreatore('carol', 'sess1', { utente: 'alice', chiave: 'K_A' });
    expect(mittenteVerificato('carol', 'sess1', 'bob')).toMatchObject({ mittente: 'alice', verificato: true, discrepanza: true });
  });

  it('il primo creatore registrato non si puo\u0300 sovrascrivere', () => {
    expect(registraCreatore('carol', 'sess1', { utente: 'alice', chiave: 'K_A' })).toBe(true);
    expect(registraCreatore('carol', 'sess1', { utente: 'bob', chiave: 'K_B' })).toBe(false);
    expect(leggiCreatore('carol', 'sess1').utente).toBe('alice');
  });

  it('registri separati per ogni utente del dispositivo', () => {
    registraCreatore('carol', 'sess1', { utente: 'alice' });
    expect(leggiCreatore('dave', 'sess1')).toBeNull();
  });

  it('confronto tra chiave usata da Olm e chiave nota', () => {
    expect(valutaChiave('K_A', 'K_A')).toBe('coerente');
    expect(valutaChiave('K_A', 'K_X')).toBe('diversa');
    expect(valutaChiave(null, 'K_A')).toBe('prima_volta');
    expect(valutaChiave('K_A', null)).toBe('sconosciuta');
  });

  it('dati mancanti non registrano nulla', () => {
    expect(registraCreatore('', 'sess1', { utente: 'alice' })).toBe(false);
    expect(registraCreatore('carol', '', { utente: 'alice' })).toBe(false);
    expect(registraCreatore('carol', 'sess1', {})).toBe(false);
  });
});
