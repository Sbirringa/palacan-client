// tests/wsClient.sessionReset.test.js  [palacan-n3]
//
// session_reset ("ho azzerato le mie sessioni 1:1, rimandami la chiave") ora resta in coda se la connessione
// della stanza non e' ancora aperta, e parte appena si apre. Prima si scartava: dopo un recupero dal backup il
// contatto se ne accorgeva solo dopo circa un minuto di tentativi senza risposta. Un session_reset rimasto in
// coda troppo a lungo (oltre 2 minuti) non serve piu' e si lascia cadere. Gli ack restano come prima (scartati).
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

vi.mock('../src/apiService', () => ({ API_URL: 'http://prova.invalid' }));
vi.mock('../src/utils/segretiStanze', () => ({ gettoneInMemoria: () => null }));

const socketCreati = [];
class SocketFinto {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  constructor(url) {
    this.url = url;
    this.readyState = SocketFinto.CONNECTING;
    this.inviati = [];
    socketCreati.push(this);
  }
  send(testo) { this.inviati.push(JSON.parse(testo)); }
  close() { this.readyState = SocketFinto.CLOSED; }
  apri() { this.readyState = SocketFinto.OPEN; this.onopen?.(); }
}

let ws;
beforeAll(async () => {
  vi.stubGlobal('WebSocket', SocketFinto);
  ws = await import('../src/wsClient');
});

afterEach(() => vi.useRealTimers());

function apriStanza(roomId) {
  ws.connect(roomId, 'token-di-prova', {});
  const s = socketCreati[socketCreati.length - 1];
  s.apri();
  return s;
}

describe('session_reset in coda finche\' la connessione non e\' aperta', () => {
  it('chiesto prima della connessione: parte appena la stanza si apre, dopo l\'autenticazione', () => {
    ws.sendSessionReset({ roomId: 'stanza-1' });
    const s = apriStanza('stanza-1');
    const tipi = s.inviati.map((m) => m.type);
    expect(tipi[0]).toBe('auth');
    expect(tipi).toContain('session_reset');
    expect(s.inviati.find((m) => m.type === 'session_reset').room_id).toBe('stanza-1');
  });

  it('va solo alla sua stanza, non a un\'altra', () => {
    ws.disconnect();
    ws.sendSessionReset({ roomId: 'stanza-2' });
    const s = apriStanza('stanza-3');
    expect(s.inviati.some((m) => m.type === 'session_reset')).toBe(false);
    const s2 = apriStanza('stanza-2');
    expect(s2.inviati.some((m) => m.type === 'session_reset' && m.room_id === 'stanza-2')).toBe(true);
  });

  it('rimasto in coda oltre 2 minuti: non parte piu\'', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T20:00:00Z'));
    ws.disconnect();
    ws.sendSessionReset({ roomId: 'stanza-4' });
    vi.setSystemTime(new Date('2026-10-26T20:03:00Z'));
    const s = apriStanza('stanza-4');
    expect(s.inviati.some((m) => m.type === 'session_reset')).toBe(false);
  });

  it('a connessione aperta parte subito, come prima', () => {
    const s = apriStanza('stanza-5');
    ws.sendSessionReset({ roomId: 'stanza-5' });
    expect(s.inviati.filter((m) => m.type === 'session_reset')).toHaveLength(1);
  });

  it('gli ack restano come prima: a connessione chiusa si scartano', () => {
    ws.disconnect();
    ws.sendAck({ eventId: 'e1', roomId: 'stanza-6' });
    const s = apriStanza('stanza-6');
    expect(s.inviati.some((m) => m.type === 'ack')).toBe(false);
  });
});
