// tests/autoreFirmato.test.js  [palacan-n5e]
//
// L'attacco che N5e chiude, con crittografia VERA (vodozemac) e le funzioni vere di olmService.
// alice crea una sessione di gruppo e scrive. zed, membro scorretto, ha ricevuto la chiave di alice e la inoltra a
// bob (dispositivo appena recuperato, senza registro) dichiarandosene autore: e' quello che fa N5 quando accetta una
// chiave inoltrata (registraCreatore con chi la manda). Prima di N5e bob vedeva i messaggi di alice come di zed.
// Ora l'attestato firmato dentro il messaggio dice chi e' il creatore: o si verifica (e il registro si corregge),
// o il messaggio aspetta la chiave di firma di alice; mai mostrato come di zed.
//
// Sul codice di PRIMA src/utils/firmaAutore.js non esiste: il test fa quello che faceva l'app (solo il registro)
// e deve fallire.
import { describe, it, expect, beforeEach } from 'vitest';
import Olm from '../src/crypto/olm.js';
import * as olm from '../src/olmService.js';
import { registraCreatore, mittenteVerificato } from '../src/utils/creatoriChiavi';

const STANZA = 'stanza-n5e';
let modulo = null;

async function firma() {
  try {
    const percorso = '../src/utils/firmaAutore.js'; // percorso in una variabile: sul codice di prima il file manca
    return await import(/* @vite-ignore */ percorso);
  } catch (_) {
    return null; // codice di prima: il modulo non c'e'
  }
}

function persona(nome) {
  const conto = new Olm.Account();
  conto.create();
  const chiavi = JSON.parse(conto.identity_keys());
  return { nome, conto, ed: chiavi.ed25519, curva: chiavi.curve25519 };
}

function comeFirmatario(p) {
  if (modulo) modulo.impostaFirmatario({ io: p.nome, chiave: p.ed, curva: p.curva, firma: (t) => p.conto.sign(t) });
}

// Messaggio Olm vero da "da" a "a" (pre-key) con olmService.encryptMessage: restituisce il testo decifrato da "a".
function olmDa(da, a, contenuto) {
  a.conto.generate_one_time_keys(1);
  const otk = Object.values(JSON.parse(a.conto.one_time_keys()).curve25519)[0];
  a.conto.mark_keys_as_published();
  const uscente = new Olm.Session();
  uscente.create_outbound(da.conto, a.curva, otk);
  comeFirmatario(da);
  const cifrato = olm.encryptMessage(uscente, JSON.stringify(contenuto));
  const entrante = new Olm.Session();
  entrante.create_inbound_from(a.conto, da.curva, cifrato.body);
  return entrante.decrypt(cifrato.type, cifrato.body);
}

// Quello che fa App.jsx (decryptMegolmRoomMessage) per scegliere l'autore da mostrare. null = non si mostra (ancora).
function autoreMostrato(io, sessionId, parsed, inAttesa) {
  if (modulo) {
    const esito = modulo.confermaAutoreFirmato(io, sessionId, STANZA, parsed, null);
    if (esito.sospetto) {
      modulo.mettiInAttesaDiFirma(esito.utente, { sessionId, parsed });
      if (inAttesa) inAttesa.push(esito.utente);
      return null;
    }
  }
  return mittenteVerificato(io, sessionId, null).mittente;
}

function scriveNelGruppo(autore, testo) {
  comeFirmatario(autore);
  const uscente = olm.getOrCreateOutboundGroupSession(autore.nome, STANZA);
  const chiave = olm.createRoomKeyEventContent(STANZA, uscente, autore.nome);
  const cifrato = olm.encryptGroupMessage(uscente, { text: testo });
  olm.saveOutboundGroupSession(autore.nome, STANZA, uscente);
  return { sessionId: uscente.session_id(), chiave, cifrato };
}

function leggeBob(bob, { chiave, cifrato }) {
  const mappa = {};
  const entrante = olm.receiveRoomKeyEvent({ username: bob.nome, roomKeyContent: chiave, inboundGroupSessions: mappa });
  return olm.safeParseOlmPayload(olm.decryptGroupMessage(entrante, cifrato).plaintext);
}

describe('N5e: l\'autore di un messaggio di gruppo non si puo\' spostare con un inoltro', () => {
  beforeEach(async () => {
    localStorage.clear();
    await olm.initOlm();
    modulo = await firma();
    if (modulo) modulo._azzeraFirmaAutore();
  });

  it('bob conosce gia\' la chiave di firma di alice (arrivata via Olm): si vede alice, e il registro e\' corretto', () => {
    const alice = persona('alice');
    const bob = persona('bob');
    const zed = persona('zed');
    const chiaroOlm = olmDa(alice, bob, { type: 'm.room_key', content: { room_id: STANZA } });
    const gruppo = scriveNelGruppo(alice, 'ciao a tutti');

    comeFirmatario(bob);
    if (modulo) modulo.imparaDaPayloadOlm('bob', 'alice', alice.curva, chiaroOlm);
    registraCreatore('bob', gruppo.sessionId, { utente: 'zed', chiave: zed.curva, verifica: 'prima_volta', stanza: STANZA }); // inoltro di zed
    const parsed = leggeBob(bob, gruppo);

    expect(parsed.text).toBe('ciao a tutti');
    expect(autoreMostrato('bob', gruppo.sessionId, parsed)).toBe('alice');
  });

  it('bob non conosce ancora la chiave di alice: il messaggio aspetta, poi si vede come di alice', async () => {
    const alice = persona('alice');
    const bob = persona('bob');
    const zed = persona('zed');
    const gruppo = scriveNelGruppo(alice, 'messaggio di alice');
    const chiaroOlm = olmDa(alice, bob, { type: 'm.room_key', content: { room_id: STANZA } }); // arrivera' dopo

    comeFirmatario(bob);
    registraCreatore('bob', gruppo.sessionId, { utente: 'zed', chiave: zed.curva, verifica: 'prima_volta', stanza: STANZA });
    const parsed = leggeBob(bob, gruppo);
    const attese = [];
    const ritentati = [];
    if (modulo) modulo.impostaRitentativo((voci) => ritentati.push(...voci));

    expect(autoreMostrato('bob', gruppo.sessionId, parsed, attese)).toBeNull(); // mai come di zed
    expect(attese).toEqual(['alice']);

    if (modulo) modulo.imparaDaPayloadOlm('bob', 'alice', alice.curva, chiaroOlm);
    await new Promise((r) => setTimeout(r, 5));
    expect(ritentati.length).toBe(1);
    expect(autoreMostrato('bob', gruppo.sessionId, ritentati[0].parsed)).toBe('alice');
  });
});
