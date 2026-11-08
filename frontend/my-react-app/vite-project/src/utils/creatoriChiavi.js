// src/utils/creatoriChiavi.js
//
// Palacan - mittente verificato (metadati fase 3.1) e chiavi per stanza (fasi 3.4b e 3.4d).
//
// 3.1: il nome del mittente arrivava dal server; un server compromesso poteva presentare in un gruppo
// il messaggio di Alice come se fosse di Bob. Ora:
//   - quando arriva una chiave di stanza (Megolm) via Olm, si registra CHI l'ha creata (nome e chiave
//     di identita' con cui Olm ha appena decifrato);
//   - quando si decifra un messaggio, il mittente mostrato e' il creatore della chiave, non il nome
//     dichiarato dal server; se i due non coincidono il messaggio e' segnalato.
//   Il primo creatore registrato non viene mai sovrascritto.
// 3.4b: il registro ricorda anche la STANZA di ogni chiave. I messaggi del canale anonimo non dicono
// quale chiave usare (niente session_id): l'app prova le chiavi di quella stanza.
// Il registro sta nel dispositivo (localStorage) ed entra nel backup cifrato delle chiavi.

const chiaveArchivio = (username) => `palacan_creatori_chiavi_${String(username || '').trim()}`;
export const CHIAVE_ARCHIVIO_CREATORI = chiaveArchivio;

// piccola cache: evita di rileggere e rianalizzare il registro per ogni messaggio della cronologia
const cache = { username: null, testo: null, mappa: {} };

function leggiTutti(username) {
  let testo = null;
  try {
    testo = localStorage.getItem(chiaveArchivio(username));
  } catch (_) {
    return {};
  }
  if (cache.username === username && cache.testo === testo) return cache.mappa;
  let mappa = {};
  try {
    mappa = JSON.parse(testo || '{}') || {};
  } catch (_) {
    mappa = {};
  }
  cache.username = username;
  cache.testo = testo;
  cache.mappa = mappa;
  return mappa;
}

function scriviTutti(username, mappa) {
  try {
    const testo = JSON.stringify(mappa);
    localStorage.setItem(chiaveArchivio(username), testo);
    cache.username = username;
    cache.testo = testo;
    cache.mappa = mappa;
  } catch (_) {
    /* spazio esaurito o archivio non disponibile: il mittente resta quello dichiarato */
  }
}

// Esito del confronto tra la chiave con cui Olm ha decifrato e quella nota per quel contatto.
export function valutaChiave(chiaveNota, chiaveUsata) {
  if (!chiaveUsata) return 'sconosciuta';
  if (!chiaveNota) return 'prima_volta';
  return chiaveNota === chiaveUsata ? 'coerente' : 'diversa';
}

// Registra chi ha creato la chiave di stanza sessionId (e in quale stanza). Il primo valore vince.
export function registraCreatore(username, sessionId, { utente, chiave = null, verifica = 'sconosciuta', stanza = null } = {}) {
  if (!username || !sessionId || !utente) return false;
  const mappa = leggiTutti(username);
  if (mappa[sessionId]) return false;
  const voce = { utente: String(utente).trim(), chiave, verifica, registrato: Date.now() };
  if (stanza) voce.stanza = String(stanza).trim();
  scriviTutti(username, { ...mappa, [sessionId]: voce });
  return true;
}

export function leggiCreatore(username, sessionId) {
  if (!username || !sessionId) return null;
  return leggiTutti(username)[sessionId] || null;
}

// Mittente da mostrare per un messaggio cifrato con la chiave sessionId.
//   verificato: true  -> il mittente viene dal creatore della chiave (non dal server)
//   discrepanza: true -> il server dichiarava un altro mittente: non gli si crede
export function mittenteVerificato(username, sessionId, mittenteDichiarato) {
  const creatore = leggiCreatore(username, sessionId);
  if (!creatore) {
    return { mittente: mittenteDichiarato || null, verificato: false, discrepanza: false, verifica: null };
  }
  const dichiarato = mittenteDichiarato == null ? '' : String(mittenteDichiarato).trim();
  const discrepanza = Boolean(dichiarato) && dichiarato !== creatore.utente;
  if (discrepanza) {
    console.warn(`⚠️ Mittente non corrispondente: il server dichiara un altro autore per la sessione ${String(sessionId).slice(0, 8)}...; mostrato il creatore della chiave.`);
  }
  return { mittente: creatore.utente, verificato: true, discrepanza, verifica: creatore.verifica };
}

// 3.4b - chiavi registrate per una stanza, dalla piu' recente.
export function sessioniDellaStanza(username, stanza) {
  if (!username || !stanza) return [];
  const mappa = leggiTutti(username);
  const cercata = String(stanza).trim();
  return Object.keys(mappa)
    .filter((sid) => mappa[sid] && mappa[sid].stanza === cercata)
    .sort((a, b) => (mappa[b].registrato || 0) - (mappa[a].registrato || 0));
}

// 3.4b/3.4d - trova quale chiave della stanza decifra il messaggio (canale anonimo, senza session_id).
// "decifra(sessione, testo)" deve lanciare un errore se la chiave non e' quella giusta.
// 3.4d: rete di sicurezza per le chiavi registrate prima del 3.4b (creatore noto, stanza no): si provano
// anche quelle e, se una funziona, le si associa la stanza per le volte successive.
const MAX_CHIAVI_SENZA_STANZA = 300;

export function trovaChiaveDellaStanza(username, stanza, testoCifrato, sessioniEntranti, decifra = (s, t) => s.decrypt(t)) {
  if (!testoCifrato || !sessioniEntranti) return null;
  const prova = (sessionId) => {
    const sessione = sessioniEntranti[sessionId];
    if (!sessione) return false;
    try {
      decifra(sessione, testoCifrato);
      return true;
    } catch (_) {
      return false; /* non e' questa: si prova la successiva */
    }
  };
  for (const sessionId of sessioniDellaStanza(username, stanza)) {
    if (prova(sessionId)) return sessionId;
  }
  const mappa = leggiTutti(username);
  const senzaStanza = Object.keys(mappa)
    .filter((sid) => mappa[sid] && !mappa[sid].stanza)
    .sort((a, b) => (mappa[b].registrato || 0) - (mappa[a].registrato || 0))
    .slice(0, MAX_CHIAVI_SENZA_STANZA);
  for (const sessionId of senzaStanza) {
    if (prova(sessionId)) {
      if (stanza) scriviTutti(username, { ...mappa, [sessionId]: { ...mappa[sessionId], stanza: String(stanza).trim() } });
      return sessionId;
    }
  }
  return null;
}

// [palacan-n5e] Autore confermato dall'attestato firmato dentro un messaggio della sessione (utils/firmaAutore.js).
// E' l'unico caso in cui una voce si corregge: la firma vale piu' di chi ha inoltrato la chiave o del nome dato dal
// server. Mai toccata una chiave creata da noi ('propria'). Restituisce true se il registro e' cambiato.
export function confermaCreatoreFirmato(username, sessionId, { utente, stanza = null } = {}) {
  if (!username || !sessionId || !utente) return false;
  const mappa = leggiTutti(username);
  const voce = mappa[sessionId];
  const autore = String(utente).trim();
  const qui = stanza ? String(stanza).trim() : null;
  if (!voce) {
    const nuova = { utente: autore, chiave: null, verifica: 'firmata', firmato: true, registrato: Date.now() };
    if (qui) nuova.stanza = qui;
    scriviTutti(username, { ...mappa, [sessionId]: nuova });
    return true;
  }
  if (voce.utente === autore) {
    if (voce.firmato && (voce.stanza || !qui)) return false;
    scriviTutti(username, { ...mappa, [sessionId]: { ...voce, firmato: true, ...(voce.stanza || !qui ? {} : { stanza: qui }) } });
    return true;
  }
  if (voce.verifica === 'propria') {
    console.warn(`⚠️ [N5e] attestato di ${autore} su una chiave creata da noi (${String(sessionId).slice(0, 8)}...): ignorato`);
    return false;
  }
  console.warn(`⚠️ [N5e] la chiave ${String(sessionId).slice(0, 8)}... era attribuita a ${voce.utente}: la firma dice ${autore}, registro corretto`);
  scriviTutti(username, {
    ...mappa,
    [sessionId]: { ...voce, utente: autore, chiave: null, verifica: 'firmata', firmato: true, corretta_da: voce.utente, ...(voce.stanza || !qui ? {} : { stanza: qui }) },
  });
  return true;
}
