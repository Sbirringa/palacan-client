// src/utils/firmaAutore.js  [palacan-n5e]
//
// Autore di ogni messaggio di gruppo DIMOSTRATO dal messaggio stesso, senza fidarsi del server ne' di chi inoltra.
//
// Il problema (N5/N5d): l'autore mostrato e' il creatore della chiave di stanza (Megolm) scritto nel registro
// (creatoriChiavi). Chi riceve una chiave INOLTRATA da un altro membro poteva solo credere a chi la inoltrava: un
// membro scorretto poteva farsi passare per autore dei messaggi di un altro. E senza registro l'autore veniva dal
// nome dichiarato dal server.
//
// La soluzione:
//   1. Chiave di firma imparata via Olm. Ogni messaggio Olm che questo dispositivo manda porta, DENTRO la parte
//      cifrata, { utente, curve25519, ed25519 } del mittente (conChiaviMittente). Un messaggio Olm lo puo' produrre
//      solo chi possiede la chiave d'identita' curve25519 del mittente: la coppia curve25519 <-> ed25519 arriva
//      autenticata dal mittente stesso, MAI dal server (imparaDaPayloadOlm). Le coppie imparate restano sul
//      dispositivo (palacan_chiavi_firma_<utente>) ed entrano nel backup cifrato.
//   2. Attestato nei messaggi di gruppo. Ogni messaggio Megolm creato da qui porta { u, k, f }: f e' la firma
//      ed25519 di "palacan-attestato-v1|<session_id>|<u>" (aggiungiAttestato). Dentro una sessione Megolm scrive
//      SOLO chi l'ha creata (gli altri hanno solo la parte per leggere): l'attestato dice chi e' il creatore, e la
//      firma dice che e' davvero lui.
//   3. Chi decifra (confermaAutoreFirmato): firma valida con una chiave imparata via Olm per quell'utente ->
//      il registro dei creatori prende quell'autore (corretto se diceva altro; mai toccata una chiave 'propria').
//      Chiave dell'autore non ancora conosciuta e attestato diverso dal registro (o dal nome dato dal server) ->
//      il messaggio NON si mostra con un autore sbagliato: resta in attesa e si ritenta appena arriva la chiave
//      di firma di quell'utente (di solito con la prossima chiave di stanza che manda).

import Olm from '../crypto/olm.js';
import { confermaCreatoreFirmato, leggiCreatore } from './creatoriChiavi';

const PREFISSO = 'palacan-attestato-v1';
const chiaveArchivio = (io) => `palacan_chiavi_firma_${String(io || '').trim()}`;
export const CHIAVE_ARCHIVIO_FIRMA = chiaveArchivio;
const MAX_CHIAVI_PER_UTENTE = 20;
const MAX_IN_ATTESA = 500;

let firmatario = null; // { io, chiave (ed25519), curva (curve25519), firma(testo) }
let ritentativo = null; // (voci) => void
let pqPronto = false; // [palacan-pq4] questo account ha chiavi post-quantum pubblicate: lo annuncia nei messaggi Olm
let pqFirmaPronta = null; // [palacan-pq5b] impronta della chiave di firma ML-DSA-65 pubblicata: si annuncia nei messaggi Olm
let scaricatorePqFirma = null; // [palacan-pq5b] (impronta nuova imparata) => scarica e verifica la chiave
const IMPRONTA_PQF = /^[0-9a-f]{64}$/; // [palacan-pq5b]
const MAX_IMPRONTE_PRECEDENTI = 5; // [palacan-pq5b] le firme fatte con le chiavi di prima si verificano ancora
let ibrido = null; // [palacan-pq5c] { firma, verifica, chiaveNota } (firmaPq.js si registra da solo)
const attestatiIbridiPropri = new Map(); // [palacan-pq5c] session_id -> parte ibrida dell'attestato di questo account
const sessioniIbride = new Set(); // [palacan-pq5c] "sid|u|k" con la parte ibrida gia' verificata
let pqIbridoPronto = false; // [palacan-pq5d] tutte le chiavi ML-KEM pubblicate hanno la firma ibrida: si annuncia
export const OGNI_IBRIDO = 32; // [palacan-pq5c] attestato ibrido (3,3 KB di ML-DSA) nel 1o messaggio della sessione e poi ogni 32
const attestatiPropri = new Map(); // session_id -> attestato di questo account
const verifiche = new Map(); // "sid|u|k|f" -> 'valida' | 'falsa'
const inAttesa = new Map(); // utente -> [voci da ritentare]
const avvisati = new Set();

const testo = (v) => (v == null ? '' : String(v).trim());

function avvisaUnaVolta(chiave, messaggio) {
  if (avvisati.has(chiave)) return;
  avvisati.add(chiave);
  console.warn(messaggio);
}

/** Chi firma da questo dispositivo (l'account Olm attuale). null all'uscita. */
export function impostaFirmatario(f) {
  const valido = f && testo(f.io) && testo(f.chiave) && typeof f.firma === 'function';
  const cambiato = !valido || !firmatario || firmatario.io !== testo(f.io) || firmatario.chiave !== testo(f.chiave);
  firmatario = valido ? { io: testo(f.io), chiave: testo(f.chiave), curva: testo(f.curva) || null, firma: f.firma } : null;
  if (cambiato) {
    attestatiPropri.clear();
    inAttesa.clear();
    pqPronto = false;  // [palacan-pq4]
    pqFirmaPronta = null;  // [palacan-pq5b]
    attestatiIbridiPropri.clear();  // [palacan-pq5c]
    sessioniIbride.clear();  // [palacan-pq5c]
    pqIbridoPronto = false;  // [palacan-pq5d]
  }
}

/** Cosa fare con i messaggi rimasti in attesa quando arriva la chiave di firma del loro autore. */
export function impostaRitentativo(fn) {
  ritentativo = typeof fn === 'function' ? fn : null;
}

export function testoAttestato(sessionId, utente) {
  return `${PREFISSO}|${testo(sessionId)}|${testo(utente)}`;
}

// ------------------------------------------------------------------ chiavi di firma imparate via Olm

function leggiChiavi(io) {
  try {
    const o = JSON.parse(localStorage.getItem(chiaveArchivio(io)) || '{}');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (_) {
    return {};
  }
}

function scriviChiavi(io, mappa) {
  try {
    localStorage.setItem(chiaveArchivio(io), JSON.stringify(mappa));
  } catch (_) { /* archivio pieno o non disponibile: si reimpara al prossimo messaggio Olm */ }
}

/** La chiave ed25519 "chiave" e' di "utente"? (imparata via Olm; per se stessi anche quella dell'account attuale) */
export function chiaveFirmaConosciuta(io, utente, chiave) {
  const me = testo(io);
  const lui = testo(utente);
  const k = testo(chiave);
  if (!me || !lui || !k) return false;
  if (lui === me && firmatario && firmatario.io === me && firmatario.chiave === k) return true;
  const sue = leggiChiavi(me)[lui];
  if (!sue || typeof sue !== 'object') return false;
  return Object.values(sue).some((v) => v && v.ed25519 === k);
}

/** [palacan-pq4] Chiave ed25519 imparata via Olm per il dispositivo "curva" di "utente" (o la propria), oppure null. */
export function chiaveFirmaPerCurva(io, utente, curva) {
  const me = testo(io);
  const lui = testo(utente);
  const c = testo(curva);
  if (!me || !lui || !c) return null;
  if (lui === me && firmatario && firmatario.io === me && firmatario.curva === c) return firmatario.chiave;
  const sue = leggiChiavi(me)[lui];
  return sue && sue[c] && sue[c].ed25519 ? sue[c].ed25519 : null;
}

/** [palacan-pq4] Il dispositivo "curva" di "utente" ci ha annunciato (dentro Olm) di avere chiavi post-quantum? */
export function supportoPqAnnunciato(io, utente, curva) {
  const sue = leggiChiavi(testo(io))[testo(utente)];
  const voce = sue ? sue[testo(curva)] : null;
  return Boolean(voce && voce.pq);
}

/** [palacan-pq4] Le chiavi post-quantum di questo account sono pubblicate: da ora lo si annuncia nei messaggi Olm. */
export function segnaPqPronto(io) {
  if (firmatario && firmatario.io === testo(io)) pqPronto = true;
}

/** [palacan-pq5d] Tutte le chiavi ML-KEM pubblicate da questo dispositivo hanno la firma ibrida: da ora lo si annuncia
 * nei messaggi Olm ("pqh"), e chi ci manda chiavi di stanza esige la firma ibrida. */
export function segnaPqIbridoPronto(io) {
  if (firmatario && firmatario.io === testo(io) && pqFirmaPronta) pqIbridoPronto = true;
}

/** [palacan-pq5d] Il dispositivo "curva" di "utente" ci ha annunciato (dentro Olm) chiavi ML-KEM con firma ibrida? */
export function supportoPqIbridoAnnunciato(io, utente, curva) {
  const sue = leggiChiavi(testo(io))[testo(utente)];
  const voce = sue ? sue[testo(curva)] : null;
  return Boolean(voce && voce.pqh && voce.pqf);
}

/** [palacan-pq5d] Chi firma da questo dispositivo (nome utente), oppure null. */
export function utenteFirmatario() {
  return firmatario ? firmatario.io : null;
}

/** [palacan-pq5b] La chiave di firma ML-DSA-65 di questo account e' pubblicata (firmaPq.js): da ora se ne annuncia
 * l'impronta nei messaggi Olm, dentro la parte cifrata. */
export function segnaPqFirmaPronta(io, impronta) {
  if (firmatario && firmatario.io === testo(io) && IMPRONTA_PQF.test(testo(impronta))) pqFirmaPronta = testo(impronta);
}

/** [palacan-pq5b] Chi scarica una chiave ML-DSA-65 appena se ne impara un'impronta nuova: fn({ utente, curva, ed, impronta }). */
export function impostaScaricatorePqFirma(fn) {
  scaricatorePqFirma = typeof fn === 'function' ? fn : null;
}

function avvisaScaricatore(utente, curva, ed, impronta) {
  const fn = scaricatorePqFirma;
  if (!fn) return;
  setTimeout(() => {
    try {
      Promise.resolve(fn({ utente, curva, ed, impronta })).catch(() => {});
    } catch (_) { /* non bloccante: si riscarica quando serve */ }
  }, 0);
}

/** [palacan-pq5b] Impronte ML-DSA-65 annunciate via Olm dal dispositivo "curva" di "utente": [attuale, ...precedenti]. */
export function improntePqFirmaPerCurva(io, utente, curva) {
  const me = testo(io);
  const lui = testo(utente);
  const c = testo(curva);
  if (!me || !lui || !c) return [];
  if (lui === me && firmatario && firmatario.io === me && firmatario.curva === c) return pqFirmaPronta ? [pqFirmaPronta] : [];
  const sue = leggiChiavi(me)[lui];
  const voce = sue ? sue[c] : null;
  if (!voce || !IMPRONTA_PQF.test(testo(voce.pqf))) return [];
  return [voce.pqf, ...(Array.isArray(voce.pqfPrecedenti) ? voce.pqfPrecedenti.filter((x) => IMPRONTA_PQF.test(testo(x))) : [])];
}

/** [palacan-pq5b] Come sopra, per il dispositivo di "utente" con la chiave ed25519 "ed" (per verificare una sua firma). */
export function improntePqFirmaPerChiave(io, utente, ed) {
  const me = testo(io);
  const lui = testo(utente);
  const k = testo(ed);
  if (!me || !lui || !k) return [];
  if (lui === me && firmatario && firmatario.io === me && firmatario.chiave === k) return pqFirmaPronta ? [pqFirmaPronta] : [];
  const sue = leggiChiavi(me)[lui];
  if (!sue || typeof sue !== 'object') return [];
  const curva = Object.keys(sue).find((c) => sue[c] && sue[c].ed25519 === k);
  return curva ? improntePqFirmaPerCurva(me, lui, curva) : [];
}

/** [palacan-pq5c] Firma ibrida ed25519 + ML-DSA-65 (firmaPq.js si registra da solo): { firma, verifica, chiaveNota }. */
export function impostaIbrido(h) {
  ibrido = h && typeof h.firma === 'function' && typeof h.verifica === 'function' && typeof h.chiaveNota === 'function' ? h : null;
}

/** [palacan-pq5c] Ritenta i messaggi in attesa di "utente": chiave di firma imparata, chiave ML-DSA-65 scaricata,
 * sessione dimostrata dalla parte ibrida. */
export function riprovaInAttesa(utente) {
  const lui = testo(utente);
  const voci = inAttesa.get(lui);
  if (!voci || !voci.length || !ritentativo) return;
  inAttesa.delete(lui);
  const fn = ritentativo;
  setTimeout(() => {
    try {
      fn(voci);
    } catch (e) {
      console.warn('[N5e] nuovo tentativo dei messaggi in attesa non riuscito (non bloccante):', e);
    }
  }, 0);
}

/** Per lo stato del gruppo firmato (statoGruppo.js): la chiave e' di "utente" secondo questo account? */
export function chiaveFirmaPerQuestoAccount(utente, chiave) {
  return Boolean(firmatario) && chiaveFirmaConosciuta(firmatario.io, utente, chiave);
}

/**
 * Da un messaggio Olm appena decifrato: se dentro c'e' { utente, curve25519, ed25519 } del mittente e la curve25519
 * e' proprio quella con cui Olm ha decifrato, si impara la coppia. Restituisce true se la chiave e' nuova.
 */
export function imparaDaPayloadOlm(io, mittente, curvaMittente, plaintext) {
  try {
    const me = testo(io);
    const lui = testo(mittente);
    const curva = testo(curvaMittente);
    if (!me || !lui || !curva || typeof plaintext !== 'string') return false;
    if (lui === me && firmatario && firmatario.io === me && firmatario.curva === curva) return false; // questo stesso dispositivo
    let letto = null;
    try {
      letto = JSON.parse(plaintext);
    } catch (_) {
      return false;
    }
    const c = letto && typeof letto === 'object' ? letto.chiavi_mittente : null;
    if (!c || typeof c !== 'object') return false;
    const ed = testo(c.ed25519);
    if (!ed || testo(c.curve25519) !== curva || testo(c.utente) !== lui) return false;
    const mappa = leggiChiavi(me);
    const sue = mappa[lui] && typeof mappa[lui] === 'object' ? { ...mappa[lui] } : {};
    const pqf = IMPRONTA_PQF.test(testo(c.pqf)) ? testo(c.pqf) : null;  // [palacan-pq5b] impronta della chiave ML-DSA-65
    if (sue[curva]) {
      if (sue[curva].ed25519 !== ed) {
        avvisaUnaVolta(`curva|${lui}|${curva}`, `⚠️ [N5e] ${lui}: la stessa chiave d'identita' dichiara un'altra chiave di firma: ignorata`);
      } else {
        // [palacan-pq4] annuncio del supporto post-quantum e [palacan-pq5b] impronta ML-DSA-65: solo in avanti, mai tolti
        // (un messaggio senza annuncio non toglie niente). Un'impronta nuova prende il posto dell'attuale, che resta
        // tra le precedenti: le firme fatte con la chiave di prima si verificano ancora.
        let voce = sue[curva];
        if (c.pq && !voce.pq) voce = { ...voce, pq: true };
        if (c.pqh && !voce.pqh) voce = { ...voce, pqh: true };  // [palacan-pq5d] chiavi ML-KEM con firma ibrida (solo in avanti)
        if (pqf && voce.pqf !== pqf) {
          const precedenti = [voce.pqf, ...(Array.isArray(voce.pqfPrecedenti) ? voce.pqfPrecedenti : [])]
            .filter((x) => x && x !== pqf).slice(0, MAX_IMPRONTE_PRECEDENTI);
          voce = { ...voce, pqf, ...(precedenti.length ? { pqfPrecedenti: precedenti } : {}) };
          avvisaScaricatore(lui, curva, ed, pqf);
        }
        if (voce !== sue[curva]) {
          mappa[lui] = { ...sue, [curva]: voce };
          scriviChiavi(me, mappa);
        }
      }
      return false;
    }
    sue[curva] = { ed25519: ed, imparata: Date.now(), ...(c.pq ? { pq: true } : {}), ...(pqf ? { pqf } : {}), ...(c.pqh ? { pqh: true } : {}) };  // [palacan-pq4] [palacan-pq5b] [palacan-pq5d]
    const ordinate = Object.entries(sue).sort((a, b) => (b[1].imparata || 0) - (a[1].imparata || 0)).slice(0, MAX_CHIAVI_PER_UTENTE);
    mappa[lui] = Object.fromEntries(ordinate);
    scriviChiavi(me, mappa);
    if (pqf) avvisaScaricatore(lui, curva, ed, pqf);  // [palacan-pq5b]
    riprovaInAttesa(lui);  // [palacan-pq5c] la stessa logica di prima, ora in una funzione
    return true;
  } catch (_) {
    return false;
  }
}

/** Nei messaggi Olm in uscita: { utente, curve25519, ed25519 } di questo account, dentro la parte cifrata. */
export function conChiaviMittente(plainText) {
  try {
    if (!firmatario || !firmatario.curva || typeof plainText !== 'string') return plainText;
    const t = plainText.trim();
    if (!t.startsWith('{')) return plainText;
    const o = JSON.parse(t);
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.chiavi_mittente) return plainText;
    return JSON.stringify({ ...o, chiavi_mittente: { utente: firmatario.io, curve25519: firmatario.curva, ed25519: firmatario.chiave, ...(pqPronto ? { pq: 1 } : {}), ...(pqFirmaPronta ? { pqf: pqFirmaPronta } : {}), ...(pqIbridoPronto ? { pqh: 1 } : {}) } });  // [palacan-pq4] pq: annuncio [palacan-pq5b] pqf: impronta ML-DSA-65
  } catch (_) {
    return plainText;
  }
}

// ------------------------------------------------------------------ attestato nei messaggi di gruppo

function attestatoPer(sessionId) {
  if (!firmatario || !sessionId) return null;
  if (attestatiPropri.has(sessionId)) return attestatiPropri.get(sessionId);
  const a = { u: firmatario.io, k: firmatario.chiave, f: firmatario.firma(testoAttestato(sessionId, firmatario.io)) };
  if (!a.f) return null;
  attestatiPropri.set(sessionId, a);
  return a;
}

/** Nei messaggi di gruppo in uscita (solo contenuti oggetto): l'attestato firmato del creatore della sessione. */
// [palacan-pq5c] Parte ibrida dell'attestato (ed25519 + ML-DSA-65 sullo stesso testo), una volta per sessione.
function attestatoIbridoPer(sessionId) {
  if (!ibrido || !firmatario || !sessionId) return null;
  if (attestatiIbridiPropri.has(sessionId)) return attestatiIbridiPropri.get(sessionId);
  let h = null;
  try {
    h = ibrido.firma({ io: firmatario.io, contesto: 'attestato', messaggio: testoAttestato(sessionId, firmatario.io), firmaEd: firmatario.firma });
  } catch (_) {
    h = null;
  }
  if (h) attestatiIbridiPropri.set(sessionId, h);
  return h;
}

export function aggiungiAttestato(payload, sessioneUscente) {
  try {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.attestato) return payload;
    const sid = sessioneUscente && typeof sessioneUscente.session_id === 'function' ? sessioneUscente.session_id() : null;
    const a = attestatoPer(sid);
    if (!a) return payload;
    // [palacan-pq5c] la parte ibrida pesa 3,3 KB: nel primo messaggio della sessione e poi ogni OGNI_IBRIDO
    let indice = null;
    try {
      indice = typeof sessioneUscente.message_index === 'function' ? Number(sessioneUscente.message_index()) : null;
    } catch (_) {
      indice = null;
    }
    const h = indice === null || !Number.isFinite(indice) || indice % OGNI_IBRIDO === 0 ? attestatoIbridoPer(sid) : null;
    return { ...payload, attestato: h ? { ...a, h } : a };
  } catch (_) {
    return payload;
  }
}

function verificaFirma(chiave, messaggio, firma) {
  const utilita = new Olm.Utility();
  try {
    utilita.ed25519_verify(chiave, messaggio, firma);
    return true;
  } catch (_) {
    return false;
  } finally {
    try { utilita.free(); } catch (_) { /* gia' liberata */ }
  }
}

/** 'valida' | 'falsa' | 'sconosciuta' (chiave di firma dell'autore non ancora imparata) | 'assente' */
export function verificaAttestato(io, sessionId, attestato) {
  const a = attestato && typeof attestato === 'object' ? attestato : null;
  if (!a || !testo(a.u) || !testo(a.k) || !testo(a.f) || !testo(sessionId)) return 'assente';
  if (!chiaveFirmaConosciuta(io, a.u, a.k)) return 'sconosciuta';
  const voce = `${sessionId}|${a.u}|${a.k}|${a.f}`;
  let esito = verifiche.get(voce);
  if (!esito) {
    esito = verificaFirma(testo(a.k), testoAttestato(sessionId, a.u), testo(a.f)) ? 'valida' : 'falsa';
    if (verifiche.size > 5000) verifiche.clear();
    verifiche.set(voce, esito);
  }
  return esito === 'valida' ? provaIbrida(io, sessionId, a) : esito;  // [palacan-pq5c]
}

// [palacan-pq5c] Autore con una chiave ML-DSA-65 annunciata via Olm: la sola ed25519 non basta piu' (niente
// downgrade). Serve, una volta per sessione, la parte ibrida dell'attestato; finche' manca l'esito e' 'sconosciuta':
// il messaggio si mostra solo se l'autore coincide con il registro, e il registro non si corregge.
function provaIbrida(io, sessionId, a) {
  if (!ibrido) return 'valida';
  const impronte = improntePqFirmaPerChiave(io, a.u, a.k);
  if (!impronte.length) return 'valida';
  const chiaveSessione = `${testo(sessionId)}|${testo(a.u)}|${testo(a.k)}`;
  if (sessioniIbride.has(chiaveSessione)) return 'valida';
  const h = a.h && typeof a.h === 'object' ? a.h : null;
  if (!h || !impronte.includes(testo(h.q))) return 'sconosciuta';
  const pubblica = ibrido.chiaveNota(io, testo(h.q));
  if (!pubblica) return 'sconosciuta'; // chiave ML-DSA-65 in arrivo: si ritenta quando e' scaricata
  const ok = ibrido.verifica({ contesto: 'attestato', ed: testo(a.k), pubblica, messaggio: testoAttestato(sessionId, a.u), fe: h.fe, fq: h.fq });
  if (!ok) return 'falsa';
  if (sessioniIbride.size > 5000) sessioniIbride.clear();
  sessioniIbride.add(chiaveSessione);
  riprovaInAttesa(a.u);
  return 'valida';
}

/**
 * Alla decifratura di un messaggio di gruppo. Restituisce { sospetto: false } oppure { sospetto: true, utente }:
 * sospetto = l'attestato nomina un autore diverso dal registro (o dal nome dato dal server) e la sua chiave di firma
 * non e' ancora nota -> il messaggio non si mostra finche' non si puo' verificare.
 */
export function confermaAutoreFirmato(io, sessionId, stanza, parsed, dichiarato = null) {
  try {
    const a = parsed && typeof parsed === 'object' ? parsed.attestato : null;
    const esito = verificaAttestato(io, sessionId, a);
    if (esito === 'assente') return { sospetto: false };
    const autore = testo(a.u);
    if (esito === 'valida') {
      confermaCreatoreFirmato(io, sessionId, { utente: autore, stanza });
      return { sospetto: false, firmato: true };
    }
    if (esito === 'falsa') {
      avvisaUnaVolta(`falsa|${sessionId}`, `⚠️ [N5e] attestato con firma non valida nella sessione ${String(sessionId).slice(0, 8)}...: ignorato`);
      return { sospetto: false };
    }
    const voce = leggiCreatore(io, sessionId);
    const atteso = voce ? testo(voce.utente) : testo(dichiarato);
    if (atteso && atteso === autore) return { sospetto: false };
    avvisaUnaVolta(`attesa|${sessionId}|${autore}`, `⏳ [N5e] messaggio firmato da ${autore} (la chiave dice ${atteso || 'nessuno'}): resta in attesa della chiave di firma di ${autore}`);
    return { sospetto: true, utente: autore };
  } catch (_) {
    return { sospetto: false };
  }
}

/** Messaggio da ritentare quando arriva la chiave di firma di "utente". */
export function mettiInAttesaDiFirma(utente, voce) {
  const lui = testo(utente);
  if (!lui || !voce) return;
  const elenco = inAttesa.get(lui) || [];
  if (voce.messageId != null && elenco.some((v) => String(v.messageId) === String(voce.messageId))) return;
  elenco.push(voce);
  if (elenco.length > MAX_IN_ATTESA) elenco.shift();
  inAttesa.set(lui, elenco);
}

// Solo per i test.
export function _azzeraFirmaAutore() {
  firmatario = null;
  pqPronto = false;  // [palacan-pq4]
  pqFirmaPronta = null;  // [palacan-pq5b]
  scaricatorePqFirma = null;  // [palacan-pq5b]
  attestatiIbridiPropri.clear();  // [palacan-pq5c]
  sessioniIbride.clear();  // [palacan-pq5c]
  pqIbridoPronto = false;  // [palacan-pq5d]
  ritentativo = null;
  attestatiPropri.clear();
  verifiche.clear();
  inAttesa.clear();
  avvisati.clear();
}
