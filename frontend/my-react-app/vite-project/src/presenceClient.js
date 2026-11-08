/**
 * presenceClient.js
 *
 * Canale WebSocket di PRESENZA: UNA sola connessione per tutta la sessione
 * utente (login → logout), indipendente da quale/quante stanze sono aperte.
 * Punta al nuovo endpoint backend /ws/presence/{token} (vedi main.py +
 * ws_manager.ConnectionManager.connect_presence/disconnect_presence).
 *
 * Deliberatamente NON gestisce to_device/room_encrypted/message: il server,
 * su questo canale, accetta in ingresso solo messaggi { type: 'ping' } di
 * heartbeat e risponde { type: 'pong' }. Tutta la logica Olm/Megolm resta
 * sull'unico socket di stanza esistente (wsClient.js) — questo file non
 * importa né tocca nulla legato a olmService.
 *
 * Stesso pattern di riconnessione di wsClient.js (backoff esponenziale con
 * jitter + heartbeat con timeout), riusando la sua getWsBaseUrl() esportata
 * per costruire l'URL ws:///wss:// da API_URL, così la logica non è
 * duplicata in due file (se cambia come viene gestito API_URL, va
 * aggiornata in un solo posto). A differenza di wsClient.js, qui non esiste
 * nessuna coda messaggi per stanza: l'unico messaggio che il client invia è
 * il ping.
 */

import { getWsBaseUrl } from './wsClient';

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 10000;

let ws = null;
let reconnectAttempt = 0;
let reconnectTimeout = null;
let heartbeatInterval = null;
let heartbeatTimeout = null;
let currentToken = null;
let currentCallbacks = {};
let manuallyClosed = true;

const clearHeartbeatTimers = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (heartbeatTimeout) {
    clearTimeout(heartbeatTimeout);
    heartbeatTimeout = null;
  }
};

const startHeartbeat = () => {
  clearHeartbeatTimers();

  heartbeatInterval = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    try {
      ws.send(JSON.stringify({ type: 'ping' }));
    } catch (e) {
      console.error('❌ Presence ping fallito:', e);
    }

    // Se non arriva un pong entro il timeout, forziamo la riconnessione:
    // il socket potrebbe essere "morto" senza che onclose sia ancora
    // scattato (es. cambio di rete, sleep del dispositivo).
    heartbeatTimeout = setTimeout(() => {
      console.warn('⚠️ Presence heartbeat timeout, forzo riconnessione');
      try {
        ws?.close();
      } catch (_) {}
    }, HEARTBEAT_TIMEOUT_MS);
  }, HEARTBEAT_INTERVAL_MS);
};

const scheduleReconnect = () => {
  if (manuallyClosed || !currentToken) return;

  const delay = Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt,
    RECONNECT_MAX_DELAY_MS
  );
  const jitter = Math.random() * 0.3 * delay;

  reconnectAttempt += 1;

  reconnectTimeout = setTimeout(() => {
    openSocket(currentToken, currentCallbacks);
  }, delay + jitter);
};

function openSocket(token, callbacks) {
  currentToken = token;
  currentCallbacks = callbacks || {};

  const base = getWsBaseUrl();
  const url = `${base}/ws/presence`;

  try {
    ws = new WebSocket(url);
  } catch (e) {
    console.error('❌ Presence WS creation failed:', e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectAttempt = 0;

    // Fix sicurezza: il token non viaggia piu' nell'URL - va mandato
    // come primo messaggio, il server lo aspetta prima di autenticare.
    try {
      ws.send(JSON.stringify({ type: 'auth', token }));
    } catch (e) {
      console.error('❌ Presence auth send fallito:', e);
    }

    startHeartbeat();
    console.log('🟢 Presence channel connesso');
    currentCallbacks.onOpen?.();
  };

  ws.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (_) {
      return;
    }

    // Il pong resetta solo il timeout dell'heartbeat, non viene mai
    // propagato al chiamante: non è un evento contatto.
    if (data?.type === 'pong') {
      if (heartbeatTimeout) {
        clearTimeout(heartbeatTimeout);
        heartbeatTimeout = null;
      }
      return;
    }

    currentCallbacks.onMessage?.(data);
  };

  ws.onerror = (e) => {
    console.error('❌ Presence WS error:', e);
  };

  ws.onclose = () => {
    clearHeartbeatTimers();
    ws = null;

    if (!manuallyClosed) {
      console.warn('⚠️ Presence channel disconnesso, riprogrammo riconnessione');
      scheduleReconnect();
    }
  };
}

/**
 * Apre il canale di presenza per la sessione corrente. Se una connessione
 * era già aperta (es. cambio account senza refresh pagina), la chiude
 * prima di aprirne una nuova.
 *
 * callbacks:
 *   onOpen: () => void
 *   onMessage: (data: object) => void   // mai chiamata per { type: 'pong' }
 */
export function connectPresence(token, callbacks = {}) {
  if (!token) return;

  if (ws) {
    disconnectPresence();
  }

  manuallyClosed = false;
  reconnectAttempt = 0;

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  openSocket(token, callbacks);
}

/**
 * Chiude il canale di presenza in modo esplicito e disattiva la
 * riconnessione automatica finché non si richiama connectPresence().
 */
/**
 * Restituisce true se il canale di presenza e' attualmente connesso e
 * pronto (WebSocket.OPEN). Serve a chi vuole forzare una riconnessione
 * SOLO se davvero necessaria, evitando di buttare giu' e ricostruire una
 * connessione gia' sana (causa di una tempesta di riconnessioni se
 * chiamato troppo spesso, es. da un listener visibilitychange che scatta
 * piu' volte del previsto su alcuni browser mobili).
 */
export function isPresenceConnected() {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

export function disconnectPresence() {
  manuallyClosed = true;
  currentToken = null;
  currentCallbacks = {};

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  clearHeartbeatTimers();

  if (ws) {
    try {
      ws.close();
    } catch (_) {}
    ws = null;
  }
}