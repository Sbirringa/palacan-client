import { eGruppoPrivato, imparaNomeStanza, nomeLocale } from './utils/nomiStanze';  // [palacan-metadati-a3.1]
import { specchia } from './utils/specchioDati';  // [palacan-metadati-a4.3b]
import { registraStanzaSegreto } from './utils/segretiStanze';  // [palacan-metadati-a4.1b]
// src/apiService.js
//
// v1.5 rispetto alla v1.4: AGGIUNTA searchContacts(), mancante rispetto
// agli endpoint reali esposti da routes/contacts.py. La ricerca utenti
// generica (searchUsers → GET /users/search?q=...) resta invariata e
// continua a esistere: searchContacts è una funzione NUOVA e SEPARATA,
// che punta all'endpoint dedicato ai contatti, con un parametro query
// diverso (query, non q). Nessuna funzione preesistente è stata
// rimossa, rinominata o modificata nel suo comportamento.
//
// Endpoint reale (routes/contacts.py):
//   GET /contacts/search?query=...
//
// v1.4 rispetto alla v1.3: AGGIUNTA sezione INVITE LINKS (link di invito
// pubblico, monouso, con password opzionale a due fattori) e relativa
// persistenza del token lato client (pending_invite_token). Nessuna
// funzione preesistente è stata rimossa, rinominata o modificata nel suo
// comportamento. Nuovi endpoint reali attesi lato backend
// (routes/invite_links.py):
//   POST /invite-links/              (autenticato)  body: { room_name?, password? }
//   GET  /invite-links/:token        (pubblico)
//   POST /invite-links/:token/redeem (autenticato)  body: { password? }
//
// v1.3 rispetto alla v1.2: FIX bug "Password errata" mostrato erroneamente
// quando in realtà il token JWT è scaduto (es. dopo ~8 ore di sessione
// inattiva). Prima, verifyRoomPassword() catturava QUALSIASI errore
// (compreso un 401 di sessione scaduta) e lo trasformava in `return false`,
// indistinguibile da un vero rifiuto password lato server. Ora:
//   - verifyRoomPassword() non inghiotte più l'errore: un fallimento di
//     rete/auth risale al chiamante con error.status/error.isAuthExpired
//     valorizzati; SOLO una risposta 200 con access !== true è un vero
//     "password errata".
//   - Aggiunto un meccanismo centralizzato onAuthExpired(callback): ogni
//     risposta HTTP con status 401, su QUALSIASI endpoint (non solo
//     verify_access), notifica l'handler registrato da App.jsx, che può
//     così forzare un logout pulito con un messaggio corretto invece di
//     lasciare che il 401 venga scambiato per un errore di dominio.
// Nessuna firma di funzione esistente è stata rimossa o rinominata.
// Zero modifiche a keys/rooms/messages/E2EE al di fuori di questi due punti.
//
// v1.2 rispetto alla v1.1: ALLINEAMENTO agli endpoint REALI esposti da
// routes/contacts.py e routes/notifications.py (verificati riga per riga
// sul backend). La v1.1 usava endpoint "proposti" mai confermati che non
// esistevano lato server. Nessuna funzione fuori dalla sezione
// CONTACT REQUESTS / NOTIFICATIONS è stata toccata. Zero modifiche a
// keys/rooms/messages/E2EE.
//
// Endpoint realmente esposti dal backend (fonte: routes/contacts.py,
// routes/notifications.py):
//   GET  /contacts/search?query=...
//   POST /contacts/request          body: { username }
//   GET  /contacts/pending          (richieste ricevute, pending)
//   GET  /contacts/sent             (richieste inviate, storico completo)
//   POST /contacts/accept           body: { username }  <-- per USERNAME, non id
//   POST /contacts/reject           body: { username }  <-- per USERNAME, non id
//   GET  /contacts/
//   GET  /notifications/?days=7
//   POST /notifications/:id/read
//
// Cambi rispetto a v1.1:
//  - getIncomingContactRequests: ora chiama GET /contacts/pending
//    (prima chiamava un endpoint /contacts/requests/incoming inesistente).
//  - getSentContactRequests: ora chiama GET /contacts/sent
//    (prima /contacts/requests/sent, inesistente).
//  - acceptContactRequest / rejectContactRequest: firma cambiata da
//    (requestId, token) a (username, token) — il backend accetta/rifiuta
//    per username nel body, non per id nell'URL. Chi le chiamava con un id
//    va aggiornato per passare lo username del mittente.
//  - getContacts / getNotifications: aggiunto slash finale nell'endpoint
//    per evitare redirect 307 (le route sono definite come "/" sotto il
//    prefix del router FastAPI).
//  - normalizeContactRequest: aggiunta lettura di receiver_username
//    (campo usato realmente da GET /contacts/sent), mancava nella v1.1.
//
// Lasciate INVARIATE, per non rompere nulla:
//  - getContactRequests(_token) → stub storico, ritorna [].
//  - sendContactRequest / sendFriendRequest → già corrette in v1.1,
//    puntano a POST /contacts/request con { username }, che è quello che
//    il backend si aspetta davvero. Nessuna modifica.

import { getSecureItem, setSecureItem } from './secureStorage';
import { segretoConfermato, gettoneDa } from './utils/segretiStanze';  // [palacan-metadati-a4.4b]
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

if (!API_URL) {
  throw new Error('VITE_API_URL non configurata');
}

const DEFAULT_JSON_HEADERS = {
  Accept: 'application/json',
};

/* ==========================================================================
   AUTH EXPIRATION — notifica centralizzata (v1.3)
   ------------------------------------------------------------------------
   App.jsx si registra con onAuthExpired(callback) una sola volta al mount
   (o comunque prima di qualunque chiamata autenticata). Ogni volta che una
   risposta HTTP arriva con status 401 — su QUALSIASI endpoint, non solo
   verify_access — viene notificato questo handler globale, oltre a
   propagare comunque l'eccezione al chiamante originale (che può quindi
   scegliere se gestirla localmente o lasciare che sia l'handler globale a
   occuparsene, es. forzando un logout pulito con messaggio "sessione
   scaduta" invece di un errore di dominio fuorviante).
   ========================================================================== */

let authExpiredHandler = null;

export function onAuthExpired(handler) {
  authExpiredHandler = typeof handler === 'function' ? handler : null;
}

/* ── nuovo: refresh token — stesso schema di onAuthExpired sopra.
   App.jsx si registra con onTokenRefreshed(callback) una sola volta al
   mount, cosi' quando fetchWithAuth rinnova in silenzio un access_token
   scaduto (vedi piu' sotto), il ref/stato del token in App.jsx viene
   aggiornato subito - altrimenti le chiamate successive userebbero
   ancora il vecchio token gia' scaduto, dato che fetchWithAuth riceve
   il token come PARAMETRO dal chiamante, non lo legge da solo. ────── */
let tokenRefreshedHandler = null;

export function onTokenRefreshed(handler) {
  tokenRefreshedHandler = typeof handler === 'function' ? handler : null;
}

function notifyTokenRefreshed(newAccessToken, newRefreshToken) {
  if (tokenRefreshedHandler) {
    try {
      tokenRefreshedHandler(newAccessToken, newRefreshToken);
    } catch (_) {
      // Stesso principio di notifyAuthExpired: un handler difettoso non
      // deve rompere il flusso di rinnovo.
    }
  }
}

/* Un solo rinnovo alla volta condiviso tra chiamate concorrenti: se piu'
   richieste scadono nello stesso momento (comune quando il token scade
   con piu' chiamate in corso), tutte devono aspettare LO STESSO
   rinnovo invece di farne uno ciascuna - il refresh token ruota a ogni
   uso, quindi rinnovi concorrenti indipendenti farebbero fallire tutti
   tranne il primo, causando un logout non necessario anche se il
   rinnovo vero e proprio e' riuscito. */
let refreshInFlight = null;

export async function refreshAccessToken() {
  // FIX (cifratura dati di sessione, audit sicurezza): token e
  // refresh_token erano salvati in chiaro in localStorage - ora cifrati
  // con AES-GCM (vedi secureStorage.js), chiave separata da PICKLE_KEY.
  const storedRefreshToken = await getSecureItem('refresh_token');
  if (!storedRefreshToken) {
    throw new Error('Nessun refresh token disponibile');
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: {
            ...DEFAULT_JSON_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: storedRefreshToken }),
        });
        const data = await handleResponse(response);

        await setSecureItem('token', data.access_token);
        await setSecureItem('refresh_token', data.refresh_token);
        notifyTokenRefreshed(data.access_token, data.refresh_token);

        return data.access_token;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

function notifyAuthExpired(error) {
  if (authExpiredHandler) {
    try {
      authExpiredHandler(error);
    } catch (_) {
      // Non lasciare che un handler difettoso rompa il flusso di richiesta
      // originale: l'errore vero risale comunque al chiamante.
    }
  }
}

const normalizeRoomId = (value) => {
  if (value === null || value === undefined) {
    throw new Error('roomId mancante');
  }

  if (typeof value === 'object') {
    const extracted = value.id ?? value.room_id ?? value.roomId ?? null;
    if (!extracted) {
      throw new Error('roomId non valido: oggetto senza id');
    }
    return String(extracted).trim();
  }

  const normalized = String(value).trim();

  if (!normalized) {
    throw new Error('roomId vuoto');
  }

  return normalized;
};

// v1.1 Step 5: helper generico per normalizzare id (richieste, notifiche).
// Stesso identico comportamento di normalizeRoomId ma con nome/messaggi
// generici — additivo, non sostituisce normalizeRoomId in nessun punto
// esistente.
const normalizeEntityId = (value, label = 'id') => {
  if (value === null || value === undefined) {
    throw new Error(`${label} mancante`);
  }

  if (typeof value === 'object') {
    const extracted = value.id ?? null;
    if (!extracted) {
      throw new Error(`${label} non valido: oggetto senza id`);
    }
    return String(extracted).trim();
  }

  const normalized = String(value).trim();

  if (!normalized) {
    throw new Error(`${label} vuoto`);
  }

  return normalized;
};

// v1.2: helper per normalizzare uno username (usato da accept/reject
// contact request, che il backend richiede per username, non per id).
const normalizeUsernameValue = (value, label = 'username') => {
  if (value === null || value === undefined) {
    throw new Error(`${label} mancante`);
  }

  if (typeof value === 'object') {
    const extracted = value.username ?? value.sender_username ?? value.receiver_username ?? null;
    if (!extracted) {
      throw new Error(`${label} non valido: oggetto senza username`);
    }
    return String(extracted).trim();
  }

  const normalized = String(value).trim();

  if (!normalized) {
    throw new Error(`${label} vuoto`);
  }

  return normalized;
};

const buildUrl = (endpoint, query = null) => {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const base = `${API_URL}${normalizedEndpoint}`;

  if (!query || typeof query !== 'object' || Object.keys(query).length === 0) {
    return base;
  }

  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== '') {
          params.append(key, String(item));
        }
      });
      return;
    }

    params.append(key, String(value));
  });

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
};

async function parseResponseBody(response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!isJson) {
    const text = await response.text();
    return text || null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function handleResponse(response, { suppressAuthExpiredNotify = false } = {}) {
  const data = await parseResponseBody(response);

  if (!response.ok) {
    let errorMsg = `Errore Server: ${response.status}`;

    if (typeof data === 'string' && data.trim()) {
      errorMsg = data.trim();
    } else if (data && typeof data === 'object') {
      errorMsg =
        data.detail ||
        data.message ||
        data.error ||
        JSON.stringify(data);
    }

    const error = new Error(errorMsg);
    error.status = response.status;
    error.data = data;

    if (response.status === 401) {
      // v1.3: marcato esplicitamente come scadenza/invalidità sessione,
      // così i chiamanti (es. verifyRoomPassword) possono distinguere
      // questo caso da un vero rifiuto di dominio (es. password errata),
      // ed è notificato anche l'handler globale registrato via
      // onAuthExpired(), per un eventuale logout pulito centralizzato.
      error.isAuthExpired = true;
      // FIX (refresh token): suppressAuthExpiredNotify permette a
      // fetchWithAuth di tentare un rinnovo silenzioso PRIMA di
      // scatenare un logout - senza questo, la notifica partirebbe
      // subito al primo 401, anche quando il rinnovo sta per riuscire.
      if (!suppressAuthExpiredNotify) {
        console.warn('Sessione scaduta o token non valido');
        notifyAuthExpired(error);
      }
    }

    throw error;
  }

  return data;
}

async function request(endpoint, options = {}, query = null, responseOptions = {}) {
  const url = buildUrl(endpoint, query);

  const response = await fetch(url, {
    ...options,
  });

  return handleResponse(response, responseOptions);
}

async function fetchJson(endpoint, options = {}, query = null) {
  const headers = {
    ...DEFAULT_JSON_HEADERS,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };

  return request(
    endpoint,
    {
      ...options,
      headers,
    },
    query
  );
}

export async function fetchWithAuth(endpoint, token, options = {}, query = null) {
  if (!token) {
    throw new Error('Token mancante');
  }

  const buildHeaders = (currentToken) => ({
    ...DEFAULT_JSON_HEADERS,
    Authorization: `Bearer ${currentToken}`,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  });

  try {
    // Primo tentativo: silenzioso in caso di 401 (suppressAuthExpiredNotify),
    // per poter provare un rinnovo prima di notificare un logout vero.
    return await request(
      endpoint,
      { ...options, headers: buildHeaders(token) },
      query,
      { suppressAuthExpiredNotify: true }
    );
  } catch (error) {
    if (!error?.isAuthExpired) {
      throw error;
    }

    // FIX (refresh token): il token era scaduto - proviamo un rinnovo
    // silenzioso prima di arrenderci. Se riesce, ripetiamo la stessa
    // richiesta con il token nuovo, senza che il chiamante originale se
    // ne accorga.
    try {
      const newToken = await refreshAccessToken();
      return await request(
        endpoint,
        { ...options, headers: buildHeaders(newToken) },
        query
      );
    } catch (refreshOrRetryError) {
      // Se il rinnovo o il retry hanno gia' generato un vero 401 dal
      // server, handleResponse ha gia' notificato da solo (senza
      // suppress) - evitiamo di notificare una seconda volta. Notifichiamo
      // qui SOLO se il fallimento non ha mai toccato il server con una
      // vera risposta 401 (es. nessun refresh token salvato).
      if (!refreshOrRetryError?.isAuthExpired) {
        notifyAuthExpired(error);
      }
      throw refreshOrRetryError;
    }
  }
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

function normalizeKeyBundleResponse(bundle) {
  if (!bundle || typeof bundle !== 'object') return null;

  const identityKey =
    bundle.identity_key ||
    bundle.identityKey ||
    bundle.curve25519 ||
    bundle.device_key ||
    bundle.deviceKey ||
    bundle.device_keys?.curve25519 ||
    bundle.identity?.curve25519 ||
    null;

  const oneTimeKey =
    normalizeOneTimeKeyValue(bundle.one_time_key) ||
    normalizeOneTimeKeyValue(bundle.oneTimeKey) ||
    normalizeOneTimeKeyValue(bundle.otk) ||
    normalizeOneTimeKeyValue(bundle.key) ||
    normalizeOneTimeKeyValue(bundle.one_time_keys?.signed_curve25519) ||
    normalizeOneTimeKeyValue(bundle.one_time_keys?.curve25519) ||
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
    identityKey,
    curve25519: identityKey,
    one_time_key: oneTimeKey,
    oneTimeKey,
    otk: oneTimeKey,
    one_time_key_id: oneTimeKeyId,
    oneTimeKeyId: oneTimeKeyId,
    otk_id: oneTimeKeyId,
    otkId: oneTimeKeyId,
    key_id: oneTimeKeyId,
    keyId: oneTimeKeyId,
  };
}

// v1.3: normalizeRoom arricchita con last_message_preview / last_message_at /
// unread_count, per alimentare badge "non letti" + anteprima + orario in
// Sidebar.jsx. Additiva: tutti i campi/alias già esistenti restano invariati.
function normalizeRoom(room) {
  if (!room || typeof room !== 'object') return room;

  const id = room.id ?? room.room_id ?? room.roomId ?? null;
  const nomeServer = room.name ?? room.room_name ?? room.roomName ?? '';  // [palacan-metadati-a3.1]
  if (eGruppoPrivato(room) && id && String(nomeServer).trim()) imparaNomeStanza(id, nomeServer);
  const name = (eGruppoPrivato(room) && id && !String(nomeServer).trim() && nomeLocale(id)) || nomeServer;
  if (id) registraStanzaSegreto(id, room);  // [palacan-metadati-a4.1b] tipo e verificatore per il segreto di stanza

  const lastMessagePreview =
    room.last_message_preview ??
    room.lastMessagePreview ??
    room.last_message ??
    room.lastMessage ??
    null;
  const lastMessageAt =
    room.last_message_at ??
    room.lastMessageAt ??
    room.updated_at ??
    room.updatedAt ??
    null;
  const unreadCount = room.unread_count ?? room.unreadCount ?? 0;

  return {
    ...room,
    id,
    room_id: room.room_id ?? room.roomId ?? room.id ?? id,
    roomId: room.roomId ?? room.room_id ?? room.id ?? id,
    name,
    room_name: room.room_name ?? room.roomName ?? room.name ?? name,
    roomName: room.roomName ?? room.room_name ?? room.name ?? name,
    has_password:
      room.has_password ?? room.hasPassword ?? room.is_protected ?? false,
    hasPassword:
      room.hasPassword ?? room.has_password ?? room.is_protected ?? false,
    created_at: room.created_at ?? room.createdAt ?? null,
    createdAt: room.createdAt ?? room.created_at ?? null,
    last_message_preview: lastMessagePreview,
    lastMessagePreview,
    last_message_at: lastMessageAt,
    lastMessageAt,
    unread_count: unreadCount,
    unreadCount,
  };
}

function normalizeUser(user) {
  if (!user || typeof user !== 'object') return user;

  return {
    ...user,
    id: user.id ?? null,
    username: user.username ?? user.user_name ?? null,
    workspace_id: user.workspace_id ?? user.workspaceId ?? null,
    workspaceId: user.workspaceId ?? user.workspace_id ?? null,
    identity_key:
      user.identity_key ?? user.identityKey ?? user.curve25519 ?? null,
    identityKey:
      user.identityKey ?? user.identity_key ?? user.curve25519 ?? null,
    curve25519:
      user.curve25519 ?? user.identity_key ?? user.identityKey ?? null,
    is_active: user.is_active ?? user.isActive ?? true,
    isActive: user.isActive ?? user.is_active ?? true,
  };
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') return message;

  const cipherBody =
    message.cipher_body ?? message.cipherBody ?? message.ciphertext ?? null;

  return {
    ...message,
    id: message.id ?? message.client_msg_id ?? message.clientMsgId ?? null,
    room_id: message.room_id ?? message.roomId ?? null,
    roomId: message.roomId ?? message.room_id ?? null,
    sender_username:
      message.sender_username ?? message.senderUsername ?? message.sender ?? null,
    senderUsername:
      message.senderUsername ?? message.sender_username ?? message.sender ?? null,
    sender: message.sender ?? message.sender_username ?? message.senderUsername ?? null,
    event_kind: message.event_kind ?? message.eventKind ?? null,
    eventKind: message.eventKind ?? message.event_kind ?? null,
    event_type: message.event_type ?? message.eventType ?? null,
    eventType: message.eventType ?? message.event_type ?? null,
    session_id: message.session_id ?? message.sessionId ?? null,
    sessionId: message.sessionId ?? message.session_id ?? null,
    cipher_body: cipherBody,
    cipherBody,
    ciphertext: cipherBody,
    cipher_type: message.cipher_type ?? message.cipherType ?? null,
    cipherType: message.cipherType ?? message.cipher_type ?? null,
    sender_key:
      message.sender_key ?? message.senderKey ?? message.curve25519 ?? null,
    senderKey:
      message.senderKey ?? message.sender_key ?? message.curve25519 ?? null,
    curve25519:
      message.curve25519 ?? message.sender_key ?? message.senderKey ?? null,
    client_msg_id: message.client_msg_id ?? message.clientMsgId ?? null,
    clientMsgId: message.clientMsgId ?? message.client_msg_id ?? null,
    created_at: message.created_at ?? message.createdat ?? message.timestamp ?? null,
    createdAt: message.createdAt ?? message.created_at ?? message.timestamp ?? null,
    createdat: message.createdat ?? message.created_at ?? message.timestamp ?? null,
    timestamp: message.timestamp ?? message.created_at ?? message.createdat ?? null,
  };
}

// v1.2 Step 5: normalizeContactRequest — richiesta di contatto tra utenti
// consumer/free. Stato: 'pending' | 'accepted' | 'rejected'.
// Copre entrambe le forme reali restituite dal backend:
//   - GET /contacts/pending  -> { id, sender_username, created_at }
//   - GET /contacts/sent     -> { id, receiver_username, status, created_at, updated_at }
// v1.2: aggiunta lettura di receiver_username per toUsername (mancava in
// v1.1, causava toUsername sempre null per le richieste inviate).
function normalizeContactRequest(reqItem) {
  if (!reqItem || typeof reqItem !== 'object') return reqItem;

  const id = reqItem.id ?? reqItem.request_id ?? reqItem.requestId ?? null;
  const fromUsername =
    reqItem.from_username ??
    reqItem.fromUsername ??
    reqItem.sender_username ??
    reqItem.senderUsername ??
    null;
  const toUsername =
    reqItem.to_username ??
    reqItem.toUsername ??
    reqItem.target_username ??
    reqItem.targetUsername ??
    reqItem.receiver_username ??
    reqItem.receiverUsername ??
    null;
  const status = reqItem.status ?? 'pending';

  return {
    ...reqItem,
    id,
    request_id: reqItem.request_id ?? reqItem.requestId ?? id,
    requestId: reqItem.requestId ?? reqItem.request_id ?? id,
    from_username: fromUsername,
    fromUsername,
    to_username: toUsername,
    toUsername,
    // alias espliciti per non ambiguare "sender" vs "receiver" a seconda
    // che la richiesta provenga da /contacts/pending o /contacts/sent
    sender_username: reqItem.sender_username ?? fromUsername,
    receiver_username: reqItem.receiver_username ?? toUsername,
    status,
    created_at: reqItem.created_at ?? reqItem.createdAt ?? null,
    createdAt: reqItem.createdAt ?? reqItem.created_at ?? null,
    updated_at: reqItem.updated_at ?? reqItem.updatedAt ?? null,
    updatedAt: reqItem.updatedAt ?? reqItem.updated_at ?? null,
  };
}

// v1.1 Step 5: normalizeNotification — notifica generica (richiesta
// ricevuta, richiesta accettata/rifiutata da chi l'ha inviata, ecc).
// Additiva, nessuna funzione preesistente la usa ancora.
function normalizeNotification(item) {
  if (!item || typeof item !== 'object') return item;

  const id = item.id ?? item.notification_id ?? item.notificationId ?? null;

  return {
    ...item,
    id,
    notification_id: item.notification_id ?? item.notificationId ?? id,
    notificationId: item.notificationId ?? item.notification_id ?? id,
    type: item.type ?? item.notification_type ?? item.notificationType ?? null,
    title: item.title ?? null,
    body: item.body ?? item.message ?? item.text ?? null,
    is_read: item.is_read ?? item.isRead ?? false,
    isRead: item.isRead ?? item.is_read ?? false,
    related_request_id:
      item.related_request_id ?? item.relatedRequestId ?? item.request_id ?? null,
    relatedRequestId:
      item.relatedRequestId ?? item.related_request_id ?? item.request_id ?? null,
    created_at: item.created_at ?? item.createdAt ?? null,
    createdAt: item.createdAt ?? item.created_at ?? null,
  };
}

// v1.4: normalizeInviteLinkInfo — risposta di GET /invite-links/:token
// (pubblica), usata dalla landing page prima del login/registrazione.
function normalizeInviteLinkInfo(info) {
  if (!info || typeof info !== 'object') return info;

  return {
    ...info,
    inviter_username: info.inviter_username ?? info.inviterUsername ?? null,
    inviterUsername: info.inviterUsername ?? info.inviter_username ?? null,
    requires_password: info.requires_password ?? info.requiresPassword ?? false,
    requiresPassword: info.requiresPassword ?? info.requires_password ?? false,
    room_name: info.room_name ?? info.roomName ?? null,
    roomName: info.roomName ?? info.room_name ?? null,
  };
}

/* ==========================================================================
   AUTH & LOGIN
   ========================================================================== */

export const loginConsumer = async (username, password) => {
  return fetchJson('/auth/login-consumer', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
};

export const loginEnterprise = async (companyName, username, password) => {
  return fetchJson('/auth/login-enterprise', {
    method: 'POST',
    body: JSON.stringify({
      company_name: companyName,
      username,
      password,
    }),
  });
};

export const registerConsumer = async (
  username,
  password,
  identityKey,
  registrationId
) => {
  return fetchJson('/auth/register-consumer', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      identity_key: identityKey,
      registration_id: registrationId,
    }),
  });
};

/* ==========================================================================
   ENTERPRISE ADMIN & ACTIVATION
   ========================================================================== */

export const activateWorkspace = async (
  licenseToken,
  companyName,
  adminUsername,
  adminPassword,
  identityKey,
  registrationId
) => {
  return fetchJson('/auth/activate-workspace', {
    method: 'POST',
    body: JSON.stringify({
      license_token: licenseToken,
      company_name: companyName,
      admin_username: adminUsername,
      admin_password: adminPassword,
      identity_key: identityKey,
      registration_id: registrationId,
    }),
  });
};

// v-next: aggiunto roomIds come SESTO parametro, DOPO token (non prima),
// proprio per restare retrocompatibile: qualunque chiamata esistente con
// 5 argomenti (username, password, identityKey, registrationId, token)
// continua a funzionare identica, con roomIds che resta [] di default.
// Il backend (routes/auth.py, POST /auth/admin/create-employee —
// endpoint NUOVO, prima non esisteva affatto: era la causa reale per cui
// non era possibile associare un dipendente a nessuna stanza in fase di
// creazione) crea l'utente con force_password_change=True e lo aggiunge
// come membro di ciascuna stanza in roomIds, ignorando silenziosamente
// id inesistenti o di un altro workspace (non è un errore bloccante).
export const createEmployee = async (
  username,
  password,
  identityKey,
  registrationId,
  token,
  roomIds = []
) => {
  return fetchWithAuth('/auth/admin/create-employee', token, {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      identity_key: identityKey,
      registration_id: registrationId,
      room_ids: Array.isArray(roomIds) ? roomIds : [],
    }),
  });
};

// v-next: FIX endpoint. Puntava a /auth/admin/users, che non esiste ed
// esistendo mai lato backend (verificato su routes/auth.py) faceva
// fallire silenziosamente ogni chiamata con un 404. L'endpoint reale
// equivalente è GET /auth/colleagues (routes/auth.py::get_colleagues),
// che restituisce già {id, username, role, is_me, is_active} filtrati
// per workspace dell'utente autenticato.
export const getWorkspaceColleagues = async (token) => {
  const res = await fetchWithAuth('/auth/colleagues', token, {
    method: 'GET',
  });
  return Array.isArray(res) ? res.map(normalizeUser) : [];
};

// v-next: cambio password — usata sia per il cambio OBBLIGATORIO al
// primo accesso (force_password_change === true nella risposta di
// login/attivazione) sia per un eventuale cambio volontario futuro.
// Backend: POST /auth/change-password (routes/auth.py), richiede sempre
// la password attuale corretta. Ritorna { message, force_password_change:
// false }: il chiamante deve aggiornare il proprio stato locale (es.
// currentUserForcePasswordChange in App.jsx) leggendo questo campo,
// invece di assumere semplicemente che l'operazione sia andata a buon
// fine.
export const changePassword = async (currentPassword, newPassword, token) => {
  return fetchWithAuth('/auth/change-password', token, {
    method: 'POST',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
};

// Recovery code: reset password self-service senza email. generateRecoveryCode
// richiede una sessione valida + password attuale (stesso principio del cambio
// password: un segreto che bypassa il login non si genera solo con un token).
// resetPasswordWithRecoveryCode invece NON richiede token — per definizione
// l'utente è fuori dall'account quando lo usa.
export const generateRecoveryCode = async (password, token) => {
  return fetchWithAuth('/recovery-code/generate', token, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
};

export const resetPasswordWithRecoveryCode = async (username, recoveryCode, newPassword) => {
  return fetchJson('/recovery-code/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      username,
      recovery_code: recoveryCode,
      new_password: newPassword,
    }),
  });
};

/* ==========================================================================
   ROOMS
   ========================================================================== */

export const getRooms = async (token) => {
  const res = await fetchWithAuth('/rooms/', token, {
    method: 'GET',
  });
  return Array.isArray(res) ? res.map(normalizeRoom) : [];
};

export const createRoom = async (name, password, token, asDepartment = false) => {
  const res = await fetchWithAuth('/rooms/', token, {
    method: 'POST',
    body: JSON.stringify({
      name,
      password: password || '',
      as_department: !!asDepartment,
    }),
  });

  return normalizeRoom(res);
};

export const joinRoom = async (roomId, password, token) => {
  const safeRoomId = normalizeRoomId(roomId);

  const res = await fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/join`, token, {
    method: 'POST',
    body: JSON.stringify({
      password: password || '',
    }),
  });

  return normalizeRoom(res);
};

// v1.3: FIX bug "Password errata" mostrato quando in realtà il token è
// scaduto. PRIMA: qualunque errore (401 di sessione scaduta, 403, rete
// giù) veniva catturato e trasformato in `return false`, indistinguibile
// da un vero rifiuto password lato server (risposta 200 con access: false).
// ORA: nessun try/catch qui. Se la richiesta fallisce, l'eccezione risale
// al chiamante con error.status / error.isAuthExpired già valorizzati da
// handleResponse(), così App.jsx può distinguere "sessione scaduta, fai
// logout" da "password davvero sbagliata, mostra l'alert". Solo una
// risposta HTTP 200 con access !== true è un vero rifiuto password.
export const verifyRoomPassword = async (roomId, password, token) => {
  const safeRoomId = normalizeRoomId(roomId);

  const response = await fetchWithAuth(
    `/rooms/${encodeURIComponent(safeRoomId)}/verify_access`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        password: password || '',
      }),
    }
  );

  return response?.access === true;
};

export const getRoomMessages = async (roomId, token) => {
  const safeRoomId = normalizeRoomId(roomId);
  // [palacan-metadati-a4.4b] chat con segreto confermato: cronologia con il gettone di stanza, senza dire al server chi legge
  const segretoStanza = segretoConfermato(safeRoomId);
  if (segretoStanza) {
    try {
      const risposta = await fetch(`${API_URL}/rooms/${encodeURIComponent(safeRoomId)}/storia`, {
        method: 'GET',
        headers: { 'X-Palacan-Room-Token': await gettoneDa(segretoStanza) },
      });
      if (risposta.ok) {
        const elenco = await risposta.json();
        return Array.isArray(elenco) ? elenco.map(normalizeMessage) : [];
      }
    } catch (_) {
      /* si torna al modo di sempre */
    }
  }

  const res = await fetchWithAuth(
    `/rooms/${encodeURIComponent(safeRoomId)}/messages`,
    token,
    {
      method: 'GET',
    }
  );
  return Array.isArray(res) ? res.map(normalizeMessage) : [];
};

export const getRoomUsers = async (roomId, token) => {
  const safeRoomId = normalizeRoomId(roomId);

  const res = await fetchWithAuth(
    `/rooms/${encodeURIComponent(safeRoomId)}/participants`,
    token,
    {
      method: 'GET',
    }
  );

  /* FIX (rotazione Megolm su cambio composizione gruppo): il backend ora
     restituisce { participants, membership_version } invece del solo
     elenco. Scompattiamo qui, in un unico punto, cosi' tutti gli altri
     chiamanti esistenti di getRoomUsers restano invariati (continuano a
     ricevere un array vero, .map()-abile, Array.isArray() sempre vero).
     La versione viene allegata come proprieta' EXTRA sull'array
     restituito - gli array JS sono oggetti, possono avere proprieta' in
     piu' senza smettere di essere array validi - cosi' chi ha bisogno
     della versione la legge da users.membershipVersion, senza una
     seconda chiamata di rete e senza rompere nessun chiamante esistente
     che ignora semplicemente questa proprieta' in piu'.
     Fallback su res stesso se dovesse arrivare ancora come array puro
     (difensivo, non dovrebbe succedere dopo questo fix). */
  const rawList = Array.isArray(res?.participants)
    ? res.participants
    : Array.isArray(res)
    ? res
    : [];
  const users = rawList.map(normalizeUser);
  users.membershipVersion =
    typeof res?.membership_version === 'number' ? res.membership_version : null;
  users.creatore = typeof res?.creatore === 'string' ? res.creatore : null;  // [palacan-metadati-a4.2b]
  users.dispositivi = Array.isArray(res?.dispositivi) ? res.dispositivi.map(String) : null;  // [palacan-l3b]
  return users;
};

export const addOrReplaceReaction = async (roomId, messageId, payload, token) => {
  const safeRoomId = normalizeRoomId(roomId);

  return fetchWithAuth(
    `/rooms/${encodeURIComponent(safeRoomId)}/messages/${encodeURIComponent(messageId)}/reactions`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
};

export const removeReaction = async (roomId, messageId, token) => {
  const safeRoomId = normalizeRoomId(roomId);

  return fetchWithAuth(
    `/rooms/${encodeURIComponent(safeRoomId)}/messages/${encodeURIComponent(messageId)}/reactions`,
    token,
    {
      method: 'DELETE',
    }
  );
};

export const getReactions = async (roomId, messageId, token) => {
  const safeRoomId = normalizeRoomId(roomId);

  const res = await fetchWithAuth(
    `/rooms/${encodeURIComponent(safeRoomId)}/messages/${encodeURIComponent(messageId)}/reactions`,
    token,
    {
      method: 'GET',
    }
  );
  return Array.isArray(res) ? res : [];
};

export const getIceServers = async (token) => {
  const res = await fetchWithAuth('/calls/ice-servers', token, { method: 'GET' });
  return Array.isArray(res?.iceServers) ? res.iceServers : [];
};

export const signalCall = async (roomId, targetUserId, type, data, token) => {
  return fetchWithAuth('/calls/signal', token, {
    method: 'POST',
    body: JSON.stringify({
      room_id: String(roomId),
      target_user_id: targetUserId,
      type,
      data: data ?? null,
    }),
  });
};

export const renameRoom = async (roomId, newName, token) => {
  const safeRoomId = normalizeRoomId(roomId);

  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ name: newName }),
  });
};

export const leaveRoom = async (roomId, token) => {
  const safeRoomId = normalizeRoomId(roomId);

  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/leave`, token, {
    method: 'POST',
  });
};

// [palacan-metadati-3.4c] il segreto di cancellazione (se c'e') dimostra di essere l'autore senza che il server sappia chi e'
export const deleteMessage = async (roomId, messageId, token, segretoCancellazione = null) => {
  const safeRoomId = normalizeRoomId(roomId);
  return fetchWithAuth(
    `/rooms/${encodeURIComponent(safeRoomId)}/messages/${encodeURIComponent(messageId)}`,
    token,
    {
      method: 'DELETE',
      ...(segretoCancellazione ? { headers: { 'X-Palacan-Delete-Token': segretoCancellazione } } : {}),
    }
  );
};

export const hideMessageForMe = async (roomId, messageId, token) => {
  const safeRoomId = normalizeRoomId(roomId);
  return fetchWithAuth(
    `/rooms/${encodeURIComponent(safeRoomId)}/messages/${encodeURIComponent(messageId)}/hide`,
    token,
    { method: 'POST' }
  );
};

export const muteRoomNotifications = async (roomId, token) => {
  const safeRoomId = normalizeRoomId(roomId);
  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/mute-notifications`, token, {
    method: 'POST',
  });
};

export const unmuteRoomNotifications = async (roomId, token) => {
  const safeRoomId = normalizeRoomId(roomId);
  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/unmute-notifications`, token, {
    method: 'POST',
  });
};

export const setAutoDeleteTimer = async (roomId, minutes, token) => {
  const safeRoomId = normalizeRoomId(roomId);
  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/auto-delete`, token, {
    method: 'PATCH',
    body: JSON.stringify({ minutes }),
  });
};

export const favoriteRoom = async (roomId, token) => {
  const safeRoomId = normalizeRoomId(roomId);
  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/favorite`, token, {
    method: 'POST',
  });
};

export const unfavoriteRoom = async (roomId, token) => {
  const safeRoomId = normalizeRoomId(roomId);
  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/unfavorite`, token, {
    method: 'POST',
  });
};

// --- Segnalazione e Blocco Utenti (solo Free, vedi backend routes/reports.py e routes/blocks.py) ---

export const reportUser = async (reportedUserId, reason, description, roomId, token) => {
  const body = { reported_user_id: reportedUserId, reason };
  if (description) body.description = description;
  if (roomId) body.room_id = normalizeRoomId(roomId);
  return fetchWithAuth('/reports', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

export const blockUser = async (userId, token) => {
  return fetchWithAuth(`/users/${encodeURIComponent(userId)}/block`, token, {
    method: 'POST',
  });
};

export const unblockUser = async (userId, token) => {
  return fetchWithAuth(`/users/${encodeURIComponent(userId)}/block`, token, {
    method: 'DELETE',
  });
};

export const getBlockedUsers = async (token) => {
  const risposta = await fetchWithAuth('/users/blocked', token);  // [palacan-metadati-a4.3b] copia cifrata sul dispositivo
  specchia('bloccati', risposta);
  return risposta;
};

export const getCustomLists = async (token) => {
  const risposta = await fetchWithAuth('/rooms/custom-lists', token);  // [palacan-metadati-a4.3b] copia cifrata sul dispositivo
  specchia('liste', risposta);
  return risposta;
};

export const createCustomList = async (name, token) => {
  return fetchWithAuth('/rooms/custom-lists', token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
};

export const addRoomToList = async (listId, roomId, token) => {
  const safeRoomId = normalizeRoomId(roomId);
  return fetchWithAuth(
    `/rooms/custom-lists/${encodeURIComponent(listId)}/rooms/${encodeURIComponent(safeRoomId)}`,
    token,
    { method: 'POST' }
  );
};

export const removeRoomFromList = async (listId, roomId, token) => {
  const safeRoomId = normalizeRoomId(roomId);
  return fetchWithAuth(
    `/rooms/custom-lists/${encodeURIComponent(listId)}/rooms/${encodeURIComponent(safeRoomId)}`,
    token,
    { method: 'DELETE' }
  );
};

export const renameCustomList = async (listId, name, token) => {
  return fetchWithAuth(`/rooms/custom-lists/${encodeURIComponent(listId)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
};

export const deleteCustomList = async (listId, token) => {
  return fetchWithAuth(`/rooms/custom-lists/${encodeURIComponent(listId)}`, token, {
    method: 'DELETE',
  });
};

/* ==========================================================================
   TASKS (E2EE task management per stanze aziendali)
   ------------------------------------------------------------------------
   Solo REST qui: nessuna cifratura in questo file. Il payload cifrato
   (algorithm/session_id/sender_key/cipher_type/cipher_body) viene preparato
   da chi chiama (vedi handleCreateTask in App.jsx, stessa sequenza Megolm
   gia' usata per handleSendMessage) e passato gia' pronto.
   ========================================================================== */

export const createTask = async (roomId, taskPayload, token) => {
  const safeRoomId = normalizeRoomId(roomId);

  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/tasks`, token, {
    method: 'POST',
    body: JSON.stringify(taskPayload),
  });
};

export const getRoomTasks = async (roomId, token) => {
  const safeRoomId = normalizeRoomId(roomId);

  const res = await fetchWithAuth(
    `/rooms/${encodeURIComponent(safeRoomId)}/tasks`,
    token,
    {
      method: 'GET',
    }
  );
  return Array.isArray(res) ? res : [];
};

export const updateTaskStatus = async (taskId, status, token) => {
  return fetchWithAuth(`/tasks/${encodeURIComponent(taskId)}/status`, token, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
};

export const updateTask = async (taskId, updates, token) => {
  return fetchWithAuth(`/tasks/${encodeURIComponent(taskId)}`, token, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
};

export const deleteTask = async (taskId, token) => {
  return fetchWithAuth(`/tasks/${encodeURIComponent(taskId)}`, token, {
    method: 'DELETE',
  });
};

/* ==========================================================================
   ROOM INVITES
   ========================================================================== */

export const getRoomInvites = async (token) => {
  const res = await fetchWithAuth('/rooms/invites', token, {
    method: 'GET',
  });
  return Array.isArray(res) ? res : [];
};

export const acceptRoomInvite = async (inviteId, token) => {
  return fetchWithAuth(`/rooms/invites/${encodeURIComponent(inviteId)}/accept`, token, {
    method: 'POST',
  });
};

export const rejectRoomInvite = async (inviteId, token) => {
  return fetchWithAuth(`/rooms/invites/${encodeURIComponent(inviteId)}/reject`, token, {
    method: 'POST',
  });
};

export const inviteUserToRoom = async (roomId, targetUsername, token, bustaNome = null) => {  // [palacan-metadati-a3.2b2]
  const safeRoomId = normalizeRoomId(roomId);

  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/invite`, token, {
    method: 'POST',
    body: JSON.stringify({
      target_username: targetUsername,
      ...(bustaNome ? { busta_nome: bustaNome } : {}),  // [palacan-metadati-a3.2b2] nome sigillato per l'invitato
    }),
  });
};

export const addMemberToRoom = async (roomId, username, token) => {
  const safeRoomId = normalizeRoomId(roomId);

  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/add-member`, token, {
    method: 'POST',
    body: JSON.stringify({
      username,
    }),
  });
};

/* ==========================================================================
   INVITE LINKS (v1.4)
   ------------------------------------------------------------------------
   Link di invito pubblico e monouso, indipendente da "unisciti con ID +
   password" (che resta invariato). Flusso:
     1. A (autenticato) chiama createInviteLink() → riceve token + path.
     2. A condivide il link (WhatsApp, Telegram, ecc.), fuori dall'app.
     3. B clicca il link, arriva sulla landing page pubblica su /i/:token
        → il frontend chiama getInviteLinkInfo(token) SENZA auth, per
        mostrare "X ti ha invitato" prima di login/registrazione.
     4. Il frontend salva il token con setPendingInviteToken(token), così
        sopravvive a refresh/redirect durante login o registrazione.
     5. Dopo che B ha fatto login/registrazione (flusso invariato:
        username+password[+passphrase]), il frontend legge
        getPendingInviteToken() e chiama redeemInviteLink(token, password, jwt).
     6. Se l'invito ha una password impostata da A e non è stata ancora
        fornita, il backend risponde 422 con
        error.data?.detail?.code === 'password_required': il chiamante
        deve mostrare un campo password e richiamare redeemInviteLink con
        password compilata. NON è un errore da mostrare come "invito non
        valido/rotto".
     7. Al successo, redeemInviteLink ritorna la stanza (già normalizzata
        con normalizeRoom, stessa forma di createRoom/joinRoom): il
        chiamante fa setCurrentRoom(room) e chiama
        clearPendingInviteToken().

   Endpoint reali attesi (routes/invite_links.py):
     POST /invite-links/              (autenticato)  body: { room_name?, password? }
     GET  /invite-links/:token        (pubblico)
     POST /invite-links/:token/redeem (autenticato)  body: { password? }
   ========================================================================== */

export const createInviteLink = async (roomName, password, token) => {
  const res = await fetchWithAuth('/invite-links/', token, {
    method: 'POST',
    body: JSON.stringify({
      room_name: roomName || null,
      password: password || null,
    }),
  });

  return {
    ...res,
    token: res?.token ?? null,
    invite_path: res?.invite_path ?? null,
    invitePath: res?.invite_path ?? null,
    has_password: res?.has_password ?? false,
    hasPassword: res?.has_password ?? false,
  };
};

// Pubblico: nessun JWT, usato dalla landing page prima del login/registrazione.
export const getInviteLinkInfo = async (inviteToken) => {
  const safeToken = normalizeEntityId(inviteToken, 'inviteToken');

  const res = await fetchJson(`/invite-links/${encodeURIComponent(safeToken)}`, {
    method: 'GET',
  });

  return normalizeInviteLinkInfo(res);
};

// Autenticato: da chiamare dopo login/registrazione riusciti. Vedi nota
// sul caso 422 / password_required nel blocco di commento sopra.
export const redeemInviteLink = async (inviteToken, password, token) => {
  const safeToken = normalizeEntityId(inviteToken, 'inviteToken');

  const res = await fetchWithAuth(
    `/invite-links/${encodeURIComponent(safeToken)}/redeem`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        password: password || null,
      }),
    }
  );

  // [palacan-invito-richiesta] il link manda una richiesta di contatto: si risponde con l'esito, e la stanza solo se esiste gia' o nasce subito
  return { esito: res?.esito || null, inviterUsername: res?.inviter_username || '', room: res?.room ? normalizeRoom(res.room) : null };
};

/* ==========================================================================
   PENDING INVITE TOKEN (persistenza lato client, v1.4)
   ------------------------------------------------------------------------
   Stesso principio già usato per backupPassphraseRef: l'utente clicca il
   link PRIMA di avere una sessione autenticata, quindi il token deve
   sopravvivere a refresh/redirect durante login o registrazione, finché
   non c'è un JWT valido per completare il redeem. Chiave dedicata per non
   collidere con altri usi di localStorage nell'app.
   ========================================================================== */

const PENDING_INVITE_STORAGE_KEY = 'chatcrypto_pending_invite_token';

export const setPendingInviteToken = (inviteToken) => {
  if (!inviteToken) return;
  try {
    window.localStorage.setItem(PENDING_INVITE_STORAGE_KEY, String(inviteToken));
  } catch (_) {
    // localStorage non disponibile (es. modalità privata restrittiva):
    // l'invito funziona comunque nella sessione corrente, solo senza
    // sopravvivere a un refresh di pagina.
  }
};

export const getPendingInviteToken = () => {
  try {
    return window.localStorage.getItem(PENDING_INVITE_STORAGE_KEY) || null;
  } catch (_) {
    return null;
  }
};

export const clearPendingInviteToken = () => {
  try {
    window.localStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
  } catch (_) {
    // no-op
  }
};

/* ==========================================================================
   KEYS (OLM / MEGOLM E2EE)
   ========================================================================== */

export const uploadIdentityKey = async (identityKey, token, deviceId = null) => {
  if (!identityKey) {
    throw new Error('identityKey mancante');
  }

  // FIX (Fase 2 multi-device): deviceId opzionale - se presente, il
  // server crea/aggiorna davvero una riga Device invece di limitarsi a
  // sovrascrivere l'unica identity_key dell'utente. Retrocompatibile:
  // senza deviceId il comportamento resta identico a prima.
  const payload = { identity_key: identityKey };
  if (deviceId) {
    payload.device_id = deviceId;
  }

  return fetchWithAuth('/keys/upload', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const uploadIdentityKeyLegacy = async (identityKey, token) => {
  if (!identityKey) {
    throw new Error('identityKey mancante');
  }

  return fetchWithAuth('/keys/upload-identity-key', token, {
    method: 'POST',
    body: JSON.stringify({
      identity_key: identityKey,
    }),
  });
};

export const uploadOneTimeKeys = async (oneTimeKeys, token, deviceId = null, { sostituisci = false } = {}) => {  // [palacan-pq7]
  if (!oneTimeKeys || typeof oneTimeKeys !== 'object' || Array.isArray(oneTimeKeys)) {
    throw new Error('oneTimeKeys non valide');
  }

  const normalized =
    Object.fromEntries(
      Object.entries(oneTimeKeys)
        .filter(([key, value]) => Boolean(key) && Boolean(value))
        .map(([key, value]) => [String(key), String(value)])
    );

  if (Object.keys(normalized).length === 0) {
    throw new Error('Nessuna OTK valida da caricare');
  }

  // FIX (Fase 2 multi-device): stesso deviceId opzionale gia' collegato
  // per uploadIdentityKey - retrocompatibile, un client che non lo manda
  // si comporta esattamente come prima.
  const payloadBody = { one_time_keys: normalized };
  if (sostituisci) payloadBody.sostituisci = true;  // [palacan-pq7] account ripristinato: il server toglie le OTK non usate dello stesso account
  if (deviceId) {
    payloadBody.device_id = deviceId;
  }

  return fetchWithAuth('/keys/upload-otks', token, {
    method: 'POST',
    body: JSON.stringify(payloadBody),
  });
};

// FIX (Fase 3 multi-device): endpoint NUOVO e separato da getKeyBundle
// sopra (che resta intatto) - restituisce un bundle per OGNI dispositivo
// attivo del destinatario, non uno solo. Forma della risposta gia'
// pulita e definita da noi (backend), non serve la normalizzazione
// difensiva multi-formato usata sotto per getKeyBundle.
// FIX (Fase 4 multi-device): self-service - vedi/revoca i PROPRI
// dispositivi. Mai un altro utente, mai identity_key/OTK esposte qui.
export const getMyDevices = async (token) => {
  const res = await fetchWithAuth('/keys/devices', token, {
    method: 'GET',
  });

  return Array.isArray(res?.devices) ? res.devices : [];
};

export const revokeDevice = async (deviceRowId, token) => {
  if (!deviceRowId) {
    throw new Error('deviceRowId mancante');
  }

  return fetchWithAuth(
    `/keys/devices/${encodeURIComponent(deviceRowId)}/revoke`,
    token,
    {
      method: 'POST',
    }
  );
};


export const getDeviceBundles = async (username, token) => {
  if (!username) {
    throw new Error('username mancante');
  }

  const res = await fetchWithAuth(
    `/keys/${encodeURIComponent(username)}/device-bundles`,
    token,
    {
      method: 'GET',
    }
  );

  const bundles = Array.isArray(res?.bundles) ? res.bundles : [];
  bundles.principale = res && res.principale ? res.principale : null;  // [palacan-l4c3] chiave principale (firma incrociata)

  console.log('[apiService.getDeviceBundles] bundles ricevuti', {
    username,
    count: bundles.length,
  });

  return bundles;
};


export const getKeyBundle = async (username, token) => {
  if (!username) {
    throw new Error('username mancante');
  }

  const res = await fetchWithAuth(
    `/keys/${encodeURIComponent(username)}/key-bundle`,
    token,
    {
      method: 'GET',
    }
  );

  const normalized = normalizeKeyBundleResponse(res);

  if (!normalized) {
    throw new Error(`Bundle nullo per ${username}`);
  }

  console.log('[apiService.getKeyBundle] bundle ricevuto', {
    username,
    identityKey: normalized.identity_key,
    oneTimeKeyId: normalized.one_time_key_id,
    hasOneTimeKey: Boolean(normalized.one_time_key),
  });

  return normalized;
};

export const queryMatrixKeys = async (username, token = null) => {
  if (!username) {
    throw new Error('username mancante');
  }

  const endpoint = `/keys/query/${encodeURIComponent(username)}`;

  if (token) {
    return await fetchWithAuth(endpoint, token, { method: 'GET' });
  }

  return await request(endpoint, {
    method: 'GET',
    headers: {
      ...DEFAULT_JSON_HEADERS,
    },
  });
};

export const getOtkCount = async (token) => {
  const res = await fetchWithAuth('/keys/otk-count', token, {
    method: 'GET',
  });
  return Number(res?.count || 0);
};

/* ==========================================================================
   KEY BACKUP (recupero chiavi multi-dispositivo, E2EE zero-knowledge)
   ------------------------------------------------------------------------
   Il server salva SOLO un blob già cifrato lato client (AES-GCM, chiave
   derivata dalla passphrase di backup via PBKDF2) più un salt non
   segreto. Il server non vede mai la passphrase né le chiavi in chiaro.
   Endpoint reali (routes/key_backup.py):
     GET    /keys/backup/status  -> { exists: bool }
     GET    /keys/backup         -> { encrypted_blob, salt, kdf_iterations, updated_at }
     PUT    /keys/backup         body: { encrypted_blob, salt, kdf_iterations }
     DELETE /keys/backup
   ========================================================================== */

export const getKeyBackupStatus = async (token) => {
  return fetchWithAuth('/keys/backup/status', token, {
    method: 'GET',
  });
};

export const downloadKeyBackup = async (token) => {
  try {
    return await fetchWithAuth('/keys/backup', token, {
      method: 'GET',
    });
  } catch (e) {
    if (e?.status === 404) return null;
    throw e;
  }
};

// [palacan-n6b] attese (facoltative): da quale backup del server e' partito il client - { updated_at } letto dal
// server, oppure { nuovo: true } se non ce n'era nessuno. Se un altro dispositivo ha caricato nel frattempo il server
// risponde 409 (errore con status 409) e il chiamante riunisce e riprova (utils/backupUnito.js).
export const uploadKeyBackup = async (payload, token, attese = null) => {
  if (!payload?.encrypted_blob || !payload?.salt || !payload?.kdf_iterations) {
    throw new Error('Payload di backup incompleto');
  }

  return fetchWithAuth('/keys/backup', token, {
    method: 'PUT',
    body: JSON.stringify({
      encrypted_blob: payload.encrypted_blob,
      salt: payload.salt,
      kdf_iterations: payload.kdf_iterations,
      ...(attese && attese.nuovo ? { expected_absent: true } : {}),
      ...(attese && attese.updated_at ? { expected_updated_at: attese.updated_at } : {}),
    }),
  });
};

export const deleteKeyBackup = async (token) => {
  return fetchWithAuth('/keys/backup', token, {
    method: 'DELETE',
  });
};

export const logout = async (token) => {
  return fetchWithAuth('/auth/logout', token, {
    method: 'POST',
  });
};
/* ==========================================================================
   CONTACTS & SOCIAL
   ========================================================================== */

export const searchUsers = async (query, token) => {
  const res = await fetchWithAuth(
    '/users/search',
    token,
    { method: 'GET' },
    { q: query }
  );
  return Array.isArray(res) ? res.map(normalizeUser) : [];
};

// v1.5: ricerca dedicata ai contatti, endpoint reale routes/contacts.py
// (GET /contacts/search?query=...). SEPARATA da searchUsers: parametro
// query diverso (query, non q) e semantica diversa (ricerca finalizzata
// a mandare una richiesta di contatto, non una ricerca utenti generica).
// Non sostituisce searchUsers in nessun punto esistente.
export const searchContacts = async (query, token) => {
  const res = await fetchWithAuth(
    '/contacts/search',
    token,
    { method: 'GET' },
    { query }
  );
  return Array.isArray(res) ? res.map(normalizeUser) : [];
};

export const sendContactRequest = async (targetUsername, token) => {
  return fetchWithAuth('/contacts/request', token, {
    method: 'POST',
    body: JSON.stringify({
      username: targetUsername,
    }),
  });
};

// v1.2: aggiunto slash finale — GET /contacts/ è la route reale definita
// nel router (prefix "/contacts" + path "/"). Senza slash finale il
// browser riceve un redirect 307 che con header Authorization può dare
// problemi di CORS su alcuni setup.
export const getContacts = async (token) => {
  const res = await fetchWithAuth('/contacts/', token, {
    method: 'GET',
  });
  const risposta = Array.isArray(res) ? res.map(normalizeUser) : [];  // [palacan-metadati-a4.3b] copia cifrata sul dispositivo
  specchia('contatti', risposta);
  return risposta;
};

// INVARIATA: stub storico, lasciato così com'è per non rompere chi la usa
// già altrove. Per il nuovo flusso Step 5 usare getIncomingContactRequests.
export const getContactRequests = async (_token) => {
  return [];
};

/* ==========================================================================
   CONTACT REQUESTS (Step 5)
   ------------------------------------------------------------------------
   Flusso reale, verificato su routes/contacts.py:
     A cerca B con searchContacts → A chiama sendFriendRequest(B) → la
     richiesta nasce con status 'pending' → B la vede con
     getIncomingContactRequests() → B chiama acceptContactRequest(usernameA)
     o rejectContactRequest(usernameA) → A riceve una notifica del
     risultato (vedi sezione NOTIFICATIONS più sotto).

   Endpoint REALI confermati sul backend (v1.2, sostituiscono i "proposti"
   della v1.1 che non esistevano):
     GET  /contacts/search     query param: query
     POST /contacts/request    body: { username }
     GET  /contacts/pending    (richieste ricevute, solo pending)
     GET  /contacts/sent       (richieste inviate, storico completo)
     POST /contacts/accept     body: { username }
     POST /contacts/reject     body: { username }
   ========================================================================== */

// Alias esplicito di sendContactRequest, stesso comportamento, nome più
// chiaro per il nuovo flusso "richiesta di amicizia/contatto in attesa
// di conferma". Non sostituisce sendContactRequest.
export const sendFriendRequest = async (targetUsername, token) => {
  return sendContactRequest(targetUsername, token);
};

// v1.2: corretto endpoint da /contacts/requests/incoming (inesistente) a
// /contacts/pending (reale, vedi routes/contacts.py::get_pending_requests).
export const getIncomingContactRequests = async (token) => {
  const res = await fetchWithAuth('/contacts/pending', token, {
    method: 'GET',
  });
  return Array.isArray(res) ? res.map(normalizeContactRequest) : [];
};

// v1.2: corretto endpoint da /contacts/requests/sent (inesistente) a
// /contacts/sent (reale, vedi routes/contacts.py::get_sent_requests).
export const getSentContactRequests = async (token) => {
  const res = await fetchWithAuth('/contacts/sent', token, {
    method: 'GET',
  });
  return Array.isArray(res) ? res.map(normalizeContactRequest) : [];
};

// v1.2: firma cambiata da (requestId, token) a (senderUsername, token).
// Il backend (routes/contacts.py::accept_request) accetta un
// UsernamePayload nel body — non un id nell'URL. La richiesta viene
// identificata server-side come "quella pending il cui sender è
// senderUsername e il cui receiver sono io (utente autenticato)".
//
// senderUsername può essere passato come stringa oppure come l'oggetto
// richiesta restituito da getIncomingContactRequests (in tal caso viene
// letto reqItem.sender_username automaticamente).
export const acceptContactRequest = async (senderUsername, token) => {
  const safeUsername = normalizeUsernameValue(senderUsername, 'senderUsername');

  return fetchWithAuth('/contacts/accept', token, {
    method: 'POST',
    body: JSON.stringify({
      username: safeUsername,
    }),
  });
};

// v1.2: stesso cambio di firma di acceptContactRequest, per coerenza con
// routes/contacts.py::reject_request (anch'esso su UsernamePayload).
export const rejectContactRequest = async (senderUsername, token) => {
  const safeUsername = normalizeUsernameValue(senderUsername, 'senderUsername');

  return fetchWithAuth('/contacts/reject', token, {
    method: 'POST',
    body: JSON.stringify({
      username: safeUsername,
    }),
  });
};

// NUOVO: rimuove un'amicizia gia' confermata (routes/contacts.py::
// remove_contact, stesso schema di accept/reject su UsernamePayload).
// Non tocca in alcun modo la chat diretta esistente lato server.
export const removeContact = async (username, token) => {
  const safeUsername = normalizeUsernameValue(username, 'username');

  return fetchWithAuth('/contacts/remove', token, {
    method: 'POST',
    body: JSON.stringify({
      username: safeUsername,
    }),
  });
};

/* ==========================================================================
   NOTIFICATIONS (Step 5)
   ------------------------------------------------------------------------
   Storico ultimi N giorni (default 7) di eventi tipo "hai una richiesta
   da X", "X ha accettato/rifiutato la tua richiesta". Il backend gestisce
   il filtro per data via query param `days` (routes/notifications.py).

   Endpoint REALI confermati:
     GET  /notifications/?days=7
     POST /notifications/:id/read
   ========================================================================== */

// v1.2: aggiunto slash finale sull'endpoint, stesso motivo di getContacts.
export const getNotifications = async (token, days = 7) => {
  const res = await fetchWithAuth(
    '/notifications/',
    token,
    { method: 'GET' },
    { days }
  );
  return Array.isArray(res) ? res.map(normalizeNotification) : [];
};

export const markNotificationRead = async (notificationId, token) => {
  const safeId = normalizeEntityId(notificationId, 'notificationId');

  return fetchWithAuth(
    `/notifications/${encodeURIComponent(safeId)}/read`,
    token,
    { method: 'POST' }
  );
};

/* ==========================================================================
   E2EE HELPERS
   ========================================================================== */

export const ensureIdentityKeyUploaded = async (identityKey, token) => {
  try {
    return await uploadIdentityKey(identityKey, token);
  } catch (e) {
    console.warn('uploadIdentityKey fallita, provo legacy:', e);
    return uploadIdentityKeyLegacy(identityKey, token);
  }
};

export const ensureSufficientOtks = async ({
  token,
  currentCount,
  generateOtks,
  minCount = 10,
  targetCount = 25,
}) => {
  if (!token) {
    throw new Error('Token mancante');
  }

  const count = Number(currentCount ?? 0);

  if (count >= minCount) {
    return {
      uploaded: false,
      previousCount: count,
      generatedCount: 0,
      finalEstimatedCount: count,
    };
  }

  if (typeof generateOtks !== 'function') {
    throw new Error('generateOtks deve essere una funzione');
  }

  const missing = Math.max(targetCount - count, 0);

  if (missing <= 0) {
    return {
      uploaded: false,
      previousCount: count,
      generatedCount: 0,
      finalEstimatedCount: count,
    };
  }

  const newOtks = await generateOtks(missing);
  const normalizedOtks =
    newOtks && typeof newOtks === 'object' && !Array.isArray(newOtks)
      ? Object.fromEntries(
          Object.entries(newOtks)
            .filter(([key, value]) => Boolean(key) && Boolean(value))
            .map(([key, value]) => [String(key), String(value)])
        )
      : {};

  const generatedCount = Object.keys(normalizedOtks).length;

  if (generatedCount === 0) {
    return {
      uploaded: false,
      previousCount: count,
      generatedCount: 0,
      finalEstimatedCount: count,
    };
  }

  const uploadRes = await uploadOneTimeKeys(normalizedOtks, token);

  return {
    uploaded: true,
    previousCount: count,
    generatedCount,
    finalEstimatedCount: count + generatedCount,
    serverResponse: uploadRes,
  };
};

export const bootstrapPeerSession = async ({
  username,
  token,
  identityKey,
  currentOtkCount,
  generateOtks,
  minOtkCount = 10,
  targetOtkCount = 25,
}) => {
  if (!username) {
    throw new Error('username mancante');
  }

  if (!identityKey) {
    throw new Error('identityKey mancante');
  }

  await ensureIdentityKeyUploaded(identityKey, token);

  const otkStatus = await ensureSufficientOtks({
    token,
    currentCount: currentOtkCount,
    generateOtks,
    minCount: minOtkCount,
    targetCount: targetOtkCount,
  });

  const bundle = await getKeyBundle(username, token);

  return {
    otkStatus,
    bundle,
  };
};

// [palacan-nonletti] segna la stanza come letta fino a ora (conteggio reale dei non letti)
export const markRoomRead = async (roomId, token) => {
  const safeRoomId = normalizeRoomId(roomId);
  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/read`, token, { method: 'POST' });
};

// [palacan-metadati-3.4c] gettone della stanza (chiede un membro autenticato; e' uguale per tutti i membri)
export const getRoomToken = async (roomId, token) => {
  const safeRoomId = normalizeRoomId(roomId);
  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/room-token`, token, { method: 'GET' });
};

// [palacan-metadati-3.4c] invio SENZA login: nessuna intestazione Authorization, solo il gettone di stanza
export const sendAnonMessage = async (roomId, roomToken, body) => {
  const safeRoomId = normalizeRoomId(roomId);
  const risposta = await fetch(`${API_URL}/rooms/${encodeURIComponent(safeRoomId)}/anon-messages`, {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json', 'X-Palacan-Room-Token': roomToken },
    body: JSON.stringify(body),
  });
  if (!risposta.ok) {
    const errore = new Error(`invio anonimo non riuscito (${risposta.status})`);
    errore.status = risposta.status;
    throw errore;
  }
  return risposta.json();
};

// [palacan-metadati-3.6] reazione come evento cifrato nelle chat aziendali (salvata senza mittente)
export const sendReactionEvent = async (roomId, body, token) => {
  const safeRoomId = normalizeRoomId(roomId);
  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/reaction-events`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

// [palacan-correzione-blocco-reazioni] periodi di blocco decisi dall'utente, anche conclusi (per il filtro sul dispositivo)
export const getBlockPeriods = async (token) => {
  const risposta = await fetchWithAuth('/users/block-periods', token);  // [palacan-metadati-a4.3b] copia cifrata sul dispositivo
  specchia('periodi_blocco', risposta);
  return risposta;
};

// [palacan-metadati-a2.1] chiave busta per lo scambio delle chiavi senza mittente
export const publishBustaKey = async (publicKey, token) => {
  return fetchWithAuth('/keys/busta', token, {
    method: 'PUT',
    body: JSON.stringify({ public_key: publicKey }),
  });
};

// null se l'utente non ha (ancora) una busta o non si condividono stanze: si usa lo scambio di oggi
export const getBustaKey = async (username, token) => {
  try {
    const res = await fetchWithAuth(`/keys/${encodeURIComponent(username)}/busta`, token, { method: 'GET' });
    return res?.busta_key || null;
  } catch (_) {
    return null;
  }
};

// [palacan-metadati-a4.1b] registra il verificatore del segreto di stanza (una volta sola: vince il primo; 409 se diverso)
export const setRoomVerifier = async (roomId, verificatore, token) => {
  const safeRoomId = normalizeRoomId(roomId);
  return fetchWithAuth(`/rooms/${encodeURIComponent(safeRoomId)}/verificatore`, token, {
    method: 'PUT',
    body: JSON.stringify({ verificatore }),
  });
};

// [palacan-metadati-a4.2b] stato del gruppo cifrato: si legge e si scrive con il gettone di stanza, senza accesso utente
export const getRoomState = async (roomId, roomToken) => {
  const safeRoomId = normalizeRoomId(roomId);
  const risposta = await fetch(`${API_URL}/rooms/${encodeURIComponent(safeRoomId)}/stato`, {
    method: 'GET',
    headers: { 'X-Palacan-Room-Token': roomToken },
  });
  if (!risposta.ok) {
    const errore = new Error(`stato del gruppo non leggibile (${risposta.status})`);
    errore.status = risposta.status;
    throw errore;
  }
  return risposta.json();
};

export const putRoomState = async (roomId, roomToken, stato, versioneAttesa) => {
  const safeRoomId = normalizeRoomId(roomId);
  const risposta = await fetch(`${API_URL}/rooms/${encodeURIComponent(safeRoomId)}/stato`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Palacan-Room-Token': roomToken },
    body: JSON.stringify({ stato, versione_attesa: versioneAttesa }),
  });
  if (!risposta.ok) {
    const errore = new Error(`stato del gruppo non scritto (${risposta.status})`);
    errore.status = risposta.status;
    throw errore;
  }
  return risposta.json();
};

// [palacan-metadati-a4.4c] impronta della propria chiave di recapito (il server non conosce la chiave)
export const setRecapitoImpronta = async (impronta, token) => {
  return fetchWithAuth('/recapito/impronta', token, {
    method: 'PUT',
    body: JSON.stringify({ impronta }),
  });
};

// [palacan-metadati-a4.4c] avviso vuoto a un'altra persona: SENZA accesso utente, il server non sa chi lo manda
export const sendAvvisoRecapito = async (destinatario, chiave) => {
  const risposta = await fetch(`${API_URL}/recapito/avviso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destinatario, chiave }),
  });
  return risposta.ok;
};

// [palacan-pq3] chiavi post-quantum (ML-KEM-768) dei dispositivi (backend: routes/pq_chiavi.py)
export const uploadPqKeys = async ({ deviceId, una = [], riserva = null, sostituisci = false }, token) => fetchWithAuth('/keys/pq/upload', token, {
  method: 'POST',
  body: JSON.stringify({ device_id: deviceId, una, riserva, sostituisci: Boolean(sostituisci) }),  // [palacan-pq5d-bis] anche sostituisci
});

export const getPqCount = async (deviceId, token) => fetchWithAuth('/keys/pq/count', token, { method: 'GET' }, { device_id: deviceId });

export const claimPqKeys = async (username, token) => {
  const res = await fetchWithAuth(`/keys/pq/claim/${encodeURIComponent(username)}`, token, { method: 'POST' });
  return Array.isArray(res?.chiavi) ? res.chiavi : [];
};

// [palacan-pq5b] chiavi di firma post-quantum (ML-DSA-65) dei dispositivi (backend: routes/pq_chiavi.py)
export const putPqFirma = async ({ deviceId, chiave, legameEd, legamePq }, token) => fetchWithAuth('/keys/pq/firma', token, {
  method: 'PUT',
  body: JSON.stringify({ device_id: deviceId, chiave, legame_ed: legameEd, legame_pq: legamePq }),
});

export const getPqFirma = async (username, impronta, token) => fetchWithAuth(
  `/keys/pq/firma/${encodeURIComponent(username)}/${encodeURIComponent(impronta)}`, token, { method: 'GET' },
);

// [palacan-l4c2] chiave principale (ed25519 + ML-DSA-65) e firme dei dispositivi (L4c1)
export const getChiavePrincipale = async (username, token) => fetchWithAuth(
  `/keys/principale/utente/${encodeURIComponent(username)}`, token, { method: 'GET' },
);

export const putChiavePrincipale = async ({ ed, pq, firma_ed, firma_pq, sostituisci = false }, token) => fetchWithAuth('/keys/principale', token, {
  method: 'PUT',
  body: JSON.stringify({ ed, pq, firma_ed, firma_pq, sostituisci }),
});

export const putFirmaDispositivo = async (deviceId, { impronta_principale, firma_ed, firma_pq }, token) => fetchWithAuth(
  `/keys/principale/dispositivi/${encodeURIComponent(deviceId)}`, token, {
    method: 'PUT',
    body: JSON.stringify({ impronta_principale, firma_ed, firma_pq }),
  },
);
