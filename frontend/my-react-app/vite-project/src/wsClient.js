// src/wsClient.js
//
// FIX applicato (unico cambiamento rispetto all'originale):
// - messageQueue era GLOBALE (non legata alla roomId), ma il socket è scoped
//   per stanza (/ws/{roomId}/{token}). Cambiando stanza, i messaggi rimasti
//   in coda per la stanza precedente venivano "flushati" nel socket della
//   NUOVA stanza al successivo onopen → messaggi persi / inoltrati alla
//   room sbagliata / bisogno di uscire e rientrare per "sbloccare".
// - Sostituito l'array globale con una Map roomId -> array, così flushQueue()
//   invia solo i messaggi che appartengono davvero alla stanza appena connessa.
// - Nessuna firma di funzione esportata è stata modificata.
//
// v1.10-T: aggiunta sendSessionReset(), allineata a sendAck() per stile e
// comportamento. Manda un segnale leggero "ho azzerato le mie sessioni
// Olm 1:1" ai membri di una stanza (vedi App.jsx, handleLogin/
// handleEnterpriseSubmit dopo un recupero backup riuscito, e main.py, nuovo
// branch "session_reset"). Zero materiale crittografico nel payload: solo
// room_id. queueIfDisconnected: false, stesso principio di sendAck — se il
// socket cade in quel preciso istante non è un problema: è solo un'occasione
// in meno di correggere proattivamente una sessione stale, non una perdita
// di dati applicativi.
//
// v-next (Step 5, canale di presenza): getWsBaseUrl() è ora ESPORTATA
// (prima era una funzione privata del modulo). Serve a presenceClient.js
// per costruire l'URL del nuovo canale /ws/presence/{token} con la stessa
// identica logica http(s)://→ws(s):// usata qui, senza duplicarla in due
// file. Nessun'altra logica di questo modulo è cambiata: wsClient.js
// resta l'unico proprietario del socket di STANZA; presenceClient.js
// gestirà un socket completamente separato, nel proprio modulo, con le
// proprie variabili module-scope (nessuna condivisione di stato tra i due).
//
// NUOVO — v1.12-S: fix "callback stale su socket riusato". connect() è un
// singleton a livello di modulo: se il socket per la stessa roomId/token è
// già aperto (sameSocketOpen) o sta già aprendosi (isConnecting), la
// funzione ritornava subito SENZA toccare gli event handler del socket
// esistente. Il problema: ws.onopen/onmessage/onclose/onerror, quando il
// socket è stato creato, catturano in chiusura JS l'oggetto `callbacks`
// del PARAMETRO di QUELLA chiamata a connect() — non "le callback più
// recenti". Se un componente React richiama connect(roomId, token, cb)
// più volte con lo stesso roomId/token (tipicissimo: ogni render/remount,
// ogni volta che cambia una dipendenza di useEffect, o con
// StrictMode/HMR), le chiamate successive ritornavano subito e gli
// handler continuavano a invocare le callback della PRIMISSIMA connect(),
// che potevano riferirsi a state/setter React ormai superati o a un
// componente smontato. Sintomo osservato in produzione: il socket si
// connette e riceve messaggi regolarmente (log "✅ WebSocket connesso",
// nessun errore), ma i messaggi non arrivano mai a schermo per nessuno dei
// due utenti — perché venivano consegnati a callback "vecchie" che non
// aggiornavano più lo stato visibile.
// Fix: gli handler del socket non catturano più il parametro `callbacks`
// della connect() che li ha creati. Leggono invece SEMPRE
// `lastParams.callbacks` al momento dell'evento, tramite il nuovo helper
// privato `currentCallbacks()`. `lastParams.callbacks` viene aggiornato a
// OGNI chiamata di connect() (anche quelle che ritornano subito perché il
// socket è già aperto/in connessione), quindi gli handler restano sempre
// agganciati alle callback più recenti indipendentemente da quale
// invocazione di connect() abbia effettivamente creato il WebSocket.
// Nessuna firma esportata, nessun altro comportamento è stato toccato.

import { API_URL } from './apiService';
import { gettoneInMemoria } from './utils/segretiStanze';  // [palacan-metadati-a4.4b]

let socket = null;
let reconnectTimeout = null;
let pingInterval = null;
let pongTimeout = null;

let currentRetryCount = 0;
let isManualDisconnect = false;
let isConnecting = false;
let lastPongAt = 0;

const MAX_RETRY_DELAY = 30000;
const PING_INTERVAL_MS = 25000;
const PONG_TIMEOUT_MS = 12000;
const MAX_QUEUE_SIZE = 200; // per-stanza, non più globale

let lastParams = {
  roomId: null,
  token: null,
  callbacks: null,
};

// v1.12-S: unico punto di lettura delle callback "vive". Tutti gli event
// handler del socket (onopen/onmessage/onclose/onerror) e le funzioni di
// heartbeat passano da qui invece di chiudere su un parametro `callbacks`
// catturato al momento della creazione del socket — vedi changelog sopra.
function currentCallbacks() {
  return lastParams.callbacks || {};
}

// Coda messaggi PER STANZA: roomId -> messaggio[]
// (prima era `let messageQueue = [];` globale — causa del bug B)
let messageQueuesByRoom = new Map();

// v-next: esportata (era `function`, ora `export function`) per essere
// riusata da presenceClient.js. Comportamento identico, zero modifiche
// alla logica.
export function getWsBaseUrl() {
  if (!API_URL) {
    throw new Error('API_URL non configurata');
  }

  return API_URL.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
}

function buildWsUrl(roomId) {
  const wsBase = getWsBaseUrl();
  return `${wsBase}/ws/${encodeURIComponent(roomId)}`;
}

function clearReconnectTimeout() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

function clearPingInterval() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

function clearPongTimeout() {
  if (pongTimeout) {
    clearTimeout(pongTimeout);
    pongTimeout = null;
  }
}

function cleanupSocketHandlers(wsInstance) {
  if (!wsInstance) return;
  wsInstance.onopen = null;
  wsInstance.onmessage = null;
  wsInstance.onclose = null;
  wsInstance.onerror = null;
}

function isSocketOpen() {
  return Boolean(socket && socket.readyState === WebSocket.OPEN);
}

function isSocketConnecting() {
  return Boolean(socket && socket.readyState === WebSocket.CONNECTING);
}

// Determina a quale stanza appartiene un messaggio in coda.
// Fallback su lastParams.roomId se il messaggio non porta room_id (es. ping).
function resolveRoomKeyForMessage(message) {
  return message?.room_id ?? message?.roomId ?? lastParams.roomId ?? '__no_room__';
}

function getRoomQueue(roomKey) {
  if (!messageQueuesByRoom.has(roomKey)) {
    messageQueuesByRoom.set(roomKey, []);
  }
  return messageQueuesByRoom.get(roomKey);
}

// [palacan-n3] session_reset ora resta in coda se la connessione della stanza non e' ancora aperta (prima si
// scartava: dopo un recupero il contatto se ne accorgeva solo dopo ~1 minuto di tentativi). Uno rimasto in coda
// oltre SESSION_RESET_MAX_ATTESA_MS non serve piu' e si lascia cadere.
const accodatoIl = new WeakMap();
const SESSION_RESET_MAX_ATTESA_MS = 120000;

function enqueueMessage(message) {
  if (!message) return;
  if (!accodatoIl.has(message)) accodatoIl.set(message, Date.now());  // [palacan-n3]

  const roomKey = resolveRoomKeyForMessage(message);
  const queue = getRoomQueue(roomKey);

  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift();
    console.warn(`⚠️ WS queue piena per room ${roomKey}, rimosso il messaggio più vecchio.`);
  }

  queue.push(message);
}

// Flush SOLO della coda relativa alla stanza correntemente connessa.
// Questo è il cuore del fix: prima flushava una coda globale che poteva
// contenere messaggi di una stanza diversa da quella appena aperta.
function flushQueue() {
  if (!isSocketOpen() || !socket) return;

  const roomKey = lastParams.roomId ?? '__no_room__';
  const queue = messageQueuesByRoom.get(roomKey);

  if (!queue || queue.length === 0) return;

  const pending = [...queue];
  messageQueuesByRoom.set(roomKey, []);

  for (const message of pending) {
    if (message?.type === 'session_reset' && Date.now() - (accodatoIl.get(message) || 0) > SESSION_RESET_MAX_ATTESA_MS) continue;  // [palacan-n3]
    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      console.error('❌ Errore flush coda WS:', error);
      enqueueMessage(message);
      break;
    }
  }
}

// v1.12-S: non prende più `callbacks` come parametro — legge sempre
// currentCallbacks() al momento in cui scatta il timeout, così anche un
// pong-timeout pianificato da una vecchia connessione userà comunque le
// callback più recenti se nel frattempo connect() è stato richiamato.
function schedulePongTimeout() {
  clearPongTimeout();

  pongTimeout = setTimeout(() => {
    console.warn('⚠️ Pong timeout: connessione considerata persa.');
    currentCallbacks()?.onHeartbeatTimeout?.();

    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.close(4001, 'Pong timeout');
      } catch (_) {}
    }
  }, PONG_TIMEOUT_MS);
}

// v1.12-S: come sopra, niente più parametro `callbacks` catturato.
function startHeartbeat() {
  clearPingInterval();
  clearPongTimeout();

  pingInterval = setInterval(() => {
    if (!isSocketOpen() || !socket) return;

    try {
      socket.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      currentCallbacks()?.onHeartbeat?.();
      schedulePongTimeout();
    } catch (error) {
      console.error('❌ Errore heartbeat WS:', error);
    }
  }, PING_INTERVAL_MS);
}

function normalizeContent(content) {
  if (!content || typeof content !== 'object') return content;

  return {
    ...content,
    ciphertext: content.ciphertext ?? content.cipher_body ?? null,
    cipher_body: content.cipher_body ?? content.ciphertext ?? null,
    messageType: content.messageType ?? content.messagetype ?? null,
    messagetype: content.messagetype ?? content.messageType ?? null,
    roomKey: content.roomKey ?? content.roomkey ?? null,
    roomkey: content.roomkey ?? content.roomKey ?? null,
    sender_key: content.sender_key ?? content.senderKey ?? null,
    senderKey: content.senderKey ?? content.sender_key ?? null,
    session_id: content.session_id ?? content.sessionId ?? null,
    sessionId: content.sessionId ?? content.session_id ?? null,
  };
}

function normalizeIncomingData(data) {
  if (!data || typeof data !== 'object') return data;

  const type = data.type ?? null;
  const eventType = data.event_type ?? data.eventType ?? null;
  const roomId = data.room_id ?? data.roomId ?? null;
  const sessionId =
    data.session_id ??
    data.sessionId ??
    data.content?.session_id ??
    data.content?.sessionId ??
    null;

  const cipherBody =
    data.cipher_body ??
    data.cipherBody ??
    data.ciphertext ??
    data.content?.cipher_body ??
    data.content?.ciphertext ??
    null;

  const senderUsername =
    data.sender_username ?? data.senderUsername ?? data.sender ?? null;

  const senderKey =
    data.sender_key ??
    data.senderKey ??
    data.content?.sender_key ??
    data.content?.senderKey ??
    null;

  const algorithm = data.algorithm ?? data.content?.algorithm ?? null;

  const normalizedMeta = {
    isToDevice:
      type === 'to_device' ||
      type === 'to_device_event' ||
      eventType === 'm.room_key',
    isRoomEncrypted:
      type === 'room_encrypted' ||
      eventType === 'm.room.encrypted' ||
      (!type && !eventType && algorithm === 'm.megolm.v1.aes-sha2'),
    isLegacyMessage: type === 'message',
    receivedAt: Date.now(),
  };

  return {
    ...data,
    meta: normalizedMeta,
    _meta: normalizedMeta,

    room_id: roomId,
    roomId,

    session_id: sessionId,
    sessionId,

    cipher_body: cipherBody,
    cipherBody,
    ciphertext: cipherBody,

    event_type: eventType,
    eventType,

    sender_key: senderKey,
    senderKey,

    algorithm,
    client_msg_id: data.client_msg_id ?? data.clientMsgId ?? null,
    clientMsgId: data.clientMsgId ?? data.client_msg_id ?? null,

    sender_username: senderUsername,
    senderUsername,

    created_at: data.created_at ?? data.createdat ?? data.timestamp ?? null,
    createdat: data.createdat ?? data.created_at ?? data.timestamp ?? null,
    timestamp: data.timestamp ?? data.created_at ?? data.createdat ?? null,

    content: normalizeContent(data.content),
  };
}

// v1.12-S: non prende più `callbacks` come parametro — legge sempre
// currentCallbacks(), coerentemente con tutto il resto del modulo.
function emitStatus(extra = {}) {
  const roomKey = lastParams.roomId ?? '__no_room__';
  const currentRoomQueueLength = messageQueuesByRoom.get(roomKey)?.length ?? 0;

  currentCallbacks()?.onStatusChange?.({
    connected: isSocketOpen(),
    connecting: isSocketConnecting() || isConnecting,
    readyState: socket ? socket.readyState : WebSocket.CLOSED,
    retryCount: currentRetryCount,
    queuedMessages: currentRoomQueueLength,
    lastPongAt,
    roomId: lastParams.roomId,
    ...extra,
  });
}

function shouldReconnect(closeEvent) {
  if (isManualDisconnect) return false;

  const code = closeEvent?.code;

  if (code === 1000) return false;
  if (code === 1008) return false;

  return true;
}

function attemptReconnect() {
  clearReconnectTimeout();

  if (isManualDisconnect) return;
  if (!lastParams.roomId || !lastParams.token) return;

  const baseDelay = Math.min(1000 * Math.pow(2, currentRetryCount), MAX_RETRY_DELAY);
  const jitter = Math.floor(Math.random() * 500);
  const delay = baseDelay + jitter;

  console.log(`🔄 Riconnessione WS tra ${(delay / 1000).toFixed(1)}s...`);

  reconnectTimeout = setTimeout(() => {
    if (isManualDisconnect) return;
    if (!lastParams.roomId || !lastParams.token) return;
    if (isConnecting || isSocketConnecting()) return;

    currentRetryCount += 1;
    connect(lastParams.roomId, lastParams.token, lastParams.callbacks);
  }, delay);
}

export function connect(roomId, token, callbacks = {}) {
  if (!roomId) {
    throw new Error('roomId mancante');
  }

  if (!token) {
    throw new Error('token mancante');
  }

  const sameParams = lastParams.roomId === roomId && lastParams.token === token;

  // v1.12-S: questo aggiornamento di lastParams.callbacks è la parte che
  // rende il fix efficace: anche quando questa chiamata a connect() sta
  // per ritornare subito (socket già aperto/in connessione) SENZA toccare
  // il socket esistente, gli event handler di quel socket leggeranno
  // comunque queste callback aggiornate al prossimo evento, perché non le
  // catturano più in chiusura ma le rileggono da lastParams tramite
  // currentCallbacks(). Vedi changelog in testa al file.
  lastParams = { roomId, token, callbacks };
  isManualDisconnect = false;

  if (isConnecting || isSocketConnecting()) {
    console.log('⚠️ WS già in connessione, skip connect().');
    emitStatus({ roomId });
    return;
  }

  const sameSocketOpen = socket && socket.readyState === WebSocket.OPEN && sameParams;
  if (sameSocketOpen) {
    console.log('ℹ️ WS già connesso.');
    emitStatus({ connected: true, roomId });
    return;
  }

  if (socket) {
    const oldSocket = socket;
    socket = null;
    cleanupSocketHandlers(oldSocket);
    try {
      oldSocket.close();
    } catch (_) {}
  }

  clearPingInterval();
  clearPongTimeout();
  clearReconnectTimeout();

  const wsUrl = buildWsUrl(roomId);

  console.log(`📡 WS Connecting (attempt ${currentRetryCount + 1}) → ${roomId}`);
  isConnecting = true;
  emitStatus({ roomId });

  const ws = new WebSocket(wsUrl);
  socket = ws;

  ws.onopen = () => {
    if (socket !== ws) return;

    isConnecting = false;
    currentRetryCount = 0;
    lastPongAt = Date.now();

    clearReconnectTimeout();
    clearPongTimeout();

    console.log('✅ WebSocket connesso');

    // Fix sicurezza: il token non viaggia piu' nell'URL (finiva nei
    // log in chiaro) - va mandato come primo messaggio dopo l'apertura,
    // il server lo aspetta prima di autenticare la connessione (vedi
    // main.py). token e' chiuso in questa closure dalla connect() che
    // ha creato QUESTO socket - il guard 'socket !== ws' sopra assicura
    // che sia ancora quello corrente.
    try {
      const gettoneStanza = gettoneInMemoria(lastParams.roomId);  // [palacan-metadati-a4.4b] solo se c'e'
      ws.send(JSON.stringify(gettoneStanza ? { type: 'auth', token, gettone_stanza: gettoneStanza } : { type: 'auth', token }));
    } catch (error) {
      console.error('❌ Errore invio auth WS:', error);
    }

    startHeartbeat();
    flushQueue();

    currentCallbacks()?.onOpen?.();
    emitStatus({ connected: true, roomId });
  };

  ws.onmessage = (event) => {
    if (socket !== ws) return;

    try {
      const parsed = JSON.parse(event.data);

      if (parsed?.type === 'pong') {
        lastPongAt = Date.now();
        clearPongTimeout();
        currentCallbacks()?.onPong?.(parsed);
        emitStatus({ connected: true, roomId });
        return;
      }

      const data = normalizeIncomingData(parsed);
      const callbacks = currentCallbacks();

      if (data?.meta?.isToDevice) {
        callbacks?.onToDeviceMessage?.(data);
      }

      if (data?.meta?.isRoomEncrypted) {
        callbacks?.onEncryptedRoomMessage?.(data);
      }

      if (data?.meta?.isLegacyMessage) {
        callbacks?.onLegacyMessage?.(data);
      }

      callbacks?.onMessage?.(data);
    } catch (error) {
      console.error('❌ WS Parse Error:', error);
      currentCallbacks()?.onError?.(error);
    }
  };

  ws.onclose = (event) => {
    if (socket === ws) {
      socket = null;
    }

    isConnecting = false;
    clearPingInterval();
    clearPongTimeout();

    console.log(
      `🔌 WS chiuso: code=${event?.code ?? 'n/a'} reason=${event?.reason || 'Connection lost'}`
    );

    currentCallbacks()?.onClose?.(event);
    emitStatus({
      connected: false,
      code: event?.code,
      reason: event?.reason || '',
      roomId,
    });

    cleanupSocketHandlers(ws);

    if (shouldReconnect(event)) {
      attemptReconnect();
    } else if (isManualDisconnect || event?.code === 1000) {
      console.log('⚠️ Chiusura volontaria/normale, nessuna riconnessione.');
    } else if (event?.code === 1008) {
      console.warn('⛔ WS chiuso per policy/auth, niente reconnessione automatica.');
    }
  };

  ws.onerror = (error) => {
    if (socket !== ws) return;
    console.error('❌ WS Error:', error);
    currentCallbacks()?.onError?.(error);
    emitStatus({ roomId });
  };
}

export function sendMessage(message, { queueIfDisconnected = true } = {}) {
  if (!message || typeof message !== 'object') {
    console.warn('⚠️ Messaggio WS non valido:', message);
    return false;
  }

  if (isSocketOpen() && socket) {
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('❌ Errore sendMessage:', error);
      if (queueIfDisconnected) {
        enqueueMessage(message);
      }
      return false;
    }
  }

  if (queueIfDisconnected) {
    enqueueMessage(message);
    console.warn('⚠️ WS non pronto, messaggio messo in coda:', message?.type);
  } else {
    console.warn('🚫 WS non pronto, messaggio scartato:', message?.type);
  }

  return false;
}

export function sendPing() {
  return sendMessage({ type: 'ping', ts: Date.now() }, { queueIfDisconnected: false });
}

export function sendAck({
  eventId = null,
  clientMsgId = null,
  roomId = null,
  targetUsername = null,
}) {
  return sendMessage(
    {
      type: 'ack',
      event_id: eventId,
      eventId,
      client_msg_id: clientMsgId,
      clientMsgId,
      room_id: roomId,
      roomId,
      target_username: targetUsername,
      targetUsername,
    },
    { queueIfDisconnected: false }
  );
}

// v1.10-T: segnale leggero "ho azzerato le mie sessioni Olm 1:1" verso i
// membri di una stanza. Nessun materiale crittografico nel payload — solo
// room_id. Vedi App.jsx (handleLogin/handleEnterpriseSubmit, dopo un
// recupero backup riuscito) e main.py (branch "session_reset", relay
// broadcast agli altri membri della stanza).
// v1.13-B (FIX MIRATO): throttle per-room sull'invio di session_reset.
// Senza questo, due session_reset ravvicinati per la stessa stanza (es.
// uno scatenato dal timeout di attesa room key, uno dal catch di
// handleToDeviceEvent) innescano ciascuno un nuovo giro di
// ensureRoomKeyShared sul lato ricevente, che crea una sessione 1:1
// outbound fresca mentre l'altra è ancora in volo: la seconda room key
// in arrivo trova il ratchet già avanzato dalla prima e fallisce come
// "non pre-key", generando un altro session_reset — loop che si
// autoalimenta. Non inviamo più di un session_reset per la stessa
// roomId ogni 5 secondi: il primo scambio ha così il tempo di
// completarsi prima che ne parta un secondo in conflitto. Nessuna
// firma toccata, stesso comportamento per il resto.
const lastSessionResetAtByRoom = new Map();
const SESSION_RESET_THROTTLE_MS = 5000;

export function sendSessionReset({ roomId = null } = {}) {
  const roomKey = roomId != null ? String(roomId) : '__no_room__';
  const now = Date.now();
  const lastSentAt = lastSessionResetAtByRoom.get(roomKey) || 0;

  if (now - lastSentAt < SESSION_RESET_THROTTLE_MS) {
    console.log(`⏳ session_reset per room ${roomKey} soppresso (throttle attivo)`);
    return false;
  }

  lastSessionResetAtByRoom.set(roomKey, now);

  return sendMessage(
    {
      type: 'session_reset',
      room_id: roomId,
      roomId,
    },
    { queueIfDisconnected: true }  // [palacan-n3] in coda finche' la connessione non e' aperta (prima: scartato)
  );
}

export function sendToDevice({
  eventType = 'm.room_key',
  targetUsername,
  content,
  roomId = null,
  clientMsgId = null,
  algorithm = null,
  senderKey = null,
}) {
  if (!targetUsername) {
    throw new Error('targetUsername mancante');
  }

  if (content === undefined || content === null) {
    throw new Error('content mancante');
  }

  const normalizedContent =
    content && typeof content === 'object'
      ? {
          ...content,
          sender_key: content.sender_key ?? content.senderKey ?? senderKey ?? null,
          senderKey: content.senderKey ?? content.sender_key ?? senderKey ?? null,
          algorithm: content.algorithm ?? algorithm ?? null,
        }
      : content;

  return sendMessage({
    type: 'to_device',
    event_type: eventType,
    eventType,
    target_username: targetUsername,
    targetUsername,
    room_id: roomId,
    roomId,
    algorithm,
    sender_key: senderKey,
    senderKey,
    client_msg_id: clientMsgId,
    clientMsgId,
    content: normalizedContent,
  });
}

export function sendRoomEncrypted({
  roomId,
  cipherBody,
  sessionId,
  algorithm = 'm.megolm.v1.aes-sha2',
  senderKey = null,
  clientMsgId = null,
  cipherType = null,
}) {
  if (!roomId) {
    throw new Error('roomId mancante');
  }

  if (!cipherBody) {
    throw new Error('cipherBody mancante');
  }

  return sendMessage({
    type: 'room_encrypted',
    event_type: 'm.room.encrypted',
    eventType: 'm.room.encrypted',
    room_id: roomId,
    roomId,
    algorithm,
    session_id: sessionId,
    sessionId,
    sender_key: senderKey,
    senderKey,
    cipher_body: cipherBody,
    cipherBody,
    ciphertext: cipherBody,
    cipher_type: cipherType,
    cipherType,
    client_msg_id: clientMsgId,
    clientMsgId,
  });
}

export function sendLegacyMessage({
  roomId,
  cipherBody,
  cipherType = 1,
  targetUsername = null,
  clientMsgId = null,
  senderKey = null,
}) {
  if (!roomId) {
    throw new Error('roomId mancante');
  }

  if (!cipherBody) {
    throw new Error('cipherBody mancante');
  }

  return sendMessage({
    type: 'message',
    room_id: roomId,
    roomId,
    cipher_body: cipherBody,
    cipherBody,
    ciphertext: cipherBody,
    cipher_type: cipherType,
    cipherType,
    target_username: targetUsername,
    targetUsername,
    sender_key: senderKey,
    senderKey,
    client_msg_id: clientMsgId,
    clientMsgId,
  });
}

export function disconnect(options = {}) {
  const {
    clearSessionParams = false,
    clearQueue = false,
  } = options;

  isManualDisconnect = true;
  isConnecting = false;

  clearReconnectTimeout();
  clearPingInterval();
  clearPongTimeout();

  currentRetryCount = 0;
  lastPongAt = 0;

  if (clearQueue) {
    // Svuota TUTTE le code (tutte le stanze) — usato tipicamente su hardDisconnect/logout.
    messageQueuesByRoom.clear();
  }

  if (clearSessionParams) {
    lastParams = {
      roomId: null,
      token: null,
      callbacks: null,
    };
  }

  if (socket) {
    const ws = socket;
    socket = null;

    try {
      ws.close(1000, 'Manual disconnect');
    } catch (_) {}

    cleanupSocketHandlers(ws);
  }

  console.log('🔌 WS disconnesso manualmente.');
}

export function hardDisconnect() {
  disconnect({ clearSessionParams: true, clearQueue: true });
}

export function reconnectNow() {
  if (isManualDisconnect) {
    isManualDisconnect = false;
  }

  clearReconnectTimeout();

  if (!lastParams.roomId || !lastParams.token) {
    console.warn('⚠️ Nessun parametro salvato per reconnectNow().');
    return;
  }

  connect(lastParams.roomId, lastParams.token, lastParams.callbacks);
}

export function isConnected() {
  return isSocketOpen();
}

export function getReadyState() {
  return socket ? socket.readyState : WebSocket.CLOSED;
}

// Conta i messaggi in coda per la stanza CORRENTE (comportamento equivalente
// a prima quando la coda era globale e c'era una sola stanza alla volta).
export function getQueuedMessagesCount() {
  const roomKey = lastParams.roomId ?? '__no_room__';
  return messageQueuesByRoom.get(roomKey)?.length ?? 0;
}

export function getConnectionInfo() {
  return {
    connected: isSocketOpen(),
    connecting: isSocketConnecting() || isConnecting,
    readyState: getReadyState(),
    retryCount: currentRetryCount,
    queuedMessages: getQueuedMessagesCount(),
    lastPongAt,
    roomId: lastParams.roomId,
  };
}