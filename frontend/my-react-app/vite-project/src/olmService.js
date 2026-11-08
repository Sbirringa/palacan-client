// src/olmService.js
//
// Modifiche (fix race condition inbound/outbound sulle sessioni Olm 1:1):
//
// 1. withInboundLock è stato generalizzato in withPeerLock. PRIMA solo
//    getOrCreateInboundSession() era protetta da un lock per-peer.
//    encryptRoomKeyForDevice() e getOrCreateOutboundSession() non avevano
//    NESSUN lock: potevano leggere/mutare/persistere lo stesso oggetto
//    Session Olm di un peer in parallelo a una decrittazione inbound in
//    corso per lo stesso peer (es. un to-device m.room_key in arrivo
//    mentre ensureRoomKeyShared() sta inviando la propria room key allo
//    stesso peer dopo una riconnessione WS). Il risultato osservato in
//    produzione: stesso session_id su entrambi i lati, ma un messaggio
//    type:1 (non pre-key) che smette improvvisamente di decrittare con
//    qualsiasi sessione esistente — segno di ratchet state disallineato
//    da una race sul salvataggio in localStorage (last-write-wins).
//    Ora getOrCreateOutboundSession(), encryptRoomKeyForDevice() e
//    decryptOlmEvent() usano tutte lo stesso lock, con la stessa chiave
//    `${username}::${peer}`, quindi inbound e outbound per lo stesso peer
//    non possono più interfogliarsi.
//
// 2. Per evitare lock annidati con la stessa chiave (deadlock), il body
//    di getOrCreateInboundSession() è stato spostato in una funzione
//    interna non lockata (getOrCreateInboundSessionInternal). La
//    funzione esportata getOrCreateInboundSession() acquisisce il lock e
//    poi chiama la versione interna; decryptOlmEvent() acquisisce il
//    lock una sola volta e chiama direttamente la versione interna.
//
// 3. Nuova cache locale (olm_peer_identity_${username}) che ricorda la
//    identity key di un peer alla prima creazione di sessione.
//    encryptRoomKeyForDevice(), quando riusa una sessione esistente, ora
//    legge la identity key da questa cache invece di richiamare
//    getUserKeyBundle() — che PRIMA veniva chiamata comunque anche in
//    caso di riuso, consumando inutilmente una one-time key nuova del
//    peer ad ogni condivisione di room key (visibile nei log: OTK id
//    sempre diversa nonostante la sessione riusata fosse sempre la
//    stessa, con conseguente esaurimento del pool di OTK del peer).
//
// 4. Aggiunta sezione KEY BACKUP in fondo al file (nessun'altra funzione,
//    firma esportata o comportamento preesistente è stato toccato):
//    buildBackupBundlePayload, encryptBackupBundle, decryptBackupBundle,
//    restoreBackupBundleToLocalStorage. Queste funzioni riusano gli
//    helper già esistenti in questo file (accountStorageKey,
//    sessionsStorageKey, inboundGroupSessionsStorageKey,
//    peerIdentityKeyStorageKey, normalizeUsername, safeLocalStorageGet,
//    safeLocalStorageSet) — zero duplicazione di logica di storage.
//
// 5. v1.9-P: restoreBackupBundleToLocalStorage NON ripristina più le
//    sessioni Olm 1:1 dal backup (bundle.sessions viene ignorato e la
//    chiave locale corrispondente viene invece cancellata). Le sessioni
//    1:1 sono uno snapshot che può essere superato dal ratchet del peer
//    nel frattempo: riusarle produce l'errore "Messaggio Olm non
//    decryptabile con sessioni esistenti e non è pre-key" (messageType 1
//    contro una sessione disallineata) osservato in produzione dopo un
//    recupero backup su un secondo dispositivo/browser. Le sessioni 1:1
//    sono economiche da ricreare da zero (un pre-key message, tipo 0, è
//    sempre decryptabile); le inbound group session Megolm — quelle che
//    contano per rileggere i messaggi vecchi — continuano invece a
//    essere ripristinate normalmente, invariato.
//
// 6. FIX WASM (dev mode con Vite): initOlm() ora passa esplicitamente
//    locateFile a Olm.init(), puntando alla root del sito ('/olm.wasm').
//    Senza questo, il codice Emscripten generato da @matrix-org/olm cerca
//    olm.wasm nella stessa cartella dove Vite ha pre-bundlato il file JS
//    (node_modules/.vite/deps/), dove il file non esiste: la richiesta
//    finisce nel fallback SPA di Vite, che risponde con index.html invece
//    del binario WASM ("expected magic word ..., found 3c 21 64 6f" =
//    "<!do..."). Il file /olm.wasm alla root è già garantito sia in dev
//    (copiato a mano in public/olm.wasm) sia in build di produzione (dal
//    plugin viteStaticCopy in vite.config.js). Nessun'altra riga di questa
//    funzione, né di nessun'altra funzione del file, è stata toccata.
//
// 7. v1.11-Q: fix "sessione Olm stale". Quando decryptOlmEvent()
//    fallisce perché il messaggio non è pre-key e nessuna sessione
//    esistente lo decifra (es. "Messaggio Olm non decryptabile con
//    sessioni esistenti e non è pre-key", o BAD_MESSAGE_KEY_ID), prima il
//    codice si limitava a loggare e rilanciare l'errore: la sessione
//    Olm 1:1 corrotta/obsoleta restava per sempre in localStorage e ogni
//    messaggio successivo dallo stesso peer falliva allo stesso modo,
//    perché veniva sempre ritentata la stessa sessione morta.
//    Aggiunta nuova funzione esportata dropStaleSessionForPeer(), che
//    rimuove SOLO la sessione 1:1 verso il peer incriminato (non tocca
//    l'account, non tocca le sessioni verso altri peer, non tocca le
//    inbound group session Megolm). decryptOlmEvent() la chiama
//    automaticamente nel proprio catch quando riconosce questo tipo di
//    errore, così il prossimo messaggio PRE-KEY (tipo 0) da quel peer
//    potrà creare una sessione nuova e pulita invece di fallire di nuovo
//    all'infinito. Il messaggio che ha causato l'errore resta comunque
//    perso (era cifrato con un ratchet ormai incompatibile: non esiste
//    modo di recuperarlo), ma i messaggi successivi tornano a funzionare
//    senza bisogno di intervento manuale (prima serviva
//    localStorage.removeItem('olm_sessions_<username>') a mano).
//    Nessun'altra funzione, firma esportata o comportamento preesistente
//    è stato toccato.
//
// 8. NUOVO — v1.12-R: fix race condition sull'ACCOUNT Olm condiviso
//    (causa del loop infinito OTK_MISMATCH -> session_reset osservato in
//    produzione tra due utenti che non riuscivano mai a stabilizzare una
//    sessione). withAccountLock() esisteva già in questo file, era
//    documentato come necessario per "qualsiasi funzione che rigenera/
//    sostituisce l'account", ma non veniva effettivamente USATO da
//    nessuna funzione qui dentro. Il problema pratico:
//
//    - removeUsedOTK() ed ensureEnoughOTKs()/generateAndGetOTKs() sono le
//      UNICHE funzioni che mutano davvero l'account (rimuovono o generano
//      one-time key e poi fanno saveOlmAccount). Venivano però invocate
//      dentro getOrCreateInboundSessionInternal(), che è protetta solo
//      da un lock PER-PEER (withPeerLock, chiave `${username}::${peer}`).
//      Due peer diversi (es. "messi" e un terzo utente) che inviano un
//      pre-key a "goku" quasi in contemporanea finiscono su DUE lock
//      diversi e possono quindi eseguire removeUsedOTK() in parallelo
//      sullo stesso account condiviso: entrambi leggono l'account fresco
//      da localStorage, entrambi rimuovono una OTK diversa, entrambi
//      salvano — l'ultimo a scrivere vince e cancella silenziosamente la
//      rimozione fatta dall'altro (last-write-wins), lasciando l'account
//      locale in uno stato incoerente rispetto a quello che il server
//      continua a distribuire ("OTK_MISMATCH" con availableOtkCount: 0
//      nei log, nonostante il server risponda sempre hasOneTimeKey:true).
//
//    - In più, diverse funzioni che NON mutano affatto l'account
//      (getOrCreateOutboundSession, encryptForUser, il ramo "nuova
//      sessione" di encryptRoomKeyForDevice, e il ramo di successo di
//      getOrCreateInboundSessionInternal/decryptOlmEvent) richiamavano
//      comunque persistAccountAndSessions(username, account, sessions),
//      che risalva SEMPRE anche l'account, anche se l'oggetto `account`
//      in memoria non è stato toccato in quella funzione. Se quella
//      copia in memoria è più vecchia di quanto risulti già persistito
//      da un'altra operazione concorrente (es. removeUsedOTK di un altro
//      peer), questo risalvataggio superfluo SOVRASCRIVE la versione più
//      recente e corretta con una più vecchia — stessa classe di bug,
//      last-write-wins, ma innescata da un salvataggio non necessario
//      anziché da due mutazioni concorrenti.
//
//    Fix (nessun'altra funzione, firma esportata o comportamento
//    preesistente è stato toccato oltre a quanto elencato qui sotto):
//      a) removeUsedOTK() ed ensureEnoughOTKs() ora avvolgono l'intera
//         lettura-mutazione-scrittura dell'account in withAccountLock(),
//         così due mutazioni concorrenti dell'account (anche per peer
//         diversi) sono serializzate e ognuna parte sempre dalla
//         versione più fresca possibile.
//      b) getOrCreateOutboundSession(), encryptForUser(), il ramo "nuova
//         sessione" e il salvataggio finale di encryptRoomKeyForDevice(),
//         e il ramo di successo di getOrCreateInboundSessionInternal()/
//         decryptOlmEvent() non richiamano più persistAccountAndSessions()
//         con l'account: salvano SOLO le sessioni (saveSessions), perché
//         l'account in quei punti non è mai stato mutato — la sua unica
//         scrittura autorevole avviene dentro removeUsedOTK()/
//         ensureEnoughOTKs(), già protette dal lock del punto (a).
//      c) bootstrapOlmAccount() avvolge anch'essa in withAccountLock() la
//         propria sequenza get-or-create + upload + refill iniziale, per
//         lo stesso motivo.

import { argon2id } from 'hash-wasm';
import Olm from './crypto/olm.js';  // [palacan-vodozemac] vodozemac (palacan-crypto) al posto di libolm, stessa interfaccia
import * as apiService from './apiService';
import { aggiungiPadding, rimuoviPadding } from './utils/paddingMessaggi';  // [palacan-metadati-2e]
import { aggiungiOra } from './utils/oraMessaggio';  // [palacan-metadati-3.4a]
import { preparaChiaveDispositivo, creaPickler, jsonPerBackup, jsonDaBackup } from './utils/chiaveDispositivo';  // [palacan-9a]

// [palacan-9a] Chiave dei pickle di PRIMA: e' scritta nel codice pubblico del sito, quindi non protegge niente.
// Ora serve solo a: leggere (una volta) i dati salvati prima della 9a, il formato del backup (gia' cifrato con
// la passphrase) e i browser senza IndexedDB. Tutto il resto usa la chiave del dispositivo (chiaviPickle.locale()).
const CHIAVE_PICKLE_VECCHIA =
  import.meta.env.VITE_PICKLE_KEY || 'pGZ9Qq3Lw9dK2vV5xM3ap1bC2tt6ui0f';
const chiaviPickle = creaPickler(CHIAVE_PICKLE_VECCHIA);  // [palacan-9a]

const peerSessionLocks = new Map();
let olmReady = false;
let olmInitPromise = null;

function accountStorageKey(username) {
  return `olm_account_${username}`;
}

function sessionsStorageKey(username) {
  return `olm_sessions_${username}`;
}

function peerIdentityKeyStorageKey(username) {
  return `olm_peer_identity_${username}`;
}

function outboundGroupSessionStorageKey(roomId, username) {
  return `megolm_outbound_${username}_${roomId}`;
}

function inboundGroupSessionsStorageKey(username) {
  return `megolm_inbound_${username}`;
}

function normalizeUsername(username) {
  return String(username || '').trim();
}

function normalizeRoomId(roomId) {
  return String(roomId || '').trim();
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function assertOlmReady() {
  if (!olmReady) {
    throw new Error('Olm non inizializzato. Chiama initOlm() prima di usare il servizio.');
  }
}

// ==========================================================================
// PEER SESSION LOCK
// ==========================================================================
// Lock asincrono per-coppia (username locale + peer), condiviso da TUTTE le
// operazioni che leggono, mutano o persistono le sessioni Olm 1:1 verso un
// peer specifico: creazione/riuso outbound (getOrCreateOutboundSession),
// invio room key (encryptRoomKeyForDevice), decrittazione inbound
// (decryptOlmEvent / getOrCreateInboundSession). Usare la STESSA chiave
// `${username}::${peer}` per tutte è essenziale: è quello che impedisce a
// un invio outbound e a una ricezione inbound verso lo stesso peer di
// correre in parallelo e corrompersi a vicenda lo stato del ratchet.
//
// ⚠️ Questo lock NON protegge l'account Olm condiviso (che non è per-peer,
// è uno solo per utente): due peer diversi hanno chiavi di lock diverse e
// possono quindi mutare l'account in parallelo. Per quello serve
// withAccountLock, vedi sezione ACCOUNT LOCK subito sotto e punto 8 nel
// changelog in testa al file.
//
// ⚠️ Attenzione a non annidare due withPeerLock con la STESSA chiave nello
// stesso flusso (es. una funzione lockata che al suo interno richiama
// un'altra funzione pubblica che lockerebbe di nuovo la stessa chiave):
// il Promise-chain usato come mutex non è rientrante e produrrebbe un
// deadlock. Per questo motivo getOrCreateInboundSession() espone una
// variante interna non lockata (getOrCreateInboundSessionInternal) usata
// da decryptOlmEvent() dentro il proprio lock.
// v1.16 FIX (self-healing lock): withPeerLock poteva restare bloccato
// per sempre se fn() si appendeva senza mai risolversi ne fallire (es.
// una fetch di rete che resta pending indefinitamente, o una chiamata
// WASM Olm che si blocca). Qualsiasi altra chiamata successiva per lo
// stesso lockKey (es. decryptOlmEvent in attesa di ricevere una room
// key, mentre ensureRoomKeyShared teneva il lock per inviarla) restava
// accodata dietro un lock morto, senza mai un errore o un timeout
// visibile in console -- esattamente il sintomo osservato in produzione
// (nessun log, nessun crash, i messaggi semplicemente non arrivano mai).
// Fix: il lock si libera forzatamente dopo PEER_LOCK_TIMEOUT_MS se fn()
// non si e ancora risolta, cosi la coda puo procedere comunque. fn() in
// se puo continuare a girare in background (le Promise JS non sono
// cancellabili), ma non blocca piu le richieste successive per lo
// stesso peer.
/* ── FIX: allargata da 8000 a 15000ms. I log diagnostici hanno mostrato
   operazioni legittime (es. getRoomUsers) che impiegano regolarmente
   6-13 secondi per via della latenza di rete, non di un vero blocco.
   Con la vecchia soglia di 8s, il rilascio forzato scattava spesso su
   operazioni ancora sane, e siccome quell'operazione vecchia continua a
   girare in background (le Promise JS non sono cancellabili), la nuova
   operazione partita nel frattempo finiva per toccare lo stesso oggetto
   WASM di cifratura insieme a quella vecchia ancora in corsa:
   esattamente la causa del crash "RuntimeError: null function"
   osservato. 15s da' margine reale, restando comunque limitato. */
const PEER_LOCK_TIMEOUT_MS = 15000;

function withPeerLock(lockKey, fn) {
  const previous = peerSessionLocks.get(lockKey) || Promise.resolve();

  const next = previous
    .catch(() => {})
    .then(() => {
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          console.error(
            `withPeerLock TIMEOUT dopo ${PEER_LOCK_TIMEOUT_MS}ms per key=${lockKey} - libero forzatamente il lock`
          );
          reject(new Error(`PEER_LOCK_TIMEOUT: ${lockKey}`));
        }, PEER_LOCK_TIMEOUT_MS);
      });

      return Promise.race([fn(), timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
      });
    })
    .finally(() => {
      if (peerSessionLocks.get(lockKey) === next) {
        peerSessionLocks.delete(lockKey);
      }
    });

  peerSessionLocks.set(lockKey, next);
  return next;
}

function peerLockKey(username, peerUsername) {
  return `${normalizeUsername(username)}::${normalizeUsername(peerUsername)}`;
}

// ==========================================================================
// ACCOUNT LOCK
// ==========================================================================
// Lock asincrono globale (per-app, non per-peer) sull'account Olm corrente.
// Qualsiasi funzione che legge E POI usa olmAccountRef.current per operazioni
// che possono rigenerare/sostituire l'account (es. checkKeysHealth) o che
// devono leggere chiavi coerenti dall'account (es. ensureRoomKeyShared,
// handleSendMessage) DEVE passare attraverso withAccountLock, altrimenti
// due operazioni concorrenti possono leggere un account già sostituito/
// liberato a metà, producendo identity key corrotte (vedi getFreshAccount).
//
// v1.12-R: questo lock ORA viene effettivamente usato anche dalle uniche
// due funzioni di questo file che mutano davvero le one-time key
// dell'account (removeUsedOTK, ensureEnoughOTKs) e da bootstrapOlmAccount.
// Prima era definito ma mai invocato qui dentro: due peer diversi potevano
// eseguire una rimozione/rigenerazione di OTK in parallelo sullo stesso
// account condiviso, con un last-write-wins su localStorage che cancellava
// silenziosamente il lavoro dell'uno o dell'altro. Vedi punto 8 nel
// changelog in testa al file per i dettagli del sintomo osservato.
let accountLockChain = Promise.resolve();

export function withAccountLock(fn) {
  const next = accountLockChain.catch(() => {}).then(fn);
  accountLockChain = next.catch(() => {});
  return next;
}

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.error(`❌ localStorage set fallita per ${key}:`, e);
  }
}

function safeLocalStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {}
}

// ==========================================================================
// PEER IDENTITY KEY CACHE
// ==========================================================================
// Ricorda l'identity key di un peer non appena una sessione viene creata
// con successo, così un riuso successivo della stessa sessione (es. per
// inviare una nuova room key) non deve richiamare getUserKeyBundle() —
// che claima sempre una one-time key NUOVA del peer, anche quando non ne
// serve una perché la sessione esiste già.
function loadPeerIdentityKeys(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return {};

  const raw = safeLocalStorageGet(peerIdentityKeyStorageKey(normalizedUsername));
  if (!raw) return {};

  return safeJsonParse(raw, {}) || {};
}

// FIX (TOFU/Safety Number, audit sicurezza): prima questa funzione
// sovrascriveva sempre e comunque, senza mai confrontare col valore
// precedente - "trust on first use" senza la parte importante del
// TOFU, cioe' accorgersi se la fiducia va rivista. Un server
// compromesso (o un vero attacco intermediario) avrebbe potuto
// sostituire silenziosamente la identity key di un contatto senza che
// l'utente se ne accorgesse mai. Ora confronta col valore gia' salvato:
// - Prima volta in assoluto per questo peer (nessun valore precedente):
//   comportamento INVARIATO, si fida e salva - questo E' il TOFU vero
//   e proprio (trust ON FIRST use), non deve dare nessun avviso.
// - Valore diverso da quello gia' fidato: registra il cambiamento in
//   un log dedicato (peerIdentityKeyChangeLogStorageKey) che l'interfaccia
//   utente potra' leggere in futuro per mostrare un avviso esplicito
//   (stile Signal "il numero di sicurezza e' cambiato") - non blocca
//   nulla oggi, solo rileva e registra, cosi' come costruito stanotte
//   per tutto il resto: prima il rilevamento sicuro, poi l'interfaccia.
function peerIdentityKeyChangeLogStorageKey(username) {
  return `palacan_identity_key_changes_${normalizeUsername(username)}`;
}

function loadPeerIdentityKeyChangeLog(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return {};

  const raw = safeLocalStorageGet(peerIdentityKeyChangeLogStorageKey(normalizedUsername));
  if (!raw) return {};

  return safeJsonParse(raw, {}) || {};
}

function savePeerIdentityKeyChangeLog(username, log) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return;

  safeLocalStorageSet(peerIdentityKeyChangeLogStorageKey(normalizedUsername), JSON.stringify(log));
}

// Esportata per l'interfaccia utente (Fase 2, non ancora costruita):
// restituisce i dettagli del cambiamento se il peer ha una chiave
// d'identita' cambiata non ancora riconosciuta dall'utente, altrimenti
// null. Non modifica nulla, sola lettura.
export function getPeerIdentityChangeWarning(username, peerUsername) {
  const normalizedPeer = normalizeUsername(peerUsername);
  if (!normalizedPeer) return null;

  const log = loadPeerIdentityKeyChangeLog(username);
  return log[normalizedPeer] || null;
}

// Esportata per l'interfaccia utente (Fase 2): l'utente ha visto e
// accettato consapevolmente la nuova identita' - rimuove l'avviso.
// Non tocca la identity key stessa (gia' salvata correttamente da
// savePeerIdentityKey), solo il flag di avviso.
export function acknowledgePeerIdentityChange(username, peerUsername) {
  const normalizedPeer = normalizeUsername(peerUsername);
  if (!normalizedPeer) return;

  const log = loadPeerIdentityKeyChangeLog(username);
  delete log[normalizedPeer];
  savePeerIdentityKeyChangeLog(username, log);
}

function savePeerIdentityKey(username, peerUsername, identityKey) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPeer = normalizeUsername(peerUsername);
  if (!normalizedUsername || !normalizedPeer || !identityKey) return;

  const current = loadPeerIdentityKeys(normalizedUsername);
  const previousKey = current[normalizedPeer] || null;
  // [palacan-l4a] TOFU per DISPOSITIVO: si ricordano tutte le chiavi gia' viste di questo contatto (telefono, pc...).
  // Alternare tra dispositivi noti non e' un cambio di identita'; una chiave MAI vista si'.
  const chiaviNote = caricaChiaviDispositiviNote(normalizedUsername);
  const notePeer = Array.isArray(chiaviNote[normalizedPeer]) ? chiaviNote[normalizedPeer].slice() : [];
  if (previousKey && !notePeer.includes(previousKey)) notePeer.push(previousKey);
  const giaVista = notePeer.includes(identityKey);

  if (previousKey && previousKey !== identityKey && !giaVista) {
    console.warn(
      `⚠️ [TOFU] Identity key cambiata per ${normalizedPeer} - possibile reinstallazione` +
      ` legittima, cambio dispositivo, O un problema di sicurezza da verificare.`
    );

    const changeLog = loadPeerIdentityKeyChangeLog(normalizedUsername);
    changeLog[normalizedPeer] = {
      previousKey,
      newKey: identityKey,
      changedAt: Date.now(),
      // [palacan-l4a] contatto gia' verificato (numero di sicurezza confermato): l'invio resta bloccato fino alla conferma
      verificato: haVerificatoContatto(normalizedUsername, normalizedPeer),
    };
    savePeerIdentityKeyChangeLog(normalizedUsername, changeLog);
    // [palacan-l4a] il banner compare subito, anche a chat gia' aperta
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('palacan:identita-cambiata', { detail: { peer: normalizedPeer } }));
      }
    } catch (e) {
      // solo avviso grafico: l'avviso resta comunque salvato
    }
  }

  current[normalizedPeer] = identityKey;
  safeLocalStorageSet(peerIdentityKeyStorageKey(normalizedUsername), JSON.stringify(current));

  // [palacan-l4a] la chiave entra tra quelle note di questo contatto (al massimo 20, le piu' vecchie escono)
  if (!notePeer.includes(identityKey)) notePeer.push(identityKey);
  while (notePeer.length > MAX_CHIAVI_DISPOSITIVI_NOTE) notePeer.shift();
  chiaviNote[normalizedPeer] = notePeer;
  safeLocalStorageSet(chiaviDispositiviNoteStorageKey(normalizedUsername), JSON.stringify(chiaviNote));
}

// [palacan-l4a] chiavi gia' viste per ogni contatto (TOFU per dispositivo)
const MAX_CHIAVI_DISPOSITIVI_NOTE = 20;

function chiaviDispositiviNoteStorageKey(username) {
  return `palacan_peer_device_keys_${username}`;
}

function caricaChiaviDispositiviNote(username) {
  const raw = safeLocalStorageGet(chiaviDispositiviNoteStorageKey(username));
  if (!raw) return {};
  const dati = safeJsonParse(raw, {});
  return dati && typeof dati === 'object' && !Array.isArray(dati) ? dati : {};
}

// [palacan-l4a] l'utente ha confermato almeno un numero di sicurezza con questo contatto?
export function haVerificatoContatto(username, peerUsername) {
  try {
    if (safeLocalStorageGet(safetyNumberVerificationStorageKey(username, peerUsername))) return true;
    return caricaNumeriVerificati(username, peerUsername).length > 0;
  } catch (e) {
    return false;
  }
}

// [palacan-l4a] contatto verificato con una chiave mai vista e non ancora confermata: niente invio nella chat 1:1
export function invioBloccatoPerIdentita(username, peerUsername) {
  const avviso = getPeerIdentityChangeWarning(username, peerUsername);
  return Boolean(avviso && avviso.verificato);
}

// [palacan-l4b] tutte le chiavi gia' viste di questo contatto (verifica con QR: il dispositivo inquadrato deve
// essere uno di questi, altrimenti qualcuno puo' essersi messo in mezzo). Sola lettura.
export function chiaviNoteDelContatto(username, peerUsername) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPeer = normalizeUsername(peerUsername);
  if (!normalizedUsername || !normalizedPeer) return [];
  const note = caricaChiaviDispositiviNote(normalizedUsername);
  const lista = Array.isArray(note[normalizedPeer]) ? note[normalizedPeer].filter((x) => typeof x === 'string' && x) : [];
  const attuale = loadPeerIdentityKeys(normalizedUsername)[normalizedPeer];
  if (attuale && !lista.includes(attuale)) lista.push(attuale);
  return lista;
}

// [palacan-l4c3] i dispositivi FIRMATI dalla chiave principale del contatto sono suoi: le loro chiavi diventano note
// (nessun avviso TOFU quando li si incontra). Al massimo MAX_CHIAVI_DISPOSITIVI_NOTE, le piu' vecchie escono.
export function aggiungiChiaviNoteDelContatto(username, peerUsername, chiavi) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPeer = normalizeUsername(peerUsername);
  if (!normalizedUsername || !normalizedPeer || !Array.isArray(chiavi)) return;
  const note = caricaChiaviDispositiviNote(normalizedUsername);
  const lista = Array.isArray(note[normalizedPeer]) ? note[normalizedPeer].slice() : [];
  let cambiata = false;
  for (const chiave of chiavi) {
    if (typeof chiave === 'string' && chiave && !lista.includes(chiave)) {
      lista.push(chiave);
      cambiata = true;
    }
  }
  if (!cambiata) return;
  while (lista.length > MAX_CHIAVI_DISPOSITIVI_NOTE) lista.shift();
  note[normalizedPeer] = lista;
  safeLocalStorageSet(chiaviDispositiviNoteStorageKey(normalizedUsername), JSON.stringify(note));
}

// [palacan-l4c3] la chiave principale di un contatto e' cambiata: stesso avviso di L4a (rosso e invio bloccato se
// il contatto era verificato). voce = { previousKey, newKey, tipo: 'principale', verificato }.
export function segnalaCambioIdentita(username, peerUsername, voce) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPeer = normalizeUsername(peerUsername);
  if (!normalizedUsername || !normalizedPeer || !voce) return;
  console.warn(`⚠️ [L4c] chiave principale cambiata per ${normalizedPeer}: da verificare`);
  const changeLog = loadPeerIdentityKeyChangeLog(normalizedUsername);
  changeLog[normalizedPeer] = {
    previousKey: voce.previousKey || null,
    newKey: voce.newKey || null,
    changedAt: Date.now(),
    tipo: voce.tipo || 'principale',
    verificato: Boolean(voce.verificato) || haVerificatoContatto(normalizedUsername, normalizedPeer),
  };
  savePeerIdentityKeyChangeLog(normalizedUsername, changeLog);
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('palacan:identita-cambiata', { detail: { peer: normalizedPeer } }));
    }
  } catch (e) {
    // solo avviso grafico: l'avviso resta comunque salvato
  }
}

// Esportata per il pannello "Verifica identità"/safety number - prima
// serviva solo internamente a questo file, ora deve essere accessibile
// anche da un componente React per calcolare il numero di sicurezza.
// Esportata per il pannello "Verifica identità"/safety number - prima
// serviva solo internamente a questo file, ora deve essere accessibile
// anche da un componente React per calcolare il numero di sicurezza.
export function loadPeerIdentityKey(username, peerUsername) {
  const all = loadPeerIdentityKeys(username);
  return all[normalizeUsername(peerUsername)] || null;
}

// Esportata per eventuale uso futuro in un reset dispositivo esplicito
// (vedi commento in App.jsx su resetDeviceCrypto): non è chiamata da
// nessuna parte in questo file.
export function clearPeerIdentityKeys(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return;
  safeLocalStorageRemove(peerIdentityKeyStorageKey(normalizedUsername));
}

function normalizeOneTimeKeyValue(oneTimeKey) {
  if (!oneTimeKey) return null;
  if (typeof oneTimeKey === 'string') return oneTimeKey;
  if (typeof oneTimeKey === 'object') {
    return (
      oneTimeKey.key ||
      oneTimeKey.one_time_key ||
      oneTimeKey.curve25519 ||
      oneTimeKey.value ||
      oneTimeKey.body ||
      null
    );
  }
  return null;
}

function normalizeKeyBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') return null;

  const identityKey =
    bundle.identity_key ||
    bundle.identityKey ||
    bundle.curve25519 ||
    bundle.identity?.curve25519 ||
    bundle.device_keys?.curve25519 ||
    null;

  const oneTimeKey =
    normalizeOneTimeKeyValue(bundle.one_time_key) ||
    normalizeOneTimeKeyValue(bundle.oneTimeKey) ||
    normalizeOneTimeKeyValue(bundle.signed_curve25519) ||
    normalizeOneTimeKeyValue(bundle.otk) ||
    normalizeOneTimeKeyValue(bundle.one_time_keys?.signed_curve25519) ||
    null;

  const oneTimeKeyId =
    bundle.one_time_key_id ||
    bundle.oneTimeKeyId ||
    bundle.otk_id ||
    bundle.otkId ||
    bundle.key_id ||
    bundle.keyId ||
    bundle.kid ||
    null;

  return {
    ...bundle,
    identity_key: identityKey,
    identityKey: identityKey,
    curve25519: identityKey,
    one_time_key: oneTimeKey,
    oneTimeKey: oneTimeKey,
    one_time_key_id: oneTimeKeyId,
    oneTimeKeyId: oneTimeKeyId,
  };
}

function normalizeOlmCipherResult(result) {
  if (!result) {
    return { type: null, body: null };
  }

  return {
    type: result.type ?? result.message_type ?? null,
    body: result.body ?? result.ciphertext ?? result.message ?? null,
  };
}

function normalizeRoomKeyContent(roomKeyContent) {
  if (!roomKeyContent || typeof roomKeyContent !== 'object') return null;

  return {
    algorithm: roomKeyContent.algorithm || 'm.megolm.v1.aes-sha2',
    room_id: roomKeyContent.room_id ?? roomKeyContent.roomId ?? null,
    roomId: roomKeyContent.roomId ?? roomKeyContent.room_id ?? null,
    session_id: roomKeyContent.session_id ?? roomKeyContent.sessionId ?? null,
    sessionId: roomKeyContent.sessionId ?? roomKeyContent.session_id ?? null,
    session_key: roomKeyContent.session_key ?? roomKeyContent.sessionKey ?? null,
    sessionKey: roomKeyContent.sessionKey ?? roomKeyContent.session_key ?? null,
    room_name: roomKeyContent.room_name ?? roomKeyContent.roomName ?? null,  // [palacan-metadati-a3.1]
    room_secret: roomKeyContent.room_secret ?? null,  // [palacan-metadati-a4.1b]
    recapito: roomKeyContent.recapito ?? null,  // [palacan-metadati-a4.4c]
  };
}

// v1.12-R: usata ovunque l'account NON sia stato mutato dalla funzione
// chiamante (solo letto per creare/riusare una sessione) — salva SOLO le
// sessioni, mai l'account. Vedi punto 8 nel changelog in testa al file:
// risalvare un account non mutato rischiava di sovrascrivere con una
// copia in memoria più vecchia lo stato più recente scritto nel frattempo
// da removeUsedOTK()/ensureEnoughOTKs() per un altro peer.
function persistSessionsOnly(username, sessions) {
  if (sessions && username) {
    saveSessions(username, sessions);
  }
}

function persistAccountAndSessions(username, account, sessions = null) {
  if (account && username) {
    saveOlmAccount(username, account);
  }
  if (sessions && username) {
    saveSessions(username, sessions);
  }
}

function tryDecryptWithSession(session, messageType, messageBody) {
  try {
    const plaintext = session.decrypt(Number(messageType), messageBody);
    return { ok: true, plaintext };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function ensurePeerSessionArray(sessionsMap, peer) {
  if (!sessionsMap[peer]) {
    sessionsMap[peer] = [];
  } else if (!Array.isArray(sessionsMap[peer])) {
    sessionsMap[peer] = [sessionsMap[peer]];
  }
  return sessionsMap[peer];
}

function getAllSessionsForPeer(sessionsMap, peer) {
  const value = sessionsMap[peer];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

  

function prependSessionForPeer(sessionsMap, peer, session) {
  const list = ensurePeerSessionArray(sessionsMap, peer);
  const withoutSameId = list.filter((existing) => {
    try {
      return existing.session_id() !== session.session_id();
    } catch {
      return existing !== session;
    }
  });
  sessionsMap[peer] = [session, ...withoutSameId];
}

// v1.14 FIX (race handshake bidirezionale simultaneo): una sessione creata
// via create_inbound (ricezione di un messaggio dal peer) NON deve scavalcare
// in testa alla lista una sessione che NOI abbiamo creato con create_outbound
// per inviare allo stesso peer -- altrimenti il prossimo invio userebbe
// existingList[0] sbagliato (la sessione inbound anziche quella outbound
// che il peer si aspetta), producendo un messaggio "non pre-key" non
// decryptabile lato destinatario. Va in CODA: resta comunque disponibile
// per la decrittazione (il loop di tryDecryptWithSession prova tutte le
// sessioni, l'ordine non conta li), ma non diventa la scelta di default
// per i futuri invii.
function appendSessionForPeer(sessionsMap, peer, session) {
  const list = ensurePeerSessionArray(sessionsMap, peer);
  const withoutSameId = list.filter((existing) => {
    try {
      return existing.session_id() !== session.session_id();
    } catch {
      return existing !== session;
    }
  });
  sessionsMap[peer] = [...withoutSameId, session];
}
function getFreshAccount(username, fallbackAccount = null) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return fallbackAccount || null;

  const loaded = loadOlmAccount(normalizedUsername);
  if (loaded) {
    // ⚠️ NON chiamare fallbackAccount.free() qui.
    // L'oggetto Olm passato come fallback può essere ancora referenziato
    // (es. olmAccountRef.current in App.jsx) da un'altra funzione asincrona
    // in corso (es. ensureRoomKeyShared chiamato in parallelo). Se quella
    // funzione legge identity_keys() dopo il free(), l'oggetto WASM è già
    // deallocato: non lancia un errore JS, ma ritorna byte a zero, che
    // codificati in base64 producono "AAAA...AAAA" — esattamente il bug
    // del sender_key placeholder osservato in produzione.
    // Lasciamo che sia il garbage collector JS a occuparsene quando non ci
    // sono più riferimenti vivi all'oggetto vecchio.
    return loaded;
  }

  return fallbackAccount || null;
}

function freeSessionSafely(session) {
  try {
    session?.free?.();
  } catch (_) {}
}

function getAccountDebugInfo(account) {
  if (!account) {
    return {
      curve25519: null,
      ed25519: null,
      maxOneTimeKeys: null,
    };
  }

  try {
    const keys = getIdentityKeys(account);
    return {
      curve25519: keys?.curve25519 || null,
      ed25519: keys?.ed25519 || null,
      maxOneTimeKeys:
        typeof account.max_number_of_one_time_keys === 'function'
          ? account.max_number_of_one_time_keys()
          : null,
    };
  } catch {
    return {
      curve25519: null,
      ed25519: null,
      maxOneTimeKeys: null,
    };
  }
}

function getSessionDebugId(session) {
  try {
    return session?.session_id?.() || null;
  } catch {
    return null;
  }
}

function isBadMessageKeyIdError(error) {
  const message = String(error?.message || error || '');
  return message.includes('BAD_MESSAGE_KEY_ID');
}

// v1.11-Q: riconosce anche il caso "messaggio non pre-key + nessuna
// sessione esistente lo decifra" come sintomo di sessione stale, non solo
// BAD_MESSAGE_KEY_ID. Usata da decryptOlmEvent() per decidere se ripulire
// la sessione locale verso quel peer.
function isStaleSessionError(error) {
  const message = String(error?.message || error || '');
  return (
    isBadMessageKeyIdError(error) ||
    message.includes('non è pre-key') ||
    message.includes('not pre-key')
  );
}

function canMatchInbound(session) {
  return Boolean(session && typeof session.matches_inbound === 'function');
}

function canMatchInboundFrom(session) {
  return Boolean(session && typeof session.matches_inbound_from === 'function');
}

function tryMatchesInbound(session, messageBody) {
  if (!canMatchInbound(session)) return null;

  try {
    return session.matches_inbound(messageBody) === true;
  } catch {
    return false;
  }
}

function tryMatchesInboundFrom(session, senderIdentityKey, messageBody) {
  if (!senderIdentityKey || !canMatchInboundFrom(session)) return null;

  try {
    return session.matches_inbound_from(senderIdentityKey, messageBody) === true;
  } catch {
    return false;
  }
}

function tryAccountMatchesOneTimeKey(account, messageBody) {
  if (!account || typeof account.one_time_keys !== 'function') return null;

  try {
    const raw = safeJsonParse(account.one_time_keys(), {});
    const keys = raw?.curve25519 || {};
    return {
      availableOtkIds: Object.keys(keys),
      availableOtkCount: Object.keys(keys).length,
      hasAny: Object.keys(keys).length > 0,
      messagePreview: String(messageBody || '').slice(0, 48),
    };
  } catch {
    return null;
  }
}

function buildBadMessageDebug({
  username,
  senderUsername,
  senderIdentityKey,
  messageType,
  messageBody,
  account,
  existingSessions,
}) {
  return {
    username: normalizeUsername(username),
    senderUsername: normalizeUsername(senderUsername),
    senderIdentityKey: senderIdentityKey || null,
    messageType: Number(messageType),
    messagePreview: String(messageBody || '').slice(0, 80),
    account: getAccountDebugInfo(account),
    existingSessionIds: (existingSessions || []).map(getSessionDebugId).filter(Boolean),
    otkState: tryAccountMatchesOneTimeKey(account, messageBody),
  };
}

export async function initOlm() {
  if (olmReady) return true;
  if (olmInitPromise) return olmInitPromise;

  olmInitPromise = (async () => {
    try {
// ✅ FIX WASM: @matrix-org/olm non accetta le opzioni come argomento
      // di init() — le legge invece da una variabile GLOBALE chiamata
      // OLM_OPTIONS, che va impostata PRIMA di chiamare Olm.init(). Senza
      // questo, il codice interno di Olm cerca comunque quella variabile
      // globale e fallisce con "OLM_OPTIONS is not defined".
      if ((await preparaChiaveDispositivo()) === 'bloccato') throw new Error('Chiave del dispositivo non leggibile: ricarica la pagina.');  // [palacan-9a] prima di leggere qualunque chiave
      await Olm.init();  // [palacan-vodozemac] palacan-crypto: il file WASM lo trova da solo (niente OLM_OPTIONS)
      olmReady = true;
      console.log('✅ Libreria Olm inizializzata.');
      return true;
    } catch (e) {
      console.error('❌ CRITICO: Init Olm fallito:', e);
      throw e;
    }
  })();

  return olmInitPromise;
}

/* ==========================================================================
   ACCOUNT
   ========================================================================== */

export function saveOlmAccount(username, account) {
  const normalizedUsername = normalizeUsername(username);
  if (!account || !normalizedUsername) return;

  try {
    const pickledAccount = account.pickle(chiaviPickle.locale());
    safeLocalStorageSet(accountStorageKey(normalizedUsername), pickledAccount);

    // Allinea la cache: se stiamo salvando un oggetto diverso da quello
    // già in cache per questo utente, libera il vecchio (siamo l'unico
    // punto che scrive nella cache, quindi è sicuro). Se è lo stesso
    // oggetto (caso comune: create -> save), aggiorna solo lo snapshot.
    const cached = olmAccountCache.get(normalizedUsername);
    if (cached && cached.account !== account) {
      freeAccountSafely(cached.account);
    }
    olmAccountCache.set(normalizedUsername, { account, pickledSnapshot: pickledAccount });
  } catch (e) {
    console.error('❌ Errore salvataggio account Olm:', e);
  }
}
// v1.14 (FIX MEMORY LEAK): cache module-level per evitare di creare un
// nuovo oggetto WASM Olm.Account ad ogni singola chiamata. Prima di questo
// fix, ogni to_device/m.room_key ricevuto (via getOrCreateInboundSessionInternal)
// chiamava getFreshAccount -> loadOlmAccount, che creava sempre un
// `new Olm.Account()` e abbandonava il precedente senza mai liberarlo
// (scelta voluta, per evitare use-after-free se qualcun altro lo stava
// ancora usando). Con test ripetuti per ore, l'heap WASM si riempiva di
// account fantasma fino a esaurirsi (RuntimeError: memory access out of
// bounds). Con la cache, se il pickle salvato in localStorage non è
// cambiato dall'ultima volta, riusiamo lo stesso oggetto già in memoria:
// zero nuove allocazioni. Liberiamo l'oggetto precedente solo quando lo
// sostituiamo qui dentro (unico punto che scrive nella cache), quindi
// abbiamo il pieno controllo del ciclo di vita — nessun rischio di
// use-after-free su un oggetto che qualcun altro sta ancora usando.
const olmAccountCache = new Map(); // username normalizzato -> { account, pickledSnapshot }

function freeAccountSafely(account) {
  if (!account) return;
  try {
    account.free();
  } catch (e) {
    console.warn('⚠️ freeAccountSafely: free() fallita (ignorato)', e);
  }
}

// === PATCH PUNTO 1: loadOlmAccount con auto-pulizia in caso di pickle corrotto ===
export function loadOlmAccount(username) {
  assertOlmReady();
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;
  const storageKey = accountStorageKey(normalizedUsername);
  const pickledAccount = safeLocalStorageGet(storageKey);

  if (!pickledAccount) {
    const cached = olmAccountCache.get(normalizedUsername);
    if (cached) {
      freeAccountSafely(cached.account);
      olmAccountCache.delete(normalizedUsername);
    }
    return null;
  }

  let cached = olmAccountCache.get(normalizedUsername);
  if (cached && cached.pickledSnapshot === pickledAccount) {
    if (contoUsabile(cached.account)) return cached.account;
    // [palacan-pq7] account in memoria bloccato dal WASM (o gia' liberato): si rilegge dal salvataggio. Il vecchio non
    // si libera (bloccato, fallirebbe anche quello): si lascia andare.
    console.warn(`🩹 Account Olm in memoria non usabile per ${normalizedUsername}: lo rileggo dal salvataggio.`);
    olmAccountCache.delete(normalizedUsername);
    cached = null;
  }

  try {
    const { oggetto: account, migrato } = chiaviPickle.daPickle(Olm.Account, pickledAccount);  // [palacan-9a] chiave del dispositivo, o quella di prima

    if (cached) {
      freeAccountSafely(cached.account);
    }
    olmAccountCache.set(normalizedUsername, { account, pickledSnapshot: pickledAccount });
    if (migrato) saveOlmAccount(normalizedUsername, account);  // [palacan-9a] riscritto con la chiave del dispositivo

    return account;
  } catch (e) {
    console.error('❌ Errore caricamento account Olm:', e);
    // Qualsiasi fallimento di unpickle (inclusi crash WASM tipo
    // "memory access out of bounds") significa che il pickle salvato non
    // e' piu' utilizzabile: va rimosso, altrimenti si ritenta e si
    // ri-fallisce identico ad ogni mount della pagina.
    console.warn(`🧹 Account Olm corrotto rimosso per ${normalizedUsername}`);
    safeLocalStorageRemove(storageKey);
    const cached = olmAccountCache.get(normalizedUsername);
    if (cached) {
      freeAccountSafely(cached.account);
      olmAccountCache.delete(normalizedUsername);
    }
    return null;
  }
}
// === FINE PATCH PUNTO 1 (self-healing esteso) ===
export function clearOlmAccount(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return;
  safeLocalStorageRemove(accountStorageKey(normalizedUsername));

  const cached = olmAccountCache.get(normalizedUsername);
  if (cached) {
    freeAccountSafely(cached.account);
    olmAccountCache.delete(normalizedUsername);
  }
}

export function createOlmAccount(username) {
  assertOlmReady();

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    throw new Error('Username mancante per creare account Olm.');
  }

  const account = new Olm.Account();
  account.create();
  saveOlmAccount(normalizedUsername, account);
  return account;
}

export function getOrCreateOlmAccount(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    throw new Error('Username mancante.');
  }

  const existing = loadOlmAccount(normalizedUsername);
  if (existing) return existing;

  return createOlmAccount(normalizedUsername);
}

export function getIdentityKeys(account) {
  if (!account) throw new Error('Account Olm mancante.');
  return safeJsonParse(account.identity_keys(), {});
}

export function getCurve25519Key(account) {
  const keys = getIdentityKeys(account);
  return keys?.curve25519 || null;
}

export function getEd25519Key(account) {
  const keys = getIdentityKeys(account);
  return keys?.ed25519 || null;
}

/* ==========================================================================
   ONE-TIME KEYS
   ========================================================================== */

export function generateAndGetOTKs(account, username, count = 50) {
  if (!account) throw new Error('Account Olm mancante.');

  account.generate_one_time_keys(count);

  const otksObject = safeJsonParse(account.one_time_keys(), {});
  const curve25519Keys = otksObject?.curve25519 || {};

  account.mark_keys_as_published();
  saveOlmAccount(username, account);

  return curve25519Keys;
}

// FIX (Fase 2 multi-device): identificativo stabile per QUESTO
// dispositivo/browser - generato una sola volta, riusato ad ogni login
// successivo dallo stesso browser (stesso pattern Matrix/Signal). Non
// e' un segreto: serve solo al server per distinguere "stesso
// dispositivo che rientra" da "dispositivo nuovo mai visto prima",
// niente di piu'. UN SOLO device_id per browser, condiviso anche se
// nello stesso browser si accede con account Palacan diversi - non e'
// un problema, la chiave vera lato server e' (user_id, device_id)
// insieme, non device_id da solo.
const DEVICE_ID_STORAGE_KEY = 'palacan_device_id';

export function getOrCreateDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;

    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch (e) {
    // localStorage non disponibile (es. modalita' privata restrittiva) -
    // degrada a un device_id nuovo ad ogni sessione: mai peggio del
    // comportamento pre-multi-device di oggi, solo non persistente.
    console.warn('getOrCreateDeviceId: localStorage non disponibile', e);
    return `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export async function uploadIdentityKey(account, token) {
  const identityKey = getCurve25519Key(account);
  if (!identityKey) {
    throw new Error('Identity key non disponibile.');
  }

  const deviceId = getOrCreateDeviceId();

  if (typeof apiService.uploadIdentityKey === 'function') {
    return apiService.uploadIdentityKey(identityKey, token, deviceId);
  }

  if (typeof apiService.ensureIdentityKeyUploaded === 'function') {
    return apiService.ensureIdentityKeyUploaded(identityKey, token, deviceId);
  }

  throw new Error('apiService non espone uploadIdentityKey/ensureIdentityKeyUploaded.');
}

// v1.12-R: intera lettura-mutazione-scrittura dell'account avvolta in
// withAccountLock(). Prima, due chiamate concorrenti a ensureEnoughOTKs()
// (o una concorrente a removeUsedOTK()) potevano entrambe leggere lo
// stesso stato "fresco" dell'account, generare/rimuovere OTK diverse e
// salvare in sequenza non coordinata: l'ultima saveOlmAccount() vinceva e
// cancellava silenziosamente il lavoro dell'altra chiamata. Nessuna firma,
// nessun comportamento osservabile è cambiato: solo l'atomicità.
export async function ensureEnoughOTKs(
  account,
  username,
  token,
  threshold = 10,
  target = 50
) {
  if (!account || !username || !token) return null;

  return withAccountLock(async () => {
    try {
      const freshAccount = getFreshAccount(username, account);
      const io = normalizeUsername(username);
      if (otkDaSostituire(io)) {  // [palacan-pq7] account ripristinato dal backup (o di prima della correzione): le OTK
        // sul server sono di un'altra copia dell'account. Se ne generano di nuove e il server toglie quelle non usate
        // dello stesso account ("sostituisci"). Se non riesce, si riprova al prossimo controllo.
        const nuove = generateAndGetOTKs(freshAccount, username, target);
        await apiService.uploadOneTimeKeys(nuove, token, getOrCreateDeviceId(), { sostituisci: true });
        saveOlmAccount(username, freshAccount);
        otkSostituite(io);
        const quante = Object.keys(nuove).length;
        console.log(`♻️ OTK sostituite (account ripristinato): ${quante}`);
        return { uploaded: true, account: freshAccount, previousCount: 0, generatedCount: quante, finalEstimatedCount: quante };
      }
      const count = await apiService.getOtkCount(token);

      if (count >= threshold) {
        saveOlmAccount(username, freshAccount);
        return {
          uploaded: false,
          account: freshAccount,
          previousCount: count,
          generatedCount: 0,
          finalEstimatedCount: count,
        };
      }

      const needed = Math.max(target - count, 0);
      if (needed <= 0) {
        saveOlmAccount(username, freshAccount);
        return {
          uploaded: false,
          account: freshAccount,
          previousCount: count,
          generatedCount: 0,
          finalEstimatedCount: count,
        };
      }

      const newOTKs = generateAndGetOTKs(freshAccount, username, needed);
      const uploadedCount = Object.keys(newOTKs).length;

      if (uploadedCount === 0) {
        saveOlmAccount(username, freshAccount);
        return {
          uploaded: false,
          account: freshAccount,
          previousCount: count,
          generatedCount: 0,
          finalEstimatedCount: count,
        };
      }

      // FIX (Fase 2 multi-device): stesso device_id stabile gia' usato
      // per l'identity key - retrocompatibile (getOrCreateDeviceId
      // funziona anche se il server non lo usasse ancora per qualche
      // motivo, e' solo un campo extra nel payload).
      await apiService.uploadOneTimeKeys(newOTKs, token, getOrCreateDeviceId());
      saveOlmAccount(username, freshAccount);

      console.log(`♻️ OTK refill completato: +${uploadedCount}`);

      return {
        uploaded: true,
        account: freshAccount,
        previousCount: count,
        generatedCount: uploadedCount,
        finalEstimatedCount: count + uploadedCount,
      };
    } catch (e) {
      console.error('❌ Errore refill OTK:', e);
      return null;
    }
  });
}

// FIX (audit "cerca bug nascosti", scoperto con un test reale che si
// bloccava per timeout, non per un errore - il commento precedente
// affermava erroneamente "non produce deadlock", verificato falso con
// una riproduzione isolata del solo meccanismo di lock): questa
// funzione chiamava `await ensureEnoughOTKs(...)` DIRETTAMENTE dentro
// il proprio `withAccountLock(...)` - dato che ensureEnoughOTKs()
// acquisisce a sua volta lo stesso withAccountLock, questo produce un
// deadlock VERO e permanente (confermato: la promise non si risolve
// mai). Mai emerso in produzione perche' bootstrapOlmAccount risulta
// CODICE MORTO (mai chiamata da nessuna parte nell'app), ma un bug
// reale in attesa se qualcuno la usasse in futuro. Stesso fix gia'
// applicato correttamente qui sotto in removeUsedOTK: si esce dal
// lock PRIMA di richiamare ensureEnoughOTKs, incatenando con .then()
// invece di un await interno.
export async function bootstrapOlmAccount({
  username,
  token,
  initialOtkTarget = 50,
}) {
  let account = await withAccountLock(async () => {
    const acc = getOrCreateOlmAccount(username);
    await uploadIdentityKey(acc, token);
    return acc;
  });

  const refill = await ensureEnoughOTKs(account, username, token, 10, initialOtkTarget);
  if (refill?.account) {
    account = refill.account;
  }

  saveOlmAccount(username, account);
  return account;
}

// v1.12-R: intera lettura-mutazione-scrittura dell'account avvolta in
// withAccountLock() — vedi spiegazione sopra ensureEnoughOTKs() e punto 8
// nel changelog in testa al file. Questa è l'altra (e ultima) funzione che
// muta davvero l'account condiviso in questo file.
// v1.13-A (FIX DEADLOCK): ensureEnoughOTKs() chiama internamente
// withAccountLock() — se lo si await-a QUI DENTRO, mentre questo stesso
// blocco è ancora in esecuzione sotto lo stesso withAccountLock, la
// nuova chiamata si accoda dietro alla catena che è già occupata da
// QUESTA esecuzione, che a sua volta sta aspettando lei: deadlock
// circolare permanente (withAccountLock non ha timeout, a differenza
// di withPeerLock che lo racchiude e dopo 8s libera forzatamente il
// lock esterno, mascherando il problema reale come PEER_LOCK_TIMEOUT).
// Fix: si esce dal lock PRIMA di chiamare ensureEnoughOTKs, incatenandolo
// con .then() invece di un await interno — stesso risultato per il
// chiamante (la promise ritornata si risolve comunque solo a fine
// catena), ma senza nidificare due prese dello stesso lock.
export async function removeUsedOTK(account, session, username, token) {
  if (!session || !username) return account || null;

  const lockedResult = await withAccountLock(async () => {
    let workingAccount = getFreshAccount(username, account);
    if (!workingAccount) return null;

    try {
      // [palacan-pq7] niente piu' remove_one_time_keys: in vodozemac la OTK si consuma gia' quando nasce la sessione in
      // entrata (create_inbound). Passargli una sessione liberata nel frattempo (scartata come vecchia) faceva fallire
      // il WASM ("null pointer passed to rust") e l'account restava bloccato per sempre ("recursive use of an
      // object"): nessun messaggio partiva piu'. Resta il salvataggio dell'account, con la OTK gia' consumata.
      saveOlmAccount(username, workingAccount);
      console.log('✅ OTK consumata e account aggiornato.');
      return workingAccount;
    } catch (e) {
      console.error('❌ Errore gestione OTK:', e);
      return workingAccount;
    }
  });

  if (!lockedResult) return null;

  if (token) {
    try {
      const refill = await ensureEnoughOTKs(lockedResult, username, token);
      if (refill?.account) {
        return refill.account;
      }
    } catch (e) {
      console.error('❌ ensureEnoughOTKs fallito dopo removeUsedOTK:', e);
    }
  }

  return lockedResult;
}

/* ==========================================================================
   DIRECT OLM SESSIONS
   ========================================================================== */

export function saveSessions(username, sessionsMap) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !sessionsMap) return;

  const toStore = {};

  for (const [peer, maybeSessions] of Object.entries(sessionsMap)) {
    const sessions = Array.isArray(maybeSessions) ? maybeSessions : [maybeSessions];
    const pickledSessions = [];

    for (const session of sessions) {
      try {
        if (session) {
          pickledSessions.push(session.pickle(chiaviPickle.locale()));
        }
      } catch (e) {
        console.error(`❌ Pickle fallito per ${peer}:`, e);
      }
    }

    if (pickledSessions.length > 0) {
      toStore[peer] = pickledSessions;
    }
  }

  safeLocalStorageSet(sessionsStorageKey(normalizedUsername), JSON.stringify(toStore));
}

export function loadSessions(username) {
  assertOlmReady();

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return {};

  const raw = safeLocalStorageGet(sessionsStorageKey(normalizedUsername));
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    const result = {};
    let hadCorruption = false;
    let daRiscrivere = false;  // [palacan-9a] dati di prima della 9a: si riscrivono con la chiave del dispositivo

    for (const [peer, stored] of Object.entries(parsed)) {
      const pickledList = Array.isArray(stored) ? stored : [stored];
      const sessions = [];

      for (const pickled of pickledList) {
        try {
          const { oggetto: session, migrato } = chiaviPickle.daPickle(Olm.Session, pickled);  // [palacan-9a]
          if (migrato) daRiscrivere = true;  // [palacan-9a]
          sessions.push(session);
        } catch (e) {
          console.error(`❌ Unpickle fallito per sessione ${peer}:`, e);
          hadCorruption = true;
        }
      }

      if (sessions.length === 1) {
        result[peer] = sessions[0];
      } else if (sessions.length > 1) {
        result[peer] = sessions;
      }
    }

    // Se almeno una sessione era corrotta, riscriviamo il blob in
    // localStorage solo con quelle valide: altrimenti la entry corrotta
    // resta li' per sempre e si ritenta l'unpickle ad ogni mount.
    if (hadCorruption || daRiscrivere) {  // [palacan-9a]
      try {
        const cleaned = {};
        for (const [peer, sess] of Object.entries(result)) {
          const list = Array.isArray(sess) ? sess : [sess];
          cleaned[peer] = list.map((s) => s.pickle(chiaviPickle.locale()));
        }
        safeLocalStorageSet(sessionsStorageKey(normalizedUsername), JSON.stringify(cleaned));
        if (hadCorruption) console.warn(`🧹 Sessioni Olm corrotte rimosse per ${normalizedUsername}`);
      } catch (e) {
        console.error('❌ Errore riscrittura sessioni pulite:', e);
      }
    }

    return result;
  } catch (e) {
    console.error('❌ Errore loadSessions:', e);
    return {};
  }
}

export function clearSessions(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return;
  safeLocalStorageRemove(sessionsStorageKey(normalizedUsername));
}

export function freeSessionsMap(sessionsMap) {
  if (!sessionsMap) return;

  for (const maybeSessions of Object.values(sessionsMap)) {
    const sessions = Array.isArray(maybeSessions) ? maybeSessions : [maybeSessions];
    for (const session of sessions) {
      freeSessionSafely(session);
    }
  }
}

// ==========================================================================
// v1.11-Q — INVALIDAZIONE SESSIONE STALE PER SINGOLO PEER
// ==========================================================================
// Rimuove SOLO la/le sessione/i Olm 1:1 verso un peer specifico da
// `sessionsMap` (l'oggetto in memoria, es. peerSessionsRef.current in
// App.jsx) e dal relativo storage persistito (olm_sessions_<username>).
// Non tocca: l'account Olm, le sessioni verso altri peer, le inbound
// group session Megolm, la cache identity key del peer (che resta valida:
// l'identity key del peer non cambia solo perché la sessione è stale).
//
// Da chiamare quando si rileva che una sessione 1:1 verso un peer non è
// più utilizzabile (messaggio non pre-key che non decifra con nessuna
// sessione esistente, o BAD_MESSAGE_KEY_ID). Dopo questa chiamata, il
// prossimo messaggio pre-key (tipo 0) in arrivo da quel peer creerà una
// sessione nuova da zero in getOrCreateInboundSessionInternal(), invece
// di continuare a fallire contro la sessione morta.
//
// NB: il messaggio che ha causato l'errore resta comunque perso — non è
// recuperabile, era cifrato con un ratchet ormai incompatibile — ma i
// messaggi successivi dallo stesso peer tornano a funzionare senza
// bisogno di intervento manuale (prima serviva un
// localStorage.removeItem('olm_sessions_<username>') a mano, che tra
// l'altro cancellava le sessioni verso TUTTI i peer, non solo quello
// incriminato).
export function dropStaleSessionForPeer(username, peerUsername, sessionsMap) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPeer = normalizeUsername(peerUsername);

  if (!normalizedUsername || !normalizedPeer || !sessionsMap) {
    return false;
  }

  ritiraSessioniDispositivi(normalizedUsername, normalizedPeer, sessionsMap);  // [palacan-pq7b] anche quelle per dispositivo

  const existing = getAllSessionsForPeer(sessionsMap, normalizedPeer);

  if (existing.length === 0) {
    // Niente da rimuovere, ma non è un errore: può succedere se la
    // sessione era già stata ripulita da un tentativo precedente.
    return false;
  }

  for (const session of existing) {
    freeSessionSafely(session);
  }

  delete sessionsMap[normalizedPeer];
  saveSessions(normalizedUsername, sessionsMap);

  console.warn(
    `🧹 Sessione Olm stale rimossa per peer "${normalizedPeer}" (utente "${normalizedUsername}"). ` +
      `Il prossimo messaggio pre-key da questo peer creerà una sessione nuova.`
  );

  return true;
}

export async function getUserKeyBundle(username, token) {
  try {
    const bundle = await apiService.getKeyBundle(username, token);
    return normalizeKeyBundle(bundle);
  } catch (e) {
    console.error(`❌ Key bundle failed for ${username}:`, e);
    return null;
  }
}

export async function createOutboundSessionForUser(account, targetUsername, token) {
  if (!account) throw new Error('Account Olm mancante.');

  try {
    const bundle = await getUserKeyBundle(targetUsername, token);

    if (!bundle?.identity_key || !bundle?.one_time_key) {
      throw new Error(`Chiavi incomplete per ${targetUsername}`);
    }

    const session = new Olm.Session();
    session.create_outbound(account, bundle.identity_key, bundle.one_time_key);

    console.log('✅ Outbound session creata', {
      targetUsername,
      peerIdentityKey: bundle.identity_key,
      oneTimeKeyId: bundle.one_time_key_id || null,
      sessionId: getSessionDebugId(session),
    });

    return {
      session,
      bundle,
    };
  } catch (error) {
    console.error(`❌ Errore sessione verso ${targetUsername}:`, error);
    return null;
  }
}

// ⚠️ Lockata con withPeerLock (stessa chiave usata da encryptRoomKeyForDevice
// e decryptOlmEvent per lo stesso peer): impedisce che una creazione/riuso
// outbound corra in parallelo a una decrittazione inbound in corso per lo
// stesso peer, mutando/persistendo lo stesso oggetto Session Olm senza
// coordinazione (era la causa del bug "sessione con lo stesso session_id
// su entrambi i lati che smette di decrittare dopo una riconnessione WS").
//
// v1.12-R: create_outbound() legge solo l'identity key del NOSTRO account
// (non consuma nessuna nostra one-time key: consuma quella del PEER, presa
// dal suo key bundle) — l'oggetto `account` locale non viene quindi mai
// mutato qui. Salviamo perciò solo le sessioni (persistSessionsOnly),
// non più l'intero account: risalvare un account non mutato rischiava di
// sovrascrivere, con una copia in memoria eventualmente più vecchia, lo
// stato più recente scritto nel frattempo da removeUsedOTK() per un altro
// peer. Vedi punto 8 nel changelog in testa al file.
// [palacan-correzione-sessione-ricevuta] regola di Matrix: per mandare a una persona si usa la sessione Olm su cui si e' decifrato il suo
// ultimo messaggio (la prova piu' forte che esiste anche dall'altra parte). Serve dopo un recupero delle chiavi
// su un dispositivo nuovo: l'altro apre una sessione nuova, e per rispondere bisogna usare quella, non la
// vecchia. Non cambia l'ordine delle sessioni (v1.14) e non ne butta nessuna. Il ricordo sta sul dispositivo.
function chiaveUltimaSessione(username) {
  return `palacan_ultima_sessione_ricevuta_${normalizeUsername(username)}`;
}

function idSessioneOlm(session) {
  try {
    return session ? session.session_id() : null;
  } catch (_) {
    return null;
  }
}

function leggiUltimeSessioni(username) {
  try {
    const mappa = JSON.parse(safeLocalStorageGet(chiaveUltimaSessione(username)) || '{}');
    return mappa && typeof mappa === 'object' ? mappa : {};
  } catch (_) {
    return {};
  }
}

export function ricordaSessioneRicevuta(username, peerUsername, session) {
  const id = idSessioneOlm(session);
  const peer = normalizeUsername(peerUsername);
  if (!id || !peer || !normalizeUsername(username)) return false;
  togliDaRitirate(username, peer, id);  // [palacan-reset-incrociati] decifrato su questa sessione: esiste anche dall'altra parte
  const mappa = leggiUltimeSessioni(username);
  if (mappa[peer] === id) return false;
  mappa[peer] = id;
  safeLocalStorageSet(chiaveUltimaSessione(username), JSON.stringify(mappa));
  return true;
}

export function sessioneDaUsare(username, peerUsername, lista) {
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const ritirate = new Set(leggiRitirate(username)[normalizeUsername(peerUsername)] || []);  // [palacan-reset-incrociati]
  const utilizzabili = lista.filter((s) => !ritirate.has(idSessioneOlm(s)));  // [palacan-reset-incrociati]
  if (utilizzabili.length === 0) return null;  // [palacan-reset-incrociati] tutte ritirate: chi chiama ne crea una nuova
  const id = leggiUltimeSessioni(username)[normalizeUsername(peerUsername)];
  if (id) {
    const trovata = utilizzabili.find((s) => idSessioneOlm(s) === id);
    if (trovata) return trovata;
  }
  return utilizzabili[0];
}

// [palacan-reset-incrociati] Sessioni 1:1 "ritirate dall'invio". Quando un contatto manda session_reset (ha perso le
// sue sessioni, es. dopo un recupero), le nostre sessioni verso di lui non si usano piu' per SCRIVERGLI (al prossimo
// invio ne parte una nuova pre-key, che lui sa sempre aprire) ma restano per DECIFRARE: un suo messaggio appena
// mandato su una sessione nuova e valida si legge, invece di diventare "non e' pre-key" (prima si cancellava tutto,
// anche la sessione appena nata, e con due recuperi quasi simultanei si perdeva una chiave). Una sessione ritirata su
// cui si decifra un suo messaggio torna utilizzabile: e' la prova che esiste anche dall'altra parte.
// Al massimo MAX_SESSIONI_RITIRATE sessioni per contatto (le piu' recenti). Il segno sta sul dispositivo.
const MAX_SESSIONI_RITIRATE = 5;

function chiaveSessioniRitirate(username) {
  return `palacan_sessioni_ritirate_${normalizeUsername(username)}`;
}

function leggiRitirate(username) {
  try {
    const mappa = JSON.parse(safeLocalStorageGet(chiaveSessioniRitirate(username)) || '{}');
    return mappa && typeof mappa === 'object' ? mappa : {};
  } catch (_) {
    return {};
  }
}

function scriviRitirate(username, mappa) {
  safeLocalStorageSet(chiaveSessioniRitirate(username), JSON.stringify(mappa));
}

/** Ritira dall'invio tutte le sessioni verso peerUsername in sessionsMap (che resta con al massimo
 *  MAX_SESSIONI_RITIRATE sessioni per quel contatto). Restituisce quante sessioni sono state ritirate. */
// [palacan-pq7b] Sessioni in uscita verso i SINGOLI dispositivi di una persona (chiavi "<persona>::device::<id>", quelle
// che usa davvero encryptRoomKeyForAllDevices). Prima session_reset e "sessione incastrata" ritiravano solo la sessione
// "<persona>": quelle per dispositivo restavano in uso per sempre, e una sessione aperta con una OTK che il destinatario
// non ha (account ripristinato in un altro browser) continuava a mandargli messaggi che lui non puo' aprire ("unknown
// one-time key", sempre la stessa). Qui si ritirano dall'invio: restano per decifrare, ma per inviare se ne apre una
// nuova con una OTK presa adesso. Non si liberano (potrebbero essere in uso proprio ora): si tengono le piu' recenti e
// le altre si lasciano andare. Al massimo una volta ogni 30 secondi per persona: una raffica di errori non consuma le
// OTK dell'altro.
const INTERVALLO_RITIRO_DISPOSITIVI_MS = 30000;
const ultimoRitiroDispositivi = new Map();

export function ritiraSessioniDispositivi(username, peerUsername, sessionsMap, adesso = Date.now()) {
  const io = normalizeUsername(username);
  const peer = normalizeUsername(peerUsername);
  if (!io || !peer || !sessionsMap) return 0;
  const limite = `${io}|${peer}`;
  const prima = ultimoRitiroDispositivi.get(limite);
  if (prima !== undefined && adesso - prima < INTERVALLO_RITIRO_DISPOSITIVI_MS) return 0;
  const prefisso = `${peer}::device::`;
  const mappa = leggiRitirate(io);
  let quante = 0;
  for (const chiave of Object.keys(sessionsMap)) {
    if (!chiave.startsWith(prefisso)) continue;
    const tenute = getAllSessionsForPeer(sessionsMap, chiave).slice(0, MAX_SESSIONI_RITIRATE);
    if (tenute.length === 0) continue;
    sessionsMap[chiave] = tenute;
    mappa[normalizeUsername(chiave)] = tenute.map((s) => idSessioneOlm(s)).filter(Boolean);
    quante += tenute.length;
  }
  if (quante > 0) {
    scriviRitirate(io, mappa);
    ultimoRitiroDispositivi.set(limite, adesso);
    console.warn(`♻️ ${quante} sessione/i verso i dispositivi di ${peer} ritirata/e dall'invio: la prossima chiave parte con una sessione nuova`);
  }
  return quante;
}

export function ritiraSessioniPerInvio(username, peerUsername, sessionsMap) {
  const normalizedUsername = normalizeUsername(username);
  const peer = normalizeUsername(peerUsername);
  if (!normalizedUsername || !peer || !sessionsMap) return 0;
  const dispositivi = ritiraSessioniDispositivi(normalizedUsername, peer, sessionsMap);  // [palacan-pq7b] anche quelle per dispositivo
  let chiave = null;
  if (sessionsMap[peer] !== undefined) chiave = peer;
  else if (sessionsMap[peerUsername] !== undefined) chiave = peerUsername;
  if (chiave === null) return dispositivi;
  const lista = getAllSessionsForPeer(sessionsMap, chiave);
  if (lista.length === 0) return dispositivi;
  const tenute = lista.slice(0, MAX_SESSIONI_RITIRATE);
  for (const session of lista.slice(MAX_SESSIONI_RITIRATE)) {
    freeSessionSafely(session);
  }
  sessionsMap[chiave] = tenute;
  const mappa = leggiRitirate(normalizedUsername);
  mappa[peer] = tenute.map((s) => idSessioneOlm(s)).filter(Boolean);
  scriviRitirate(normalizedUsername, mappa);
  return tenute.length + dispositivi;  // [palacan-pq7b]
}

function togliDaRitirate(username, peer, id) {
  const mappa = leggiRitirate(username);
  const elenco = Array.isArray(mappa[peer]) ? mappa[peer] : [];
  if (!elenco.includes(id)) return;
  const resto = elenco.filter((x) => x !== id);
  if (resto.length > 0) mappa[peer] = resto;
  else delete mappa[peer];
  scriviRitirate(username, mappa);
}

export async function getOrCreateOutboundSession({
  account,
  username,
  targetUsername,
  sessions,
  token,
}) {
  if (!account) throw new Error('Account Olm mancante.');
  if (!username) throw new Error('Username locale mancante.');
  if (!targetUsername) throw new Error('Username target mancante.');

  const normalizedUsername = normalizeUsername(username);
  const normalizedTarget = normalizeUsername(targetUsername);
  const lockKey = peerLockKey(normalizedUsername, normalizedTarget);

  return withPeerLock(lockKey, async () => {
    const existingList = getAllSessionsForPeer(sessions, normalizedTarget);
    const scelta = existingList.length > 0 ? sessioneDaUsare(normalizedUsername, normalizedTarget, existingList) : null;  // [palacan-correzione-sessione-ricevuta] [palacan-reset-incrociati] null se sono tutte ritirate
    if (scelta) {
      return scelta;
    }

    const created = await createOutboundSessionForUser(account, normalizedTarget, token);
    if (!created?.session) {
      throw new Error(`Impossibile creare sessione outbound per ${normalizedTarget}`);
    }

    prependSessionForPeer(sessions, normalizedTarget, created.session);
    persistSessionsOnly(username, sessions);

    const peerIdentityKey = created.bundle?.identity_key || null;
    if (peerIdentityKey) {
      savePeerIdentityKey(normalizedUsername, normalizedTarget, peerIdentityKey);
    }

    return created.session;
  });
}

import { conChiaviMittente, imparaDaPayloadOlm, aggiungiAttestato } from './utils/firmaAutore';  // [palacan-n5e] autore firmato (vedi il file)
import { chiaviPqPer, chiudiPerDispositivo, apriSeBusta } from './utils/bustePq';  // [palacan-pq4] doppia busta post-quantum (vedi il file)
import { firmaPqPerBackup, ripristinaFirmaPqDaBackup } from './utils/firmaPq';  // [palacan-pq5b] chiave di firma ML-DSA-65 nel backup, con l'account
import { chiavePrincipalePerBackup, ripristinaChiavePrincipaleDaBackup } from './utils/chiavePrincipale';  // [palacan-l4c2] chiave principale nel backup
import { filtraDispositiviFirmati, principaleDelContatto } from './utils/fiduciaContatti';  // [palacan-l4c3] firma incrociata
import { contoUsabile, segnaOtkDaSostituire, otkDaSostituire, otkSostituite } from './utils/contoOlm';  // [palacan-pq7] account bloccato, OTK dopo il ripristino

export function encryptMessage(session, plainText) {
  if (!session) throw new Error('Sessione non valida.');
  return session.encrypt(conChiaviMittente(plainText));  // [palacan-n5e] dentro la parte cifrata: utente, curve25519 ed ed25519 del mittente
}

// v1.12-R: cifrare un messaggio con una sessione esistente avanza il
// ratchet della SESSIONE, non muta l'account — salviamo quindi solo le
// sessioni, mai l'account (stesso motivo di getOrCreateOutboundSession,
// vedi punto 8 nel changelog in testa al file).
export async function encryptForUser({
  account,
  username,
  targetUsername,
  sessions,
  token,
  payload,
}) {
  const session = await getOrCreateOutboundSession({
    account,
    username,
    targetUsername,
    sessions,
    token,
  });

  const plainText = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const encryptedRaw = encryptMessage(session, plainText);
  const encrypted = normalizeOlmCipherResult(encryptedRaw);

  persistSessionsOnly(username, sessions);

  return {
    session,
    encrypted,
  };
}

export function decryptMessage(session, messageType, messageBody) {
  if (!session) {
    throw new Error('Sessione mancante.');
  }

  const plaintext = session.decrypt(Number(messageType), messageBody);

  return {
    plaintext,
    repairedSession: null,
  };
}

// Versione interna, NON lockata: assume che il chiamante possieda già il
// lock per-peer corretto (vedi decryptOlmEvent, unico chiamante interno).
// Contiene il body originale di getOrCreateInboundSession, invariato.
async function getOrCreateInboundSessionInternal({
  account,
  username,
  senderUsername,
  senderIdentityKey = null,
  messageType,
  messageBody,
  existingSessions = {},
  token,
}) {
  if (!account) throw new Error('Account Olm mancante.');
  if (!username) throw new Error('Username locale mancante.');
  if (!senderUsername) throw new Error('Sender username mancante.');

  const normalizedSender = normalizeUsername(senderUsername);
  const numericType = Number(messageType);

  const currentSessions = getAllSessionsForPeer(existingSessions, normalizedSender);

  for (const session of currentSessions) {
    const matched = tryDecryptWithSession(session, numericType, messageBody);
    if (matched.ok) {
      return {
        session,
        plaintext: matched.plaintext,
        created: false,
        account,
      };
    }
  }

  if (numericType !== 0) {
    throw new Error('Messaggio Olm non decryptabile con sessioni esistenti e non è pre-key.');
  }

  // ⚠️ FIX OTK_MISMATCH: un singolo tentativo di create_inbound può fallire
  // se l'account in memoria (workingAccount) non riflette ancora l'ultimo
  // stato delle one-time key salvato su disco — per esempio se un'altra
  // operazione concorrente (es. l'invio della NOSTRA room key allo stesso
  // peer, che claima una OTK e aggiorna l'account) ha scritto su
  // localStorage un istante prima, ma il riferimento che stiamo usando qui
  // era stato letto/passato prima di quell'aggiornamento.
  // Strategia: tentiamo una prima volta con l'account "fresco" più
  // recente disponibile; se falliamo con OTK_MISMATCH, ricarichiamo
  // ESPLICITAMENTE l'account da zero da localStorage (bypassando ogni
  // riferimento in memoria) e ritentiamo una sola volta, perché nel
  // frattempo lo stato corretto potrebbe già essere stato persistito.
  // ⚠️ FIX DEFINITIVA (confermata con test isolato Olm puro, fuori da
  // React/HTTP/DB): in questa build di @matrix-org/olm (3.2.15), le
  // funzioni matches_inbound() e matches_inbound_from() ritornano SEMPRE
  // false, anche per un messaggio pre-key perfettamente valido con
  // identity key e one-time key corrette. È un bug/limitazione di questa
  // build WASM specifica. L'esempio ufficiale della libreria (vedi
  // README npm) non usa infatti questo controllo preliminare: chiama
  // create_inbound/create_inbound_from direttamente sulla sessione vuota.
  // Usiamo quindi create_inbound_from/create_inbound diretto, lasciando
  // che sia il try/catch a intercettare un vero fallimento (es. OTK
  // realmente sbagliata/già usata), invece di un gate che blocca SEMPRE
  // a priori indipendentemente dalla validità reale del messaggio.
  const attemptInboundCreation = (accountForAttempt) => {
    const debugBase = buildBadMessageDebug({
      username,
      senderUsername: normalizedSender,
      senderIdentityKey,
      messageType: numericType,
      messageBody,
      account: accountForAttempt,
      existingSessions: currentSessions,
    });

    const newSession = new Olm.Session();

    try {
      if (
        senderIdentityKey &&
        typeof newSession.create_inbound_from === 'function'
      ) {
        newSession.create_inbound_from(accountForAttempt, senderIdentityKey, messageBody);
      } else {
        newSession.create_inbound(accountForAttempt, messageBody);
      }

      const plaintext = newSession.decrypt(numericType, messageBody);

      return {
        ok: true,
        session: newSession,
        plaintext,
        debugBase,
      };
    } catch (e) {
      freeSessionSafely(newSession);

      // Se create_inbound_from fallisce realmente (es. messaggio
      // corrotto, OTK davvero non posseduta), preserviamo comunque il
      // codice OTK_MISMATCH per compatibilità con la logica di retry
      // esistente più sotto.
      if (!e.code) {
        e.code = 'OTK_MISMATCH';
      }

      return { ok: false, error: e, debugBase };
    }
  };

  let workingAccount = getFreshAccount(username, account);
  if (!workingAccount) {
    throw new Error('Account Olm aggiornato non disponibile.');
  }

  let attempt = attemptInboundCreation(workingAccount);

  if (!attempt.ok && attempt.error?.code === 'OTK_MISMATCH') {
    console.warn(
      '⚠️ OTK_MISMATCH al primo tentativo, ricarico account fresco da localStorage e ritento...'
    );

    const reloadedAccount = loadOlmAccount(username);

    if (reloadedAccount) {
      workingAccount = reloadedAccount;
      attempt = attemptInboundCreation(workingAccount);
    }
  }

  if (!attempt.ok) {
    const enrichedDebug = {
      ...attempt.debugBase,
      error: String(attempt.error?.message || attempt.error),
      code: attempt.error?.code || null,
    };

    if (attempt.error?.code === 'OTK_MISMATCH') {
      console.error('❌ Inbound pre-key mismatch diagnostic (dopo retry)', enrichedDebug);
    } else if (isBadMessageKeyIdError(attempt.error)) {
      console.error('❌ BAD_MESSAGE_KEY_ID diagnostic', enrichedDebug);
    } else {
      console.error('❌ Inbound session creation failed', enrichedDebug);
    }

    throw attempt.error;
  }

  const { session: newSession, plaintext } = attempt;

  appendSessionForPeer(existingSessions, normalizedSender, newSession);
  // v1.12-R: qui l'account (workingAccount) non è ancora stato mutato —
  // create_inbound_from()/create_inbound() non rimuovono da soli la OTK
  // usata, serve la chiamata esplicita a removeUsedOTK() qui sotto, che è
  // l'unica autorizzata a scrivere l'account (dentro withAccountLock).
  // Salviamo quindi solo le sessioni, per non rischiare di sovrascrivere
  // con questa copia "pre-rimozione" uno stato dell'account più recente
  // scritto nel frattempo da un altro peer. Vedi punto 8 nel changelog.
  persistSessionsOnly(username, existingSessions);

  // [palacan-ordine-lucchetti] La OTK usata NON si rimuove qui: removeUsedOTK prende il lucchetto dell'account e qui
  // siamo dentro il lucchetto di coppia (withPeerLock), mentre ensureRoomKeyShared (App.jsx) li prende nell'ordine
  // opposto (account, poi coppia). Se capitano insieme si aspettano a vicenda finche' il lucchetto di coppia scade:
  // chiave della stanza persa e sessione rovinata. La rimozione la fa il chiamante a lucchetto di coppia rilasciato
  // (rimuoviOtkDopo, in decryptOlmEvent e getOrCreateInboundSession). Regola: mai l'account sotto la coppia.
  const updatedAccount = null;

  // FIX (audit "pensa da penetration tester", scoperto scavando dopo
  // aver corretto un test che falliva per il motivo sbagliato - vedi
  // memoria del progetto): il controllo TOFU (getPeerIdentityChangeWarning)
  // esisteva gia' completo lato INVIO (getOrCreateOutboundSession,
  // encryptRoomKeyForDevice) ma non veniva MAI chiamato qui, lato
  // RICEZIONE - la direzione piu' importante, dato che decifrare/
  // fidarsi di contenuto in arrivo da un'identita' cambiata e' il
  // rischio piu' concreto (account del contatto compromesso a meta'
  // conversazione). Stessa infrastruttura gia' pronta (banner
  // IdentityChangeWarningBanner.jsx, acknowledgePeerIdentityChange) -
  // qui la completiamo, non la reinventiamo. Solo quando conosciamo
  // davvero la identity key del mittente (non sempre il caso, vedi
  // parametro opzionale senderIdentityKey piu' sopra).
  if (senderIdentityKey) {
    savePeerIdentityKey(username, normalizedSender, senderIdentityKey);
  }

  console.log('✅ Inbound session creata', {
    username,
    senderUsername: normalizedSender,
    senderIdentityKey: senderIdentityKey || null,
    sessionId: getSessionDebugId(newSession),
  });

  return {
    session: newSession,
    plaintext,
    created: true,
    account: updatedAccount || workingAccount,
    otkDaRimuovere: { account: workingAccount, session: newSession },  // [palacan-ordine-lucchetti]
  };
}

// Wrapper pubblico lockato, per compatibilità con eventuali chiamanti
// esterni diretti (nessuno, ad oggi, nel codice fornito). decryptOlmEvent()
// NON passa da qui: acquisisce il lock una volta sola e chiama la versione
// interna direttamente, per evitare un lock annidato con la stessa chiave.
export async function getOrCreateInboundSession(params) {
  const lockKey = peerLockKey(params?.username, params?.senderUsername);
  const esito = await withPeerLock(lockKey, () => getOrCreateInboundSessionInternal(params));  // [palacan-ordine-lucchetti]
  return rimuoviOtkDopo(esito, params?.username, params?.token);
}

// [palacan-ordine-lucchetti] Rimuove la OTK consumata da una sessione in arrivo DOPO aver rilasciato il lucchetto di
// coppia (vedi getOrCreateInboundSessionInternal). Stesso removeUsedOTK di prima, stesso account aggiornato restituito.
async function rimuoviOtkDopo(esito, username, token) {
  const daRimuovere = esito?.otkDaRimuovere;
  if (!daRimuovere) return esito;
  delete esito.otkDaRimuovere;
  const aggiornato = await removeUsedOTK(daRimuovere.account, daRimuovere.session, username, token);
  if (aggiornato) esito.account = aggiornato;
  return esito;
}

export async function decryptOlmEvent({
  account,
  username,
  senderUsername,
  senderIdentityKey = null,
  messageType,
  messageBody,
  sessions = {},
  token,
}) {
  if (!account) throw new Error('Account Olm mancante.');
  if (!username) throw new Error('Username locale mancante.');
  if (!senderUsername) throw new Error('Sender username mancante.');

  const normalizedSender = normalizeUsername(senderUsername);
  const numericType = Number(messageType);
  const lockKey = peerLockKey(username, normalizedSender);

  const esito = await withPeerLock(lockKey, async () => {  // [palacan-ordine-lucchetti] la OTK si rimuove dopo, fuori dal lucchetto
    const existingSessions = getAllSessionsForPeer(sessions, normalizedSender);

    for (const session of existingSessions) {
      const matched = tryDecryptWithSession(session, numericType, messageBody);

      if (matched.ok) {
        ricordaSessioneRicevuta(username, normalizedSender, session);  // [palacan-correzione-sessione-ricevuta]
        saveSessions(username, sessions);
        return {
          plaintext: matched.plaintext,
          repairedSession: session,
          account,
        };
      }
    }

    try {
      const created = await getOrCreateInboundSessionInternal({
        account,
        username,
        senderUsername: normalizedSender,
        senderIdentityKey,
        messageType: numericType,
        messageBody,
        existingSessions: sessions,
        token,
      });

      // v1.12-R: l'account aggiornato (created.account) è già stato
      // scritto in modo autorevole e atomico dentro removeUsedOTK(), sotto
      // withAccountLock(). Risalvarlo qui, fuori dal lock, con questo
      // riferimento potrebbe correre contro una mutazione dell'account
      // avvenuta nel frattempo per un altro peer e sovrascriverla.
      // Salviamo quindi solo le sessioni. Vedi punto 8 nel changelog.
      persistSessionsOnly(username, sessions);
      ricordaSessioneRicevuta(username, normalizedSender, created.session);  // [palacan-correzione-sessione-ricevuta]

      return {
        plaintext: created.plaintext,
        repairedSession: created.session,
        account: created.account || account,
        otkDaRimuovere: created.otkDaRimuovere,  // [palacan-ordine-lucchetti]
      };
    } catch (e) {
      const debug = buildBadMessageDebug({
        username,
        senderUsername: normalizedSender,
        senderIdentityKey,
        messageType: numericType,
        messageBody,
        account,
        existingSessions,
      });

      // v1.11-Q: se l'errore è del tipo "sessione stale" (non pre-key
      // senza sessione che decifri, o BAD_MESSAGE_KEY_ID), non ci
      // limitiamo più a loggare e rilanciare: ripuliamo la sessione 1:1
      // verso QUESTO peer, così il prossimo messaggio pre-key da lui
      // potrà creare una sessione nuova invece di fallire di nuovo allo
      // stesso modo all'infinito. Il messaggio corrente resta comunque
      // perso (non è recuperabile), ma sblocchiamo i successivi senza
      // bisogno di un reset manuale di localStorage.
      if (isStaleSessionError(e)) {
        console.warn(
          '🧹 Sessione Olm considerata stale per questo peer, la rimuovo per forzare un nuovo handshake al prossimo pre-key.',
          debug
        );
        dropStaleSessionForPeer(username, normalizedSender, sessions);
      } else if (isBadMessageKeyIdError(e)) {
        console.error('❌ decryptOlmEvent -> BAD_MESSAGE_KEY_ID', debug);
      } else {
        console.error('❌ decryptOlmEvent failed', {
          ...debug,
          error: String(e?.message || e),
        });
      }

      throw e;
    }
  });
  // [palacan-n5e] chiave di firma del mittente, autenticata da Olm: solo se la curve25519 e' quella nota per lui
  if (esito && senderIdentityKey && loadPeerIdentityKey(username, normalizedSender) === senderIdentityKey) {
    imparaDaPayloadOlm(username, normalizedSender, senderIdentityKey, esito && esito.plaintext);
  }
  // [palacan-pq4] eccezione mirata approvata: la busta post-quantum si apre qui; il resto dell'app riceve il messaggio
  // originale, come prima (un messaggio senza busta passa intatto)
  const esitoAperto = esito && typeof esito.plaintext === 'string'
    ? {
      ...esito,
      plaintext: await apriSeBusta({
        io: normalizeUsername(username),
        mittente: normalizedSender,
        curvaMittente: senderIdentityKey,
        curvaMia: getCurve25519Key(account),
        plaintext: esito.plaintext,
      }),
    }
    : esito;
  return rimuoviOtkDopo(esitoAperto, username, token);  // [palacan-ordine-lucchetti]
}

/* ==========================================================================
   MEGOLM - ROOM KEYS
   ========================================================================== */

export function saveOutboundGroupSession(username, roomId, session) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedRoomId = normalizeRoomId(roomId);

  if (!normalizedUsername || !normalizedRoomId || !session) return;

  try {
    const pickled = session.pickle(chiaviPickle.locale());
    safeLocalStorageSet(
      outboundGroupSessionStorageKey(normalizedRoomId, normalizedUsername),
      pickled
    );
  } catch (e) {
    console.error('❌ Errore saveOutboundGroupSession:', e);
  }
}

export function loadOutboundGroupSession(username, roomId) {
  assertOlmReady();

  const normalizedUsername = normalizeUsername(username);
  const normalizedRoomId = normalizeRoomId(roomId);

  if (!normalizedUsername || !normalizedRoomId) return null;

  const pickled = safeLocalStorageGet(
    outboundGroupSessionStorageKey(normalizedRoomId, normalizedUsername)
  );
  if (!pickled) return null;

  try {
    const { oggetto: session, migrato } = chiaviPickle.daPickle(Olm.OutboundGroupSession, pickled);  // [palacan-9a]
    if (migrato) saveOutboundGroupSession(normalizedUsername, normalizedRoomId, session);  // [palacan-9a] riscritta con la chiave del dispositivo
    return session;
  } catch (e) {
    console.error('❌ Errore loadOutboundGroupSession:', e);
    console.warn(`🧹 Outbound group session corrotta rimossa per stanza ${normalizedRoomId}`);
    safeLocalStorageRemove(outboundGroupSessionStorageKey(normalizedRoomId, normalizedUsername));
    return null;
  }
}

export function clearOutboundGroupSession(username, roomId) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedRoomId = normalizeRoomId(roomId);

  if (!normalizedUsername || !normalizedRoomId) return;
  safeLocalStorageRemove(
    outboundGroupSessionStorageKey(normalizedRoomId, normalizedUsername)
  );
}

// ── FIX (rotazione Megolm su cambio composizione gruppo): il server
// tiene un contatore "membership_version" per stanza, che aumenta di 1
// ogni volta che qualcuno entra o esce. Queste due funzioni tengono
// traccia, LOCALMENTE, dell'ultima versione vista per ciascuna stanza -
// il chiamante (ensureRoomKeyShared in App.jsx) confronta il valore
// salvato con quello appena ricevuto dal server: se sono diversi, sa
// che deve abbandonare la sessione Megolm di invio attuale e crearne
// una nuova, condivisa solo con chi e' membro ORA. Una mappa sola per
// utente (tutte le stanze insieme), stesso schema gia' usato altrove in
// questo file per dati simili (es. loadPeerIdentityKeys). ───────────
function roomMembershipVersionStorageKey(username) {
  return `palacan_room_membership_version_${username}`;
}

export function loadRoomMembershipVersion(username, roomId) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedRoomId = normalizeRoomId(roomId);
  if (!normalizedUsername || !normalizedRoomId) return null;

  try {
    const raw = safeLocalStorageGet(roomMembershipVersionStorageKey(normalizedUsername));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed[normalizedRoomId];
    return typeof value === 'number' ? value : null;
  } catch (_) {
    return null;
  }
}

export function saveRoomMembershipVersion(username, roomId, version) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedRoomId = normalizeRoomId(roomId);
  if (!normalizedUsername || !normalizedRoomId || typeof version !== 'number') return;

  try {
    const key = roomMembershipVersionStorageKey(normalizedUsername);
    const raw = safeLocalStorageGet(key);
    let existing = {};
    if (raw) {
      try {
        existing = JSON.parse(raw) || {};
      } catch (_) {
        existing = {};
      }
    }
    existing[normalizedRoomId] = version;
    safeLocalStorageSet(key, JSON.stringify(existing));
  } catch (_) {}
}

// [palacan-l3b] dispositivi ATTIVI dei membri di una stanza visti l'ultima volta (identificativi opachi dal server).
// Se ne manca uno (revocato, copia superata, utente disattivato), il chiamante cambia la sessione Megolm di invio:
// chi aveva la chiave non legge i messaggi successivi. Un dispositivo in PIU' non cambia niente.
function roomDevicesStorageKey(username) {
  return `palacan_room_devices_${username}`;
}

export function loadRoomDevices(username, roomId) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedRoomId = normalizeRoomId(roomId);
  if (!normalizedUsername || !normalizedRoomId) return null;
  try {
    const parsed = JSON.parse(safeLocalStorageGet(roomDevicesStorageKey(normalizedUsername)) || 'null');
    const value = parsed && typeof parsed === 'object' ? parsed[normalizedRoomId] : null;
    return Array.isArray(value) ? value.map(String) : null;
  } catch (_) {
    return null;
  }
}

export function saveRoomDevices(username, roomId, devices) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedRoomId = normalizeRoomId(roomId);
  if (!normalizedUsername || !normalizedRoomId || !Array.isArray(devices)) return;
  try {
    const key = roomDevicesStorageKey(normalizedUsername);
    let existing = {};
    try {
      existing = JSON.parse(safeLocalStorageGet(key) || '{}') || {};
    } catch (_) {
      existing = {};
    }
    existing[normalizedRoomId] = devices.map(String);
    safeLocalStorageSet(key, JSON.stringify(existing));
  } catch (_) {}
}

export function deviceRemovedFromRoom(previous, current) {
  if (!Array.isArray(previous) || !Array.isArray(current)) return false;
  const ora = new Set(current.map(String));
  return previous.some((d) => !ora.has(String(d)));
}

export function getOrCreateOutboundGroupSession(username, roomId) {
  assertOlmReady();

  const normalizedUsername = normalizeUsername(username);
  const normalizedRoomId = normalizeRoomId(roomId);

  let session = loadOutboundGroupSession(normalizedUsername, normalizedRoomId);
  if (session) return session;

  session = new Olm.OutboundGroupSession();
  session.create();
  saveOutboundGroupSession(normalizedUsername, normalizedRoomId, session);
  saveInitialRoomKeySnapshot(normalizedUsername, normalizedRoomId, session);
  return session;
}

// ── FIX bug messaggi iniziali persi: la chiave di sessione Megolm
// (session_key()) avanza ad ogni messaggio cifrato - proprieta' voluta
// della forward secrecy, non un difetto della libreria. Se la
// richiediamo "in tempo reale" ogni volta che condividiamo/ri-
// condividiamo la sessione con un peer, un peer che la riceve DOPO che
// alcuni messaggi sono gia' stati cifrati ottiene uno snapshot gia'
// avanzato - decifra solo i messaggi da quel punto in poi, mai quelli
// precedenti (terminale, non recuperabile). Catturiamo la chiave UNA
// SOLA VOLTA, nell'istante in cui la sessione nasce (ratchet a zero),
// e la persistiamo - createRoomKeyEventContent la riusa sempre invece
// di richiederla dal vivo.
function initialRoomKeySnapshotStorageKey(username) {
  return `palacan_initial_room_key_snapshot_${username}`;
}

function saveInitialRoomKeySnapshot(username, roomId, session) {
  try {
    const key = initialRoomKeySnapshotStorageKey(username);
    let existing = {};
    const raw = safeLocalStorageGet(key);
    if (raw) {
      try {
        existing = JSON.parse(raw);
      } catch (_) {
        existing = {};
      }
    }
    existing[session.session_id()] = {
      room_id: roomId,
      session_key: session.session_key(),
      // v-next (rotazione periodica Megolm): marca temporale di
      // creazione della sessione - prima non tracciata da nessuna
      // parte. Serve a shouldRotateOutboundSessionByAge sotto, per
      // ruotare una sessione che non ha mai visto un cambio di
      // composizione (oggi l'UNICO trigger di rotazione esistente,
      // vedi ensureRoomKeyShared in App.jsx) ma e' comunque rimasta
      // attiva troppo a lungo - stessa pratica raccomandata da
      // Matrix/Signal per limitare quanto viene cifrato sotto la
      // stessa chiave.
      created_at: Date.now(),
    };
    safeLocalStorageSet(key, JSON.stringify(existing));
  } catch (e) {
    console.error('❌ Salvataggio snapshot iniziale room key fallito:', e);
  }
}

function loadInitialRoomKeySnapshot(username, sessionId) {
  try {
    const raw = safeLocalStorageGet(initialRoomKeySnapshotStorageKey(username));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.[sessionId] || null;
  } catch (e) {
    return null;
  }
}

// v-next (rotazione periodica Megolm): oggi l'UNICO trigger di
// rotazione e' un cambio di composizione del gruppo (vedi
// ensureRoomKeyShared in App.jsx, sezione "Fase A - riconciliazione").
// Una stanza dove nessuno entra/esce mai non ruota MAI la sessione di
// invio, anche se resta attiva per mesi - non e' un bug (la sicurezza
// di Megolm/Signal non dipende dalla rotazione per restare valida),
// ma e' una pratica raccomandata da Matrix/Signal per limitare quanto
// viene cifrato sotto la stessa chiave nel tempo. Questa funzione
// verifica se la sessione di invio ATTUALE (se esiste) ha superato
// maxAgeMs dalla sua creazione - se si', il chiamante decide se
// ruotare (stesso identico meccanismo gia' usato per il cambio di
// composizione: clearOutboundGroupSession + una nuova verra' creata
// automaticamente al prossimo giro).
export function shouldRotateOutboundSessionByAge(username, roomId, maxAgeMs) {
  try {
    const session = loadOutboundGroupSession(username, roomId);
    if (!session) return false; // nessuna sessione attiva, nulla da ruotare

    const snapshot = loadInitialRoomKeySnapshot(username, session.session_id());
    if (!snapshot || typeof snapshot.created_at !== 'number') {
      // [palacan-l3a] sessione senza data di creazione (creata prima che la si salvasse): non si sa quanto sia
      // vecchia, quindi si cambia (una volta: la nuova nasce con la sua data). Prima restava attiva per sempre.
      return true;
    }

    return Date.now() - snapshot.created_at > maxAgeMs;
  } catch (e) {
    console.error('❌ shouldRotateOutboundSessionByAge fallito:', e);
    return false;
  }
}

// [palacan-l3a] rotazione per numero di messaggi: la sessione di invio ATTUALE ha gia' cifrato maxMessages messaggi
// (contatore del modulo, message_index)? Allora il chiamante la cambia, con lo stesso meccanismo di eta' e membri.
export function shouldRotateOutboundSessionByMessages(username, roomId, maxMessages) {
  try {
    const session = loadOutboundGroupSession(username, roomId);
    if (!session) return false; // nessuna sessione attiva, nulla da ruotare
    return session.message_index() >= maxMessages;
  } catch (e) {
    console.error('❌ shouldRotateOutboundSessionByMessages fallito:', e);
    return false;
  }
}

export function saveInboundGroupSessions(username, sessionsMap) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !sessionsMap) return;

  const toStore = {};

  for (const [sessionId, session] of Object.entries(sessionsMap)) {
    try {
      if (session) {
        toStore[sessionId] = session.pickle(chiaviPickle.locale());
      }
    } catch (e) {
      console.error(`❌ Pickle inbound Megolm fallito per ${sessionId}:`, e);
    }
  }

  safeLocalStorageSet(
    inboundGroupSessionsStorageKey(normalizedUsername),
    JSON.stringify(toStore)
  );
}

export function loadInboundGroupSessions(username) {
  assertOlmReady();

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return {};

  const raw = safeLocalStorageGet(inboundGroupSessionsStorageKey(normalizedUsername));
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    const result = {};
    let hadCorruption = false;
    let daRiscrivere = false;  // [palacan-9a] dati di prima della 9a: si riscrivono con la chiave del dispositivo

    for (const [sessionId, pickled] of Object.entries(parsed)) {
      try {
        const { oggetto: session, migrato } = chiaviPickle.daPickle(Olm.InboundGroupSession, pickled);  // [palacan-9a]
        if (migrato) daRiscrivere = true;  // [palacan-9a]
        result[sessionId] = session;
      } catch (e) {
        console.error(`❌ Unpickle inbound Megolm fallito per ${sessionId}:`, e);
        hadCorruption = true;
      }
    }

    // Stessa logica di loadSessions: riscriviamo il blob senza le entry
    // corrotte, altrimenti restano li' per sempre.
    if (hadCorruption || daRiscrivere) {  // [palacan-9a]
      try {
        const cleaned = {};
        for (const [sessionId, session] of Object.entries(result)) {
          cleaned[sessionId] = session.pickle(chiaviPickle.locale());
        }
        safeLocalStorageSet(inboundGroupSessionsStorageKey(normalizedUsername), JSON.stringify(cleaned));
        if (hadCorruption) console.warn(`🧹 Inbound Megolm corrotte rimosse per ${normalizedUsername}`);
      } catch (e) {
        console.error('❌ Errore riscrittura inbound pulite:', e);
      }
    }

    return result;
  } catch (e) {
    console.error('❌ Errore loadInboundGroupSessions:', e);
    return {};
  }
}

export function clearInboundGroupSessions(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return;
  safeLocalStorageRemove(inboundGroupSessionsStorageKey(normalizedUsername));
}

export function createRoomKeyEventContent(roomId, outboundGroupSession, username) {
  if (!roomId) throw new Error('roomId mancante.');
  if (!outboundGroupSession) throw new Error('Outbound group session mancante.');

  const sessionId = outboundGroupSession.session_id();
  const normalizedUsername = username ? normalizeUsername(username) : null;
  const snapshot = normalizedUsername
    ? loadInitialRoomKeySnapshot(normalizedUsername, sessionId)
    : null;
  const sessionKey = snapshot?.session_key || outboundGroupSession.session_key();

  return {
    algorithm: 'm.megolm.v1.aes-sha2',
    room_id: roomId,
    roomId: roomId,
    session_id: sessionId,
    sessionId: sessionId,
    session_key: sessionKey,
    sessionKey: sessionKey,
  };
}

// ⚠️ Lockata con withPeerLock, stessa chiave di getOrCreateOutboundSession
// e decryptOlmEvent per lo stesso peer (vedi commento in testa al file).
// In più: quando riusa una sessione esistente, legge la identity key dalla
// cache locale (loadPeerIdentityKey) invece di richiamare sempre
// getUserKeyBundle(), che claimerebbe inutilmente una one-time key nuova
// del peer ad ogni condivisione di room key.
//
// v1.12-R: sia il ramo "sessione esistente" sia il ramo "nuova sessione"
// leggono soltanto l'account locale (per l'identity key e per
// create_outbound), non lo mutano mai: consumano una one-time key del
// PEER, non una nostra. Il salvataggio finale ora persiste solo le
// sessioni (persistSessionsOnly), non più l'account — vedi punto 8 nel
// changelog in testa al file.
export async function encryptRoomKeyForDevice({
  account,
  username,
  targetUsername,
  sessions,
  token,
  roomKeyContent,
  payloadPersonalizzato = null,  // [palacan-n5d] se c'e', si cifra questo invece dell'm.room_key
}) {
  const normalizedRoomKey = payloadPersonalizzato ? null : normalizeRoomKeyContent(roomKeyContent);  // [palacan-n5d]

  if (
    !payloadPersonalizzato &&  // [palacan-n5d] contenuto gia' pronto (chiavi inoltrate): niente roomKeyContent
    (!normalizedRoomKey?.room_id ||
    !normalizedRoomKey?.session_id ||
    !normalizedRoomKey?.session_key)
  ) {
    throw new Error('roomKeyContent incompleto.');
  }

  const normalizedUsername = normalizeUsername(username);
  const normalizedTarget = normalizeUsername(targetUsername);
  const lockKey = peerLockKey(normalizedUsername, normalizedTarget);

  return withPeerLock(lockKey, async () => {
    const existingList = getAllSessionsForPeer(sessions, normalizedTarget);

    let session;
    let peerIdentityKey = null;
    let bundle = null;

    const scelta = existingList.length > 0 ? sessioneDaUsare(normalizedUsername, normalizedTarget, existingList) : null;  // [palacan-correzione-sessione-ricevuta] [palacan-reset-incrociati] null se sono tutte ritirate
    if (scelta) {
      session = scelta;
      peerIdentityKey = loadPeerIdentityKey(normalizedUsername, normalizedTarget);

      if (!peerIdentityKey) {
        // Cache miss (es. sessione creata prima di questo fix): fallback
        // necessario al bundle completo, questo singolo caso raro non
        // evita lo spreco di OTK ma si autocorregge dal giro successivo.
        bundle = await getUserKeyBundle(targetUsername, token);
        peerIdentityKey = bundle?.identity_key || null;
        if (peerIdentityKey) {
          savePeerIdentityKey(normalizedUsername, normalizedTarget, peerIdentityKey);
        }
      }
    } else {
      bundle = await getUserKeyBundle(targetUsername, token);

      if (!bundle?.identity_key || !bundle?.one_time_key) {
        throw new Error(`Chiavi incomplete per ${targetUsername}`);
      }

      peerIdentityKey = bundle.identity_key;

      session = new Olm.Session();
      session.create_outbound(account, bundle.identity_key, bundle.one_time_key);

      prependSessionForPeer(sessions, normalizedTarget, session);
      persistSessionsOnly(username, sessions);
      savePeerIdentityKey(normalizedUsername, normalizedTarget, peerIdentityKey);

      console.log('✅ Sessione Olm per room_key creata', {
        targetUsername: normalizedTarget,
        peerIdentityKey,
        oneTimeKeyId: bundle.one_time_key_id || null,
        sessionId: getSessionDebugId(session),
      });
    }

    if (!session) {
      throw new Error(`Impossibile ottenere sessione Olm per ${targetUsername}`);
    }

    const payload = payloadPersonalizzato ? JSON.stringify(payloadPersonalizzato) : JSON.stringify({  // [palacan-n5d]
      type: 'm.room_key',
      content: {
        algorithm: normalizedRoomKey.algorithm,
        room_id: normalizedRoomKey.room_id,
        session_id: normalizedRoomKey.session_id,
        session_key: normalizedRoomKey.session_key,
        ...(normalizedRoomKey.room_name ? { room_name: normalizedRoomKey.room_name } : {}),  // [palacan-metadati-a3.1] nome del gruppo privato
        ...(normalizedRoomKey.room_secret ? { room_secret: normalizedRoomKey.room_secret } : {}),  // [palacan-metadati-a4.1b] segreto di stanza
        ...(normalizedRoomKey.recapito ? { recapito: normalizedRoomKey.recapito } : {}),  // [palacan-metadati-a4.4c] casella di recapito
      },
    });

    // [palacan-pq4] eccezione mirata approvata: chiave di stanza nella busta post-quantum (ML-KEM) dentro Olm
    const chiusoPq = chiudiPerDispositivo({
      payload,
      io: normalizedUsername,
      curvaMia: getCurve25519Key(account),
      destinatario: normalizedTarget,
      curvaDest: peerIdentityKey,
      chiaviPq: await chiaviPqPer(normalizedTarget, token),
    });
    const encryptedRaw = encryptMessage(session, chiusoPq);
    const encrypted = normalizeOlmCipherResult(encryptedRaw);

    persistSessionsOnly(username, sessions);

    return {
      ...encrypted,
      peerIdentityKey,
      bundle,
      olmSessionId: getSessionDebugId(session),
    };
  });
}

// FIX (Fase 3 multi-device): funzione NUOVA e separata da
// encryptRoomKeyForDevice sopra (che resta intatta, mai modificata) -
// manda la room key a OGNI dispositivo attivo del destinatario, non
// solo uno. Ogni dispositivo usa una chiave di sessione SINTETICA
// (`${target}::device::${deviceId}`) nella stessa mappa `sessions` -
// un bucket separato, mai lo stesso usato da encryptRoomKeyForDevice
// per il peer "a nome utente semplice", zero rischio di collisione o
// interferenza con le sessioni 1:1 esistenti che oggi funzionano.
//
// FALLBACK CRITICO: se il destinatario non ha ancora NESSUN
// dispositivo registrato (oggi la stragrande maggioranza degli
// utenti - solo i client aggiornati stanotte mandano un device_id),
// il comportamento e' IDENTICO a prima, tramite encryptRoomKeyForDevice
// invariata. Senza questo fallback, un elenco dispositivi vuoto
// smetterebbe di mandare la room key a chiunque non abbia ancora un
// Device registrato - una regressione grave che spezzerebbe la
// consegna dei messaggi per la maggior parte degli utenti, non un
// miglioramento.
//
// Restituisce SEMPRE un array di risultati (uno per dispositivo
// raggiunto con successo), anche nel caso di fallback (array con un
// solo elemento) - il chiamante decide se/come iterare.
export async function encryptRoomKeyForAllDevices({
  account,
  username,
  targetUsername,
  sessions,
  token,
  roomKeyContent,
  payloadPersonalizzato = null,  // [palacan-n5d] se c'e', si cifra questo invece dell'm.room_key
}) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedTarget = normalizeUsername(targetUsername);

  let deviceBundles = [];
  try {
    deviceBundles = await apiService.getDeviceBundles(targetUsername, token);
  } catch (e) {
    console.warn(
      `⚠️ getDeviceBundles fallito per ${targetUsername}, fallback a bundle singolo:`,
      e
    );
    deviceBundles = [];
  }

  // [palacan-l4c3] firma incrociata: se il destinatario ha una chiave principale (consegnata o gia' ricordata),
  // ricevono la chiave SOLO i suoi dispositivi firmati. Se nessuno lo e' (o il server non risponde), niente
  // ripiego sul bundle singolo qui sotto: lo aggirerebbe.
  if (deviceBundles && deviceBundles.length > 0) {
    const filtroL4c3 = await filtraDispositiviFirmati({
      io: normalizedUsername,
      utente: normalizedTarget,
      bundles: deviceBundles,
      haVerificato: haVerificatoContatto,
      segnalaCambio: segnalaCambioIdentita,
      aggiungiNote: aggiungiChiaviNoteDelContatto,
    });
    if (filtroL4c3.ammessi.length === 0) {
      console.warn(`⚠️ [L4c] nessun dispositivo firmato di ${normalizedTarget}: chiave non mandata`);
      return [];
    }
    deviceBundles = filtroL4c3.ammessi;
  } else if (principaleDelContatto(normalizedUsername, normalizedTarget)) {
    console.warn(`⚠️ [L4c] dispositivi di ${normalizedTarget} non disponibili: con una chiave principale niente ripiego`);
    return [];
  }

  if (!deviceBundles || deviceBundles.length === 0) {
    const single = await encryptRoomKeyForDevice({
      account,
      username,
      targetUsername,
      sessions,
      token,
      roomKeyContent,
      payloadPersonalizzato,  // [palacan-n5d]
    });
    return [{ ...single, deviceId: null }];
  }

  const normalizedRoomKey = payloadPersonalizzato ? null : normalizeRoomKeyContent(roomKeyContent);  // [palacan-n5d]
  if (
    !payloadPersonalizzato &&  // [palacan-n5d] contenuto gia' pronto (chiavi inoltrate): niente roomKeyContent
    (!normalizedRoomKey?.room_id ||
    !normalizedRoomKey?.session_id ||
    !normalizedRoomKey?.session_key)
  ) {
    throw new Error('roomKeyContent incompleto.');
  }

  const chiaviPqDestinatario = await chiaviPqPer(normalizedTarget, token);  // [palacan-pq4] una volta per destinatario
  const results = [];

  for (const deviceBundle of deviceBundles) {
    const deviceId = deviceBundle.device_id;
    const deviceIdentityKey = deviceBundle.identity_key;

    if (!deviceIdentityKey) {
      console.warn(
        `⚠️ Bundle dispositivo senza identity_key per ${targetUsername}, salto`,
        deviceBundle
      );
      continue;
    }

    const deviceSessionPeerKey = `${normalizedTarget}::device::${deviceId}`;
    const lockKey = peerLockKey(normalizedUsername, deviceSessionPeerKey);

    try {
      const result = await withPeerLock(lockKey, async () => {
        const existingList = getAllSessionsForPeer(sessions, deviceSessionPeerKey);

        let session;

        const scelta = existingList.length > 0 ? sessioneDaUsare(normalizedUsername, deviceSessionPeerKey, existingList) : null;  // [palacan-pq7b] mai una ritirata
        if (scelta) {
          session = scelta;
        } else {
          if (!deviceBundle.one_time_key) {
            throw new Error(
              `OTK mancante per dispositivo ${deviceId} di ${targetUsername}`
            );
          }

          session = new Olm.Session();
          session.create_outbound(account, deviceIdentityKey, deviceBundle.one_time_key);

          prependSessionForPeer(sessions, deviceSessionPeerKey, session);
          persistSessionsOnly(username, sessions);

          console.log('✅ Sessione Olm per room_key creata (multi-device)', {
            targetUsername: normalizedTarget,
            deviceId,
            peerIdentityKey: deviceIdentityKey,
            oneTimeKeyId: deviceBundle.one_time_key_id || null,
            sessionId: getSessionDebugId(session),
          });
        }

        const payload = payloadPersonalizzato ? JSON.stringify(payloadPersonalizzato) : JSON.stringify({  // [palacan-n5d]
          type: 'm.room_key',
          content: {
            algorithm: normalizedRoomKey.algorithm,
            room_id: normalizedRoomKey.room_id,
            session_id: normalizedRoomKey.session_id,
            session_key: normalizedRoomKey.session_key,
            ...(normalizedRoomKey.room_name ? { room_name: normalizedRoomKey.room_name } : {}),  // [palacan-metadati-a3.1] nome del gruppo privato
            ...(normalizedRoomKey.room_secret ? { room_secret: normalizedRoomKey.room_secret } : {}),  // [palacan-metadati-a4.1b] segreto di stanza
            ...(normalizedRoomKey.recapito ? { recapito: normalizedRoomKey.recapito } : {}),  // [palacan-metadati-a4.4c] casella di recapito
          },
        });

        // [palacan-pq4] eccezione mirata approvata: busta post-quantum per questo dispositivo
        const chiusoPq = chiudiPerDispositivo({
          payload,
          io: normalizedUsername,
          curvaMia: getCurve25519Key(account),
          destinatario: normalizedTarget,
          curvaDest: deviceIdentityKey,
          chiaviPq: chiaviPqDestinatario,
        });
        const encryptedRaw = encryptMessage(session, chiusoPq);
        const encrypted = normalizeOlmCipherResult(encryptedRaw);

        persistSessionsOnly(username, sessions);

        return {
          ...encrypted,
          peerIdentityKey: deviceIdentityKey,
          deviceId,
          olmSessionId: getSessionDebugId(session),
        };
      });

      results.push(result);
    } catch (e) {
      console.warn(
        `⚠️ Cifratura fallita per dispositivo ${deviceId} di ${targetUsername}:`,
        e
      );
    }
  }

  return results;
}

// [palacan-n5d] Chiavi di stanza inoltrate a un ALTRO membro (utils/richiesteChiavi.js): stesso percorso della
// condivisione normale - stessa sessione Olm 1:1 (o per dispositivo), stessi dispositivi, stesso lucchetto - in UN
// solo messaggio cifrato con tutte le chiavi. Per ogni chiave c'e' il suo autore, dentro la parte cifrata.
// session_key nel formato di export_session() (exportRoomKeyForForwarding): si importa con import_session().
export async function encryptForwardedRoomKeys({
  account,
  username,
  targetUsername,
  sessions,
  token,
  roomId,
  chiavi,
}) {
  if (!roomId || !Array.isArray(chiavi) || chiavi.length === 0) {
    throw new Error('Chiavi da inoltrare mancanti.');
  }
  const elenco = chiavi.map((c) => ({
    session_id: c?.session_id || null,
    session_key: c?.session_key || null,
    creatore: c?.creatore || null,
  }));
  if (elenco.some((c) => !c.session_id || !c.session_key)) {
    throw new Error('Chiave da inoltrare incompleta.');
  }
  return encryptRoomKeyForAllDevices({
    account,
    username,
    targetUsername,
    sessions,
    token,
    roomKeyContent: null,
    payloadPersonalizzato: {
      type: 'm.forwarded_room_keys',
      content: { algorithm: 'm.megolm.v1.aes-sha2', room_id: roomId, chiavi: elenco },
    },
  });
}

// FIX (m.room_key_request/m.forwarded_room_key, recupero chiave tra
// PROPRI dispositivi - non tra persone diverse, quello resta fuori
// scope, vedi nota di sicurezza nel commit). Un dispositivo nuovo che
// non ha mai ricevuto la condivisione originale di una room key resta
// bloccato per sempre nel buffer di attesa (pendingEncryptedMessagesRef
// in App.jsx) - nessuno ricondivide retroattivamente. Queste due
// funzioni permettono a un ALTRO dei propri dispositivi, che la
// sessione ce l'ha gia', di "inoltrarla" in modo sicuro.
//
// Usa import_session/export_session di Olm - API DIVERSA da
// create()/session_key() usata ovunque nel resto del file per la
// condivisione NORMALE (chi manda i messaggi nella stanza). Qui non
// c'e' nessuna outbound session coinvolta: un dispositivo che ha gia'
// una InboundGroupSession la esporta cosi' com'e' (dal punto del
// ratchet in cui si trova) e un altro la importa identica - stesso
// principio del test funzionale reale gia' eseguito con Olm vera
// prima di scrivere questo codice (export/import round-trip, messaggi
// futuri decifrabili, forward secrecy verso ESTRANEI mai intaccata -
// qui il destinatario e' sempre e solo se stessi).

// Esportata per essere chiamata quando SI RICEVE una m.room_key_request
// da un proprio altro dispositivo e SI HA GIA' la sessione richiesta.
// Restituisce null se non abbiamo quella sessione (nulla da inoltrare).
// Cifra una room key ESPORTATA (da inoltrare) per UNO specifico
// dispositivo del chiamante stesso - non un fan-out a tutti come
// encryptRoomKeyForAllDevices (Fase 3), qui sappiamo gia' ESATTAMENTE
// quale dispositivo l'ha chiesta. Riusa lo stesso schema di chiave di
// sessione sintetica (`${self}::device::${deviceId}`) - mai in
// collisione con le chiavi usate per condividere con ALTRE persone
// (ensureRoomKeyShared esclude sempre se stessi dalla lista peer, vedi
// filtro `u.username !== username` in App.jsx: questa combinazione
// self+deviceId non e' mai usata altrove).
export async function encryptForwardedRoomKeyForDevice({
  account,
  username,
  targetDeviceId,
  targetIdentityKey,
  targetOneTimeKey,
  sessions,
  roomId,
  sessionId,
  exportedSessionKey,
  token = null,  // [palacan-pq4] per prelevare le chiavi post-quantum del proprio dispositivo
}) {
  if (!targetDeviceId || !targetIdentityKey) {
    throw new Error('Dati dispositivo destinatario incompleti.');
  }

  const normalizedUsername = normalizeUsername(username);
  const deviceSessionPeerKey = `${normalizedUsername}::device::${targetDeviceId}`;
  const lockKey = peerLockKey(normalizedUsername, deviceSessionPeerKey);

  return withPeerLock(lockKey, async () => {
    const existingList = getAllSessionsForPeer(sessions, deviceSessionPeerKey);

    let session;

    const scelta = existingList.length > 0 ? sessioneDaUsare(normalizedUsername, deviceSessionPeerKey, existingList) : null;  // [palacan-pq7b] mai una ritirata
    if (scelta) {
      session = scelta;
    } else {
      if (!targetOneTimeKey) {
        throw new Error(`OTK mancante per dispositivo ${targetDeviceId}`);
      }

      session = new Olm.Session();
      session.create_outbound(account, targetIdentityKey, targetOneTimeKey);

      prependSessionForPeer(sessions, deviceSessionPeerKey, session);
      persistSessionsOnly(username, sessions);

      console.log('✅ Sessione Olm per forwarded_room_key creata', {
        targetDeviceId,
        peerIdentityKey: targetIdentityKey,
        sessionId: getSessionDebugId(session),
      });
    }

    const payload = JSON.stringify({
      type: 'm.forwarded_room_key',
      content: {
        algorithm: 'm.megolm.v1.aes-sha2',
        room_id: roomId,
        session_id: sessionId,
        session_key: exportedSessionKey,
      },
    });

    // [palacan-pq4] eccezione mirata approvata: busta post-quantum anche tra i propri dispositivi
    const chiusoPq = chiudiPerDispositivo({
      payload,
      io: normalizedUsername,
      curvaMia: getCurve25519Key(account),
      destinatario: normalizedUsername,
      curvaDest: targetIdentityKey,
      chiaviPq: await chiaviPqPer(normalizedUsername, token),
    });
    const encryptedRaw = encryptMessage(session, chiusoPq);
    const encrypted = normalizeOlmCipherResult(encryptedRaw);

    persistSessionsOnly(username, sessions);

    return {
      ...encrypted,
      peerIdentityKey: targetIdentityKey,
      olmSessionId: getSessionDebugId(session),
    };
  });
}

export function exportRoomKeyForForwarding(inboundGroupSessions, sessionId) {
  const session = inboundGroupSessions?.[sessionId];
  if (!session) return null;

  try {
    return session.export_session();
  } catch (e) {
    console.warn(`⚠️ Esportazione sessione fallita per session_id=${sessionId}:`, e);
    return null;
  }
}

// Esportata per essere chiamata quando SI RICEVE una m.forwarded_room_key
// da un proprio altro dispositivo (risposta a una richiesta fatta in
// precedenza). A differenza di receiveRoomKeyEvent (che usa .create()
// per una chiave condivisa dall'inizio), questa usa .import_session()
// perche' la sessione arriva gia' avviata da un punto del ratchet a
// meta' strada - API diversa, scopo diverso, MAI intercambiabili.
// Idempotente come receiveRoomKeyEvent: se la sessione esiste gia'
// (es. arrivata nel frattempo per altra via), non fa nulla.
export function receiveForwardedRoomKey({
  username,
  roomKeyContent,
  inboundGroupSessions,
}) {
  if (!username) throw new Error('username mancante.');

  const normalized = normalizeRoomKeyContent(roomKeyContent);
  if (!normalized?.session_id || !normalized?.session_key) {
    throw new Error('roomKeyContent incompleto (forwarded).');
  }

  let session = inboundGroupSessions[normalized.session_id];
  if (session) {
    return session;
  }

  session = new Olm.InboundGroupSession();
  session.import_session(normalized.session_key);

  inboundGroupSessions[normalized.session_id] = session;
  saveInboundGroupSessions(username, inboundGroupSessions);

  return session;
}

export function receiveRoomKeyEvent({
  username,
  roomKeyContent,
  inboundGroupSessions,
}) {
  if (!username) throw new Error('username mancante.');

  const normalized = normalizeRoomKeyContent(roomKeyContent);
  if (!normalized?.session_id || !normalized?.session_key) {
    throw new Error('roomKeyContent incompleto.');
  }

  let session = inboundGroupSessions[normalized.session_id];
  if (session) {
    return session;
  }

  session = new Olm.InboundGroupSession();
  session.create(normalized.session_key);

  inboundGroupSessions[normalized.session_id] = session;
  saveInboundGroupSessions(username, inboundGroupSessions);

  return session;
}

export function encryptGroupMessage(outboundGroupSession, payload) {
  if (!outboundGroupSession) {
    throw new Error('Outbound group session mancante.');
  }

  const conOra = aggiungiOra(aggiungiAttestato(payload, outboundGroupSession));  // [palacan-metadati-3.4a] ora esatta dentro il contenuto cifrato [palacan-n5e] + attestato del creatore
  const plainText = aggiungiPadding(typeof conOra === 'string' ? conOra : JSON.stringify(conOra));  // [palacan-metadati-2e] lunghezza allo scaglione prima di cifrare
  return outboundGroupSession.encrypt(plainText);
}

export function decryptGroupMessage(inboundGroupSession, cipherText) {
  if (!inboundGroupSession) {
    throw new Error('Inbound group session mancante.');
  }

  const decrypted = inboundGroupSession.decrypt(cipherText);

  return {
    plaintext: decrypted?.plaintext ?? decrypted,
    messageIndex: decrypted?.message_index ?? decrypted?.messageIndex ?? null,
  };
}

export function buildMegolmEncryptedPayload({
  roomId,
  sessionId,
  cipherText,
}) {
  return {
    algorithm: 'm.megolm.v1.aes-sha2',
    room_id: roomId,
    roomId,
    session_id: sessionId,
    sessionId,
    ciphertext: cipherText,
    cipher_body: cipherText,
  };
}

export function parseMegolmPayload(message) {
  if (!message || typeof message !== 'object') return null;

  return {
    algorithm: message.algorithm || null,
    roomId: message.room_id || message.roomId || null,
    room_id: message.room_id || message.roomId || null,
    sessionId: message.session_id || message.sessionId || null,
    session_id: message.session_id || message.sessionId || null,
    ciphertext: message.ciphertext || message.cipher_body || null,
    cipher_body: message.cipher_body || message.ciphertext || null,
  };
}

/* ==========================================================================
   KEY BACKUP — cifratura/decifratura lato client, zero-knowledge lato server
   ------------------------------------------------------------------------
   Riusa gli helper già definiti in cima al file (accountStorageKey,
   sessionsStorageKey, inboundGroupSessionsStorageKey,
   peerIdentityKeyStorageKey, normalizeUsername, safeLocalStorageGet,
   safeLocalStorageSet) — nessuna duplicazione, nessuna riga del layer
   esistente sopra è stata toccata.

   Il server riceve SOLO encrypted_blob (bytes cifrati AES-GCM) + salt
   (non segreto, serve solo contro rainbow table) + kdf_iterations.
   Non riceve mai la passphrase né la chiave derivata: la cifratura e la
   decifratura avvengono sempre e solo qui, lato client.
   ========================================================================== */

const ARGON2_TIME_COST = 3;
const ARGON2_MEMORY_COST_KIB = 65536;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32;
const LEGACY_PBKDF2_THRESHOLD = 1000;

function base64FromBytes(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function bytesFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Deriva una chiave AES-256-GCM dalla passphrase di backup usando PBKDF2.
// Il salt va generato random (16 byte) al primo backup e riusato sempre
// per lo stesso utente — cambiare salt invaliderebbe backup precedenti.
async function deriveBackupKeyArgon2id(passphrase, saltBytes, timeCost = ARGON2_TIME_COST) {
  const derivedHex = await argon2id({
    password: passphrase,
    salt: saltBytes,
    parallelism: ARGON2_PARALLELISM,
    iterations: timeCost,
    memorySize: ARGON2_MEMORY_COST_KIB,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: 'hex',
  });

  const keyBytes = new Uint8Array(
    derivedHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
  );

  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

async function deriveBackupKeyPBKDF2Legacy(passphrase, saltBytes, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Raccoglie tutto il materiale crittografico locale di un utente in un
// unico oggetto serializzabile, pronto per essere cifrato. Include:
// - account Olm (pickled)
// - sessioni 1:1 (pickled, per peer)
// - inbound group sessions Megolm (pickled, per session_id)
// - cache identity key dei peer, per non dover ri-fare key bundle lookup
//   dopo un recupero (coerente con la cache introdotta da questo fix)
// NON include le outbound group sessions per stanza (megolm_outbound_*):
// sono ricreabili automaticamente al bisogno da getOrCreateOutboundGroupSession,
// e mantenerle sincronizzate nel backup aggiungerebbe complessità (una key
// per ogni stanza) senza vero beneficio: perderle nel caso più raro (mai
// fatto login altrove nel frattempo) significa solo iniziare una nuova
// sessione Megolm outbound, non perdere niente in lettura.
export function buildBackupBundlePayload(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) throw new Error('Username mancante per il backup.');

  const accountPickled = safeLocalStorageGet(accountStorageKey(normalizedUsername));
  const sessionsPickled = safeLocalStorageGet(sessionsStorageKey(normalizedUsername));
  const inboundGroupPickled = safeLocalStorageGet(
    inboundGroupSessionsStorageKey(normalizedUsername)
  );
  const peerIdentityKeys = safeLocalStorageGet(
    peerIdentityKeyStorageKey(normalizedUsername)
  );

  return {
    version: 1,
    username: normalizedUsername,
    account: accountPickled ? chiaviPickle.perBackup(Olm.Account, accountPickled) : null,  // [palacan-9a] formato di sempre: si recupera da ogni browser
    sessions: jsonPerBackup(chiaviPickle, Olm.Session, sessionsPickled),  // [palacan-9a]
    inboundGroupSessions: jsonPerBackup(chiaviPickle, Olm.InboundGroupSession, inboundGroupPickled),  // [palacan-9a]
    peerIdentityKeys: peerIdentityKeys || null,
    creatoriChiavi: safeLocalStorageGet(`palacan_creatori_chiavi_${normalizedUsername}`) || null,  // [palacan-metadati-3.1]
    ...(safeLocalStorageGet(`palacan_chiavi_firma_${normalizedUsername}`)  // [palacan-n5e] chiavi di firma imparate via Olm (solo se ce ne sono)
      ? { chiaviFirma: safeLocalStorageGet(`palacan_chiavi_firma_${normalizedUsername}`) } : {}),
    ...(firmaPqPerBackup(normalizedUsername) ? { firmaPq: firmaPqPerBackup(normalizedUsername) } : {}),  // [palacan-pq5b] seme ML-DSA-65 dell'account (solo se pronto)
    ...(chiavePrincipalePerBackup(normalizedUsername) ? { chiavePrincipale: chiavePrincipalePerBackup(normalizedUsername) } : {}),  // [palacan-l4c2] solo quella ATTUALE dell'account
  };
}

// Cifra il bundle con AES-GCM usando una chiave derivata dalla passphrase.
// Ritorna esattamente il payload da mandare a PUT /keys/backup.
// Genera un salt NUOVO solo se non ne viene passato uno esistente
// (riusare il salt esistente evita di dover re-inserire una nuova
// passphrase coerente ad ogni singolo aggiornamento del backup).
export async function encryptBackupBundle(bundle, passphrase, existingSaltBase64 = null) {
  if (passphrase && typeof passphrase === 'object' && passphrase.tipo === 'chiave-backup') return cifraBundleConChiave(bundle, passphrase);  // [palacan-n4] chiave gia' ricavata dalla passphrase
  /* ── FIX (audit sicurezza): soglia alzata da 8 a 12 caratteri, e
     aggiunto un controllo minimo di varieta'. Argon2id rende ogni
     singolo tentativo genuinamente costoso anche offline, ma non
     protegge da un dizionario: una passphrase come "password1" o
     "12345678" verrebbe comunque provata per prima. Non richiediamo
     maiuscole/simboli obbligatori (una passphrase di backup e' pensata
     per essere piu' lunga ma piu' facile da ricordare - stile "frase",
     non "password complessa"), solo che non sia banalmente ripetitiva
     o puramente numerica. ─────────────────────────────────────────── */
  if (!passphrase || passphrase.length < 12) {
    throw new Error('La passphrase di backup deve avere almeno 12 caratteri.');
  }
  if (/^[0-9]+$/.test(passphrase)) {
    throw new Error('La passphrase di backup non può essere composta solo da numeri.');
  }
  if (/^(.)\1+$/.test(passphrase)) {
    throw new Error('La passphrase di backup non può essere un carattere ripetuto.');
  }

  const saltBytes = existingSaltBase64
    ? bytesFromBase64(existingSaltBase64)
    : crypto.getRandomValues(new Uint8Array(16));

  const key = await deriveBackupKeyArgon2id(passphrase, saltBytes, ARGON2_TIME_COST);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(bundle));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return {
    encrypted_blob: base64FromBytes(combined),
    salt: base64FromBytes(saltBytes),
    kdf_iterations: ARGON2_TIME_COST,
  };
}

// Decifra il blob scaricato dal server e ritorna il bundle originale.
// Lancia un errore se la passphrase è sbagliata (AES-GCM fallisce
// l'autenticazione) — da intercettare lato UI per mostrare "passphrase
// errata" e permettere un nuovo tentativo.
export async function decryptBackupBundle({ encrypted_blob, salt, kdf_iterations }, passphrase) {
  if (passphrase && typeof passphrase === 'object' && passphrase.tipo === 'chiave-backup') return decifraBundleConChiave({ encrypted_blob, salt, kdf_iterations }, passphrase);  // [palacan-n6] chiave gia' pronta
  const saltBytes = bytesFromBase64(salt);
  const isLegacyPBKDF2 = (kdf_iterations || 0) >= LEGACY_PBKDF2_THRESHOLD;
  const key = isLegacyPBKDF2
    ? await deriveBackupKeyPBKDF2Legacy(passphrase, saltBytes, kdf_iterations)
    : await deriveBackupKeyArgon2id(passphrase, saltBytes, kdf_iterations || ARGON2_TIME_COST);

  const combined = bytesFromBase64(encrypted_blob);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  let plaintextBuffer;
  try {
    plaintextBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch (e) {
    throw new Error('Passphrase di backup errata o backup corrotto.');
  }

  const dec = new TextDecoder();
  const json = dec.decode(plaintextBuffer);
  return JSON.parse(json);
}

// Ripristina un bundle decifrato in localStorage per l'username indicato.
// Dopo questa chiamata, loadOlmAccount/loadInboundGroupSessions funzionano
// esattamente come se le chiavi non fossero mai state perse.
//
// v1.9-P: bundle.sessions (le sessioni Olm 1:1) NON viene più scritto in
// localStorage. È uno snapshot fermo al momento dell'ultimo upload del
// backup: nel frattempo il peer con cui si conversava può aver fatto
// avanzare il ratchet della sua sessione, rendendo quella salvata nel
// backup incompatibile. Riusarla produce l'errore osservato in produzione
// ("Messaggio Olm non decryptabile con sessioni esistenti e non è
// pre-key", messageType 1 su una sessione disallineata). Rimuoviamo quindi
// esplicitamente la chiave locale corrispondente: ogni peer verrà
// ristabilito da zero al primo scambio, sempre tramite un messaggio
// pre-key (tipo 0), che è sempre decryptabile. Nessun messaggio storico va
// perso in questo modo: quelli restano leggibili tramite le inbound group
// session Megolm, ripristinate normalmente qui sotto.
export function restoreBackupBundleToLocalStorage(bundle) {
  if (!bundle || !bundle.username) {
    throw new Error('Bundle di backup non valido.');
  }

  const normalizedUsername = normalizeUsername(bundle.username);

  if (bundle.account) {
    safeLocalStorageSet(accountStorageKey(normalizedUsername), chiaviPickle.daBackupOppureCosi(Olm.Account, bundle.account));  // [palacan-9a] dal formato del backup alla chiave del dispositivo
    segnaOtkDaSostituire(normalizedUsername);  // [palacan-pq7] copia dell'account: le OTK sul server vanno sostituite
  }

  // Non ripristiniamo bundle.sessions: vedi commento sopra la funzione.
  safeLocalStorageRemove(sessionsStorageKey(normalizedUsername));

  if (bundle.inboundGroupSessions) {
    safeLocalStorageSet(
      inboundGroupSessionsStorageKey(normalizedUsername),
      jsonDaBackup(chiaviPickle, Olm.InboundGroupSession, bundle.inboundGroupSessions)  // [palacan-9a]
    );
  }
  if (bundle.peerIdentityKeys) {
    safeLocalStorageSet(
      peerIdentityKeyStorageKey(normalizedUsername),
      bundle.peerIdentityKeys
    );
  }
  if (bundle.creatoriChiavi) {  // [palacan-metadati-3.1] registro dei creatori delle chiavi di stanza
    safeLocalStorageSet(`palacan_creatori_chiavi_${normalizedUsername}`, bundle.creatoriChiavi);
  }
  if (bundle.chiaviFirma) {  // [palacan-n5e] chiavi di firma imparate via Olm
    safeLocalStorageSet(`palacan_chiavi_firma_${normalizedUsername}`, bundle.chiaviFirma);
  }
  if (bundle.firmaPq) ripristinaFirmaPqDaBackup(normalizedUsername, bundle.firmaPq);  // [palacan-pq5b] si adotta se e' dello stesso account
  if (bundle.chiavePrincipale) ripristinaChiavePrincipaleDaBackup(normalizedUsername, bundle.chiavePrincipale);  // [palacan-l4c2] si adotta solo se e' quella attuale
}

/* ==========================================================================
   UTIL
   ========================================================================== */

export async function getIdentityKeyFingerprint(identityKey) {
  if (!identityKey) return 'N/A';

  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(identityKey));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  return (hex.slice(0, 16).match(/.{1,4}/g) || []).join(':');
}

// FIX (audit sicurezza approfondito "deve essere perfetta, quasi
// migliore di Signal" - nuova funzionalita', non un bug): TOFU rileva
// un cambio di identity key SOLO dopo il primo contatto - se un
// backend compromesso sostituisse identity key/OTK al PRIMISSIMO
// scambio (prima che esista una storia da confrontare), nessun
// meccanismo esistente se ne accorgerebbe. Stesso identico limite di
// Signal di base, risolto li' con i "numeri di sicurezza": un codice
// derivato dalle chiavi di identita' di ENTRAMBI gli utenti, che loro
// possono confrontare fuori banda (di persona, per telefono) per
// avere la certezza matematica che nessuno si sia messo in mezzo -
// un MITM attivo dovrebbe presentare una identity key diversa ad
// ALMENO uno dei due lati, cambiando il numero che vedrebbero.
//
// Calcolato interamente lato client (mai il server, per coerenza con
// tutto il resto dell'architettura E2EE) - ordine canonico per
// username (minuscolo) cosi' ENTRAMBI i lati derivano esattamente lo
// stesso numero, indipendentemente da chi lo calcola. SHA-256 via Web
// Crypto (stessa libreria gia' usata sopra per il fingerprint
// singolo), convertito in gruppi di cifre leggibili in stile Signal.
// v-next (safety number): persistenza dello stato "verificato" tra un
// utente e un contatto specifico - legata alle chiavi ESATTE presenti
// al momento della verifica (via numeroCalcolato stesso, che le
// incorpora entrambe attraverso l'hash), non solo ai nomi utente. Se
// una delle due identity key cambia (nuovo dispositivo, o un TOFU
// break reale), il numero cambia, la corrispondenza con quello salvato
// fallisce, e la verifica risulta automaticamente NON piu' valida -
// niente puo' restare "verificato" per errore contro una chiave
// diversa da quella controllata davvero.
function safetyNumberVerificationStorageKey(username, peerUsername) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPeer = normalizeUsername(peerUsername);
  return `palacan_safety_number_verified_${normalizedUsername}_${normalizedPeer}`;
}

// [palacan-l4a] un numero verificato per ogni dispositivo del contatto (al massimo 20)
function numeriVerificatiStorageKey(username, peerUsername) {
  return `palacan_safety_numbers_verified_list_${normalizeUsername(username)}_${normalizeUsername(peerUsername)}`;
}

function caricaNumeriVerificati(username, peerUsername) {
  const raw = safeLocalStorageGet(numeriVerificatiStorageKey(username, peerUsername));
  if (!raw) return [];
  const lista = safeJsonParse(raw, []);
  return Array.isArray(lista) ? lista.filter((x) => typeof x === 'string' && x) : [];
}

export function saveSafetyNumberVerified(username, peerUsername, numeroVerificato) {
  try {
    safeLocalStorageSet(
      safetyNumberVerificationStorageKey(username, peerUsername),
      numeroVerificato
    );
    // [palacan-l4a] si aggiunge alla lista: la verifica degli altri dispositivi resta
    if (numeroVerificato) {
      const lista = caricaNumeriVerificati(username, peerUsername);
      if (!lista.includes(numeroVerificato)) lista.push(numeroVerificato);
      while (lista.length > 20) lista.shift();
      safeLocalStorageSet(numeriVerificatiStorageKey(username, peerUsername), JSON.stringify(lista));
    }
  } catch (e) {
    console.error('❌ Salvataggio stato verificato safety number fallito:', e);
  }
}

export function isSafetyNumberVerified(username, peerUsername, numeroAttuale) {
  try {
    const salvato = safeLocalStorageGet(safetyNumberVerificationStorageKey(username, peerUsername));
    if (Boolean(salvato) && salvato === numeroAttuale) return true;
    // [palacan-l4a] verificato per uno qualsiasi dei dispositivi del contatto
    return Boolean(numeroAttuale) && caricaNumeriVerificati(username, peerUsername).includes(numeroAttuale);
  } catch (e) {
    return false;
  }
}

export async function computeSafetyNumber(usernameA, identityKeyA, usernameB, identityKeyB) {
  if (!usernameA || !identityKeyA || !usernameB || !identityKeyB) {
    return null;
  }

  // Ordine canonico: chi ha lo username alfabeticamente prima va
  // sempre per primo nella concatenazione, indipendentemente da chi
  // sia "io" e chi sia "il contatto" - senza questo, i due lati
  // calcolerebbero hash diversi dello stesso pacchetto di chiavi.
  const normalizedA = String(usernameA).trim().toLowerCase();
  const normalizedB = String(usernameB).trim().toLowerCase();

  const [primoUsername, primaChiave, secondoUsername, secondaChiave] =
    normalizedA <= normalizedB
      ? [normalizedA, identityKeyA, normalizedB, identityKeyB]
      : [normalizedB, identityKeyB, normalizedA, identityKeyA];

  const testoDaFirmare = `${primoUsername}|${primaChiave}|${secondoUsername}|${secondaChiave}`;

  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(testoDaFirmare));
  const bytes = new Uint8Array(hashBuffer);

  // 6 gruppi da 5 cifre decimali (30 cifre totali) - stile Signal,
  // sufficiente entropia per un confronto significativo restando
  // pratico da leggere/confrontare a voce. Ogni gruppo usa 2 byte
  // dell'hash interpretati come intero a 16 bit, modulo 100000.
  const gruppi = [];
  for (let i = 0; i < 6; i++) {
    const valore16bit = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
    gruppi.push(String(valore16bit % 100000).padStart(5, '0'));
  }

  return gruppi.join(' ');
}

export function safeParseOlmPayload(plaintext) {
  if (typeof plaintext !== 'string') return plaintext;
  return rimuoviPadding(safeJsonParse(plaintext, plaintext));  // [palacan-metadati-2e] via il riempimento
}

export function freeOlmAccount(account) {
  try {
    account?.free?.();
  } catch (_) {}
}

/* ── FIX use-after-free WASM al re-login stessa scheda ──────────────────
   freeOlmAccount() sopra libera SOLO l'oggetto passato, ma non tocca mai
   olmAccountCache (mappa a livello di modulo: username -> { account,
   pickledSnapshot }). Se dopo un logout si rifà login con lo stesso
   username nella stessa scheda, loadOlmAccount() trova la entry in cache
   con pickled snapshot invariato e restituisce l'oggetto WASM già
   liberato: crash sincrono use-after-free, blocca l'intero thread.
   Questa funzione fa la stessa pulizia di cache di clearOlmAccount() ma
   SENZA la safeLocalStorageRemove(): il pickled account resta su disco,
   è l'identità crittografica persistente dell'utente e va preservata a
   ogni logout normale (clearOlmAccount è per un hard reset dispositivo,
   caso diverso). ─────────────────────────────────────────────────────── */
export function invalidateOlmAccountCache(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return;
  const cached = olmAccountCache.get(normalizedUsername);
  if (cached) {
    freeAccountSafely(cached.account);
    olmAccountCache.delete(normalizedUsername);
  }
}

export function freeGroupSessionsMap(sessionsMap) {
  if (!sessionsMap) return;

  for (const session of Object.values(sessionsMap)) {
    try {
      session?.free?.();
    } catch (_) {}
  }
}

// [palacan-n4] Chiave del backup ricavata UNA volta dalla passphrase (Argon2id, sale nuovo) e NON esportabile: si
// conserva sul dispositivo (utils/chiaveBackup.js) cosi' il backup continua dopo un ricaricamento della pagina,
// senza tenere la passphrase. encryptBackupBundle la accetta al posto della passphrase: stesso formato del backup
// (si decifra con la passphrase, come sempre).
export async function preparaChiaveBackup(passphrase, saltBase64 = null) {  // [palacan-n6] sale facoltativo: quello del backup del server
  if (!passphrase || typeof passphrase !== 'string') throw new Error('Passphrase di backup mancante.');
  const saltBytes = saltBase64 ? bytesFromBase64(saltBase64) : crypto.getRandomValues(new Uint8Array(16));  // [palacan-n6]
  const chiave = await deriveBackupKeyArgon2id(passphrase, saltBytes, ARGON2_TIME_COST);
  return { tipo: 'chiave-backup', chiave, salt: base64FromBytes(saltBytes), kdf_iterations: ARGON2_TIME_COST };
}

async function cifraBundleConChiave(bundle, pronta) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    pronta.chiave,
    new TextEncoder().encode(JSON.stringify(bundle))
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return { encrypted_blob: base64FromBytes(combined), salt: pronta.salt, kdf_iterations: pronta.kdf_iterations };
}

// [palacan-n6] Apre il backup con la chiave gia' pronta (preparaChiaveBackup), senza rifare Argon2id. Serve a unire il
// backup del server con quello del dispositivo prima di ricaricarlo. Se il backup e' cifrato con un altro sale la
// chiave non puo' aprirlo: errore con codice SALE_DIVERSO (serve la passphrase).
async function decifraBundleConChiave({ encrypted_blob, salt, kdf_iterations }, pronta) {
  if (!pronta || !pronta.chiave || salt !== pronta.salt || Number(kdf_iterations) !== Number(pronta.kdf_iterations)) {
    const e = new Error('Backup cifrato con un altro sale: serve la passphrase.');
    e.codice = 'SALE_DIVERSO';
    throw e;
  }
  const combined = bytesFromBase64(encrypted_blob);
  let chiaro;
  try {
    chiaro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, pronta.chiave, combined.slice(12));
  } catch (e) {
    throw new Error('Passphrase di backup errata o backup corrotto.');
  }
  return JSON.parse(new TextDecoder().decode(chiaro));
}
