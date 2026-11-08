// tests/wsClient.test.js
//
// Test su wsClient.js con un WebSocket FINTO controllabile a mano
// (nessun WebSocket vero: qui serve controllare esattamente QUANDO il
// socket "si apre", per riprodurre lo scenario esatto del bug storico
// documentato nel changelog del file (v1.12-S, "callback stale su
// socket riusato"): un componente React chiama connect() più volte
// con lo stesso roomId/token PRIMA che il socket finisca di aprirsi -
// le chiamate successive tornano subito (socket gia' in connessione),
// ma gli handler devono comunque usare le callback PIU' RECENTI, non
// quelle della primissima chiamata.
import { describe, it, expect, beforeEach, vi } from 'vitest';

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
    if (this.readyState !== WebSocketFinto.OPEN) {
      throw new Error('WebSocket non aperto');
    }
    this.messaggiInviati.push(data);
  }

  close() {
    this.readyState = WebSocketFinto.CLOSED;
    this.onclose?.({ code: 1000, reason: 'chiusura manuale nel test' });
  }

  // Metodo di comodo SOLO per il test - simula l'apertura vera del socket.
  simulaApertura() {
    this.readyState = WebSocketFinto.OPEN;
    this.onopen?.();
  }

  simulaMessaggio(dati) {
    this.onmessage?.({ data: JSON.stringify(dati) });
  }
}

beforeEach(async () => {
  vi.resetModules();
  global.WebSocket = WebSocketFinto;
  WebSocketFinto.ultimaIstanza = null;
});

describe('wsClient — fix "callback stale su socket riusato" (v1.12-S)', () => {
  it('due connect() consecutive con lo stesso roomId/token, PRIMA che il socket si apra, usano SEMPRE le callback più recenti quando il socket apre davvero', async () => {
    const { connect } = await import('../src/wsClient.js');

    const onOpenPrimaChiamata = vi.fn();
    const onOpenSecondaChiamata = vi.fn();

    // Prima chiamata - crea davvero il socket finto (ancora CONNECTING).
    connect('stanza_test', 'token_test', { onOpen: onOpenPrimaChiamata });
    const socketCreato = WebSocketFinto.ultimaIstanza;
    expect(socketCreato).toBeTruthy();

    // Seconda chiamata, STESSO roomId/token, PRIMA che il socket si apra -
    // deve tornare subito (isConnecting true) senza creare un secondo
    // socket, ma DEVE aggiornare le callback che verranno usate.
    connect('stanza_test', 'token_test', { onOpen: onOpenSecondaChiamata });

    // Ora il socket (lo stesso, unico, creato dalla prima chiamata) si apre davvero.
    socketCreato.simulaApertura();

    expect(onOpenSecondaChiamata).toHaveBeenCalledTimes(1);
    expect(onOpenPrimaChiamata).not.toHaveBeenCalled();
  });

  it('un messaggio in arrivo dopo più connect() consecutive va SEMPRE alla callback onMessage più recente', async () => {
    const { connect } = await import('../src/wsClient.js');

    const onMessagePrimaChiamata = vi.fn();
    const onMessageSecondaChiamata = vi.fn();

    connect('stanza_test2', 'token_test2', { onOpen: () => {}, onMessage: onMessagePrimaChiamata });
    const socketCreato = WebSocketFinto.ultimaIstanza;

    connect('stanza_test2', 'token_test2', { onOpen: () => {}, onMessage: onMessageSecondaChiamata });

    socketCreato.simulaApertura();
    socketCreato.simulaMessaggio({ type: 'ping' });

    expect(onMessageSecondaChiamata).toHaveBeenCalledTimes(1);
    expect(onMessagePrimaChiamata).not.toHaveBeenCalled();
  });
});

describe('wsClient — comportamento base', () => {
  it('connect() lancia un errore chiaro se manca roomId o token', async () => {
    const { connect } = await import('../src/wsClient.js');
    expect(() => connect(null, 'token')).toThrow('roomId mancante');
    expect(() => connect('stanza', null)).toThrow('token mancante');
  });

  it('dopo l\'apertura, il socket manda subito un messaggio di autenticazione con il token (mai nell\'URL)', async () => {
    const { connect } = await import('../src/wsClient.js');

    connect('stanza_auth', 'token_segreto_da_non_mettere_in_url', { onOpen: () => {} });
    const socketCreato = WebSocketFinto.ultimaIstanza;

    // Il token non deve mai comparire nell'URL del socket.
    expect(socketCreato.url).not.toContain('token_segreto_da_non_mettere_in_url');

    socketCreato.simulaApertura();

    expect(socketCreato.messaggiInviati.length).toBeGreaterThan(0);
    const primoMessaggio = JSON.parse(socketCreato.messaggiInviati[0]);
    expect(primoMessaggio).toEqual({ type: 'auth', token: 'token_segreto_da_non_mettere_in_url' });
  });
});