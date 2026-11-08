// tests/callManager.test.js
//
// Test sull'hook React useCallManager (WebRTC) con RTCPeerConnection
// e getUserMedia FINTI, controllabili a mano. Mirati ai bug storici
// GIA' documentati e corretti nel changelog del file - il tipo di
// test piu' prezioso: dimostrare che una regressione futura verrebbe
// scoperta, non solo che il comportamento attuale e' quello giusto.
// [palacan-l4e] offerta, risposta e candidati ICE partono SOLO cifrati (cifraSegnale, da App.jsx): qui una cifratura
// finta che nasconde il contenuto; la crittografia vera si prova in tests/segnaliChiamata.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCallManager } from '../src/callManager.js';
import * as apiService from '../src/apiService.js';

vi.mock('../src/apiService.js', () => ({
  getIceServers: vi.fn(),
  signalCall: vi.fn(),
}));

class RTCPeerConnectionFinta {
  constructor(config) {
    this.config = config;
    this.connectionState = 'new';
    this.onicecandidate = null;
    this.ontrack = null;
    this.onconnectionstatechange = null;
    this.tracceAggiunte = [];
    RTCPeerConnectionFinta.ultimaIstanza = this;
  }
  addTrack(track, stream) {
    this.tracceAggiunte.push({ track, stream });
  }
  async createOffer() {
    return { type: 'offer', sdp: 'sdp_offerta_finta' };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'sdp_risposta_finta' };
  }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  async addIceCandidate() {}
  close() {
    this.connectionState = 'closed';
  }
  // Metodo di comodo SOLO per il test - simula un cambio di stato reale.
  simulaCambioStato(nuovoStato) {
    this.connectionState = nuovoStato;
    this.onconnectionstatechange?.();
  }
}

function creaStreamFinto() {
  const audioTrackFinta = { enabled: true, stop: vi.fn() };
  return {
    getTracks: () => [audioTrackFinta],
    getAudioTracks: () => [audioTrackFinta],
  };
}

// [palacan-l4e] cifratura finta: il contenuto non deve comparire in quello che va al server
const cifraFinta = vi.fn(async (stanza, tipo, dati) => ({
  e2e: 'palacan-chiamata-v1',
  session_id: 'sessione_finta',
  ciphertext: Buffer.from(JSON.stringify({ stanza, tipo, dati })).toString('base64').split('').reverse().join(''),
}));
const apriFinta = (busta) => JSON.parse(Buffer.from(busta.ciphertext.split('').reverse().join(''), 'base64').toString());

beforeEach(() => {
  vi.clearAllMocks();
  global.RTCPeerConnection = RTCPeerConnectionFinta;
  global.RTCSessionDescription = function (init) { return init; };
  global.RTCIceCandidate = function (init) { return init; };
  global.navigator.mediaDevices = {
    getUserMedia: vi.fn().mockResolvedValue(creaStreamFinto()),
  };
  apiService.getIceServers.mockResolvedValue([{ urls: 'turn:turn.finto.example' }]);
  apiService.signalCall.mockResolvedValue({ delivered: true });
});

describe('useCallManager — privacy: relay ICE forzato', () => {
  it('createPeerConnection imposta SEMPRE iceTransportPolicy: "relay" - mai una connessione P2P diretta che rivelerebbe l\'IP', async () => {
    const { result } = renderHook(() =>
      useCallManager({ authToken: 'token_test', callSignalEvent: null, onCallEnded: vi.fn(), cifraSegnale: cifraFinta })
    );

    await act(async () => {
      await result.current.startCall('stanza1', 'utente_bersaglio', false);
    });

    expect(RTCPeerConnectionFinta.ultimaIstanza.config.iceTransportPolicy).toBe('relay');
  });
});

describe('useCallManager — REGRESSIONE: doppia registrazione nel registro chiamate (bug storico corretto)', () => {
  it('terminare la chiamata esplicitamente (endCall) e poi lasciare che il socket si chiuda da solo registra la chiamata UNA SOLA VOLTA, non due', async () => {
    const onCallEnded = vi.fn();
    const { result } = renderHook(() =>
      useCallManager({ authToken: 'token_test', callSignalEvent: null, onCallEnded, cifraSegnale: cifraFinta })
    );

    await act(async () => {
      await result.current.startCall('stanza2', 'utente_bersaglio2', false);
    });

    const pc = RTCPeerConnectionFinta.ultimaIstanza;

    // La chiamata si connette davvero.
    await act(async () => {
      pc.simulaCambioStato('connected');
    });

    // L'utente termina la chiamata esplicitamente - PRIMA registrazione.
    await act(async () => {
      await result.current.endCall();
    });

    expect(onCallEnded).toHaveBeenCalledTimes(1);

    // endCall() -> cleanup() chiude pc.close(), che nella FINTA imposta
    // connectionState='closed' ma NON richiama da solo onconnectionstatechange
    // (a differenza del vero browser) - simuliamo qui esplicitamente cosa
    // farebbe un vero browser dopo close(), per verificare che l'handler
    // sia stato correttamente disattivato PRIMA della chiusura (fix reale).
    expect(pc.onconnectionstatechange).toBeNull();
  });
});

describe('useCallManager — REGRESSIONE: stato bloccato dopo interruzione di rete (bug storico corretto)', () => {
  it('dopo una interruzione di rete (mai una endCall esplicita), lo stato torna a "idle" e una chiamata successiva puo essere accettata', async () => {
    const onCallEnded = vi.fn();
    const { result, rerender } = renderHook(
      ({ callSignalEvent }) => useCallManager({ authToken: 'token_test', callSignalEvent, onCallEnded, cifraSegnale: cifraFinta }),
      { initialProps: { callSignalEvent: null } }
    );

    await act(async () => {
      await result.current.startCall('stanza3', 'utente_bersaglio3', false);
    });

    const pc = RTCPeerConnectionFinta.ultimaIstanza;

    await act(async () => {
      pc.simulaCambioStato('connected');
    });

    // La rete cade - MAI una endCall esplicita, solo l'evento del socket.
    await act(async () => {
      pc.simulaCambioStato('failed');
    });

    expect(result.current.callState).toBe('idle');

    // Ora arriva un INVITO in ingresso - prima del fix, sarebbe stato
    // rifiutato automaticamente perche' callState era rimasto bloccato
    // su qualcosa di diverso da 'idle'.
    await act(async () => {
      rerender({
        callSignalEvent: {
          signal_type: 'invite',
          room_id: 'stanza_nuova',
          from_user_id: 'nuovo_chiamante',
          from_username: 'Nuovo Chiamante',
          data: { sdp: { type: 'offer', sdp: 'sdp_finta' }, video: false },
        },
      });
    });

    expect(result.current.callState).toBe('ringing');
    expect(result.current.incomingCall).not.toBeNull();
  });
});

describe('useCallManager — invito non consegnato (bug storico corretto: prima restava bloccato per sempre)', () => {
  it('se signalCall segnala delivered:false, mostra un errore e torna a "idle" invece di restare bloccato su "calling"', async () => {
    apiService.signalCall.mockResolvedValue({ delivered: false });

    const { result } = renderHook(() =>
      useCallManager({ authToken: 'token_test', callSignalEvent: null, onCallEnded: vi.fn(), cifraSegnale: cifraFinta })
    );

    await act(async () => {
      await result.current.startCall('stanza4', 'utente_irraggiungibile', false);
    });

    expect(result.current.callState).toBe('idle');
    expect(result.current.errorMessage).toBeTruthy();
  });
});

describe('useCallManager — L4e: offerta, risposta e candidati ICE solo cifrati end-to-end [palacan-l4e]', () => {
  const inviati = (tipo) => apiService.signalCall.mock.calls.filter((c) => c[2] === tipo);

  it('l\'invito va al server solo come busta cifrata: niente SDP e niente "video" in chiaro', async () => {
    const { result } = renderHook(() =>
      useCallManager({ authToken: 'token_test', callSignalEvent: null, onCallEnded: vi.fn(), cifraSegnale: cifraFinta })
    );
    await act(async () => {
      await result.current.startCall('stanza_e2e', 'utente_e2e', true);
    });
    const inviti = inviati('invite');
    expect(inviti.length).toBe(1);
    const [stanza, destinatario, , busta, token] = inviti[0];
    expect([stanza, destinatario, token]).toEqual(['stanza_e2e', 'utente_e2e', 'token_test']);
    expect(JSON.stringify(busta), 'segnale di chiamata in chiaro verso il server').not.toContain('sdp_offerta_finta');
    expect(JSON.stringify(busta)).not.toContain('video');
    expect(apriFinta(busta)).toEqual({ stanza: 'stanza_e2e', tipo: 'invite', dati: { sdp: { type: 'offer', sdp: 'sdp_offerta_finta' }, video: true } });
    expect(result.current.callState).toBe('calling');
  });

  it('i candidati ICE (indirizzi) partono cifrati', async () => {
    const { result } = renderHook(() =>
      useCallManager({ authToken: 'token_test', callSignalEvent: null, onCallEnded: vi.fn(), cifraSegnale: cifraFinta })
    );
    await act(async () => {
      await result.current.startCall('stanza_ice', 'utente_ice', false);
    });
    const candidato = { candidate: 'candidate:1 1 udp 1 198.51.100.9 3478 typ relay', sdpMid: '0', sdpMLineIndex: 0 };
    await act(async () => {
      RTCPeerConnectionFinta.ultimaIstanza.onicecandidate({ candidate: { toJSON: () => candidato } });
      await new Promise((r) => setTimeout(r, 0));
    });
    const ice = inviati('ice_candidate');
    expect(ice.length).toBe(1);
    expect(JSON.stringify(ice[0][3]), 'segnale di chiamata in chiaro verso il server').not.toContain('198.51.100.9');
    expect(apriFinta(ice[0][3]).dati).toEqual(candidato);
  });

  it('la risposta parte cifrata', async () => {
    const { result, rerender } = renderHook(
      ({ callSignalEvent }) => useCallManager({ authToken: 'token_test', callSignalEvent, onCallEnded: vi.fn(), cifraSegnale: cifraFinta }),
      { initialProps: { callSignalEvent: null } }
    );
    await act(async () => {
      rerender({
        callSignalEvent: {
          signal_type: 'invite', room_id: 'stanza_r', from_user_id: 'chiamante_r', from_username: 'Chiamante',
          data: { sdp: { type: 'offer', sdp: 'sdp_finta' }, video: false },
        },
      });
    });
    await act(async () => {
      await result.current.acceptCall();
    });
    const risposte = inviati('answer');
    expect(risposte.length).toBe(1);
    expect(JSON.stringify(risposte[0][3]), 'segnale di chiamata in chiaro verso il server').not.toContain('sdp_risposta_finta');
    expect(apriFinta(risposte[0][3]).dati).toEqual({ sdp: { type: 'answer', sdp: 'sdp_risposta_finta' } });
  });

  it('senza cifratura (o se fallisce) la chiamata non parte: nessun ripiego in chiaro', async () => {
    const casi = [undefined, vi.fn(async () => { throw new Error('chiave non pronta'); }), vi.fn(async () => null)];
    for (const cifraSegnale of casi) {
      apiService.signalCall.mockClear();
      const { result, unmount } = renderHook(() =>
        useCallManager({ authToken: 'token_test', callSignalEvent: null, onCallEnded: vi.fn(), cifraSegnale })
      );
      await act(async () => {
        await result.current.startCall('stanza_x', 'utente_x', false);
      });
      expect(inviati('invite').length, 'segnale di chiamata in chiaro verso il server').toBe(0);
      expect(result.current.callState).toBe('idle');
      expect(result.current.errorMessage).toMatch(/cifrat/);
      unmount();
    }
  });

  it('rifiuto e fine restano senza dati (niente da proteggere)', async () => {
    const { result } = renderHook(() =>
      useCallManager({ authToken: 'token_test', callSignalEvent: null, onCallEnded: vi.fn(), cifraSegnale: cifraFinta })
    );
    await act(async () => {
      await result.current.startCall('stanza_f', 'utente_f', false);
    });
    await act(async () => {
      await result.current.endCall();
    });
    expect(inviati('end')).toEqual([['stanza_f', 'utente_f', 'end', null, 'token_test']]);
  });
});
