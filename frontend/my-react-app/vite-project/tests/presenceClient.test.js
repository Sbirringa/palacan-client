// tests/presenceClient.test.js
//
// Test sul canale di presenza (heartbeat, riconnessione, auth a
// messaggio). Stesso principio di WebSocket finto controllabile a
// mano gia' usato per wsClient.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class WebSocketFinto {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = WebSocketFinto.CONNECTING;
    this.messaggiInviati = [];
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    WebSocketFinto.ultimaIstanza = this;
  }

  send(data) {
    this.messaggiInviati.push(data);
  }

  close() {
    this.readyState = WebSocketFinto.CLOSED;
    this.onclose?.({});
  }

  simulaApertura() {
    this.readyState = WebSocketFinto.OPEN;
    this.onopen?.();
  }

  simulaMessaggio(dati) {
    this.onmessage?.({ data: JSON.stringify(dati) });
  }

  simulaChiusuraInattesa() {
    // Diverso da close() - simula il server/rete che chiude SENZA che
    // sia stata l'app a chiamare disconnectPresence().
    this.readyState = WebSocketFinto.CLOSED;
    this.onclose?.({});
  }
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  global.WebSocket = WebSocketFinto;
  WebSocketFinto.ultimaIstanza = null;
});

afterEach(() => {
  // FIX (scoperto con un fallimento reale, non assunto): vi.resetModules()
  // azzera SOLO il registro dei moduli - non cancella i timer finti gia'
  // programmati dall'istanza di modulo del test PRECEDENTE (es. un
  // heartbeatInterval mai fermato perche' quel test non chiamava
  // disconnectPresence). Senza questa pulizia esplicita, un avanzamento
  // di tempo in un test SUCCESSIVO fa scattare timer "fantasma" del test
  // precedente, contaminando i risultati - non e' un bug dell'app, e'
  // un requisito dell'ambiente di test con fake timer + moduli reimportati.
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('presenceClient — connessione base e autenticazione', () => {
  it('dopo l\'apertura, manda subito un messaggio di autenticazione con il token (mai nell\'URL)', async () => {
    const { connectPresence } = await import('../src/presenceClient.js');

    connectPresence('token_segreto_presenza', { onOpen: () => {} });
    const socket = WebSocketFinto.ultimaIstanza;

    expect(socket.url).not.toContain('token_segreto_presenza');

    socket.simulaApertura();

    const primoMessaggio = JSON.parse(socket.messaggiInviati[0]);
    expect(primoMessaggio).toEqual({ type: 'auth', token: 'token_segreto_presenza' });
  });

  it('senza un token, non fa nulla (nessun socket creato)', async () => {
    const { connectPresence } = await import('../src/presenceClient.js');
    connectPresence(null, {});
    expect(WebSocketFinto.ultimaIstanza).toBeNull();
  });
});

describe('presenceClient — i messaggi "pong" sono sempre trattenuti, mai propagati al chiamante', () => {
  it('un messaggio pong NON attiva mai onMessage, un messaggio normale sì', async () => {
    const { connectPresence } = await import('../src/presenceClient.js');

    const onMessage = vi.fn();
    connectPresence('token_test', { onOpen: () => {}, onMessage });
    const socket = WebSocketFinto.ultimaIstanza;
    socket.simulaApertura();

    socket.simulaMessaggio({ type: 'pong' });
    expect(onMessage).not.toHaveBeenCalled();

    socket.simulaMessaggio({ type: 'contact_online', username: 'bob' });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ type: 'contact_online', username: 'bob' });
  });
});

describe('presenceClient — riconnessione automatica solo se NON chiusa manualmente', () => {
  it('una chiusura INATTESA (rete/server) programma una riconnessione', async () => {
    const { connectPresence, isPresenceConnected } = await import('../src/presenceClient.js');

    connectPresence('token_test2', { onOpen: () => {} });
    const primoSocket = WebSocketFinto.ultimaIstanza;
    primoSocket.simulaApertura();

    expect(isPresenceConnected()).toBe(true);

    primoSocket.simulaChiusuraInattesa();
    expect(isPresenceConnected()).toBe(false);

    // Avanziamo il tempo oltre il ritardo di riconnessione - un NUOVO
    // socket deve essere stato creato automaticamente.
    await vi.advanceTimersByTimeAsync(2000);

    expect(WebSocketFinto.ultimaIstanza).not.toBe(primoSocket);
  });

  it('disconnectPresence() esplicita NON programma alcuna riconnessione', async () => {
    const { connectPresence, disconnectPresence } = await import('../src/presenceClient.js');

    connectPresence('token_test3', { onOpen: () => {} });
    const primoSocket = WebSocketFinto.ultimaIstanza;
    primoSocket.simulaApertura();

    disconnectPresence();

    // Avanziamo il tempo ben oltre qualunque ritardo di riconnessione -
    // NESSUN nuovo socket deve essere stato creato.
    await vi.advanceTimersByTimeAsync(35000);

    expect(WebSocketFinto.ultimaIstanza).toBe(primoSocket);
  });
});

describe('presenceClient — isPresenceConnected', () => {
  it('restituisce false prima della connessione e true dopo l\'apertura', async () => {
    const { connectPresence, isPresenceConnected } = await import('../src/presenceClient.js');

    expect(isPresenceConnected()).toBe(false);

    connectPresence('token_test4', { onOpen: () => {} });
    expect(isPresenceConnected()).toBe(false); // ancora CONNECTING, non OPEN

    WebSocketFinto.ultimaIstanza.simulaApertura();
    expect(isPresenceConnected()).toBe(true);
  });
});