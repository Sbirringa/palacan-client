// tests/firmaAutore.test.js  [palacan-n5e]
//
// Le regole di src/utils/firmaAutore.js una per una, con firme ed25519 VERE (account Olm), e i collegamenti nei file
// dell'app (olmService, App, backup, stato del gruppo, richieste di chiavi).
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import Olm from '../src/crypto/olm.js';
import {
  impostaFirmatario, impostaRitentativo, conChiaviMittente, imparaDaPayloadOlm, chiaveFirmaConosciuta,
  aggiungiAttestato, verificaAttestato, confermaAutoreFirmato, mettiInAttesaDiFirma, testoAttestato,
  chiaveFirmaPerQuestoAccount, CHIAVE_ARCHIVIO_FIRMA, _azzeraFirmaAutore,
} from '../src/utils/firmaAutore';
import { registraCreatore, leggiCreatore, confermaCreatoreFirmato } from '../src/utils/creatoriChiavi';
import { unisciBundle } from '../src/utils/backupUnito';
import { chiaviDaInoltrare } from '../src/utils/richiesteChiavi';

function persona(nome) {
  const conto = new Olm.Account();
  conto.create();
  const k = JSON.parse(conto.identity_keys());
  return { nome, conto, ed: k.ed25519, curva: k.curve25519 };
}
const firmatarioDi = (p) => ({ io: p.nome, chiave: p.ed, curva: p.curva, firma: (t) => p.conto.sign(t) });
const sessioneFinta = (id) => ({ session_id: () => id });
const olmDiAlice = (alice, extra = {}) => JSON.stringify({
  type: 'm.room_key', content: {}, chiavi_mittente: { utente: alice.nome, curve25519: alice.curva, ed25519: alice.ed, ...extra },
});

describe('N5e - chiave di firma imparata via Olm', () => {
  beforeEach(() => { localStorage.clear(); _azzeraFirmaAutore(); });

  it('nei messaggi Olm in uscita va { utente, curve25519, ed25519 } solo dentro un contenuto oggetto', () => {
    const alice = persona('alice');
    expect(conChiaviMittente('{"type":"x"}')).toBe('{"type":"x"}'); // nessun firmatario: invariato
    impostaFirmatario(firmatarioDi(alice));
    const dentro = JSON.parse(conChiaviMittente(JSON.stringify({ type: 'm.room_key', content: { a: 1 } })));
    expect(dentro.chiavi_mittente).toEqual({ utente: 'alice', curve25519: alice.curva, ed25519: alice.ed });
    expect(dentro.content).toEqual({ a: 1 });
    expect(conChiaviMittente('testo semplice')).toBe('testo semplice');
    expect(conChiaviMittente('[1,2]')).toBe('[1,2]');
  });

  it('si impara solo se curve25519 e utente coincidono con chi Olm dice che scrive', () => {
    const alice = persona('alice');
    const bob = persona('bob');
    impostaFirmatario(firmatarioDi(bob));
    expect(imparaDaPayloadOlm('bob', 'alice', 'curva-di-un-altro', olmDiAlice(alice))).toBe(false);
    expect(imparaDaPayloadOlm('bob', 'mallory', alice.curva, olmDiAlice(alice))).toBe(false);
    expect(chiaveFirmaConosciuta('bob', 'alice', alice.ed)).toBe(false);
    expect(imparaDaPayloadOlm('bob', 'alice', alice.curva, olmDiAlice(alice))).toBe(true);
    expect(chiaveFirmaConosciuta('bob', 'alice', alice.ed)).toBe(true);
    expect(chiaveFirmaConosciuta('bob', 'zed', alice.ed)).toBe(false);
    expect(JSON.parse(localStorage.getItem(CHIAVE_ARCHIVIO_FIRMA('bob'))).alice[alice.curva].ed25519).toBe(alice.ed);
  });

  it('la stessa chiave d\'identita\' non puo\' cambiare chiave di firma', () => {
    const alice = persona('alice');
    const zed = persona('zed');
    impostaFirmatario(firmatarioDi(persona('bob')));
    imparaDaPayloadOlm('bob', 'alice', alice.curva, olmDiAlice(alice));
    expect(imparaDaPayloadOlm('bob', 'alice', alice.curva, olmDiAlice(alice, { ed25519: zed.ed }))).toBe(false);
    expect(chiaveFirmaConosciuta('bob', 'alice', zed.ed)).toBe(false);
  });

  it('per se stessi vale la chiave dell\'account attuale', () => {
    const bob = persona('bob');
    impostaFirmatario(firmatarioDi(bob));
    expect(chiaveFirmaConosciuta('bob', 'bob', bob.ed)).toBe(true);
    expect(chiaveFirmaPerQuestoAccount('bob', bob.ed)).toBe(true);
    expect(chiaveFirmaConosciuta('bob', 'bob', persona('x').ed)).toBe(false);
  });
});

describe('N5e - attestato nei messaggi di gruppo', () => {
  beforeEach(() => { localStorage.clear(); _azzeraFirmaAutore(); });

  it('l\'attestato e\' la firma vera di "palacan-attestato-v1|sessione|autore"', () => {
    const alice = persona('alice');
    impostaFirmatario(firmatarioDi(alice));
    const conA = aggiungiAttestato({ text: 'ciao' }, sessioneFinta('S1'));
    expect(conA.text).toBe('ciao');
    expect(conA.attestato.u).toBe('alice');
    const u = new Olm.Utility();
    expect(() => u.ed25519_verify(alice.ed, testoAttestato('S1', 'alice'), conA.attestato.f)).not.toThrow();
    expect(() => u.ed25519_verify(alice.ed, testoAttestato('S2', 'alice'), conA.attestato.f)).toThrow();
    u.free();
    expect(aggiungiAttestato('testo', sessioneFinta('S1'))).toBe('testo');
  });

  it('esiti: valida, falsa (altra sessione o altro autore), sconosciuta, assente', () => {
    const alice = persona('alice');
    impostaFirmatario(firmatarioDi(alice));
    const a1 = aggiungiAttestato({}, sessioneFinta('S1')).attestato;
    impostaFirmatario(firmatarioDi(persona('bob')));
    expect(verificaAttestato('bob', 'S1', a1)).toBe('sconosciuta');
    imparaDaPayloadOlm('bob', 'alice', alice.curva, olmDiAlice(alice));
    expect(verificaAttestato('bob', 'S1', a1)).toBe('valida');
    expect(verificaAttestato('bob', 'S2', a1)).toBe('falsa'); // copiato in un'altra sessione
    expect(verificaAttestato('bob', 'S1', { ...a1, u: 'carol' })).toBe('sconosciuta');
    expect(verificaAttestato('bob', 'S1', null)).toBe('assente');
  });

  it('firma valida: il registro prende l\'autore firmato, ma una chiave propria non si tocca mai', () => {
    const alice = persona('alice');
    const bob = persona('bob');
    impostaFirmatario(firmatarioDi(alice));
    const a1 = aggiungiAttestato({}, sessioneFinta('S1')).attestato;
    const a2 = aggiungiAttestato({}, sessioneFinta('S2')).attestato;
    impostaFirmatario(firmatarioDi(bob));
    imparaDaPayloadOlm('bob', 'alice', alice.curva, olmDiAlice(alice));
    registraCreatore('bob', 'S1', { utente: 'zed', verifica: 'prima_volta', stanza: 'r' });
    registraCreatore('bob', 'S2', { utente: 'bob', verifica: 'propria', stanza: 'r' });
    expect(confermaAutoreFirmato('bob', 'S1', 'r', { attestato: a1 })).toMatchObject({ sospetto: false, firmato: true });
    expect(leggiCreatore('bob', 'S1')).toMatchObject({ utente: 'alice', verifica: 'firmata', firmato: true, corretta_da: 'zed' });
    confermaAutoreFirmato('bob', 'S2', 'r', { attestato: a2 });
    expect(leggiCreatore('bob', 'S2')).toMatchObject({ utente: 'bob', verifica: 'propria' });
  });

  it('chiave dell\'autore non ancora nota: sospetto solo se l\'attestato non coincide con il registro', () => {
    const alice = persona('alice');
    impostaFirmatario(firmatarioDi(alice));
    const a1 = aggiungiAttestato({}, sessioneFinta('S1')).attestato;
    impostaFirmatario(firmatarioDi(persona('bob')));
    registraCreatore('bob', 'S1', { utente: 'alice', verifica: 'coerente', stanza: 'r' });
    expect(confermaAutoreFirmato('bob', 'S1', 'r', { attestato: a1 })).toEqual({ sospetto: false });
    registraCreatore('bob', 'S9', { utente: 'zed', verifica: 'prima_volta', stanza: 'r' });
    expect(confermaAutoreFirmato('bob', 'S9', 'r', { attestato: { ...a1 } })).toEqual({ sospetto: true, utente: 'alice' });
    expect(confermaAutoreFirmato('bob', 'S7', 'r', { attestato: a1 }, 'alice')).toEqual({ sospetto: false }); // nome dal server uguale
    expect(confermaAutoreFirmato('bob', 'S7', 'r', { attestato: a1 }, 'zed').sospetto).toBe(true);
    expect(confermaAutoreFirmato('bob', 'S1', 'r', { text: 'senza attestato' })).toEqual({ sospetto: false });
  });

  it('i messaggi in attesa si ritentano quando arriva la chiave di firma del loro autore', async () => {
    const alice = persona('alice');
    impostaFirmatario(firmatarioDi(persona('bob')));
    const ritentati = [];
    impostaRitentativo((voci) => ritentati.push(...voci));
    mettiInAttesaDiFirma('alice', { messageId: 'm1' });
    mettiInAttesaDiFirma('alice', { messageId: 'm1' }); // doppione
    mettiInAttesaDiFirma('carol', { messageId: 'm2' });
    imparaDaPayloadOlm('bob', 'alice', alice.curva, olmDiAlice(alice));
    await new Promise((r) => setTimeout(r, 5));
    expect(ritentati.map((v) => v.messageId)).toEqual(['m1']);
  });
});

describe('N5e - registro, backup, richieste di chiavi', () => {
  beforeEach(() => { localStorage.clear(); _azzeraFirmaAutore(); });

  it('confermaCreatoreFirmato su una chiave mai vista la registra come firmata', () => {
    expect(confermaCreatoreFirmato('bob', 'S3', { utente: 'alice', stanza: 'r' })).toBe(true);
    expect(leggiCreatore('bob', 'S3')).toMatchObject({ utente: 'alice', verifica: 'firmata', firmato: true, stanza: 'r' });
  });

  it('unione dei backup: la voce firmata vince su quella non firmata; le chiavi di firma si sommano', () => {
    const remoto = {
      creatoriChiavi: JSON.stringify({ S1: { utente: 'zed', verifica: 'prima_volta', registrato: 1 } }),
      chiaviFirma: JSON.stringify({ alice: { C1: { ed25519: 'E1' } } }),
    };
    const locale = {
      creatoriChiavi: JSON.stringify({ S1: { utente: 'alice', verifica: 'firmata', firmato: true, registrato: 1 } }),
      chiaviFirma: JSON.stringify({ alice: { C2: { ed25519: 'E2' } }, carol: { C3: { ed25519: 'E3' } } }),
    };
    const unito = unisciBundle(remoto, locale);
    expect(JSON.parse(unito.creatoriChiavi).S1.utente).toBe('alice');
    expect(JSON.parse(unito.chiaviFirma)).toEqual({ alice: { C1: { ed25519: 'E1' }, C2: { ed25519: 'E2' } }, carol: { C3: { ed25519: 'E3' } } });
    const alContrario = unisciBundle(locale, remoto);
    expect(JSON.parse(alContrario.creatoriChiavi).S1.utente).toBe('alice');
  });

  it('le chiavi con autore firmato si possono restituire a chi le ha create (N5c)', () => {
    registraCreatore('bob', 'S5', { utente: 'alice', verifica: 'prima_volta', stanza: 'r' });
    confermaCreatoreFirmato('bob', 'S6', { utente: 'alice', stanza: 'r' });
    const scelte = chiaviDaInoltrare({
      io: 'bob', richiedente: 'alice', stanza: 'r', partecipanti: [{ username: 'alice', joined_at: '2026-01-01T00:00:00' }],
      sessioniEntranti: { S5: {}, S6: {} },
    });
    expect(scelte.sort()).toEqual(['S5', 'S6']);
  });

  it('collegamenti nei file dell\'app', () => {
    const svc = readFileSync('src/olmService.js', 'utf8');
    for (const pezzo of ['return session.encrypt(conChiaviMittente(plainText));',
      'imparaDaPayloadOlm(username, normalizedSender, senderIdentityKey, esito && esito.plaintext)',
      'aggiungiOra(aggiungiAttestato(payload, outboundGroupSession))',
      'chiaviFirma: safeLocalStorageGet(`palacan_chiavi_firma_${normalizedUsername}`)',
      'safeLocalStorageSet(`palacan_chiavi_firma_${normalizedUsername}`, bundle.chiaviFirma)']) expect(svc).toContain(pezzo);
    const app = readFileSync('src/App.jsx', 'utf8');
    for (const pezzo of ['const esitoFirma = confermaAutoreFirmato(username, sessionId, normalizedRoom, parsed, senderUsername);',
      'mettiInAttesaDiFirma(esitoFirma.utente,', 'impostaFirmatario({', 'impostaRitentativo((voci) =>']) expect(app).toContain(pezzo);
    expect(app.indexOf('const esitoFirma')).toBeLessThan(app.indexOf('const verificaMittente = mittenteVerificato('));
    expect(readFileSync('src/utils/statoGruppo.js', 'utf8')).toContain('chiaveFirmaPerQuestoAccount(utente, chiave)');
    expect(readFileSync('src/utils/statoGruppo.js', 'utf8')).not.toContain('queryMatrixKeys(utente, token)');
  });
});
