// src/utils/richiesteChiavi.js  [palacan-n5] [palacan-n5d]
//
// Recupero delle chiavi di stanza (Megolm) mancanti dagli ALTRI membri della stanza.
// Prima si potevano chiedere solo ai propri altri dispositivi (v1.14-B/C): se la chiave non era mai
// arrivata, o era andata persa senza backup, i messaggi restavano "in attesa di una chiave" per sempre.
// Questo vale soprattutto per il canale anonimo, dove il messaggio non dice quale chiave serve.
//
// Chi CHIEDE (dopo qualche secondo con messaggi della stanza ancora in attesa):
//   - manda m.room_key_request agli altri membri della stanza, al massimo una volta al minuto per stanza;
//   - la richiesta NON contiene il session_id (il server non deve sapere quale chiave cifra quali messaggi,
//     vedi metadati 3.4d): chiede "le chiavi di questa stanza".
// Chi RISPONDE, se chi chiede e' membro della stanza adesso, gli manda:
//   a. le chiavi create da se' per QUELLA stanza (registro dei creatori: verifica 'propria'), solo se chi chiede
//      e' entrato nella stanza prima che la chiave nascesse: chi entra dopo non legge i messaggi di prima;
//   b. [n5d] le chiavi create da CHI CHIEDE e ricevute a suo tempo (gliele si restituisce: le aveva gia'), solo
//      se l'autore era stato verificato con la sua chiave d'identita' (coerente / prima volta).
//   [n5d] Tutto viaggia in UN messaggio cifrato con Olm (olmService.encryptForwardedRoomKeys) sulla stessa sessione
//   1:1 e verso gli stessi dispositivi della condivisione normale delle chiavi; per ogni chiave c'e' il suo autore,
//   DENTRO la parte cifrata (il server non puo' toglierlo ne' cambiarlo).
// Chi RICEVE accetta le chiavi solo se:
//   - le aveva chieste da poco per quella stanza;
//   - l'autore dichiarato e' chi le manda, oppure se stesso (chiave propria restituita); mai un terzo;
//   - il registro non dice gia' che l'autore e' un altro;
//   - la chiave importata ha davvero l'identificativo dichiarato.
//   Una chiave dichiarata "propria" si accetta solo se il proprio registro dei creatori la conosce gia' come
//   propria (legata al suo identificativo, che nessuno puo' falsificare): un membro scorretto non puo' far
//   comparire come nostri i suoi messaggi. Senza registro la chiave propria persa resta persa (strada sicura).

import { leggiCreatore, registraCreatore, sessioniDellaStanza, valutaChiave } from './creatoriChiavi';

export const RITARDO_RICHIESTA_MS = 6000;
export const PAUSA_RICHIESTE_MS = 60000;
export const VALIDITA_RICHIESTA_MS = 10 * 60 * 1000;
export const PAUSA_RISPOSTE_MS = 30000;
export const MAX_CHIAVI_INOLTRATE = 25;
export const MAX_DESTINATARI = 30;
export const TIPO_CHIAVI_INOLTRATE = 'm.forwarded_room_keys';
const VERIFICHE_RESTITUZIONE = ['coerente', 'prima_volta', 'firmata'];  // [palacan-n5e] 'firmata': autore dimostrato dall'attestato

const timer = new Map(); // stanza -> timer della richiesta programmata
const ultimaRichiesta = new Map(); // stanza -> quando e' partita l'ultima richiesta
const ultimaRisposta = new Map(); // "richiedente|stanza" -> quando si e' risposto
const ricariche = new Map(); // stanza -> timer della ricarica (accorpa piu' chiavi in arrivo)

const testo = (v) => (v == null ? '' : String(v).trim());

/** Data del server in millisecondi. Le date senza fuso (es. "2026-10-26T10:00:00") sono UTC. */
export function aData(valore) {
  if (!valore) return null;
  let s = String(valore).trim();
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(s)) s += 'Z';
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

/** A chi chiedere: gli altri membri della stanza (nomi unici, al massimo MAX_DESTINATARI). */
export function destinatariRichiesta(membri, io) {
  const visti = new Set();
  for (const m of Array.isArray(membri) ? membri : []) {
    const nome = testo(m && (m.username ?? m.user_name));
    if (nome && nome !== testo(io)) visti.add(nome);
    if (visti.size >= MAX_DESTINATARI) break;
  }
  return [...visti];
}

/** Programma una richiesta per la stanza: parte dopo RITARDO_RICHIESTA_MS, una al minuto al massimo. */
export function programmaRichiestaMembri(stanza, esegui, { ritardo = RITARDO_RICHIESTA_MS, pausa = PAUSA_RICHIESTE_MS } = {}) {
  const s = testo(stanza);
  if (!s || typeof esegui !== 'function') return false;
  if (timer.has(s)) return false;
  const ultima = ultimaRichiesta.get(s);
  if (ultima && Date.now() - ultima < pausa) return false;
  timer.set(s, setTimeout(async () => {
    timer.delete(s);
    try {
      const partita = await esegui();
      if (partita) ultimaRichiesta.set(s, Date.now());
    } catch (e) {
      console.warn('Richiesta delle chiavi ai membri non riuscita (non bloccante):', e);
    }
  }, ritardo));
  return true;
}

/** Segna che per la stanza e' stata appena chiesta una chiave (solo allora si accettano chiavi inoltrate). */
export function segnaRichiesta(stanza) {
  const s = testo(stanza);
  if (s) ultimaRichiesta.set(s, Date.now());
}

export function richiestaAperta(stanza) {
  const ultima = ultimaRichiesta.get(testo(stanza));
  return Boolean(ultima) && Date.now() - ultima < VALIDITA_RICHIESTA_MS;
}

function puoRispondere(richiedente, stanza) {
  const chiave = `${richiedente}|${stanza}`;
  const ultima = ultimaRisposta.get(chiave);
  if (ultima && Date.now() - ultima < PAUSA_RISPOSTE_MS) return false;
  ultimaRisposta.set(chiave, Date.now());
  return true;
}

/** Le chiavi della stanza che si possono dare a "richiedente" (regole a e b), dalla piu' recente. */
export function chiaviDaInoltrare({ io, richiedente, stanza, partecipanti, sessioniEntranti }) {
  const me = testo(io);
  const lui = testo(richiedente);
  const s = testo(stanza);
  if (!me || !lui || !s || me === lui || !sessioniEntranti) return [];
  const membro = (Array.isArray(partecipanti) ? partecipanti : []).find((m) => testo(m && m.username) === lui);
  if (!membro) return [];
  const entrato = aData(membro.joined_at ?? membro.joinedAt);
  const scelte = [];
  for (const sessionId of sessioniDellaStanza(me, s)) {
    const c = leggiCreatore(me, sessionId);
    if (!c || c.stanza !== s || !sessioniEntranti[sessionId]) continue;
    const propria = c.utente === me && c.verifica === 'propria'
      && entrato != null && typeof c.registrato === 'number' && c.registrato >= entrato;
    const sua = c.utente === lui && VERIFICHE_RESTITUZIONE.includes(c.verifica);
    if (!propria && !sua) continue;
    scelte.push(sessionId);
    if (scelte.length >= MAX_CHIAVI_INOLTRATE) break;
  }
  return scelte;
}

function ricaricaPresto(stanza, amb) {
  const s = testo(stanza);
  if (ricariche.has(s)) return;
  ricariche.set(s, setTimeout(async () => {
    ricariche.delete(s);
    try {
      amb.salvaBackup?.();
    } catch (_) { /* non bloccante */ }
    try {
      if (amb.stanzaAperta && String(amb.stanzaAperta()) === s) await amb.ricaricaCronologia?.();
    } catch (e) {
      console.warn('Ricarica cronologia dopo chiave inoltrata non riuscita (non bloccante):', e);
    }
  }, 500));
}

async function rispondi({ content, mittente }, amb) {
  const stanza = testo(content && content.room_id);
  if (!stanza || !puoRispondere(mittente, stanza)) return 0;
  let partecipanti;
  try {
    partecipanti = await amb.api.getRoomUsers(stanza, amb.token);
  } catch (e) {
    console.warn('Verifica della richiesta di chiavi non riuscita:', e);
    return 0;
  }
  const scelte = chiaviDaInoltrare({ io: amb.io, richiedente: mittente, stanza, partecipanti, sessioniEntranti: amb.sessioniEntranti() });
  const chiavi = [];
  for (const sessionId of scelte) {
    const esportata = amb.olm.exportRoomKeyForForwarding(amb.sessioniEntranti(), sessionId);
    const c = leggiCreatore(amb.io, sessionId);
    if (esportata && c) chiavi.push({ session_id: sessionId, session_key: esportata, creatore: c.utente });
  }
  if (chiavi.length === 0) return 0;
  const miaChiave = amb.olm.getCurve25519Key(amb.account);
  if (!miaChiave) return 0;
  // Stessa sessione Olm e stessi dispositivi della condivisione normale (encryptRoomKeyForAllDevices).
  const risultati = await amb.olm.encryptForwardedRoomKeys({
    account: amb.account,
    username: amb.io,
    targetUsername: mittente,
    sessions: amb.sessioniPeer,
    token: amb.token,
    roomId: stanza,
    chiavi,
  });
  amb.sincronizzaSessioni?.();
  const ciphertext = {};
  for (const r of Array.isArray(risultati) ? risultati : []) {
    if (r && r.peerIdentityKey && r.body != null && r.type != null) ciphertext[r.peerIdentityKey] = { type: r.type, body: r.body };
  }
  if (Object.keys(ciphertext).length === 0) {
    console.warn(`⚠️ Nessun dispositivo di ${mittente} raggiungibile per le chiavi richieste`);
    return 0;
  }
  amb.inviaToDevice({
    eventType: 'm.forwarded_room_key',
    targetUsername: mittente,
    roomId: stanza,
    clientMsgId: `chiaviinoltrate-${stanza}-${mittente}-${Date.now()}`,
    algorithm: 'm.olm.v1.curve25519-aes-sha2',
    senderKey: miaChiave,
    content: { algorithm: 'm.olm.v1.curve25519-aes-sha2', sender_key: miaChiave, ciphertext },
  });
  const restituite = chiavi.filter((c) => c.creatore === mittente).length;
  console.log(`📤 [N5] ${chiavi.length} chiave/i della stanza inoltrata/e a ${mittente}${restituite ? ` (${restituite} sue, restituite)` : ''}`);
  return chiavi.length;
}

function importa(amb, { stanza, sessionId, chiave, mittente, chiaveMittente, autore }) {
  const io = testo(amb.io);
  const propria = autore === io;
  if (autore !== mittente && !propria) {
    console.warn(`⚠️ ${mittente} ha inoltrato una chiave dichiarandone autore un terzo: ignorata`);
    return false;
  }
  const noto = leggiCreatore(io, sessionId);
  // [n5d] una chiave dichiarata "tua" si accetta SOLO se il proprio registro dice gia' che l'abbiamo creata noi.
  // Il registro e' legato all'identificativo della chiave (la chiave pubblica della sessione Megolm, verificato
  // sotto): nessun altro puo' fabbricare una chiave con quell'identificativo. Cosi' un membro scorretto non puo'
  // farci credere nostri i suoi messaggi.
  if (propria && !(noto && noto.utente === io)) {
    console.warn(`⚠️ ${mittente} ha inoltrato una chiave dichiarandola nostra, ma il registro non la conosce: ignorata`);
    return false;
  }
  if (noto && noto.utente !== autore) {
    console.warn(`⚠️ ${mittente} ha inoltrato una chiave che il registro attribuisce a un altro: ignorata`);
    return false;
  }
  const mappa = amb.sessioniEntranti();
  if (mappa[sessionId]) return false; // gia' presente: niente da fare
  const sessione = amb.olm.receiveForwardedRoomKey({
    username: io,
    roomKeyContent: { algorithm: 'm.megolm.v1.aes-sha2', room_id: stanza, session_id: sessionId, session_key: chiave },
    inboundGroupSessions: mappa,
  });
  let idVero = null;
  try {
    idVero = sessione && typeof sessione.session_id === 'function' ? sessione.session_id() : null;
  } catch (_) {
    idVero = null;
  }
  if (idVero !== sessionId) {
    delete mappa[sessionId];
    try {
      amb.olm.saveInboundGroupSessions?.(io, mappa);
    } catch (_) { /* non bloccante */ }
    console.warn(`⚠️ Chiave inoltrata da ${mittente} con un identificativo falso: scartata`);
    return false;
  }
  amb.aggiornaSessioniEntranti?.(mappa);
  if (!propria) {
    registraCreatore(io, sessionId, {
      utente: mittente,
      chiave: chiaveMittente,
      verifica: valutaChiave(amb.olm.loadPeerIdentityKey?.(io, mittente) || null, chiaveMittente),
      stanza,
    });
  }
  return propria ? 'propria' : 'sua';
}

async function ricevi({ data, content, mittente }, amb) {
  const miaChiave = amb.olm.getCurve25519Key(amb.account);
  if (!miaChiave) return false;
  const perMe = content && content.ciphertext && typeof content.ciphertext === 'object' ? content.ciphertext[miaChiave] : null;
  const chiaveMittente = (data && (data.sender_key || data.senderKey)) || (content && content.sender_key) || null;
  if (!perMe || perMe.body == null || perMe.type == null || !chiaveMittente) return false;

  const risultato = await amb.olm.decryptOlmEvent({
    account: amb.account,
    username: amb.io,
    senderUsername: mittente,
    senderIdentityKey: chiaveMittente,
    messageType: Number(perMe.type),
    messageBody: perMe.body,
    sessions: amb.sessioniPeer,
    token: amb.token,
  });
  if (risultato && risultato.account) amb.aggiornaAccount?.(risultato.account);
  amb.sincronizzaSessioni?.();

  const letto = amb.olm.safeParseOlmPayload(risultato && risultato.plaintext);
  if (!letto || typeof letto !== 'object') return false;
  let stanza = '';
  let elenco = [];
  if (letto.type === TIPO_CHIAVI_INOLTRATE) {
    stanza = testo(letto.content && letto.content.room_id);
    elenco = Array.isArray(letto.content && letto.content.chiavi) ? letto.content.chiavi : [];
  } else if (letto.type === 'm.forwarded_room_key') {
    // formato di N5/N5b (una chiave, sempre di chi la manda): accettato finche' qualcuno non aggiorna la pagina
    stanza = testo(letto.content && letto.content.room_id);
    elenco = [{ session_id: letto.content && letto.content.session_id, session_key: letto.content && letto.content.session_key }];
  } else {
    return false;
  }
  if (!stanza || elenco.length === 0) return false;
  if (!richiestaAperta(stanza)) {
    console.warn(`⚠️ Chiavi inoltrate da ${mittente} senza una richiesta aperta: ignorate`);
    return false;
  }

  let sue = 0;
  let proprie = 0;
  const importate = [];
  for (const voce of elenco.slice(0, MAX_CHIAVI_INOLTRATE)) {
    const sessionId = testo(voce && voce.session_id);
    const chiave = voce && voce.session_key;
    if (!sessionId || !chiave) continue;
    const autore = testo(voce.creatore) || mittente;
    const esito = importa(amb, { stanza, sessionId, chiave, mittente, chiaveMittente, autore });
    if (!esito) continue;
    importate.push(sessionId);
    if (esito === 'propria') proprie += 1;
    else sue += 1;
  }
  if (importate.length === 0) return false;
  console.log(`✅ [N5] ${importate.length} chiave/i della stanza ricevuta/e da ${mittente}${proprie ? ` (${proprie} proprie, restituite)` : ''}`);

  const attese = amb.inAttesa || {};
  for (const chiaveAttesa of [...importate, `stanza:${stanza}`]) {
    const coda = attese[chiaveAttesa];
    if (!Array.isArray(coda) || coda.length === 0) continue;
    delete attese[chiaveAttesa];
    for (const item of coda) {
      try {
        await amb.ritenta(item);
      } catch (e) {
        console.warn('Nuovo tentativo di un messaggio in attesa non riuscito (non bloccante):', e);
      }
    }
  }
  ricaricaPresto(stanza, amb);
  return { sue, proprie };
}

/** Richiesta o chiavi inoltrate arrivate da un ALTRO utente (quelle dai propri dispositivi restano a v1.14-B). */
export async function gestisciEventoChiaveMembro(evento, amb) {
  const mittente = testo(evento && evento.mittente);
  if (!mittente || !amb || !amb.io || mittente === testo(amb.io)) return null;
  if (evento.eventType === 'm.room_key_request') return rispondi({ ...evento, mittente }, amb);
  if (evento.eventType === 'm.forwarded_room_key') return ricevi({ ...evento, mittente }, amb);
  return null;
}

// Solo per i test.
export function _azzeraRichieste() {
  for (const t of timer.values()) clearTimeout(t);
  for (const t of ricariche.values()) clearTimeout(t);
  timer.clear();
  ultimaRichiesta.clear();
  ultimaRisposta.clear();
  ricariche.clear();
}
