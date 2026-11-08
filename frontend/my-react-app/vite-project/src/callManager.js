// src/callManager.js
//
// Fase 1 del piano chiamate (voce 1:1): logica WebRTC vera. Gestisce
// RTCPeerConnection, microfono, scambio SDP/ICE via signalCall
// (backend/routes/calls.py -> POST /calls/signal). Nessun dato media
// passa MAI dal server: solo i metadati di segnalazione (offerta/
// risposta SDP, candidati ICE). Il flusso audio vero e' peer-to-peer
// diretto tra i due browser, gia' cifrato da WebRTC stesso (DTLS-SRTP,
// obbligatorio nello standard) - coerente con l'approccio zero-knowledge
// del resto dell'app.
//
// [palacan-l4e] Offerta, risposta e candidati ICE partono SOLO cifrati end-to-end con la chiave Megolm della chat
// (cifraSegnale, da App.jsx; utils/segnaliChiamata.js): il server non vede SDP, impronte DTLS, indirizzi ne' il tipo
// di chiamata, e non puo' sostituirli. Senza cifratura non parte niente. Rifiuto e fine restano senza dati.

import { useState, useRef, useEffect, useCallback } from 'react';
import * as apiService from './apiService';

export function useCallManager({ authToken, callSignalEvent, onCallEnded, cifraSegnale }) {
  /* ── nuovo (registro chiamate): traccia quando la chiamata si e'
     davvero connessa, per calcolare la durata all'esito. */
  const callConnectedAtRef = useRef(null);
  const onCallEndedRef = useRef(onCallEnded);
  onCallEndedRef.current = onCallEnded;
  const cifraSegnaleRef = useRef(cifraSegnale);  // [palacan-l4e]
  cifraSegnaleRef.current = cifraSegnale;
  const [callState, setCallState] = useState('idle'); // idle | calling | ringing | connected | ended
  const [incomingCall, setIncomingCall] = useState(null); // {roomId, fromUserId, fromUsername, offer}
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const isVideoCallRef = useRef(false);
  const [isVideoCall, setIsVideoCall] = useState(false);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const roomIdRef = useRef(null);
  const targetUserIdRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const remoteDescriptionSetRef = useRef(false);
  const iceServersRef = useRef(null);

  const ensureIceServers = useCallback(async () => {
    if (iceServersRef.current) return iceServersRef.current;
    try {
      const servers = await apiService.getIceServers(authToken);
      iceServersRef.current = servers.length > 0 ? servers : [{ urls: 'stun:stun.l.google.com:19302' }];
    } catch (e) {
      console.error('Errore recupero ICE servers:', e);
      iceServersRef.current = [{ urls: 'stun:stun.l.google.com:19302' }];
    }
    return iceServersRef.current;
  }, [authToken]);

  const reportCallEnded = (outcome) => {
    if (!onCallEndedRef.current) return;
    const durationSeconds = callConnectedAtRef.current
      ? Math.round((Date.now() - callConnectedAtRef.current) / 1000)
      : 0;
    try {
      onCallEndedRef.current({
        roomId: roomIdRef.current,
        targetUserId: targetUserIdRef.current,
        isVideo: isVideoCallRef.current,
        outcome,
        durationSeconds,
      });
    } catch (e) {
      console.error('Errore segnalazione fine chiamata (registro):', e);
    }
  };

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      /* ── fix secondo doppione nel registro chiamate: chiudere la
         connessione con .close() fa scattare in automatico
         onconnectionstatechange con stato 'closed' - che a sua volta
         richiamava di nuovo reportCallEnded, anche se la chiamata era
         gia' stata registrata esplicitamente un attimo prima (in
         endCall/rejectCall/eccetera). Disattivando l'handler PRIMA di
         chiudere, la chiusura volontaria non genera piu' una seconda
         registrazione automatica - resta invariato il comportamento per
         una chiusura DAVVERO inattesa (rete che cade), che passa sempre
         da questo stesso evento perche' li' non c'e' nessun'altra
         chiamata esplicita a reportCallEnded prima. */
      try { pcRef.current.onconnectionstatechange = null; } catch (_) {}
      try { pcRef.current.close(); } catch (_) {}
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    pendingIceCandidatesRef.current = [];
    remoteDescriptionSetRef.current = false;
    roomIdRef.current = null;
    targetUserIdRef.current = null;
    isVideoCallRef.current = false;
    setIsVideoCall(false);
    callConnectedAtRef.current = null;
    setRemoteStream(null);
    setLocalStream(null);
    setIncomingCall(null);
    setCallState('idle');
  }, []);

  // [palacan-l4e] offerta, risposta e candidati: solo cifrati end-to-end, mai un ripiego in chiaro
  const inviaCifrato = useCallback(async (roomId, targetUserId, tipo, dati) => {
    const cifra = cifraSegnaleRef.current;
    let busta = null;
    try {
      busta = typeof cifra === 'function' ? await cifra(roomId, tipo, dati) : null;
    } catch (e) {
      console.error('[L4e] cifratura del segnale di chiamata non riuscita:', e);
    }
    if (!busta || typeof busta !== 'object' || typeof busta.ciphertext !== 'string' || !busta.ciphertext) {
      const errore = new Error('segnale di chiamata non cifrato: non parte');
      errore.palacanCifratura = true;
      throw errore;
    }
    return apiService.signalCall(roomId, targetUserId, tipo, busta, authToken);
  }, [authToken]);

  const createPeerConnection = useCallback(async () => {
    const iceServers = await ensureIceServers();
    /* FIX (privacy): iceTransportPolicy: 'relay' forza OGNI candidato ICE
       a passare dal server TURN, mai una connessione diretta P2P - senza
       questo, WebRTC di default preferisce sempre la connessione diretta
       quando possibile, che rivela l'indirizzo IP reale di entrambi i
       partecipanti l'uno all'altro (comportamento standard del
       protocollo, non un difetto di Palacan, ma comunque una scelta che
       un'app che punta sulla privacy dovrebbe evitare di default).
       Compromesso onesto da sapere: forzare sempre il relay puo'
       aumentare leggermente la latenza (il traffico fa un giro in piu'
       passando dal server TURN invece che diretto), e se il server TURN
       fosse irraggiungibile la chiamata fallirebbe del tutto invece di
       riuscire comunque in P2P - vale la pena tenerlo d'occhio nei log
       se in futuro si notassero piu' chiamate fallite del previsto. */
    const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: 'relay' });

    pc.onicecandidate = (event) => {
      if (event.candidate && roomIdRef.current && targetUserIdRef.current) {
        inviaCifrato(roomIdRef.current, targetUserIdRef.current, 'ice_candidate', event.candidate.toJSON())  // [palacan-l4e]
          .catch((e) => console.error('Errore invio candidato ICE:', e));
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        if (!callConnectedAtRef.current) callConnectedAtRef.current = Date.now();
        setCallState('connected');
      } else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        /* ── fix stato bloccato dopo interruzione di rete: prima questo
           ramo impostava callState su 'ended' e poi chiamava cleanup(),
           ma cleanup() NON riportava mai lo stato a 'idle' - restava
           bloccato su 'ended' per sempre, finche' non si ricaricava la
           pagina. Con lo stato mai tornato a 'idle', il controllo nel
           ramo 'invite' qui sotto (`if (callState !== 'idle')`)
           rifiutava automaticamente e in silenzio OGNI chiamata futura
           in arrivo - sintomo osservato: "a volte le chiamate non
           arrivano", in realta' sempre dopo una singola interruzione di
           rete precedente. Ora cleanup() riporta sempre callState a
           'idle' da solo (vedi sopra), quindi il setCallState('ended')
           qui e' solo per un istante prima del riordino automatico -
           lasciato per dare comunque un feedback visivo momentaneo. */
        reportCallEnded(callConnectedAtRef.current ? 'answered' : 'missed');
        setCallState('ended');
        cleanup();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [authToken, ensureIceServers, cleanup, inviaCifrato]);

  const startCall = useCallback(
    async (roomId, targetUserId, isVideo = false) => {
      try {
        setErrorMessage(null);
        roomIdRef.current = roomId;
        targetUserIdRef.current = targetUserId;
        isVideoCallRef.current = isVideo;
        setIsVideoCall(isVideo);

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } } : false });
        localStreamRef.current = stream;
        setLocalStream(stream);

        const pc = await createPeerConnection();
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const inviteResult = await inviaCifrato(roomId, targetUserId, 'invite', { sdp: offer, video: isVideo });  // [palacan-l4e]

        /* ── nuovo: il backend (routes/calls.py) restituisce sempre
           `delivered: true/false` - true solo se il destinatario aveva
           davvero una connessione attiva in quel momento. Prima questo
           valore veniva completamente ignorato: se il destinatario aveva
           una connessione "fantasma" (stesso problema gia' risolto
           stanotte per i messaggi), l'invito si perdeva in silenzio e il
           chiamante restava bloccato su "Chiamata in corso..." per
           sempre, senza nessun avviso. Ora, se non risulta consegnato,
           avvisiamo subito invece di aspettare all'infinito. */
        if (inviteResult && inviteResult.delivered === false) {
          setErrorMessage(
            'Impossibile raggiungere l\'utente in questo momento. Riprova tra poco.'
          );
          cleanup();
          setCallState('idle');
          return;
        }

        setCallState('calling');
      } catch (e) {
        console.error('Errore avvio chiamata:', e);
        setErrorMessage(
          e?.palacanCifratura
            ? 'Impossibile avviare la chiamata in modo cifrato: la chiave della chat non e\' ancora pronta. Riprova tra poco.'
            : isVideo
            ? 'Impossibile avviare la videochiamata. Controlla i permessi di microfono e fotocamera.'
            : 'Impossibile avviare la chiamata. Controlla il permesso del microfono.'
        );
        cleanup();
        setCallState('idle');
      }
    },
    [authToken, createPeerConnection, cleanup, inviaCifrato]
  );

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    try {
      setErrorMessage(null);
      const { roomId, fromUserId, offer, isVideo } = incomingCall;
      roomIdRef.current = roomId;
      targetUserIdRef.current = fromUserId;
      isVideoCallRef.current = !!isVideo;
      setIsVideoCall(!!isVideo);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } } : false });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = await createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      remoteDescriptionSetRef.current = true;

      for (const candidate of pendingIceCandidatesRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
      }
      pendingIceCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await inviaCifrato(roomId, fromUserId, 'answer', { sdp: answer });  // [palacan-l4e]
      setIncomingCall(null);
      setCallState('connected');
    } catch (e) {
      console.error('Errore accettazione chiamata:', e);
      setErrorMessage(
        e?.palacanCifratura
          ? 'Impossibile rispondere in modo cifrato: la chiave della chat non e\' ancora pronta. Riprova tra poco.'
          : incomingCall?.isVideo
          ? 'Impossibile rispondere alla videochiamata. Controlla i permessi di microfono e fotocamera.'
          : 'Impossibile rispondere. Controlla il permesso del microfono.'
      );
      cleanup();
      setCallState('idle');
    }
  }, [authToken, incomingCall, createPeerConnection, cleanup, inviaCifrato]);

  const rejectCall = useCallback(async () => {
    if (!incomingCall) return;
    const { roomId, fromUserId, isVideo } = incomingCall;
    try {
      await apiService.signalCall(roomId, fromUserId, 'reject', null, authToken);
    } catch (e) {
      console.error('Errore invio rifiuto:', e);
    }
    if (onCallEndedRef.current) {
      try {
        onCallEndedRef.current({
          roomId,
          targetUserId: fromUserId,
          isVideo: !!isVideo,
          outcome: 'rejected',
          durationSeconds: 0,
        });
      } catch (e) {
        console.error('Errore segnalazione rifiuto (registro):', e);
      }
    }
    setIncomingCall(null);
    setCallState('idle');
  }, [authToken, incomingCall]);

  const endCall = useCallback(async () => {
    const roomId = roomIdRef.current;
    const targetUserId = targetUserIdRef.current;
    if (roomId && targetUserId) {
      try {
        await apiService.signalCall(roomId, targetUserId, 'end', null, authToken);
      } catch (e) {
        console.error('Errore invio fine chiamata:', e);
      }
    }
    reportCallEnded(callConnectedAtRef.current ? 'answered' : 'missed');
    cleanup();
    setCallState('idle');
  }, [authToken, cleanup]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return false;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return false;
    audioTrack.enabled = !audioTrack.enabled;
    return !audioTrack.enabled;
  }, []);

  useEffect(() => {
    if (!callSignalEvent) return;

    const { signal_type, room_id, from_user_id, from_username, data } = callSignalEvent;

    console.log(`[DIAG-CALL] callManager riceve signal_type=${signal_type}, callState attuale=${callState}`);

    if (signal_type === 'invite') {
      if (callState !== 'idle') {
        console.log(`[DIAG-CALL] INVITO SCARTATO: callState era "${callState}" invece di "idle" - rifiuto automatico per occupato`);
        /* ── nuovo: rifiuto automatico perche' gia' occupati con un'altra
           chiamata - prima non generava nessuna voce nel registro su
           nessuno dei due lati. Ora registriamo comunque il tentativo
           (stesso schema di rejectCall, chiamata diretta a
           onCallEndedRef dato che qui non abbiamo mai popolato i ref
           interni per questa chiamata mai accettata). */
        apiService.signalCall(room_id, from_user_id, 'reject', null, authToken).catch(() => {});
        if (onCallEndedRef.current) {
          try {
            onCallEndedRef.current({
              roomId: room_id,
              targetUserId: from_user_id,
              isVideo: !!data?.video,
              outcome: 'rejected',
              durationSeconds: 0,
            });
          } catch (e) {
            console.error('Errore segnalazione rifiuto per occupato (registro):', e);
          }
        }
        return;
      }
      setIncomingCall({
        roomId: room_id,
        fromUserId: from_user_id,
        fromUsername: from_username,
        offer: data?.sdp,
        isVideo: !!data?.video,
      });
      setCallState('ringing');
      return;
    }

    if (signal_type === 'answer' && pcRef.current) {
      (async () => {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
          remoteDescriptionSetRef.current = true;
          for (const candidate of pendingIceCandidatesRef.current) {
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
          }
          pendingIceCandidatesRef.current = [];
        } catch (e) {
          /* ── fix stato bloccato: se l'elaborazione della risposta
             fallisce, prima non si puliva nulla - lo stato restava
             fermo su 'calling' per sempre, con lo stesso identico
             effetto collaterale gia' corretto sopra (rifiuto automatico
             e silenzioso di ogni chiamata futura in arrivo, perche' lo
             stato non e' mai 'idle'). Ora si chiama cleanup() anche qui,
             che riporta sempre lo stato a 'idle' da solo. */
          console.error('Errore impostazione risposta remota:', e);
          setErrorMessage('Impossibile completare la connessione della chiamata.');
          cleanup();
        }
      })();
      return;
    }

    if (signal_type === 'ice_candidate' && data) {
      if (pcRef.current && remoteDescriptionSetRef.current) {
        pcRef.current.addIceCandidate(new RTCIceCandidate(data)).catch((e) =>
          console.error('Errore aggiunta candidato ICE:', e)
        );
      } else {
        pendingIceCandidatesRef.current.push(data);
      }
      return;
    }

    if (signal_type === 'reject') {
      /* ── fix registro chiamate duplicato: NON registrare qui - chi
         rifiuta lo fa gia' da se' in rejectCall(), che scatta PRIMA che
         questo segnale venga anche solo inviato. Se registrassimo anche
         qui (lato di chi ha chiamato, alla RICEZIONE del segnale),
         risulterebbero due messaggi per la stessa chiamata rifiutata. */
      setErrorMessage('Chiamata rifiutata.');
      cleanup();
      setCallState('idle');
      return;
    }

    if (signal_type === 'end') {
      /* ── fix registro chiamate duplicato (invariato): se la chiamata si
         era DAVVERO connessa, non registrare qui - chi chiude lo fa gia'
         da se' in endCall(), un doppione qui darebbe due voci per la
         stessa chiamata riuscita.
         ── NUOVO fix (lacuna trovata): se la chiamata NON si era mai
         connessa (ignorata, mai accettata/rifiutata attivamente - il
         caso "squilla e basta, nessuno tocca nulla"), prima non
         risultava NESSUNA voce nel registro dal lato di chi ha ricevuto.
         Qui non c'e' rischio di doppione perche' non e' mai stata
         registrata da nessun'altra parte per questo lato. Uso i dati di
         incomingCall (non i ref interni, MAI popolati per una chiamata
         mai accettata - stesso motivo per cui rejectCall() li usa
         allo stesso modo poco piu' sopra nel file). */
      if (!callConnectedAtRef.current && incomingCall && onCallEndedRef.current) {
        try {
          onCallEndedRef.current({
            roomId: incomingCall.roomId,
            targetUserId: incomingCall.fromUserId,
            isVideo: !!incomingCall.isVideo,
            outcome: 'missed',
            durationSeconds: 0,
          });
        } catch (e) {
          console.error('Errore segnalazione chiamata persa (registro):', e);
        }
      }
      cleanup();
      setCallState('idle');
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callSignalEvent]);

  return {
    callState,
    incomingCall,
    remoteStream,
    localStream,
    isVideoCall,
    errorMessage,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
  };
}
