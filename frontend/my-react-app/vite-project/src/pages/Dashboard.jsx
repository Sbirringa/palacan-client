import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut, Plus, Send, Lock, CheckCircle2, AlertCircle, Menu, RefreshCw,
  Copy, UserPlus, X, Building2, MessageSquare, Search, MoreVertical,
  Sun, Moon, Info, Edit3, DoorOpen, ChevronRight, ChevronLeft, Hash,
  Paperclip, Smile, Camera, Loader2, Share2, Bell, BellOff, Check, Reply, Star, Tag, Pencil, Users, UserX, ShieldCheck, KeyRound,
  ListChecks, Trash2, Phone, Video, PhoneOff, Mic, Volume2, History, Flag, Ban, Smartphone, Timer,
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';  // [palacan-l1a] sempre emojiStyle="native": niente immagini da cdn.jsdelivr.net
import DeviceManagementPanel from '../components/DeviceManagementPanel';
import AvvisoDispositivoDaApprovare from '../components/AvvisoDispositivoDaApprovare';  // [palacan-l4c5]
import IdentityChangeWarningBanner from '../components/IdentityChangeWarningBanner';
import SafetyNumberPanel from '../components/SafetyNumberPanel';
import * as apiService from '../apiService';
import { reazioniDel } from '../utils/reazioni';  // [palacan-metadati-3.6]
import * as olmService from '../olmService';
import { useTheme } from '../contexts/ThemeContext.jsx';
import AdminApp from '../admin/AdminApp.jsx';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import '../styles/palacan-tema.css';
import { eGruppoPrivato, imparaNomeStanza } from '../utils/nomiStanze';  // [palacan-metadati-a3.2a]
import { nomeLocale } from '../utils/nomiStanze';  // [palacan-correzioni-prove]
import { invitaConNome, apriNomiInviti } from '../utils/nomiInviti';  // [palacan-metadati-a3.2b2]
import { ruotaRecapito, segnaSbloccato } from '../utils/recapito';  // [palacan-metadati-a4.4c3]
import { leggiLocale, salvaLocale } from '../utils/datiLocaliCifrati';  // [palacan-9a2]

// [palacan-correzioni-prove] nome da mostrare: per un gruppo privato quello piu' recente conosciuto dal dispositivo
function nomeMostratoStanza(stanza) {
  if (!stanza) return '';
  return (eGruppoPrivato(stanza) && nomeLocale(stanza.id)) || stanza.name || '';
}

const T = {
  bg: 'bg-[#EEF4F4]',
  surface: 'bg-[#F7FBFB]',
  surfaceHover: 'hover:bg-[#E4EEEE]',
  elevated: 'bg-[#FFFFFF]',
  border: 'border-[#DCE6E6]',
  borderSoft: 'border-[#E3ECEC]',
  text: 'text-[#122023]',
  textMuted: 'text-[#5C6D6F]',
  textFaint: 'text-[#8CA0A2]',
  accent: '#0F766E',
  accentText: 'text-[#0F766E]',
  accentBg: 'bg-[#14B8A6]',
  accentBgHover: 'hover:bg-[#0F766E]',
  accentSoftBg: 'bg-[#14B8A6]/10',
  accentSoftBorder: 'border-[#14B8A6]/30',
  teal: '#0E7490',
  tealText: 'text-[#0E7490]',
  warn: 'text-[#B45309]',
  warnSoftBg: 'bg-[#FDF1E0]',
  danger: 'text-[#C2410C]',
  dangerSoftBg: 'bg-[#FCE9E0]',
  dangerSoftBorder: 'border-[#C2410C]/25',
};

const EASE = [0.4, 0, 0.2, 1];

export const normalizeRoomId = (value) => {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
};

export const getRoomPasswordFlag = (room) =>
  Boolean(room?.has_password ?? room?.hasPassword ?? false);

export const getAdminPanelOpenKey = (username) => `admin_panel_open_${username}`;

export const getDraftsStorageKey = (username) => `chat_drafts_${username}`;
// [palacan-9a2] bozze CIFRATE con la chiave del dispositivo (utils/datiLocaliCifrati.js); qui si legge dalla
// memoria, caricata prima dell'uso da preparaDatiLocali (App, all'avvio e a ogni accesso).
export const loadDraftsFromStorage = (username) => {
  const salvate = leggiLocale(getDraftsStorageKey(username));
  return salvate && typeof salvate === 'object' ? { ...salvate } : {};
};
export const saveDraftsToStorage = (username, draftsMap) => {
  salvaLocale(getDraftsStorageKey(username), draftsMap);
};

export const resolveRoomMuted = (room, overrides) => {
  const key = normalizeRoomId(room?.id);
  if (key && overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
    return Boolean(overrides[key]);
  }
  return Boolean(room?.notifications_muted);
};

export const resolveRoomFavorite = (room, overrides) => {
  const key = normalizeRoomId(room?.id);
  if (key && overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
    return Boolean(overrides[key]);
  }
  return Boolean(room?.is_favorite);
};

export const formatTime = (msg) => {
  if (!msg) return '';
  const ts =
    msg.timestamp ?? msg.created_at ?? msg.createdAt ?? msg.createdat ?? msg.sent_at ??
    (typeof msg.id === 'number' && msg.id > 1000000 ? msg.id : null);
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

export const formatRelativeRoomTime = (room) => {
  const ts = room?.last_message_at ?? room?.updated_at ?? room?.created_at ?? room?.timestamp ?? null;
  if (!ts) return '';
  try {
    const date = new Date(ts);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Ora';
    if (diffMin < 60) return `${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}g`;
    return date.toLocaleDateString();
  } catch { return ''; }
};

export const getMessagePreview = (room) =>
  room?.last_message_preview ??
  room?.lastMessagePreview ??
  room?.last_message_text ??
  room?.lastMessageText ??
  room?.last_message ??
  room?.preview ??
  (room?.is_corporate ? i18n.t('dashboard.common.workspace_conversation_preview') : null);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRealMessageId = (id) => UUID_PATTERN.test(String(id || ''));

export const isCurrentRoom = (currentRoom, room) =>
  normalizeRoomId(currentRoom?.id) === normalizeRoomId(room?.id);

export const groupRoomsByTime = (rooms) => {
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const today = startOfDay(new Date());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

  const buckets = { oggi: [], ieri: [], settimana: [], precedenti: [] };

  rooms.forEach((room) => {
    const ts = room?.last_message_at ?? room?.updated_at ?? room?.created_at ?? room?.timestamp;
    const d = ts ? new Date(ts) : null;
    if (!d || Number.isNaN(d.getTime())) { buckets.precedenti.push(room); return; }
    if (d >= today) buckets.oggi.push(room);
    else if (d >= yesterday) buckets.ieri.push(room);
    else if (d >= weekAgo) buckets.settimana.push(room);
    else buckets.precedenti.push(room);
  });

  return [
    { label: i18n.t('dashboard.timeline.today'), rooms: buckets.oggi },
    { label: i18n.t('dashboard.timeline.yesterday'), rooms: buckets.ieri },
    { label: i18n.t('dashboard.timeline.this_week'), rooms: buckets.settimana },
    { label: i18n.t('dashboard.timeline.earlier'), rooms: buckets.precedenti },
  ].filter((g) => g.rooms.length > 0);
};

export const avatarSeedHash = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return Math.abs(h);
};

const AVATAR_PALETTES = [
  { bg: '#14B8A6', text: '#0B0C11' },
  { bg: '#6FA8DC', text: '#0E2238' },
  { bg: '#B39DDB', text: '#241A38' },
  { bg: '#E0B97D', text: '#3A2A12' },
  { bg: '#E093A8', text: '#3A1320' },
  { bg: '#7FCDCD', text: '#102B2B' },
];

function UserAvatar({ username, size = 40, className = '' }) {
  if (!username) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-2xl ${T.elevated} flex items-center justify-center ${T.textFaint} shrink-0 ${className}`}
      >
        <span style={{ fontSize: size * 0.38, fontWeight: 600 }}>?</span>
      </div>
    );
  }
  const seed = avatarSeedHash(username);
  const palette = AVATAR_PALETTES[seed % AVATAR_PALETTES.length];
  const initial = username.trim().charAt(0).toUpperCase();
  const radius = Math.round(size * 0.3);
  return (
    <svg
      width={size} height={size} viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label={`Avatar di ${username}`} role="img"
    >
      <rect width="40" height="40" rx={radius} fill={palette.bg} />
      <text
        x="20" y="20" dominantBaseline="central" textAnchor="middle"
        fill={palette.text} fontSize="16" fontWeight="600"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
      >
        {initial}
      </text>
    </svg>
  );
}

const SlideOver = ({ title, subtitle, onClose, children, width = 'max-w-md' }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15, ease: EASE }}
    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4"
    onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <motion.div
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.96, opacity: 0 }}
      transition={{ duration: 0.16, ease: EASE }}
      className={`relative max-h-[85vh] w-full ${width} overflow-y-auto rounded-3xl ${T.surface} border border-[#14B8A6]/25 shadow-[0_0_40px_-12px_rgba(20,184,166,0.35)] p-6`}
    >
      <button
        type="button" onClick={onClose}
        className={`absolute right-5 top-5 rounded-full border ${T.borderSoft} p-2 ${T.textFaint} transition-colors duration-150 hover:border-[#14B8A6]/40 hover:text-[#14B8A6]`}
        aria-label={i18n.t('dashboard.common.close')}
      >
        <X size={18} />
      </button>
      <div className="mb-6 pr-10">
        <h3 className="text-lg font-semibold bg-clip-text text-transparent bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)]">{title}</h3>
        {subtitle && <p className={`mt-1 text-sm ${T.textMuted}`}>{subtitle}</p>}
      </div>
      {children}
    </motion.div>
  </motion.div>
);

const BottomSheet = ({ title, subtitle, onClose, children }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15, ease: EASE }}
    className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center"
    onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 24, opacity: 0 }}
      transition={{ duration: 0.18, ease: EASE }}
      className={`relative w-full max-w-md rounded-t-3xl sm:rounded-3xl ${T.surface} border border-[#14B8A6]/25 shadow-[0_0_40px_-12px_rgba(20,184,166,0.35)] p-6`}
    >
      <button
        type="button" onClick={onClose}
        className={`absolute right-5 top-5 rounded-full border ${T.borderSoft} p-2 ${T.textFaint} transition-colors duration-150 hover:border-[#14B8A6]/40 hover:text-[#14B8A6]`}
        aria-label={i18n.t('dashboard.common.close')}
      >
        <X size={18} />
      </button>
      <div className="mb-5 pr-10">
        <h3 className="text-lg font-semibold bg-clip-text text-transparent bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)]">{title}</h3>
        {subtitle && <p className={`mt-1 text-sm ${T.textMuted}`}>{subtitle}</p>}
      </div>
      {children}
    </motion.div>
  </motion.div>
);

/* ── nuovo (sessione corrente, Fase 1 chiamate): interfaccia della
   chiamata vocale 1:1 - squillo in arrivo, barra durante la chiamata,
   elemento audio nascosto per sentire l'altra persona. Riceve solo
   callManager (gia' esistente), nessuna modifica a componenti
   preesistenti. Renderizzato a livello del wrapper Dashboard cosi' e'
   visibile ovunque nell'app, non solo dentro la chat aperta. ────────── */
/* ── nuovo (schermata "Chiamate" dedicata): elenco di tutte le chiamate
   fatte/ricevute, raccolte via loadCallHistory (App.jsx) da tutte le
   stanze dirette - decifrate al volo ogni volta che si apre, mai salvate
   in chiaro da nessuna parte, coerente con l'approccio zero-knowledge
   del resto dell'app. ─────────────────────────────────────────────────── */
const CallHistoryScreen = ({ open, onClose, loadCallHistory }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !loadCallHistory) return;
    let cancelled = false;
    setLoading(true);
    loadCallHistory()
      .then((result) => {
        if (!cancelled) setEntries(Array.isArray(result) ? result : []);
      })
      .catch((e) => {
        console.error('Errore caricamento cronologia chiamate:', e);
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadCallHistory]);

  if (!open) return null;

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-[280] flex flex-col bg-[#EEF4F4]">
      <div className="flex items-center gap-3 border-b border-[#DCE6E6] bg-[#F7FBFB] px-4 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-2 text-[#5C6D6F] transition-colors duration-150 hover:bg-white/50"
          aria-label="Chiudi"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-base font-semibold text-[#122023]">Chiamate</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-[#5C6D6F]" size={24} />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <History size={32} className="text-[#8CA0A2]" />
            <p className="text-sm text-[#5C6D6F]">Nessuna chiamata ancora</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {entries.map((entry) => {
              const isMissedOrRejected = entry.text.includes('persa') || entry.text.includes('rifiutata');
              const label = entry.text.replace(/^[^\s]+\s/, '');
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-2xl border border-[#E3ECEC] bg-white p-3.5"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      isMissedOrRejected ? 'bg-[#FCE9E0] text-[#C2410C]' : 'bg-[#14B8A6]/10 text-[#14B8A6]'
                    }`}
                  >
                    {entry.isVideo ? <Video size={17} /> : <Phone size={17} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#122023]">
                      {entry.otherUsername || 'Utente'}
                    </p>
                    <p className={`text-xs ${isMissedOrRejected ? 'text-[#C2410C]' : 'text-[#5C6D6F]'}`}>
                      {label}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-[#8CA0A2]">{formatDate(entry.createdAt)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const CallOverlay = ({ callManager }) => {
  const audioRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  /* ── nuovo (sessione corrente): scelta uscita audio (altoparlante vs
     auricolare) durante la chiamata su mobile - "best effort", visibile
     SOLO dove il browser supporta davvero setSinkId (soprattutto Android
     Chrome; iOS Safari non lo supporta affatto e non mostrera' mai il
     bottone, nessuna promessa falsa). Vedi memoria progetto per il
     contesto completo su questo limite noto del web. */
  const [speakerSupported] = useState(
    () => typeof window !== 'undefined' && 'setSinkId' in (window.HTMLMediaElement?.prototype || {})
  );
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = callManager?.remoteStream || null;
    }
  }, [callManager?.remoteStream]);

  /* ── nuovo (Fase 2 videochiamate): collega i flussi video locale/remoto
     agli elementi <video>. FIX (dopo primo test reale): gli elementi
     <video> sono dentro un blocco condizionale (compaiono solo quando
     callState e' 'calling'/'connected') - se il flusso arriva anche solo
     un istante prima che l'elemento sia davvero apparso nel DOM, il
     collegamento andava a vuoto (il ref era ancora null in quel momento)
     e restava vuoto per sempre, perche' l'effetto scattava solo quando
     CAMBIAVA il flusso, non quando compariva l'elemento - schermo nero
     anche con video che arrivava correttamente. Aggiunta callState come
     dipendenza in piu': cosi' il collegamento viene ritentato anche ad
     ogni cambio di stato della chiamata, non solo quando arriva il
     flusso, coprendo il caso in cui i due eventi non sono sincronizzati
     nell'ordine "giusto". */
  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = callManager?.remoteStream || null;
    }
  }, [callManager?.remoteStream, callManager?.callState]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = callManager?.localStream || null;
    }
  }, [callManager?.localStream, callManager?.callState]);

  /* ── fix (dopo audit completo): l'audio di una videochiamata esce
     dall'elemento <video> remoto (audioRef non esiste piu' durante una
     videochiamata, rimosso apposta per evitare l'eco/doppio audio) - ma
     la scelta auricolare/vivavoce puntava sempre e solo ad audioRef,
     quindi durante le videochiamate non aveva alcun elemento su cui
     agire e non faceva mai nulla. Questa funzione ora restituisce
     l'elemento giusto in entrambi i casi. */
  const getActiveMediaElement = () =>
    callManager?.isVideoCall ? remoteVideoRef.current : audioRef.current;

  const findAudioOutput = async (wantSpeaker) => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((d) => d.kind === 'audiooutput');
    /* ── nuovo: etichette in piu' lingue (un telefono in italiano dice
       "Altoparlante"/"Auricolare"/"Ricevitore", non "speaker"/"earpiece"
       - la corrispondenza solo in inglese non trovava mai nulla). Se
       nessuna etichetta corrisponde, si passa al dispositivo successivo
       nell'elenco (ciclo), cosi' c'e' comunque un effetto sui dispositivi
       con piu' uscite audio, indipendentemente dalla lingua. */
    let target = outputs.find((d) =>
      wantSpeaker
        ? /speaker|altoparlante|haut-?parleur|lautsprecher|altavoz/i.test(d.label)
        : /earpiece|receiver|auricolare|ricevitore|écouteur|ohrhörer|auricular/i.test(d.label)
    );
    const activeElement = getActiveMediaElement();
    if (!target && outputs.length > 1 && activeElement) {
      const currentIndex = outputs.findIndex((d) => d.deviceId === (activeElement.sinkId || ''));
      target = outputs[(currentIndex + 1 + outputs.length) % outputs.length];
    }
    return target;
  };

  /* ── nuovo: appena arriva l'audio della chiamata, proviamo noi (senza
     aspettare un bottone) a impostare l'auricolare come uscita di
     default - come una telefonata normale. Se il telefono ha gia' delle
     cuffie collegate, il sistema operativo le usa comunque a prescindere
     da questa scelta (nessun rischio di "rubare" l'audio dalle cuffie).
     Se il dispositivo non espone piu' uscite audio distinte (limite noto
     della piattaforma), il tentativo semplicemente non ha effetto
     visibile - nessun errore, nessun blocco della chiamata. */
  /* ── fix (giustamente segnalato dall'utente): nelle videochiamate il
     vivavoce e' il default corretto, non l'auricolare - si tiene il
     telefono a distanza per guardare lo schermo, l'auricolare sarebbe
     inascoltabile in quella posizione. Solo le chiamate VOCALI (dove il
     telefono si tiene all'orecchio, come una telefonata normale) hanno
     l'auricolare come default corretto. */
  useEffect(() => {
    const activeElement = getActiveMediaElement();
    if (!speakerSupported || !callManager?.remoteStream || !activeElement) return;
    const wantSpeakerByDefault = !!callManager?.isVideoCall;
    (async () => {
      try {
        const target = await findAudioOutput(wantSpeakerByDefault);
        if (target) {
          await activeElement.setSinkId(target.deviceId);
          setIsSpeakerOn(wantSpeakerByDefault);
        }
      } catch (e) {
        console.error('Errore impostazione uscita audio di default:', e);
      }
    })();
  }, [speakerSupported, callManager?.remoteStream, callManager?.isVideoCall]);

  const handleToggleSpeaker = async () => {
    const activeElement = getActiveMediaElement();
    if (!speakerSupported || !activeElement) return;
    try {
      const wantSpeaker = !isSpeakerOn;
      const target = await findAudioOutput(wantSpeaker);
      if (target) {
        await activeElement.setSinkId(target.deviceId);
        setIsSpeakerOn(wantSpeaker);
      }
    } catch (e) {
      console.error('Errore cambio uscita audio:', e);
    }
  };

  if (!callManager) return null;
  const { callState, incomingCall, errorMessage, acceptCall, rejectCall, endCall, toggleMute } = callManager;

  /* ── fix: "Chiamata rifiutata." (e altri messaggi di errore) restavano
     fissi a schermo per sempre - nulla li cancellava mai da soli, solo
     l'inizio di una nuova chiamata li sovrascriveva. Ora spariscono da
     soli dopo 4 secondi. */
  const [localErrorVisible, setLocalErrorVisible] = useState(false);
  useEffect(() => {
    if (!errorMessage) {
      setLocalErrorVisible(false);
      return undefined;
    }
    setLocalErrorVisible(true);
    const timer = setTimeout(() => setLocalErrorVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  const handleToggleMute = () => {
    const nowMuted = toggleMute();
    setIsMuted(nowMuted);
  };

  return (
    <>
      {/* ── fix (Fase 2 videochiamate): l'elemento <video> remoto porta gia'
         l'audio da solo - se questo <audio> restasse attivo ANCHE durante
         una videochiamata, lo stesso audio verrebbe riprodotto due volte
         in contemporanea da due elementi diversi (eco/distorsione, "si
         sente male" riportato dall'utente). Ora e' attivo SOLO per le
         chiamate vocali (senza video), dove resta l'unica sorgente audio
         come prima. ─────────────────────────────────────────────────── */}
      {!callManager?.isVideoCall && <audio ref={audioRef} autoPlay />}

      {callState === 'ringing' && incomingCall && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-[#14B8A6]/25 shadow-[0_0_40px_-12px_rgba(20,184,166,0.35)] bg-white p-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)]">
              {incomingCall.isVideo ? <Video size={24} className="text-white" /> : <Phone size={24} className="text-white" />}
            </div>
            <p className="mb-1 text-lg font-semibold text-[#122023]">{incomingCall.fromUsername}</p>
            <p className="mb-6 text-sm text-[#5C6D6F]">{incomingCall.isVideo ? 'Videochiamata in arrivo…' : 'Chiamata in arrivo…'}</p>
            <div className="flex justify-center gap-4">
              <button
                type="button"
                onClick={rejectCall}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[#C2410C] text-white transition-opacity duration-150 hover:opacity-90"
                aria-label="Rifiuta"
              >
                <PhoneOff size={22} />
              </button>
              <button
                type="button"
                onClick={acceptCall}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[#14B8A6] text-white transition-opacity duration-150 hover:opacity-90"
                aria-label="Rispondi"
              >
                <Phone size={22} />
              </button>
            </div>
          </div>
        </div>
      )}

      {callManager?.isVideoCall && (callState === 'calling' || callState === 'connected') && (
        <div className="fixed inset-0 z-[290] bg-black">
          <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute right-4 top-4 h-32 w-24 rounded-2xl border-2 border-white/30 object-cover shadow-lg sm:h-40 sm:w-28"
          />
        </div>
      )}
      {(callState === 'calling' || callState === 'connected') && (
        <div className="fixed left-1/2 top-3 z-[300] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[#14B8A6]/25 bg-white px-2.5 py-1.5 shadow-lg sm:gap-3 sm:px-4 sm:py-2">
          <span className="hidden h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#14B8A6] sm:block" />
          <span className="hidden shrink-0 text-sm font-medium text-[#122023] sm:inline">
            {callState === 'calling' ? 'Chiamata in corso…' : 'In chiamata'}
          </span>
          {speakerSupported && (
            <button
              type="button"
              onClick={handleToggleSpeaker}
              className={`shrink-0 rounded-full p-2 transition-colors duration-150 sm:p-3 ${isSpeakerOn ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'text-[#5C6D6F] hover:bg-[#E4EEEE]'}`}
              aria-label={isSpeakerOn ? "Passa all'auricolare" : "Passa al vivavoce"}
            >
              <Volume2 size={18} className="sm:hidden" />
              <Volume2 size={22} className="hidden sm:block" />
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleMute}
            className={`shrink-0 rounded-full p-2 transition-colors duration-150 sm:p-3 ${isMuted ? 'bg-[#FCE9E0] text-[#C2410C]' : 'text-[#5C6D6F] hover:bg-[#E4EEEE]'}`}
            aria-label="Muto"
          >
            <Mic size={18} className="sm:hidden" />
            <Mic size={22} className="hidden sm:block" />
          </button>
          <button
            type="button"
            onClick={endCall}
            className="shrink-0 rounded-full bg-[#C2410C] p-2 text-white transition-opacity duration-150 hover:opacity-90 sm:p-3"
            aria-label="Chiudi chiamata"
          >
            <PhoneOff size={18} className="sm:hidden" />
            <PhoneOff size={22} className="hidden sm:block" />
          </button>
        </div>
      )}

      {localErrorVisible && errorMessage && callState === 'idle' && (
        <div className="fixed left-1/2 top-4 z-[300] -translate-x-1/2 rounded-full border border-[#C2410C]/25 bg-[#FCE9E0] px-4 py-2 text-sm text-[#C2410C] shadow-lg">
          {errorMessage}
        </div>
      )}
    </>
  );
};

const StatusToast = ({ toast }) => (
  <AnimatePresence>
    {toast.show && (
      <motion.div
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -16, opacity: 0 }}
        transition={{ duration: 0.15, ease: EASE }}
        className={`fixed left-1/2 top-6 z-[120] -translate-x-1/2 rounded-2xl border px-4 py-2.5 shadow-xl backdrop-blur-xl ${
          toast.type === 'error'
            ? `${T.dangerSoftBorder} ${T.dangerSoftBg} ${T.danger}`
            : `${T.accentSoftBorder} ${T.accentSoftBg} ${T.accentText}`
        }`}
      >
        <div className="flex items-center gap-2.5 text-sm font-medium">
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{toast.message}</span>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

function AccountMenu({ username, userId, userRole, onLogout, onInvite, onOpenAdminApp, onGenerateRecoveryCode, onOpenBlockedUsers, onOpenDeviceManagement, onClose }) {
  const { t } = useTranslation();

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const roleLabel = userRole === 'consumer' ? 'Area personale'
    : userRole === 'admin' ? 'Admin workspace'
    : 'Workspace';

  const normalActions = [
    { icon: Share2, label: t('dashboard.account_menu.invite_friend'), onClick: onInvite, show: Boolean(onInvite) },
    { icon: ShieldCheck, label: t('dashboard.account_menu.administration'), onClick: onOpenAdminApp, show: Boolean(onOpenAdminApp) },
    { icon: KeyRound, label: t('dashboard.account_menu.recovery_code'), onClick: onGenerateRecoveryCode, show: Boolean(onGenerateRecoveryCode) },
    { icon: Ban, label: t('dashboard.account_menu.blocked_users'), onClick: onOpenBlockedUsers, show: Boolean(onOpenBlockedUsers) },
    { icon: Smartphone, label: t('dashboard.account_menu.my_devices'), onClick: onOpenDeviceManagement, show: Boolean(onOpenDeviceManagement) },
  ].filter((a) => a.show);

  const handleActionClick = (action) => {
    action.onClick();
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: EASE }}
      className="fixed inset-0 z-[100] flex justify-end lg:bg-black/50 lg:backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 28 }}
        transition={{ duration: 0.18, ease: EASE }}
        className={`flex h-full w-full flex-col ${T.bg} lg:w-full lg:max-w-md lg:border-l lg:${T.border} lg:shadow-2xl`}
      >
        <div className={`flex items-center gap-3 border-b ${T.borderSoft} px-4 py-4`}>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl p-2 ${T.textMuted} transition-colors duration-150 hover:bg-white/5 hover:${T.text}`}
            aria-label={t('dashboard.common.close')}
          >
            <ChevronLeft size={20} />
          </button>
          <UserAvatar username={username} size={38} />
          <div className="min-w-0">
            <h3 className={`truncate text-base font-semibold ${T.text}`}>{username || t('dashboard.account_menu.default_username')}</h3>
            <p className={`text-xs ${T.textFaint}`}>{roleLabel}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-1">
            {normalActions.map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleActionClick(action)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium ${T.text} transition-colors duration-150 hover:bg-white/5`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${T.accentSoftBg} ${T.accentText}`}>
                  <action.icon size={17} />
                </span>
                {action.label}
              </button>
            ))}
          </div>

          <div className={`mt-4 space-y-1 border-t ${T.borderSoft} pt-4`}>
            <button
              type="button"
              onClick={() => handleActionClick({ onClick: onLogout })}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium ${T.danger} transition-colors duration-150 hover:bg-white/5`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                <LogOut size={17} />
              </span>
              {t('dashboard.account_menu.logout')}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function RecoveryCodeModal({ authToken, onClose, showToast }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [generatedCode, setGeneratedCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiService.generateRecoveryCode(password, authToken);
      setGeneratedCode(res.recovery_code);
    } catch (err) {
      setError(err?.message || 'Errore durante la generazione del codice');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDone = () => {
    if (showToast) showToast('Codice di recupero generato');
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: EASE }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[2px] px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <motion.div
        initial={{ y: 12, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 12, opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.18, ease: EASE }}
        className={`relative w-full max-w-sm rounded-2xl border ${T.border} ${T.surface} shadow-2xl overflow-hidden`}
      >
        <div className={`flex items-start justify-between border-b ${T.borderSoft} px-5 py-4`}>
          <div>
            <h3 className={`text-sm font-semibold ${T.text}`}>{t('dashboard.recovery_modal.title')}</h3>
            <p className={`mt-0.5 text-xs ${T.textFaint}`}>
              {generatedCode ? 'Salvalo ora: non lo vedrai più' : 'Serve per reimpostare la password se la dimentichi'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${T.textFaint} transition-colors duration-150 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50`}
            aria-label={t('dashboard.common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          {!generatedCode ? (
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label htmlFor="recovery-confirm-password" className={`mb-2 block text-sm font-medium ${T.text}`}>
                  {t('dashboard.recovery_modal.confirm_password_label')}
                </label>
                <input
                  id="recovery-confirm-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                  className={`w-full rounded-xl border ${T.border} ${T.elevated} px-4 py-3 text-sm ${T.text} outline-none transition-colors duration-150 focus:border-[#14B8A6]/40 disabled:cursor-not-allowed disabled:opacity-60`}
                />
              </div>

              {error && (
                <div className={`flex items-start gap-2.5 rounded-xl border ${T.dangerSoftBorder ?? T.border} ${T.dangerSoftBg ?? T.elevated} px-4 py-3 text-sm ${T.danger}`}>
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <p className={`text-xs ${T.textFaint}`}>
                Generare un nuovo codice invalida automaticamente quello precedente, se ne avevi già uno.
              </p>

              <button
                type="submit"
                disabled={loading || !password}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl ${T.accentBg} ${T.accentBgHover} px-4 py-3 text-sm font-semibold text-[#0B0C11] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                <span>{loading ? t('dashboard.recovery_modal.generating') : t('dashboard.recovery_modal.generate_button')}</span>
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-xl border ${T.border} ${T.elevated} px-4 py-4 text-center`}>
                <p className={`font-mono text-lg tracking-wider ${T.text}`}>{generatedCode}</p>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border ${T.border} px-4 py-2.5 text-sm font-medium ${T.text} transition-colors duration-150 hover:bg-white/5`}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{copied ? 'Copiato' : 'Copia codice'}</span>
              </button>

              <div className={`flex items-start gap-2.5 rounded-xl border ${T.dangerSoftBorder ?? T.border} ${T.dangerSoftBg ?? T.elevated} px-4 py-3 text-xs ${T.danger}`}>
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t('dashboard.recovery_modal.save_warning')}</span>
              </div>

              <button
                type="button"
                onClick={handleDone}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl ${T.accentBg} ${T.accentBgHover} px-4 py-3 text-sm font-semibold text-[#0B0C11] transition-colors duration-150`}
              >
                <span>{t('dashboard.recovery_modal.saved_confirm')}</span>
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function TaskPanel({
  tasks,
  tasksLoading,
  onClose,
  onCreateTask,
  onToggleStatus,
  onDeleteTask,
  showToast,
  room,
  authToken,
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [roomMembers, setRoomMembers] = useState([]);
  const menuRef = useRef(null);

  // Carica i membri della stanza per il selettore "Assegna a" -- stesso
  // pattern gia' usato da RosterPanel/ConversationInfoPanel, TaskPanel
  // non condivide il loro scope quindi si carica la lista da se'.
  useEffect(() => {
    if (!room?.id || !authToken) return;
    apiService.getRoomUsers(room.id, authToken)
      .then((data) => setRoomMembers(Array.isArray(data) ? data : []))
      .catch(() => setRoomMembers([]));
  }, [room?.id, authToken]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);
    try {
      await onCreateTask({
        title: title.trim(),
        description: description.trim(),
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        assignedToUserId: assignedToUserId || null,
      });
      setTitle('');
      setDescription('');
      setDueDate('');
      setAssignedToUserId('');
      showToast && showToast('Task creato');
    } catch (err) {
      showToast && showToast(err?.message || 'Errore creazione task', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (task) => {
    setBusyId(task.id);
    try {
      await onToggleStatus(task);
    } catch (err) {
      showToast && showToast(err?.message || 'Errore aggiornamento stato', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (task) => {
    setBusyId(task.id);
    try {
      await onDeleteTask(task);
      showToast && showToast('Task eliminato');
    } catch (err) {
      showToast && showToast(err?.message || 'Errore eliminazione task', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: EASE }}
      className="fixed inset-0 z-[100] flex justify-end bg-black/40 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        ref={menuRef}
        initial={{ x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 24, opacity: 0 }}
        transition={{ duration: 0.18, ease: EASE }}
        className={`relative h-full w-full max-w-md ${T.surface} border-l ${T.border} shadow-2xl overflow-y-auto p-6`}
      >
        <div className="mb-6 flex items-center justify-between">
          <h3 className={`text-lg font-semibold ${T.text}`}>{t('dashboard.task_panel.title')}</h3>
          <button type="button" onClick={onClose} className={`rounded-xl p-2 ${T.textFaint} hover:bg-white/5`}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mb-6 space-y-2.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('dashboard.task_panel.title_placeholder')}
            className={`w-full rounded-xl border ${T.border} ${T.elevated} px-3 py-2.5 text-sm ${T.text} outline-none`}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('dashboard.task_panel.description_placeholder')}
            rows={2}
            className={`w-full rounded-xl border ${T.border} ${T.elevated} px-3 py-2.5 text-sm ${T.text} outline-none`}
          />
          <input
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={`w-full rounded-xl border ${T.border} ${T.elevated} px-3 py-2.5 text-sm ${T.text} outline-none`}
          />
          <select
            value={assignedToUserId}
            onChange={(e) => setAssignedToUserId(e.target.value)}
            className={`w-full rounded-xl border ${T.border} ${T.elevated} px-3 py-2.5 text-sm ${T.text} outline-none`}
          >
            <option value="">{t('dashboard.task_panel.no_assignee')}</option>
            {roomMembers.map((m) => (
              <option key={m.id || m.username} value={m.id}>
                {m.username}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="w-full rounded-xl bg-[#5ED6A8] py-2.5 text-sm font-semibold text-[#0B2A20] disabled:opacity-50"
          >
            {creating ? t('dashboard.task_panel.creating') : t('dashboard.task_panel.add_task')}
          </button>
        </form>

        {tasksLoading ? (
          <p className={`text-sm ${T.textFaint}`}>{t('dashboard.task_panel.loading')}</p>
        ) : tasks.length === 0 ? (
          <p className={`text-sm ${T.textFaint}`}>{t('dashboard.task_panel.empty')}</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const isDone = task.status === 'done';
              const isBusy = busyId === task.id;
              return (
                <div
                  key={task.id}
                  className={`rounded-xl border ${T.border} ${T.elevated} p-3 flex items-start gap-3`}
                >
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleToggle(task)}
                    className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border flex items-center justify-center ${
                      isDone ? 'bg-[#5ED6A8] border-transparent' : `${T.border} bg-transparent`
                    }`}
                  >
                    {isDone && <Check size={13} strokeWidth={3} className="text-[#0B2A20]" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    {task.undecryptable ? (
                      <p className={`text-sm italic ${T.textFaint}`}>🔒 {t('dashboard.task_panel.undecryptable')}</p>
                    ) : (
                      <>
                        <p className={`text-sm font-medium ${isDone ? T.textFaint : T.text} ${isDone ? 'line-through' : ''}`}>
                          {task.title || t('dashboard.task_panel.untitled')}
                        </p>
                        {task.description && (
                          <p className={`mt-0.5 text-xs ${T.textFaint}`}>{task.description}</p>
                        )}
                      </>
                    )}
                    {task.due_date && (
                      <p className={`mt-1 text-[11px] ${T.textFaint}`}>
                        {t('dashboard.task_panel.due_date_prefix')} {new Date(task.due_date).toLocaleString('it-IT')}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDelete(task)}
                    className={`shrink-0 rounded-lg p-1.5 ${T.textFaint} hover:bg-white/5 hover:text-red-400`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function ReportUserModal({ targetUserId, roomId, authToken, onClose, showToast }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('spam');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reasons = [
    { value: 'spam', label: t('dashboard.report_modal.reason_spam') },
    { value: 'molestie', label: t('dashboard.report_modal.reason_harassment') },
    { value: 'contenuto_inappropriato', label: t('dashboard.report_modal.reason_inappropriate') },
    { value: 'altro', label: t('dashboard.report_modal.reason_other') },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || !targetUserId) return;
    setSubmitting(true);
    try {
      await apiService.reportUser(targetUserId, reason, description.trim() || undefined, roomId, authToken);
      showToast(t('dashboard.report_modal.success_toast'));
      onClose();
    } catch (err) {
      const status = err?.status;
      if (status === 400) {
        showToast(t('dashboard.report_modal.self_report_error'), 'error');
      } else if (status === 429) {
        showToast(t('dashboard.report_modal.rate_limit_error'), 'error');
      } else {
        showToast(t('dashboard.report_modal.error_toast'), 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SlideOver title={t('dashboard.report_modal.title')} subtitle={t('dashboard.report_modal.subtitle')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className={`mb-2 text-sm font-medium ${T.text}`}>{t('dashboard.report_modal.reason_label')}</p>
          <div className="space-y-2">
            {reasons.map((r) => (
              <label
                key={r.value}
                className={`flex items-center gap-2.5 rounded-xl border ${T.border} ${T.elevated} px-4 py-2.5 text-sm ${T.text} cursor-pointer transition-colors duration-150 hover:bg-white/5`}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="accent-[#14B8A6]"
                />
                {r.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="report-description" className={`mb-2 block text-sm font-medium ${T.text}`}>
            {t('dashboard.report_modal.description_label')}
          </label>
          <textarea
            id="report-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('dashboard.report_modal.description_placeholder')}
            rows={3}
            maxLength={2000}
            className={`w-full rounded-2xl border ${T.border} ${T.elevated} px-4 py-3 text-sm ${T.text} outline-none transition-colors duration-150 focus:border-[#14B8A6]/40`}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)] py-2.5 text-sm font-semibold text-[#0B0C11] disabled:opacity-50 transition-opacity duration-150 hover:opacity-90`}
        >
          <Flag size={15} />
          {t('dashboard.report_modal.submit_button')}
        </button>
      </form>
    </SlideOver>
  );
}

function BlockConfirmSheet({ username, onConfirm, onCancel }) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      title={t('dashboard.block_confirm.title', { username: username || '' })}
      subtitle={t('dashboard.block_confirm.subtitle')}
      onClose={onCancel}
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border ${T.borderSoft} ${T.surface} py-2.5 text-sm font-medium ${T.textMuted} transition-colors duration-150 hover:bg-white/5`}
        >
          {t('dashboard.block_confirm.cancel_button')}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl ${T.dangerSoftBg} ${T.dangerSoftBorder} border py-2.5 text-sm font-medium ${T.danger} disabled:opacity-50 transition-colors duration-150 hover:bg-white/5`}
        >
          <Ban size={15} />
          {t('dashboard.block_confirm.confirm_button')}
        </button>
      </div>
    </BottomSheet>
  );
}

function BlockedUsersPanel({ authToken, onClose, onUnblocked, showToast }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState(null);

  useEffect(() => {
    if (!authToken) return;
    setLoading(true);
    apiService.getBlockedUsers(authToken)
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [authToken]);

  const handleUnblock = async (userId) => {
    if (unblockingId) return;
    setUnblockingId(userId);
    try {
      await apiService.unblockUser(userId, authToken);
      segnaSbloccato(userId);  // [palacan-metadati-a4.4c3]
      window.dispatchEvent(new CustomEvent('palacan:blocchi-cambiati'));  // [palacan-metadati-3.4d-blocco]
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      if (typeof onUnblocked === 'function') onUnblocked(userId);
      showToast(t('dashboard.blocked_users_panel.unblock_success'));
    } catch (e) {
      console.error('Errore sblocco:', e);
      showToast(t('dashboard.blocked_users_panel.unblock_error'), 'error');
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <SlideOver title={t('dashboard.blocked_users_panel.title')} subtitle={t('dashboard.blocked_users_panel.subtitle')} onClose={onClose}>
      {loading ? (
        <div className={`text-xs ${T.textFaint} py-2`}>{t('dashboard.blocked_users_panel.loading')}</div>
      ) : users.length > 0 ? (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className={`flex items-center gap-2.5 rounded-2xl border ${T.border} ${T.elevated} px-4 py-2.5`}>
              <UserAvatar username={u.username} size={32} />
              <span className={`flex-1 truncate text-sm ${T.text}`}>{u.username}</span>
              <button
                type="button"
                onClick={() => handleUnblock(u.id)}
                disabled={unblockingId === u.id}
                className={`shrink-0 rounded-xl border ${T.borderSoft} px-3 py-1.5 text-xs font-medium ${T.textMuted} disabled:opacity-50 transition-colors duration-150 hover:bg-white/5`}
              >
                {t('dashboard.blocked_users_panel.unblock_button')}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className={`text-xs ${T.textFaint}`}>{t('dashboard.blocked_users_panel.empty_state')}</p>
      )}
    </SlideOver>
  );
}

function ConversationActionsMenu({ onAddFriend, onCopyId, onInfo, onRename, onLeave, onOpenTasks, onOpenAutoDelete, onToggleMute, isMuted, onToggleFavorite, isFavorite, onReport, onBlock, onRemoveContact, onVerifyIdentity, isDirect, isBlocked, onClose }) {
  const { t } = useTranslation();

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const actions = [
    { icon: UserPlus, label: t('dashboard.actions_menu.add_participant'), onClick: onAddFriend, show: Boolean(onAddFriend) },
    { icon: Info, label: t('dashboard.actions_menu.info'), onClick: onInfo, show: true },
    { icon: Edit3, label: t('dashboard.actions_menu.rename'), onClick: onRename, show: Boolean(onRename) && !isDirect },
    { icon: ListChecks, label: t('dashboard.actions_menu.tasks'), onClick: onOpenTasks, show: Boolean(onOpenTasks) },
    { icon: Timer, label: t('dashboard.actions_menu.auto_delete'), onClick: onOpenAutoDelete, show: Boolean(onOpenAutoDelete) },
    // [palacan-avanzi-id] 'Copia ID conversazione' tolto: in un gruppo si entra solo su invito
    { icon: ShieldCheck, label: t('dashboard.actions_menu.verify_identity', 'Verifica identità'), onClick: onVerifyIdentity, show: Boolean(onVerifyIdentity) && isDirect },
    { icon: isMuted ? Bell : BellOff, label: isMuted ? t('dashboard.actions_menu.unmute') : t('dashboard.actions_menu.mute'), onClick: onToggleMute, show: Boolean(onToggleMute) },
    { icon: Star, label: isFavorite ? t('dashboard.actions_menu.remove_favorite') : t('dashboard.actions_menu.add_favorite'), onClick: onToggleFavorite, show: Boolean(onToggleFavorite) },
    { icon: Flag, label: t('dashboard.actions_menu.report'), onClick: onReport, show: Boolean(onReport) && isDirect, danger: true },
    { icon: Ban, label: isBlocked ? t('dashboard.actions_menu.unblock') : t('dashboard.actions_menu.block'), onClick: onBlock, show: Boolean(onBlock) && isDirect, danger: true },
    {
      icon: isDirect ? Trash2 : DoorOpen,
      label: isDirect ? t('dashboard.actions_menu.delete_conversation', 'Elimina conversazione') : t('dashboard.actions_menu.leave'),
      onClick: onLeave,
      show: Boolean(onLeave),
      danger: true,
      confirmMessage: isDirect
        ? t('dashboard.actions_menu.delete_conversation_confirm', 'Eliminare questa conversazione? Resterà visibile solo all\'altro utente.')
        : t('dashboard.actions_menu.leave_confirm', 'Sei sicuro di voler uscire da questo gruppo?'),
    },
  ].filter((a) => a.show);

  const normalActions = actions.filter((a) => !a.danger);
  const dangerActions = actions.filter((a) => a.danger);

  const handleActionClick = (action) => {
    if (action.confirmMessage && !window.confirm(action.confirmMessage)) return;
    action.onClick();
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: EASE }}
      className="fixed inset-0 z-[100] flex justify-end lg:bg-black/50 lg:backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 28 }}
        transition={{ duration: 0.18, ease: EASE }}
        className={`flex h-full w-full flex-col ${T.bg} lg:w-full lg:max-w-md lg:border-l lg:${T.border} lg:shadow-2xl`}
      >
        <div className={`flex items-center gap-3 border-b ${T.borderSoft} px-4 py-4`}>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl p-2 ${T.textMuted} transition-colors duration-150 hover:bg-white/5 hover:${T.text}`}
            aria-label={t('dashboard.common.close')}
          >
            <ChevronLeft size={20} />
          </button>
          <h3 className={`text-base font-semibold ${T.text}`}>{t('dashboard.actions_menu.panel_title', 'Opzioni conversazione')}</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-1">
            {normalActions.map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleActionClick(action)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium ${T.text} transition-colors duration-150 hover:bg-white/5`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${T.accentSoftBg} ${T.accentText}`}>
                  <action.icon size={17} />
                </span>
                {action.label}
              </button>
            ))}
          </div>
          {dangerActions.length > 0 && (
            <div className={`mt-4 space-y-1 border-t ${T.borderSoft} pt-4`}>
              {dangerActions.map((action, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleActionClick(action)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium ${T.danger} transition-colors duration-150 hover:bg-white/5`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                    <action.icon size={17} />
                  </span>
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// v-next (timer di auto-cancellazione, richiesta esplicita di prodotto):
// pannello di scelta, SOLO stanze non aziendali (mai renderizzato per
// una stanza aziendale - vedi onOpenAutoDelete in ConversationActionsMenu,
// passato come undefined se isEnterprise). Il backend rifiuta comunque
// la richiesta anche se qualcuno bypassasse l'interfaccia - mai una
// sola barriera.
const AUTO_DELETE_OPTIONS = [
  { minutes: null, labelKey: 'dashboard.auto_delete_panel.option_never' },
  { minutes: 5, labelKey: 'dashboard.auto_delete_panel.option_5_min' },
  { minutes: 30, labelKey: 'dashboard.auto_delete_panel.option_30_min' },
  { minutes: 60, labelKey: 'dashboard.auto_delete_panel.option_1_hour' },
  { minutes: 1440, labelKey: 'dashboard.auto_delete_panel.option_1_day' },
  { minutes: 10080, labelKey: 'dashboard.auto_delete_panel.option_1_week' },
];

function AutoDeleteSettingsPanel({ room, onClose, onSelect }) {
  const { t } = useTranslation();
  const currentValue = room?.auto_delete_after_minutes ?? null;

  return (
    <SlideOver title={t('dashboard.auto_delete_panel.title')} onClose={onClose}>
      <p className={`text-xs ${T.textFaint} mb-4`}>
        {t('dashboard.auto_delete_panel.description')}
      </p>
      <div className="space-y-1">
        {AUTO_DELETE_OPTIONS.map((option) => {
          const isSelected = currentValue === option.minutes;
          return (
            <button
              key={String(option.minutes)}
              type="button"
              onClick={() => onSelect(option.minutes)}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors duration-150 ${
                isSelected
                  ? `${T.accentSoftBg} ${T.accentText} ring-1 ${T.accentSoftBorder}`
                  : `${T.text} hover:bg-white/5`
              }`}
            >
              {t(option.labelKey)}
              {isSelected && <Check size={16} />}
            </button>
          );
        })}
      </div>
    </SlideOver>
  );
}


// [palacan-metadati-2a] Nome mostrato di una stanza. Per le chat dirette il server non conserva piu' i nomi
// degli utenti nel nome della stanza: il nome si ricava dai partecipanti che il server fornisce
// (participant_usernames). Il vecchio formato "a, b" resta leggibile finche' la migrazione non lo svuota.
function altriPartecipantiDiretta(room, currentUsername) {
  if (!room) return [];
  const elenco = Array.isArray(room.participant_usernames)
    ? room.participant_usernames
    : Array.isArray(room.participantUsernames) ? room.participantUsernames : [];
  const altri = elenco.filter((u) => u && u !== currentUsername);
  if (altri.length) return altri;
  return String(room.name || '').split(',').map((s) => s.trim()).filter((n) => n && n !== currentUsername);
}

function nomeVisibileStanza(room, currentUsername) {
  if (!room) return '';
  if (room.room_kind === 'direct' || room.roomKind === 'direct') {
    return altriPartecipantiDiretta(room, currentUsername).join(', ');
  }
  return room.name || '';
}

function ConversationInfoPanel({ room, authToken, currentUsername, onClose, onAddFriend, onRename, onLeave, showToast }) {
  const { t } = useTranslation();
  const [participants, setParticipants] = useState([]);
  const [loadingPart, setLoadingPart] = useState(true);

  useEffect(() => {
    if (!room?.id || !authToken) return;
    setLoadingPart(true);
    apiService.getRoomUsers(room.id, authToken)
      .then((data) => setParticipants(Array.isArray(data) ? data : []))
      .catch(() => setParticipants([]))
      .finally(() => setLoadingPart(false));
  }, [room?.id, authToken]);

  // [palacan-avanzi-id] copia del 'codice d'invito' (era l'identificativo della stanza) tolta

  const createdAt = room?.created_at
    ? new Date(room.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <SlideOver title={t('dashboard.info_panel.title')} onClose={onClose}>
      <div className="flex items-center gap-3 mb-6">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${T.accentSoftBg} ${T.accentText} ring-1 ${T.accentSoftBorder} text-lg font-semibold`}>
          {(nomeVisibileStanza(room, currentUsername) || '?').charAt(0).toUpperCase()}
        </div>
        <div>
          <p className={`font-medium ${T.text}`}>{nomeVisibileStanza(room, currentUsername) || t('dashboard.info_panel.default_room_name')}</p>
          {createdAt && <p className={`text-xs ${T.textFaint}`}>{t('dashboard.info_panel.created_on_prefix')} {createdAt}</p>}
        </div>
      </div>

      {/* [palacan-avanzi-id] riquadro 'codice d'invito' tolto: in un gruppo si entra solo su invito dal menu */}

      <div className="mb-6">
        <p className={`text-[11px] font-medium uppercase tracking-wider ${T.textFaint} mb-2.5`}>
          {t('dashboard.info_panel.participants_label')} {!loadingPart && `(${participants.length})`}
        </p>
        {loadingPart ? (
          <div className={`text-xs ${T.textFaint} py-2`}>{t('dashboard.info_panel.loading')}</div>
        ) : participants.length > 0 ? (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {participants.map((p) => (
              <div key={p?.id || p?.username} className="flex items-center gap-2.5">
                <UserAvatar username={p?.username} size={28} />
                <span className={`text-sm ${T.text} truncate`}>{p?.username}</span>
                {p?.username === currentUsername && (
                  <span className={`text-[10px] ${T.accentText} font-medium`}>{t('dashboard.info_panel.you_badge')}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className={`text-xs ${T.textFaint}`}>{t('dashboard.info_panel.no_participants')}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {onAddFriend && (
          <button
            type="button"
            onClick={() => { onAddFriend(); onClose(); }}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl ${T.accentBg} ${T.accentBgHover} py-2.5 text-sm font-semibold text-[#0B0C11] transition-colors duration-150`}
          >
            <UserPlus size={15} />
            {t('dashboard.info_panel.add_friend_button')}
          </button>
        )}

        {/* [palacan-avanzi-id] pulsante 'Copia codice d'invito' tolto */}
        {onRename && (
          <button
            type="button"
            onClick={() => { onRename(); onClose(); }}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border ${T.border} ${T.elevated} py-2.5 text-sm font-medium ${T.text} transition-colors duration-150 hover:bg-white/5`}
          >
            <Edit3 size={15} />
            {t('dashboard.info_panel.rename_button')}
          </button>
        )}

        {onLeave && (
          <button
            type="button"
            onClick={() => { onLeave(); onClose(); }}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border ${T.dangerSoftBorder} ${T.dangerSoftBg} py-2.5 text-sm font-medium ${T.danger} transition-colors duration-150 hover:opacity-90`}
          >
            <DoorOpen size={15} />
            {t('dashboard.info_panel.leave_button')}
          </button>
        )}
      </div>
    </SlideOver>
  );
}

function RenamePanel({ room, authToken, onClose, onSuccess, showToast }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(room?.name || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!value.trim() || !room?.id) return;
    setLoading(true);
    try {
      if (typeof apiService.renameRoom !== 'function') throw new Error(t('dashboard.rename_panel.error_endpoint_unavailable'));
      // [palacan-metadati-a3.2a] gruppo privato: al server solo il controllo del permesso, il nome nuovo sul dispositivo
      const privato = eGruppoPrivato(room);
      await apiService.renameRoom(room.id, privato ? ' ' : value.trim(), authToken);
      if (privato) imparaNomeStanza(room.id, value.trim());
      if (privato) window.dispatchEvent(new CustomEvent('palacan:rinomina-gruppo', { detail: { roomId: room.id, nome: value.trim() } }));  // [palacan-metadati-a3.2b1]
      showToast(t('dashboard.rename_panel.success'));
      onSuccess?.(value.trim());
      onClose();
    } catch (err) {
      showToast(err?.message || t('dashboard.rename_panel.error_generic'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SlideOver title={t('dashboard.rename_panel.title')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          autoFocus value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('dashboard.rename_panel.placeholder')}
          className={`w-full rounded-2xl border ${T.border} ${T.elevated} px-4 py-3 ${T.text} outline-none transition-colors duration-150 focus:border-[#14B8A6]/40`}
          required
        />
        <button
          type="submit" disabled={loading || !value.trim()}
          className={`w-full rounded-2xl ${T.accentBg} ${T.accentBgHover} py-3 text-sm font-semibold text-[#0B0C11] disabled:opacity-50 transition-colors duration-150`}
        >
          {loading ? t('dashboard.rename_panel.submitting') : t('dashboard.rename_panel.submit_button')}
        </button>
      </form>
    </SlideOver>
  );
}

function ContactsListPanel({ authToken, onClose, showToast }) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingUsername, setRemovingUsername] = useState(null);

  useEffect(() => {
    if (!authToken) return;
    setLoading(true);
    apiService.getContacts(authToken)
      .then((list) => setContacts(Array.isArray(list) ? list : []))
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }, [authToken]);

  const handleRemove = async (username) => {
    const confirmMsg = t(
      'dashboard.contacts_list.remove_confirm',
      `Rimuovere ${username} dai tuoi amici? Potrete tornare amici in futuro se vi ri-inviterete.`
    );
    if (!window.confirm(confirmMsg)) return;

    setRemovingUsername(username);
    try {
      await apiService.removeContact(username, authToken);
      setContacts((prev) => prev.filter((c) => c.username !== username));
      showToast?.(t('dashboard.contacts_list.removed', 'Contatto rimosso'));
    } catch (e) {
      console.error('Errore rimozione contatto:', e);
      showToast?.(t('dashboard.contacts_list.remove_error', 'Errore rimozione contatto'), 'error');
    } finally {
      setRemovingUsername(null);
    }
  };

  return (
    <SlideOver title={t('dashboard.contacts_list.title', 'I miei contatti')} onClose={onClose}>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className={`animate-spin ${T.textFaint}`} size={24} />
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Users size={32} className={T.textFaint} />
          <p className={`text-sm ${T.textFaint}`}>{t('dashboard.contacts_list.empty', 'Nessun contatto ancora')}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {contacts.map((c) => (
            <div
              key={c.username}
              className={`flex items-center gap-3 rounded-2xl border ${T.borderSoft} ${T.surface} p-3`}
            >
              <UserAvatar username={c.username} size={40} />
              <p className={`flex-1 truncate text-sm font-medium ${T.text}`}>{c.username}</p>
              <button
                type="button"
                onClick={() => handleRemove(c.username)}
                disabled={removingUsername === c.username}
                className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors duration-150 hover:bg-red-100 disabled:opacity-50"
              >
                {removingUsername === c.username ? '...' : t('dashboard.contacts_list.remove', 'Rimuovi')}
              </button>
            </div>
          ))}
        </div>
      )}
    </SlideOver>
  );
}

const NewConversationTrigger = ({ onCreate, onJoin, variant = 'full' }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button" onClick={() => setOpen(true)}
          className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)]"
          aria-label={t('dashboard.new_conversation.aria_label')}
        >
          <span className="ct-shine-sweep pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgba(255,255,255,0.35)_50%,transparent_65%)]" />
          <Plus size={18} className="relative text-[#0B0C11]" />
        </button>
      ) : variant === 'full' ? (
        <button
          type="button" onClick={() => setOpen(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-2xl ${T.accentBg} ${T.accentBgHover} px-5 py-2.5 text-sm font-semibold text-[#0B0C11] transition-colors duration-150`}
        >
          <Plus size={16} />
          {t('dashboard.new_conversation.button_full')}
        </button>
      ) : (
        <button
          type="button" onClick={() => setOpen(true)}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl ${T.accentBg} ${T.accentBgHover} px-4 py-2.5 text-sm font-semibold text-[#0B0C11] transition-colors duration-150`}
          aria-label={t('dashboard.new_conversation.aria_label')}
        >
          <Plus size={15} />
          {t('dashboard.new_conversation.button_full')}
        </button>
      )}
      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              />
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.15, ease: EASE }}
                className={`fixed bottom-4 left-4 z-50 w-[300px] max-w-[calc(100vw-2rem)] rounded-3xl border border-[#14B8A6]/25 ${T.surface} shadow-[0_0_40px_-12px_rgba(20,184,166,0.35)] p-3`}
              >
                <button
                  type="button"
                  onClick={() => { setOpen(false); onCreate && onCreate(); }}
                  className="flex w-full items-center gap-3.5 rounded-2xl p-3 text-left transition-colors duration-150 hover:bg-white/5"
                >
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${T.elevated}`}>
                    <MessageSquare size={19} className={T.accentText} />
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${T.text}`}>{t('dashboard.new_conversation.dropdown_new_title')}</p>
                    <p className={`text-xs ${T.textFaint}`}>{t('dashboard.new_conversation.dropdown_new_subtitle')}</p>
                  </div>
                </button>
                {/* [palacan-gruppi-solo-invito] 'Entra con ID' tolto: in un gruppo si entra solo su invito */}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

const EmptyConversationState = ({ currentUsername, isEnterprise, isAdmin, onCreate, onJoin }) => (
  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
    <div className={`mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border ${T.border} ${T.surface}`}>
      <MessageSquare size={26} className={T.textMuted} />
    </div>
    <h3 className={`text-lg font-medium tracking-tight ${T.text}`}>
      {isEnterprise ? (isAdmin ? i18n.t('dashboard.empty_states.no_conversation_selected') : i18n.t('dashboard.empty_states.select_conversation')) : i18n.t('dashboard.empty_states.choose_who')}
    </h3>
    <p className={`mt-2.5 max-w-sm text-sm leading-7 ${T.textMuted}`}>
      {isEnterprise
        ? isAdmin
          ? i18n.t('dashboard.empty_states.workspace_hint')
          : i18n.t('dashboard.empty_states.workspace_hint')
        : i18n.t('dashboard.empty_states.personal_hint')}
    </p>
    {!isEnterprise && (onCreate || onJoin) && (
      <div className="mt-6 flex flex-col gap-2 w-full max-w-[220px]">
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="rounded-2xl bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)] px-4 py-2.5 text-sm font-semibold text-[#0B0C11] transition-opacity duration-150 hover:opacity-90"
          >
            {i18n.t('dashboard.new_conversation.dropdown_new_title')}
          </button>
        )}
        {onJoin && (
          <button
            type="button"
            onClick={onJoin}
            className={`rounded-2xl border ${T.border} ${T.surface} px-4 py-2.5 text-sm font-semibold ${T.text} transition-colors duration-150 hover:bg-white/5`}
          >
            {i18n.t('dashboard.new_conversation.dropdown_join_title')}
          </button>
        )}
      </div>
    )}
  </div>
);

const EmptyMessagesState = () => (
  <div className={`flex min-h-[280px] items-center justify-center rounded-3xl border ${T.borderSoft} ${T.surface}/40 px-6 text-center`}>
    <div className="max-w-md">
      <h4 className={`text-base font-medium ${T.text}`}>{i18n.t('dashboard.empty_states.ready_title')}</h4>
      <p className={`mt-2 text-sm leading-7 ${T.textMuted}`}>
        {i18n.t('dashboard.empty_states.ready_subtitle')}
      </p>
    </div>
  </div>
);

const LoadingMessagesState = () => (
  <div className={`flex min-h-[280px] items-center justify-center rounded-3xl border ${T.borderSoft} ${T.surface}/40 px-6 text-center`}>
    <div className="flex flex-col items-center gap-3">
      <Loader2 size={20} className={`${T.textFaint} animate-spin`} />
      <p className={`text-sm ${T.textFaint}`}>{i18n.t('dashboard.empty_states.loading_conversation')}</p>
    </div>
  </div>
);

const ChatBubble = ({ msg, isDirect, onDelete, onHideForMe, onReply, selectionMode, selected, onLongPressStart, onToggleSelect, roomId, authToken, currentUsername, encryptReaction, decryptReaction, reactionLiveEvent, wsReconnectCount }) => {
  const { t } = useTranslation();
  const isSystem = msg?.type === 'system';

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, ease: EASE }}
        className="flex w-full justify-center"
      >
        <span className={`rounded-full px-3 py-1 text-[11px] ${T.textFaint} ${T.elevated}`}>
          {msg?.text}
        </span>
      </motion.div>
    );
  }

  const isSelf = msg?.type === 'self';
  const isFailed = Boolean(msg?.failed);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmDeleteRef = useRef(null); // [palacan-messaggi]
  useEffect(() => { // [palacan-messaggi] chiude la conferma di eliminazione con clic fuori o Esc
    if (!confirmingDelete) return undefined;
    const fuori = (e) => { if (confirmDeleteRef.current && !confirmDeleteRef.current.contains(e.target)) setConfirmingDelete(false); };
    const esc = (e) => { if (e.key === 'Escape') setConfirmingDelete(false); };
    document.addEventListener('mousedown', fuori);
    document.addEventListener('touchstart', fuori);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuori);
      document.removeEventListener('touchstart', fuori);
      document.removeEventListener('keydown', esc);
    };
  }, [confirmingDelete]);
  /* Reazioni REALI: cifrate con Megolm (stessa sessione dei messaggi),
     salvate/lette dal backend (endpoint gia' pronti). reactions = elenco
     grezzo decifrato [{id, username, emoji}]; localReactions (sotto) e'
     derivato per il rendering (raggruppato per emoji con conteggio). */
  const [reactions, setReactions] = useState([]);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const reactionPickerRef = useRef(null);
  const reactionPopupRef = useRef(null);
  const [showFullReactionPicker, setShowFullReactionPicker] = useState(false);
  const [reactionPickerPos, setReactionPickerPos] = useState(null);

  useEffect(() => {
    if (!showReactionPicker) setShowFullReactionPicker(false);
  }, [showReactionPicker]);

  useEffect(() => {
    if (!showReactionPicker) return undefined;
    const handleClickOutside = (e) => {
      const insideTrigger = reactionPickerRef.current && reactionPickerRef.current.contains(e.target);
      const insidePopup = reactionPopupRef.current && reactionPopupRef.current.contains(e.target);
      if (!insideTrigger && !insidePopup) {
        setShowReactionPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showReactionPicker]);
  const [reactionBusy, setReactionBusy] = useState(false);

  // [palacan-metadati-3.6] reazioni come messaggi cifrati: arrivano con la cronologia e dal vivo e sono raccolte in
  // src/utils/reazioni.js. La bolla non scarica piu' nulla dal server (prima: una richiesta per messaggio).
  useEffect(() => {
    const aggiorna = () => setReactions(reazioniDel(roomId, [msg?.id, msg?.client_msg_id]));
    aggiorna();
    window.addEventListener('palacan:reazioni-cambiate', aggiorna);
    return () => window.removeEventListener('palacan:reazioni-cambiate', aggiorna);
  }, [roomId, msg?.id, msg?.client_msg_id]);

  const localReactions = useMemo(() => {
    const byEmoji = new Map();
    for (const r of reactions) {
      const entry = byEmoji.get(r.emoji) || { emoji: r.emoji, count: 0, reactedByMe: false };
      entry.count += 1;
      if (r.username === currentUsername) entry.reactedByMe = true;
      byEmoji.set(r.emoji, entry);
    }
    return Array.from(byEmoji.values());
  }, [reactions, currentUsername]);

  const toggleLocalReaction = async (emoji) => {
    // [palacan-metadati-3.6] bersaglio: l'id del server (lo conoscono tutti); per un messaggio appena inviato, quello provvisorio
    const bersaglio = isRealMessageId(msg?.id) ? msg.id : msg?.client_msg_id;
    if (!roomId || !bersaglio || typeof encryptReaction !== 'function' || reactionBusy) return;
    const myExisting = reactions.find((r) => r.username === currentUsername);
    const removingSame = myExisting && myExisting.emoji === emoji;
    setReactionBusy(true);
    try {
      await encryptReaction(roomId, bersaglio, removingSame ? null : emoji);
    } catch (e) {
      console.error('Errore reazione:', e);
    } finally {
      setReactionBusy(false);
    }
  };
  const pressTimerRef = useRef(null);
  const handlePressStart = () => {
    if (!isSelf || isFailed || selectionMode || !isRealMessageId(msg?.id)) return;
    pressTimerRef.current = setTimeout(() => {
      if (typeof onLongPressStart === 'function') onLongPressStart();
    }, 500);
  };
  const handlePressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };
  const handleContextMenu = (e) => {
    if (!isSelf || isFailed || selectionMode || !isRealMessageId(msg?.id)) return;
    e.preventDefault();
    if (typeof onLongPressStart === 'function') onLongPressStart();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: EASE }}
      className={`flex w-full ${isSelf ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`group max-w-[88%] px-3.5 py-2.5 md:max-w-[68%] transition-all duration-200 relative overflow-hidden ${
          isFailed
            ? `rounded-3xl border ${T.dangerSoftBorder} ${T.dangerSoftBg} ${T.text}`
            : isSelf
              ? `rounded-t-3xl rounded-bl-3xl rounded-br-lg bg-[linear-gradient(160deg,#5AA3F0_0%,#3878D4_100%)] text-white shadow-[0_8px_20px_-6px_rgba(56,120,212,0.45)] hover:shadow-[0_14px_30px_-8px_rgba(56,120,212,0.55)] hover:-translate-y-0.5 before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-[linear-gradient(180deg,rgba(255,255,255,0.25)_0%,rgba(255,255,255,0)_100%)] before:pointer-events-none`
              : `rounded-t-3xl rounded-br-3xl rounded-bl-lg border ${T.borderSoft} bg-white ${T.text} shadow-[0_4px_16px_-4px_rgba(28,37,48,0.12)] hover:shadow-[0_10px_26px_-6px_rgba(28,37,48,0.18)] hover:-translate-y-0.5 before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-[linear-gradient(180deg,rgba(255,255,255,0.7)_0%,rgba(255,255,255,0)_100%)] before:pointer-events-none`
        } ${selectionMode && isSelf ? (selected ? 'ring-2 ring-red-400 cursor-pointer' : 'ring-1 ring-white/20 cursor-pointer') : ''}`}
        onClick={selectionMode && isSelf ? onToggleSelect : undefined}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        onContextMenu={handleContextMenu}
      >
                {!isSelf && !isDirect && (
          <p className={`mb-1 text-[11px] font-medium ${T.accentText}`}>
            {msg?.sender || msg?.sender_username || t('dashboard.chat_bubble.default_sender')}
          </p>
        )}
        {msg?.replyTo && (
          <div className={`mb-1 border-l-2 pl-2 ${
            isSelf ? 'border-[#0B0C11]/40' : T.accentSoftBorder
          }`}>
            <p className={`truncate text-[10px] font-semibold leading-tight ${isSelf ? 'text-[#0B0C11]/70' : T.accentText}`}>
              {msg.replyTo.sender}
            </p>
            <p className={`truncate text-[11px] leading-tight ${isSelf ? 'text-[#0B0C11]/55' : T.textFaint}`}>
              {msg.replyTo.text}
            </p>
          </div>
        )}
        {msg?.undecryptable ? (
          <p className={`flex items-center gap-1.5 break-words text-[15px] italic leading-7 ${isSelf ? 'text-[#0B0C11]/70' : T.textFaint}`}>
            🔒 {t('dashboard.chat_bubble.undecryptable')}
          </p>
        ) : (
          <>
            {!isSelf && isDirect && (
              <p className="mb-0.5 text-xs font-semibold text-[#0F766E]">
                {msg?.sender || msg?.sender_username || t('dashboard.chat_bubble.default_sender')}
              </p>
            )}
            <p className={`break-words [overflow-wrap:anywhere] text-[15px] leading-[1.85] tracking-[-0.15px] ${isSelf ? 'font-medium' : 'font-normal'}`}>
              {msg?.text || msg?.body || t('dashboard.chat_bubble.unreadable')}
            </p>
          </>
        )}
        <div className="mt-0.5 flex justify-end">
          {isFailed ? (
            <p className={`text-[11px] font-medium ${isSelf ? T.danger : T.danger}`}>
              ⚠ {t('dashboard.chat_bubble.not_sent')}{msg?.failReason === 'muted' ? ` · ${t('dashboard.chat_bubble.muted_suffix')}` : ''}
              {/* [palacan-metadati-3.4d-ter] nuovo tentativo di un messaggio in coda di uscita */}
              {msg?.failReason === 'offline' && (
                <button
                  type="button"
                  aria-label={t('dashboard.chat_bubble.retry', { defaultValue: 'Retry' })}
                  title={t('dashboard.chat_bubble.retry', { defaultValue: 'Retry' })}
                  className="ml-2 font-semibold"
                  onClick={() => window.dispatchEvent(new CustomEvent('palacan:riprova-messaggio', { detail: { id: msg?.id } }))}
                >
                  ↻
                </button>
              )}
            </p>
          ) : (
            <p className={`text-[11px] ${isSelf ? 'text-[#0B0C11]/60' : T.textFaint}`}>
              {formatTime(msg)}
            </p>
          )}
        </div>

        {localReactions.length > 0 && (
          <div className={`mt-1 flex flex-wrap items-center gap-1 ${isSelf ? 'justify-end' : 'justify-start'}`}>
            {localReactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => toggleLocalReaction(r.emoji)}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors duration-150 ${
                  r.reactedByMe ? 'border-[#14B8A6]' : T.borderSoft
                } ${T.surface}`}
                style={r.reactedByMe ? { background: 'rgba(20,184,166,0.12)' } : undefined}
              >
                <span>{r.emoji}</span>
                <span className={T.textFaint}>{r.count}</span>
              </button>
            ))}
          </div>
        )}
        {!isFailed && !selectionMode && (typeof onReply === 'function' || (isSelf && isRealMessageId(msg?.id) && typeof onDelete === 'function')) && (
          <div className={`mt-0.5 flex items-center gap-2 ${isSelf ? 'justify-end' : 'justify-start'}`}>
            {typeof onReply === 'function' && (
              <button
                type="button"
                onClick={onReply}
                className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${T.text} opacity-60 transition-all duration-150 hover:opacity-100 hover:bg-black/10 hover:scale-105 active:scale-95`}
                aria-label={t('dashboard.chat_bubble.reply_aria')}
              >
                <Reply size={11} />
                {t('dashboard.chat_bubble.reply_button')}
              </button>
            )}
            {isSelf && isRealMessageId(msg?.id) && typeof onDelete === 'function' && (
              confirmingDelete ? (
                <div ref={confirmDeleteRef} className="flex items-center gap-1.5 rounded-lg bg-black/20 px-1.5 py-0.5">
                  {typeof onHideForMe === 'function' && (
                    <button
                      type="button"
                      onClick={() => { setConfirmingDelete(false); onHideForMe(); }}
                      className={`rounded px-1.5 py-0.5 text-[10px] ${T.text} opacity-80 hover:bg-white/10`}
                    >
                      {t('dashboard.chat_bubble.delete_for_me')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setConfirmingDelete(false); onDelete(); }}
                    className="rounded-full px-2 py-1 text-[10px] font-medium text-red-400 transition-all duration-150 hover:bg-white/10 hover:scale-105 active:scale-95"
                  >
                    {t('dashboard.chat_bubble.delete_for_all')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${T.text} opacity-70 hover:bg-white/10`}
                  >
                    {t('dashboard.chat_bubble.cancel')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] ${T.text} opacity-60 transition-opacity duration-150 hover:opacity-100`}
                  aria-label={t('dashboard.chat_bubble.delete_aria')}
                >
                  <Trash2 size={11} />
                  {t('dashboard.chat_bubble.delete_button')}
                </button>
              )
            )}
            <div className="relative" ref={reactionPickerRef}>
              <button
                type="button"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setReactionPickerPos({ top: rect.top, left: isSelf ? rect.right : rect.left });
                  setShowReactionPicker((v) => !v);
                }}
                className={`flex h-5 w-5 items-center justify-center rounded-full border ${T.borderSoft} ${T.surface} opacity-60 transition-opacity duration-150 hover:opacity-100`}
                aria-label="Reagisci"
              >
                <Smile size={11} className={T.textFaint} />
              </button>
              {showReactionPicker && reactionPickerPos && createPortal(
                <div
                  ref={reactionPopupRef}
                  style={{
                    position: 'fixed',
                    top: reactionPickerPos.top,
                    left: reactionPickerPos.left,
                    transform: isSelf ? 'translate(-100%, calc(-100% - 8px))' : 'translate(0, calc(-100% - 8px))',
                  }}
                  className={
                    showFullReactionPicker
                      ? 'z-[200]'
                      : `z-[200] flex gap-1 rounded-full border ${T.border} bg-white p-1.5 shadow-[0_8px_24px_-4px_rgba(23,23,43,0.25)]`
                  }
                >
                  {showFullReactionPicker ? (
                    <EmojiPicker emojiStyle="native"
                      onEmojiClick={(emojiData) => { toggleLocalReaction(emojiData.emoji); setShowReactionPicker(false); }}
                      width={270}
                      height={330}
                      previewConfig={{ showPreview: false }}
                      searchPlaceholder="Cerca emoji..."
                      skinTonesDisabled
                    />
                  ) : (
                    <>
                      {['👍', '❤️', '😂', '😮', '😢'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => { toggleLocalReaction(emoji); setShowReactionPicker(false); }}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-base transition-transform duration-150 hover:scale-125"
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowFullReactionPicker(true)}
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${T.textFaint} transition-transform duration-150 hover:scale-110`}
                        aria-label="Altre emoji"
                      >
                        +
                      </button>
                    </>
                  )}
                </div>,
                document.body
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export const getDirectRoomOthers = (room) =>
  (Array.isArray(room?.participant_usernames) && room.participant_usernames) ||
  (Array.isArray(room?.participantUsernames) && room.participantUsernames) ||
  [];

const ConversationListItem = ({ room, currentRoom, onClick, draftText, isMuted, isFavorite }) => {
  const { t } = useTranslation();
  const active = isCurrentRoom(currentRoom, room);
  const roomId = normalizeRoomId(room?.id);
  const hasPassword = getRoomPasswordFlag(room);
  const preview = getMessagePreview(room);
  const relativeTime = formatRelativeRoomTime(room);
  const unread = Number(room?.unread_count ?? room?.unreadCount ?? 0);

  const isDirect = room?.room_kind === 'direct';
  const isDepartment = room?.room_kind === 'department' || (room?.is_corporate && !room?.room_kind);
  const others = isDirect ? getDirectRoomOthers(room) : [];
  const directDisplayName = isDirect && others.length > 0 ? others.join(', ') : null;
  const avatarSeed = isDirect ? (others[0] || room?.name || roomId) : (room?.name || roomId);
  const displayName = directDisplayName || room?.name || t('dashboard.list_item.default_room_name');

  return (
    <button
      type="button" onClick={() => onClick(room)}
      className={`w-full rounded-2xl border p-3 text-left transition-colors duration-150 ${
        active
          ? `${T.accentSoftBorder} ${T.accentSoftBg}`
          : `${T.borderSoft} ${T.surfaceHover}`
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <UserAvatar username={avatarSeed} size={44} />
          {isDepartment && (
            <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-lg bg-[#4FC3F7] ring-2 ring-[#0B0C11]">
              <Building2 size={9} className="text-[#0B0C11]" />
            </div>
          )}
          {room?.is_corporate && !isDepartment && (
            <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-lg bg-white/20 ring-2 ring-[#0B0C11]">
              <MessageSquare size={9} className="text-white" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className={`truncate text-base font-semibold ${active ? T.accentText : T.text}`}>
                  {displayName}
                </p>
                {hasPassword && <Lock size={10} className={`shrink-0 ${T.textFaint}`} />}
                {isMuted && <BellOff size={10} className={`shrink-0 ${T.textFaint}`} />}
                {isFavorite && <Star size={10} className={`shrink-0 fill-current ${T.accentText}`} />}
              </div>
              {draftText ? (
                <p className={`mt-1 line-clamp-1 text-sm ${T.textFaint}`}>
                  <span className="font-medium text-[#14B8A6]">{t('dashboard.list_item.draft_label')}</span> {draftText}
                </p>
              ) : (
                <p className={`mt-1 line-clamp-1 text-sm ${T.textFaint}`}>
                  {preview || t('dashboard.list_item.no_message')}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              {relativeTime && (
                <span className={`text-[11px] ${T.textFaint}`}>{relativeTime}</span>
              )}
              {unread > 0 && (
                <span className={`inline-flex min-w-[1.3rem] items-center justify-center rounded-full ${T.accentBg} px-1.5 py-0.5 text-[10px] font-semibold text-[#0B0C11]`}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
};

export const splitRoomsByKind = (rooms) => {
  const departments = [];
  const directs = [];
  rooms.forEach((r) => {
    if (r?.room_kind === 'direct') directs.push(r);
    else departments.push(r);
  });
  return { departments, directs };
};

const ConversationTimeline = ({ rooms, currentRoom, onRoomClick, drafts, mutedOverrides, favoriteOverrides }) => {
  const { t } = useTranslation();
  if (!rooms.length) {
    return (
      <div className={`rounded-2xl border border-dashed ${T.borderSoft} p-4 text-sm ${T.textFaint}`}>
        {t('dashboard.timeline.empty')}
      </div>
    );
  }

  const favoriteRooms = rooms.filter((r) => resolveRoomFavorite(r, favoriteOverrides));
  const restRooms = rooms.filter((r) => !resolveRoomFavorite(r, favoriteOverrides));
  const groups = groupRoomsByTime(restRooms);

  return (
    <div className="space-y-4">
      {favoriteRooms.length > 0 && (
        <div>
          <p className={`mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider ${T.textFaint}`}>
            {t('dashboard.timeline.favorites_label')}
          </p>
          <div className="space-y-1">
            {favoriteRooms.map((room) => (
              <ConversationListItem
                key={normalizeRoomId(room?.id) || room?.name}
                room={room}
                currentRoom={currentRoom}
                onClick={onRoomClick}
                draftText={drafts?.[normalizeRoomId(room?.id)]}
                isMuted={resolveRoomMuted(room, mutedOverrides)}
                isFavorite={true}
              />
            ))}
          </div>
        </div>
      )}
      {groups.map((group) => (
        <div key={group.label}>
          <p className={`mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider ${T.textFaint}`}>
            {group.label}
          </p>
          <div className="space-y-1">
            {group.rooms.map((room) => (
              <ConversationListItem
                key={normalizeRoomId(room?.id) || room?.name}
                room={room}
                currentRoom={currentRoom}
                onClick={onRoomClick}
                draftText={drafts?.[normalizeRoomId(room?.id)]}
                isMuted={resolveRoomMuted(room, mutedOverrides)}
                isFavorite={false}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const WorkspaceAdminPanel = ({
  adminTab, setAdminTab, corporateRooms, employees, handleRoomClick,
  handleCreateCorporateRoom, handleCreateEmployee,
  roomNameInput, setRoomNameInput, roomPwdInput, setRoomPwdInput,
  newEmpUser, setNewEmpUser, newEmpPass, setNewEmpPass, loadingAdmin,
  selectedRoomIds, onToggleRoomSelection,
}) => {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  if (collapsed) {
    return (
      <section className="relative m-3 flex w-[28px] shrink-0 items-center justify-center xl:flex">
        <button
          type="button" onClick={() => setCollapsed(false)}
          className={`group flex h-32 w-7 items-center justify-center rounded-full border border-[#14B8A6]/25 ${T.bg} shadow-[0_0_20px_-8px_rgba(20,184,166,0.4)] transition-all duration-200 hover:w-8`}
          aria-label={t('dashboard.admin_panel.open_aria')}
        >
          <ChevronLeft size={14} className={`${T.textFaint} transition-transform duration-200 group-hover:-translate-x-0.5`} />
        </button>
      </section>
    );
  }
  return (
  <section className={`relative m-3 flex h-[calc(100%-1.5rem)] w-[300px] shrink-0 flex-col rounded-3xl border border-[#14B8A6]/25 shadow-[0_0_40px_-12px_rgba(20,184,166,0.35)] ${T.bg} xl:flex`}>
    <div className={`border-b ${T.borderSoft} px-4 py-4`}>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-2">
          <button
            type="button" onClick={() => setAdminTab('rooms')}
            className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors duration-150 ${
              adminTab === 'rooms' ? `bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)] text-[#0B0C11]` : `${T.surface} ${T.textMuted} hover:bg-white/5`
            }`}
          >
            {t('dashboard.admin_panel.tab_rooms')}
          </button>
          <button
            type="button" onClick={() => setAdminTab('users')}
            className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors duration-150 ${
              adminTab === 'users' ? `bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)] text-[#0B0C11]` : `${T.surface} ${T.textMuted} hover:bg-white/5`
            }`}
          >
            {t('dashboard.admin_panel.tab_users')}
          </button>
        </div>
        <button
          type="button" onClick={() => setCollapsed(true)}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${T.surface} ${T.textFaint} transition-colors duration-150 hover:bg-white/5`}
          aria-label={t('dashboard.admin_panel.close_aria')}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>

    <div className="flex-1 overflow-y-auto p-4">
      {adminTab === 'rooms' && (
        <div className="space-y-5">
          <div className={`rounded-3xl border ${T.border} ${T.surface} p-4`}>
            <h3 className={`mb-3 text-sm font-medium ${T.text}`}>{t('dashboard.admin_panel.new_room_title')}</h3>
            <form onSubmit={handleCreateCorporateRoom} className="space-y-2.5">
              <input
                type="text"
                value={roomNameInput}
                onChange={(e) => setRoomNameInput(e.target.value)}
                placeholder={t('dashboard.admin_panel.room_name_placeholder')}
                required
                className={`w-full rounded-2xl border ${T.border} ${T.elevated} px-4 py-2.5 text-sm ${T.text} outline-none transition-colors duration-150 focus:border-[#14B8A6]/40`}
              />
              <input
                type="password"
                value={roomPwdInput}
                onChange={(e) => setRoomPwdInput(e.target.value)}
                placeholder={t('dashboard.admin_panel.room_password_placeholder')}
                className={`w-full rounded-2xl border ${T.border} ${T.elevated} px-4 py-2.5 text-sm ${T.text} outline-none transition-colors duration-150 focus:border-[#14B8A6]/40`}
              />
              <button
                type="submit"
                disabled={loadingAdmin}
                className={`w-full rounded-2xl bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)] px-4 py-2.5 text-sm font-medium text-[#0B0C11] transition-opacity duration-150 hover:opacity-90 disabled:opacity-50`}
              >
                {t('dashboard.admin_panel.create_room_button')}
              </button>
            </form>
          </div>

          <div className="space-y-1.5">
            {corporateRooms.length > 0 ? (
              corporateRooms.map((room) => (
                <button
                  key={normalizeRoomId(room?.id) || room?.name}
                  type="button" onClick={() => handleRoomClick(room)}
                  className={`w-full rounded-2xl border ${T.borderSoft} ${T.surface} p-3.5 text-left transition-colors duration-150 hover:bg-white/[0.03]`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${T.elevated} ${T.textMuted}`}>
                      <Building2 size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-medium ${T.text}`}>{nomeVisibileStanza(room, null) || t('dashboard.admin_panel.default_room_name')}</p>
                      <p className={`text-xs ${T.textFaint}`}>{normalizeRoomId(room?.id).slice(0, 8)}…</p>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className={`rounded-2xl border border-dashed ${T.borderSoft} p-5 text-sm ${T.textFaint}`}>
                {t('dashboard.admin_panel.no_rooms_in_workspace')}
              </div>
            )}
          </div>
        </div>
      )}

      {adminTab === 'users' && (
        <div className="space-y-5">
          <div className={`rounded-3xl border ${T.border} ${T.surface} p-4`}>
            <h3 className={`mb-3 text-sm font-medium ${T.text}`}>{t('dashboard.admin_panel.new_person_title')}</h3>
            <form onSubmit={handleCreateEmployee} className="space-y-2.5">
              <input
                autoComplete="username" required value={newEmpUser}
                onChange={(e) => setNewEmpUser(e.target.value)}
                placeholder={t('dashboard.admin_panel.username_placeholder')}
                className={`w-full rounded-2xl border ${T.border} ${T.elevated} px-4 py-2.5 text-sm ${T.text} outline-none transition-colors duration-150 focus:border-[#14B8A6]/40`}
              />
              <input
                autoComplete="new-password" required type="password" value={newEmpPass}
                onChange={(e) => setNewEmpPass(e.target.value)}
                placeholder={t('dashboard.admin_panel.temp_password_placeholder')}
                className={`w-full rounded-2xl border ${T.border} ${T.elevated} px-4 py-2.5 text-sm ${T.text} outline-none transition-colors duration-150 focus:border-[#14B8A6]/40`}
              />
              <p className={`text-[11px] leading-relaxed ${T.textFaint}`}>
                {t('dashboard.admin_panel.password_requirements')}
              </p>

              <div className={`rounded-2xl border ${T.border} ${T.elevated} p-3`}>
                <p className={`mb-2 text-[11px] font-medium uppercase tracking-wider ${T.textFaint}`}>
                  {t('dashboard.admin_panel.rooms_to_associate_label')}
                </p>
                {corporateRooms.length > 0 ? (
                  <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                    {corporateRooms.map((room) => {
                      const roomId = normalizeRoomId(room?.id);
                      const checked = Array.isArray(selectedRoomIds) && selectedRoomIds.includes(roomId);
                      return (
                        <label
                          key={roomId || room?.name}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors duration-150 hover:bg-white/5`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleRoomSelection?.(roomId)}
                            className={`h-4 w-4 shrink-0 rounded border-[#1E2029] accent-[#14B8A6]`}
                          />
                          <span className={`truncate text-sm ${T.text}`}>{nomeVisibileStanza(room, null) || t('dashboard.admin_panel.default_room_name')}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className={`text-xs ${T.textFaint}`}>
                    {t('dashboard.admin_panel.no_workspace_rooms')}
                  </p>
                )}
              </div>

              <button
                disabled={loadingAdmin} type="submit"
                className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)] py-2.5 text-sm font-semibold text-[#0B0C11] disabled:opacity-50 transition-opacity duration-150 hover:opacity-90`}
              >
                {loadingAdmin ? <RefreshCw className="animate-spin" size={16} /> : t('dashboard.admin_panel.add_person_button')}
              </button>
            </form>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              placeholder={t('dashboard.admin_panel.search_user_placeholder')}
              className={`w-full rounded-2xl border ${T.border} ${T.elevated} px-4 py-2.5 text-sm ${T.text} outline-none transition-colors duration-150 focus:border-[#14B8A6]/40`}
            />
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
              {employees.filter((emp) => (emp?.username || '').toLowerCase().includes(userSearchQuery.toLowerCase())).length > 0 ? (
                employees
                  .filter((emp) => (emp?.username || '').toLowerCase().includes(userSearchQuery.toLowerCase()))
                  .map((emp) => (
                    <div key={emp?.id || emp?.username} className={`flex items-center gap-3 rounded-2xl border ${T.borderSoft} ${T.surface} p-3`}>
                      <UserAvatar username={emp?.username} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${T.text}`}>{emp?.username || t('dashboard.admin_panel.default_username')}</p>
                        <p className={`text-[11px] tracking-wide ${T.textFaint}`}>
                          {(() => {
                            const r = emp?.role || 'employee';
                            return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
                          })()}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${
                        emp?.is_active
                          ? `${T.accentSoftBorder} ${T.accentSoftBg} ${T.accentText} border`
                          : `${T.borderSoft} ${T.elevated} ${T.textFaint} border`
                      }`}>
                        {emp?.is_active ? t('dashboard.admin_panel.status_active') : t('dashboard.admin_panel.status_inactive')}
                      </span>
                    </div>
                  ))
              ) : (
                <div className={`rounded-2xl border border-dashed ${T.borderSoft} p-5 text-sm ${T.textFaint}`}>
                  {t('dashboard.admin_panel.no_people')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  </section>
  );
};

const InvitePanel = ({
  onClose, creatingInvite, generatedInviteLink, inviteLinkCreateError, onCopy,
}) => {
  const { t } = useTranslation();
  const linkUrl = (generatedInviteLink?.invite_path || generatedInviteLink?.invitePath)
    ? `${window.location.origin}${generatedInviteLink.invite_path || generatedInviteLink.invitePath}`
    : (generatedInviteLink?.url || '');

  return (
    <SlideOver
      title={t('dashboard.invite_panel.title')}
      subtitle={t('dashboard.invite_panel.subtitle')}
      onClose={onClose}
    >
      {creatingInvite ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 size={20} className={`${T.textFaint} animate-spin`} />
          <p className={`text-sm ${T.textFaint}`}>{t('dashboard.invite_panel.generating')}</p>
        </div>
      ) : inviteLinkCreateError ? (
        <div className={`rounded-2xl border ${T.dangerSoftBorder} ${T.dangerSoftBg} p-4 text-sm ${T.danger}`}>
          {inviteLinkCreateError}
        </div>
      ) : linkUrl ? (
        <div className="space-y-4">
          <div className={`rounded-2xl border ${T.border} ${T.elevated} px-4 py-3`}>
            <p className={`text-[11px] font-medium uppercase tracking-wider ${T.textFaint} mb-1.5`}>
              {t('dashboard.invite_panel.link_label')}
            </p>
            <p className={`break-all text-sm font-mono ${T.accentText}`}>{linkUrl}</p>
          </div>

          <button
            type="button" onClick={onCopy}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl ${T.accentBg} ${T.accentBgHover} py-2.5 text-sm font-semibold text-[#0B0C11] transition-colors duration-150`}
          >
            <Copy size={15} />
            {t('dashboard.invite_panel.copy_button')}
          </button>

          <p className={`text-center text-xs ${T.textFaint}`}>
            {t('dashboard.invite_panel.disclaimer')}
          </p>
        </div>
      ) : (
        <p className={`text-sm ${T.textFaint}`}>{t('dashboard.invite_panel.no_link')}</p>
      )}
    </SlideOver>
  );
};

const AddFriendPanel = ({ roomId, roomName, onClose, onSearch, onInvite, showToast }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [invitedUsernames, setInvitedUsernames] = useState(() => new Set());
  const [invitingUsername, setInvitingUsername] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }

    setSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = typeof onSearch === 'function' ? await onSearch(trimmed) : [];
        setResults(Array.isArray(res) ? res : []);
      } catch (_) {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [query, onSearch]);

  const handleInviteClick = async (user) => {
    if (!user?.username || invitedUsernames.has(user.username)) return;
    if (typeof onInvite !== 'function' || !roomId) return;

    setInvitingUsername(user.username);
    try {
      await onInvite(roomId, user.username);
      setInvitedUsernames((prev) => new Set(prev).add(user.username));
      showToast(`${t('dashboard.add_friend_panel.invite_sent_prefix')} ${user.username}`);
      if (typeof onClose === 'function') onClose();  // [palacan-pannelli-chiusura] invito fatto: il pannello si chiude
    } catch (err) {
      showToast(err?.message || t('dashboard.add_friend_panel.error_invite'), 'error');
    } finally {
      setInvitingUsername(null);
    }
  };

  return (
    <SlideOver
      title={t('dashboard.add_friend_panel.title')}
      subtitle={roomName ? `${t('dashboard.add_friend_panel.subtitle_with_room')} "${roomName}"` : t('dashboard.add_friend_panel.subtitle_generic')}
      onClose={onClose}
    >
      <div className={`mb-4 flex items-center gap-2 rounded-2xl border ${T.borderSoft} ${T.elevated} px-3 py-2.5 transition-colors duration-150 focus-within:border-[#14B8A6] focus-within:ring-2 focus-within:ring-[#14B8A6]/20`}>
        <Search size={15} className={`${T.textFaint} shrink-0`} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('dashboard.add_friend_panel.search_placeholder')}
          className={`w-full bg-transparent text-sm ${T.text} outline-none placeholder:${T.textFaint}`}
        />
        {searching && <Loader2 size={14} className={`${T.textFaint} animate-spin shrink-0`} />}
      </div>

      {query.trim().length < 2 ? (
        <p className={`py-6 text-center text-sm ${T.textFaint}`}>
          {t('dashboard.add_friend_panel.min_chars_hint')}
        </p>
      ) : searching ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 size={18} className={`${T.textFaint} animate-spin`} />
          <p className={`text-sm ${T.textFaint}`}>{t('dashboard.add_friend_panel.searching')}</p>
        </div>
      ) : results.length === 0 ? (
        <p className={`py-6 text-center text-sm ${T.textFaint}`}>{t('dashboard.add_friend_panel.no_users_found')}</p>
      ) : (
        <div className="space-y-2">
          {results.map((user) => {
            const already = invitedUsernames.has(user.username);
            const inviting = invitingUsername === user.username;
            return (
              <div
                key={user.id || user.username}
                className={`flex items-center gap-3 rounded-2xl border ${T.borderSoft} ${T.elevated} p-3`}
              >
                <UserAvatar username={user.username} size={34} />
                <span className={`flex-1 truncate text-sm font-medium ${T.text}`}>{user.username}</span>
                <button
                  type="button"
                  disabled={already || inviting}
                  onClick={() => handleInviteClick(user)}
                  className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                    already
                      ? `${T.accentSoftBorder} ${T.accentSoftBg} ${T.accentText} border cursor-default`
                      : `${T.accentBg} ${T.accentBgHover} text-[#0B0C11] disabled:opacity-50`
                  }`}
                >
                  {already ? t('dashboard.add_friend_panel.already_invited') : inviting ? '…' : t('dashboard.add_friend_panel.invite_button')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </SlideOver>
  );
};

const RosterPanel = ({ room, authToken, currentUsername, onClose, onStartDirectChat, showToast }) => {
  const { t } = useTranslation();
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startingUsername, setStartingUsername] = useState(null);

  useEffect(() => {
    if (!room?.id || !authToken) return;
    setLoading(true);
    apiService.getRoomUsers(room.id, authToken)
      .then((data) => setParticipants(Array.isArray(data) ? data : []))
      .catch(() => setParticipants([]))
      .finally(() => setLoading(false));
  }, [room?.id, authToken]);

  const handleStartChat = async (username) => {
    if (!username || username === currentUsername) return;
    if (typeof onStartDirectChat !== 'function') return;
    setStartingUsername(username);
    try {
      await onStartDirectChat(username);
      onClose();
    } catch (err) {
      showToast(err?.message || t('dashboard.roster_panel.error_open_chat'), 'error');
    } finally {
      setStartingUsername(null);
    }
  };

  return (
    <SlideOver
      title={t('dashboard.roster_panel.title')}
      subtitle={nomeVisibileStanza(room, currentUsername) ? `${t('dashboard.roster_panel.subtitle_with_room')} "${nomeVisibileStanza(room, currentUsername)}"` : t('dashboard.roster_panel.subtitle_generic')}
      onClose={onClose}
    >
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 size={20} className={`${T.textFaint} animate-spin`} />
          <p className={`text-sm ${T.textFaint}`}>{t('dashboard.roster_panel.loading')}</p>
        </div>
      ) : participants.length === 0 ? (
        <p className={`py-8 text-center text-sm ${T.textFaint}`}>{t('dashboard.roster_panel.no_colleagues')}</p>
      ) : (
        <div className="space-y-2">
          {participants.map((p) => {
            const isSelf = p?.username === currentUsername;
            const starting = startingUsername === p?.username;
            return (
              <div
                key={p?.id || p?.username}
                className={`flex items-center gap-3 rounded-2xl border ${T.borderSoft} ${T.elevated} p-3`}
              >
                <UserAvatar username={p?.username} size={34} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${T.text}`}>{p?.username}</p>
                  {isSelf && <p className={`text-[11px] ${T.accentText}`}>{t('dashboard.roster_panel.you_badge')}</p>}
                </div>
                {!isSelf && (
                  <button
                    type="button"
                    disabled={starting}
                    onClick={() => handleStartChat(p?.username)}
                    className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${T.accentBg} ${T.accentBgHover} text-[#0B0C11] disabled:opacity-50`}
                  >
                    {starting ? '…' : t('dashboard.roster_panel.write_button')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SlideOver>
  );
};

const IncomingInvitesPanel = ({ invites, onClose, onAccept, onReject, showToast }) => {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState(null);

  const handleAccept = async (invite) => {
    setBusyId(invite.id);
    try {
      await onAccept(invite);
      if (typeof onClose === 'function') onClose();  // [palacan-pannelli-chiusura] accettato: il pannello si chiude
      showToast(`${t('dashboard.incoming_invites.joined_prefix')} "${invite.room_name || invite.roomName || t('dashboard.incoming_invites.default_room_name_lower')}"`);
    } catch (err) {
      showToast(err?.message || t('dashboard.incoming_invites.error_accept'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (invite) => {
    setBusyId(invite.id);
    try {
      await onReject(invite);
      if ((invites || []).filter((x) => x.id !== invite.id).length === 0 && typeof onClose === 'function') onClose();  // [palacan-pannelli-chiusura] era l'ultimo
    } catch (err) {
      showToast(err?.message || t('dashboard.incoming_invites.error_reject'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SlideOver title={t('dashboard.incoming_invites.title')} subtitle={t('dashboard.incoming_invites.subtitle')} onClose={onClose}>
      {!invites || invites.length === 0 ? (
        <p className={`py-8 text-center text-sm ${T.textFaint}`}>{t('dashboard.incoming_invites.empty')}</p>
      ) : (
        <div className="space-y-2.5">
          {invites.map((invite) => {
            const busy = busyId === invite.id;
            const roomName = invite.room_name || invite.roomName || t('dashboard.incoming_invites.default_room_name');
            const senderUsername = invite.sender_username || invite.senderUsername || t('dashboard.incoming_invites.default_username');
            return (
              <div key={invite.id} className={`rounded-2xl border ${T.borderSoft} ${T.elevated} p-3.5`}>
                <div className="mb-3 flex items-center gap-3">
                  <UserAvatar username={senderUsername} size={32} />
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${T.text}`}>{roomName}</p>
                    <p className={`text-xs ${T.textFaint}`}>{t('dashboard.incoming_invites.invited_by_prefix')} {senderUsername}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button" disabled={busy} onClick={() => handleAccept(invite)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl ${T.accentBg} ${T.accentBgHover} py-2 text-xs font-semibold text-[#0B0C11] disabled:opacity-50 transition-colors duration-150`}
                  >
                    <Check size={13} /> {t('dashboard.incoming_invites.accept_button')}
                  </button>
                  <button
                    type="button" disabled={busy} onClick={() => handleReject(invite)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border ${T.borderSoft} ${T.surface} py-2 text-xs font-medium ${T.textMuted} disabled:opacity-50 transition-colors duration-150 hover:bg-white/5`}
                  >
                    <X size={13} /> {t('dashboard.incoming_invites.reject_button')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SlideOver>
  );
};

const IncomingContactRequestsPanel = ({ requests, onClose, onAccept, onReject, onSearch, onSendRequest, showToast }) => {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sentUsernames, setSentUsernames] = useState(() => new Set());
  const [sendingUsername, setSendingUsername] = useState(null);
  const searchDebounceRef = useRef(null);

  useEffect(() => {
    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    searchDebounceRef.current = window.setTimeout(async () => {
      try {
        const res = typeof onSearch === 'function' ? await onSearch(trimmed) : [];
        setResults(Array.isArray(res) ? res : []);
      } catch (_) {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current); };
  }, [query, onSearch]);

  const handleSendClick = async (user) => {
    if (!user?.username || sentUsernames.has(user.username)) return;
    if (typeof onSendRequest !== 'function') return;
    setSendingUsername(user.username);
    try {
      await onSendRequest(user.username);
      setSentUsernames((prev) => new Set(prev).add(user.username));
      showToast(`${t('dashboard.contact_requests.request_sent_prefix')} ${user.username}`);
      if (typeof onClose === 'function') onClose();  // [palacan-pannelli-chiusura] richiesta inviata: il pannello si chiude
    } catch (err) {
      showToast(err?.message || t('dashboard.contact_requests.error_send'), 'error');
    } finally {
      setSendingUsername(null);
    }
  };
  const handleAccept = async (request) => {
    setBusyId(request.id);
    try {
      await onAccept(request);
      showToast(`${request.sender_username || t('dashboard.contact_requests.default_username')} ${t('dashboard.contact_requests.now_in_contacts_suffix')}`);
      if (typeof onClose === 'function') onClose();  // [palacan-pannelli-chiusura] accettato: il pannello si chiude (si apre la chat)
    } catch (err) {
      showToast(err?.message || t('dashboard.contact_requests.error_accept'), 'error');
    } finally {
      setBusyId(null);
    }
  };
  const handleReject = async (request) => {
    setBusyId(request.id);
    try {
      await onReject(request);
      if ((requests || []).filter((r) => r.id !== request.id).length === 0 && typeof onClose === 'function') onClose();  // [palacan-pannelli-chiusura] era l'ultima
    } catch (err) {
      showToast(err?.message || t('dashboard.contact_requests.error_reject'), 'error');
    } finally {
      setBusyId(null);
    }
  };
  return (
    <SlideOver title={t('dashboard.contact_requests.title')} subtitle={t('dashboard.contact_requests.subtitle')} onClose={onClose}>
      <p className={`mb-2 text-[11px] font-medium uppercase tracking-wider ${T.textFaint}`}>
        {t('dashboard.contact_requests.pending_label')}
      </p>
      {!requests || requests.length === 0 ? (
        <p className={`py-6 text-center text-sm ${T.textFaint}`}>{t('dashboard.contact_requests.no_pending')}</p>
      ) : (
        <div className="mb-2 space-y-2.5">
          {requests.map((request) => {
            const busy = busyId === request.id;
            const senderUsername = request.sender_username || t('dashboard.contact_requests.default_username');
            return (
              <div key={request.id} className={`rounded-2xl border ${T.borderSoft} ${T.elevated} p-3.5`}>
                <div className="mb-3 flex items-center gap-3">
                  <UserAvatar username={senderUsername} size={32} />
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${T.text}`}>{senderUsername}</p>
                    <p className={`text-xs ${T.textFaint}`}>{t('dashboard.contact_requests.wants_to_add')}</p>
                    {/* [palacan-invito-richiesta] */}
                    {request.via_invito && <p className={`text-xs ${T.textFaint}`}>{t('dashboard.contact_requests.via_invite')}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button" disabled={busy} onClick={() => handleAccept(request)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl ${T.accentBg} ${T.accentBgHover} py-2 text-xs font-semibold text-[#0B0C11] disabled:opacity-50 transition-colors duration-150`}
                  >
                    <Check size={13} /> {t('dashboard.contact_requests.accept_button')}
                  </button>
                  <button
                    type="button" disabled={busy} onClick={() => handleReject(request)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border ${T.borderSoft} ${T.surface} py-2 text-xs font-medium ${T.textMuted} disabled:opacity-50 transition-colors duration-150 hover:bg-white/5`}
                  >
                    <X size={13} /> {t('dashboard.contact_requests.reject_button')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={`my-5 border-t ${T.borderSoft}`} />

      <p className={`mb-2 text-[11px] font-medium uppercase tracking-wider ${T.textFaint}`}>
        {t('dashboard.contact_requests.find_people_label')}
      </p>
      <div className={`mb-4 flex items-center gap-2 rounded-2xl border ${T.borderSoft} ${T.elevated} px-3 py-2.5 transition-colors duration-150 focus-within:border-[#14B8A6] focus-within:ring-2 focus-within:ring-[#14B8A6]/20`}>
        <Search size={15} className={`${T.textFaint} shrink-0`} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('dashboard.contact_requests.search_placeholder')}
          className={`w-full bg-transparent text-sm ${T.text} outline-none placeholder:${T.textFaint}`}
        />
        {searching && <Loader2 size={14} className={`${T.textFaint} animate-spin shrink-0`} />}
      </div>
      {query.trim().length >= 2 && (
        <div className="space-y-2">
          {searching ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={18} className={`${T.textFaint} animate-spin`} />
            </div>
          ) : results.length === 0 ? (
            <p className={`py-4 text-center text-sm ${T.textFaint}`}>{t('dashboard.contact_requests.no_users_found')}</p>
          ) : (
            results.map((user) => {
              const sent = sentUsernames.has(user.username);
              const sending = sendingUsername === user.username;
              return (
                <div
                  key={user.id || user.username}
                  className={`flex items-center justify-between gap-3 rounded-2xl border ${T.borderSoft} ${T.elevated} p-3`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <UserAvatar username={user.username} size={30} />
                    <p className={`truncate text-sm font-medium ${T.text}`}>{user.username}</p>
                  </div>
                  <button
                    type="button"
                    disabled={sent || sending}
                    onClick={() => handleSendClick(user)}
                    className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors duration-150 disabled:opacity-60 ${
                      sent ? `${T.surface} ${T.textFaint}` : `${T.accentBg} ${T.accentBgHover} text-[#0B0C11]`
                    }`}
                  >
                    {sent ? t('dashboard.contact_requests.sent_status') : sending ? '...' : t('dashboard.contact_requests.add_button')}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </SlideOver>
  );
};
const ManageListPanel = ({ list, rooms, onRename, onDelete, onToggleRoom }) => {
  const { t } = useTranslation();
  const [nameInput, setNameInput] = useState(list?.name || '');
  if (!list) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          className={`flex-1 rounded-xl border ${T.borderSoft} ${T.surface} px-3 py-2 text-sm ${T.text} outline-none`}
        />
        <button
          type="button"
          onClick={() => onRename(nameInput)}
          className={`shrink-0 rounded-xl ${T.accentBg} px-3 py-2 text-sm font-medium text-[#0B0C11]`}
        >
          {t('dashboard.manage_list.save_button')}
        </button>
      </div>
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {rooms.map((room) => {
          const roomId = normalizeRoomId(room?.id);
          const checked = (list.room_ids || []).includes(roomId);
          return (
            <button
              key={roomId || room?.name}
              type="button"
              onClick={() => onToggleRoom(roomId)}
              className={`flex w-full items-center justify-between rounded-xl border ${T.borderSoft} ${T.surface} px-3 py-2 text-sm ${T.text}`}
            >
              <span className="truncate">{nomeVisibileStanza(room, null) || t('dashboard.manage_list.default_room_name')}</span>
              {checked && <Check size={16} className={T.accentText} />}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="w-full rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400"
      >
        {t('dashboard.manage_list.delete_button')}
      </button>
    </div>
  );
};
const ChatLayout = ({
  currentUsername, currentUserRole, currentWorkspaceId, currentUserId,
  recentRooms, currentRoom, messages, messagesLoading,
  onSelectChat, onCreateRoom, onJoinRoom, onSendMessage, onDeleteMessage, onHideMessageForMe, onLogout,
  onLeaveRoom, onBack,
  sidebarOpen, setSidebarOpen,
  adminPanel, isEnterprise, isAdmin,
  onOpenAdminApp,
  authToken,
  onCreateInviteLink, generatedInviteLink, inviteLinkCreateError, onClearGeneratedInviteLink,
  pendingInvites, onAcceptInvite, onRejectInvite, onSearchContacts, onInviteUserToRoom,
  pendingContactRequests, showContactRequestsPanel, setShowContactRequestsPanel,
  handleAcceptContactRequest, handleRejectContactRequest,
  contactLiveEvent,
  sendRejectedEvent,
  currentWorkspaceName, onStartDirectChat,
  onCreateTask, decryptTaskList,
  refreshRooms,
  encryptReaction, decryptReaction,
  reactionLiveEvent,
  wsReconnectCount,
  callManager,
  onOpenCallHistory,
  olmAccount, // [palacan-sicurezza] serve al pannello "Verifica identita'" (numero di sicurezza)
}) => {
  const [safetyNumberPanelOpen, setSafetyNumberPanelOpen] = useState(false);
  const { t } = useTranslation();
  const [msgInput, setMsgInput] = useState('');
  const [showComposerEmojiPicker, setShowComposerEmojiPicker] = useState(false);
  const composerEmojiPickerRef = useRef(null);
  const composerInputRef = useRef(null); // [palacan-messaggi]

  useEffect(() => {
    if (!showComposerEmojiPicker) return undefined;
    const handleClickOutside = (e) => {
      if (composerEmojiPickerRef.current && !composerEmojiPickerRef.current.contains(e.target)) {
        setShowComposerEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showComposerEmojiPicker]);
  /* ── nuovo (sessione corrente, Fase 1 chiamate): recupera l'ID
     dell'altro partecipante nelle chat 1:1, serve a callManager.startCall
     (che ha bisogno di un user_id, non solo dello username gia'
     disponibile su currentRoom.participant_usernames). Stesso pattern
     di TaskPanel (apiService.getRoomUsers), nessuna riga esistente
     toccata. */
  const [callTargetUser, setCallTargetUser] = useState(null);
  useEffect(() => {
    if (!currentRoom?.id || !authToken || currentRoom.room_kind !== 'direct') {
      setCallTargetUser(null);
      return undefined;
    }
    let cancelled = false;
    apiService
      .getRoomUsers(currentRoom.id, authToken)
      .then((members) => {
        if (cancelled) return;
        const list = Array.isArray(members) ? members : [];
        const other = list.find(
          (m) => (m.username || '').toLowerCase() !== (currentUsername || '').toLowerCase()
        );
        setCallTargetUser(other ? { id: other.id, username: other.username } : null);
      })
      .catch((e) => {
        console.error('Errore recupero membri stanza per chiamata:', e);
        if (!cancelled) setCallTargetUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentRoom?.id, currentRoom?.room_kind, authToken, currentUsername]);
  const [drafts, setDrafts] = useState(() => loadDraftsFromStorage(currentUsername));
  const [mutedOverrides, setMutedOverrides] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [favoriteOverrides, setFavoriteOverrides] = useState({});
  const [blockedUserIds, setBlockedUserIds] = useState(new Set());
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showBlockedUsersPanel, setShowBlockedUsersPanel] = useState(false);
  const [showContactsListPanel, setShowContactsListPanel] = useState(false);

  useEffect(() => {
    if (!authToken) return;
    apiService.getBlockedUsers(authToken)
      .then((list) => setBlockedUserIds(new Set((Array.isArray(list) ? list : []).map((u) => u.id))))
      .catch(() => {});
  }, [authToken]);

  const handleSearchOwnContacts = useCallback(async (query) => {
    if (!authToken) return [];
    try {
      const contacts = await apiService.getContacts(authToken);
      const q = query.trim().toLowerCase();
      return (Array.isArray(contacts) ? contacts : []).filter((c) =>
        (c.username || '').toLowerCase().includes(q)
      );
    } catch (e) {
      console.error('Errore ricerca contatti:', e);
      return [];
    }
  }, [authToken]);

  const handleSendContactRequest = useCallback(async (username) => {
    if (!authToken) return;
    await apiService.sendContactRequest(username, authToken);
    await refreshRooms();
  }, [authToken]);
  const [customLists, setCustomLists] = useState([]);
  const [activeListFilter, setActiveListFilter] = useState(null);

  const loadCustomLists = useCallback(async () => {
    if (!authToken) return;
    try {
      const lists = await apiService.getCustomLists(authToken);
      setCustomLists(Array.isArray(lists) ? lists : []);
    } catch (e) {
      console.error('Errore caricamento liste personalizzate:', e);
    }
  }, [authToken]);

  useEffect(() => {
    loadCustomLists();
  }, [loadCustomLists]);

  const handleCreateCustomList = useCallback(async () => {
    const name = window.prompt(t('dashboard.chat_layout.new_list_prompt'));
    if (!name || !name.trim()) return;
    try {
      const created = await apiService.createCustomList(name.trim(), authToken);
      setCustomLists((prev) => [...prev, created]);
      setActiveListFilter(created.id);
    } catch (e) {
      console.error('Errore creazione lista:', e);
    }
  }, [authToken]);

  const [managingListId, setManagingListId] = useState(null);

  const handleToggleRoomInList = useCallback(async (listId, roomId) => {
    const list = customLists.find((l) => l.id === listId);
    if (!list) return;
    const isInList = (list.room_ids || []).includes(roomId);
    try {
      if (isInList) {
        await apiService.removeRoomFromList(listId, roomId, authToken);
      } else {
        await apiService.addRoomToList(listId, roomId, authToken);
      }
      setCustomLists((prev) => prev.map((l) => (
        l.id === listId
          ? { ...l, room_ids: isInList ? l.room_ids.filter((id) => id !== roomId) : [...l.room_ids, roomId] }
          : l
      )));
    } catch (e) {
      console.error('Errore aggiornamento lista:', e);
    }
  }, [customLists, authToken]);

  const handleRenameList = useCallback(async (listId, newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    try {
      await apiService.renameCustomList(listId, trimmed, authToken);
      setCustomLists((prev) => prev.map((l) => (l.id === listId ? { ...l, name: trimmed } : l)));
      showToast(t('dashboard.chat_layout.list_renamed'));
      setManagingListId(null);
    } catch (e) {
      console.error('Errore rinomina lista:', e);
      showToast(t('dashboard.chat_layout.error_rename_list'), 'error');
    }
  }, [authToken]);

  const handleDeleteList = useCallback(async (listId) => {
    try {
      await apiService.deleteCustomList(listId, authToken);
      setCustomLists((prev) => prev.filter((l) => l.id !== listId));
      setActiveListFilter((prev) => (prev === listId ? null : prev));
      setManagingListId(null);
    } catch (e) {
      console.error('Errore eliminazione lista:', e);
    }
  }, [authToken]);

  const handleToggleMuteNotifications = useCallback(async () => {
    if (!authToken || !currentRoom?.id) return;
    const roomId = normalizeRoomId(currentRoom.id);
    const nextMuted = !resolveRoomMuted(currentRoom, mutedOverrides);
    try {
      if (nextMuted) {
        await apiService.muteRoomNotifications(roomId, authToken);
      } else {
        await apiService.unmuteRoomNotifications(roomId, authToken);
      }
      setMutedOverrides((prev) => ({ ...prev, [roomId]: nextMuted }));
    } catch (e) {
      console.error('Errore toggle mute notifiche:', e);
    }
  }, [authToken, currentRoom, mutedOverrides]);

  const [showAutoDeletePanel, setShowAutoDeletePanel] = useState(false);

  // v-next (timer di auto-cancellazione, richiesta esplicita di
  // prodotto): SOLO stanze non aziendali - la voce di menu stessa non
  // viene nemmeno mostrata per le stanze aziendali (vedi
  // onOpenAutoDelete piu' sotto, passato come undefined se isEnterprise),
  // e il backend rifiuta comunque la richiesta anche se qualcuno
  // provasse a bypassare l'interfaccia (doppia barriera, mai una sola).
  const handleSetAutoDelete = useCallback(async (minutes) => {
    if (!authToken || !currentRoom?.id) return;
    const roomId = normalizeRoomId(currentRoom.id);
    try {
      const updatedRoom = await apiService.setAutoDeleteTimer(roomId, minutes, authToken);
      setRecentRooms((prev) =>
        prev.map((r) => (normalizeRoomId(r.id) === roomId ? { ...r, ...updatedRoom } : r))
      );
      setShowAutoDeletePanel(false);
    } catch (e) {
      console.error('Errore impostazione auto-cancellazione:', e);
    }
  }, [authToken, currentRoom]);

  const handleToggleFavorite = useCallback(async () => {
    if (!authToken || !currentRoom?.id) return;
    const roomId = normalizeRoomId(currentRoom.id);
    const nextFavorite = !resolveRoomFavorite(currentRoom, favoriteOverrides);
    try {
      if (nextFavorite) {
        await apiService.favoriteRoom(roomId, authToken);
      } else {
        await apiService.unfavoriteRoom(roomId, authToken);
      }
      setFavoriteOverrides((prev) => ({ ...prev, [roomId]: nextFavorite }));
    } catch (e) {
      console.error('Errore toggle preferiti:', e);
    }
  }, [authToken, currentRoom, favoriteOverrides]);

  const isCurrentRoomDirect = currentRoom?.room_kind === 'direct';
  const isCallTargetBlocked = callTargetUser?.id ? blockedUserIds.has(callTargetUser.id) : false;

  const handleToggleBlock = useCallback(async () => {
    if (!callTargetUser?.id) return;
    if (isCallTargetBlocked) {
      try {
        await apiService.unblockUser(callTargetUser.id, authToken);
        segnaSbloccato(callTargetUser.id);  // [palacan-metadati-a4.4c3]
        window.dispatchEvent(new CustomEvent('palacan:blocchi-cambiati'));  // [palacan-metadati-3.4d-blocco]
        setBlockedUserIds((prev) => {
          const next = new Set(prev);
          next.delete(callTargetUser.id);
          return next;
        });
        showToast(t('dashboard.block_confirm.user_unblocked'));
      } catch (e) {
        console.error('Errore sblocco:', e);
        showToast(t('dashboard.block_confirm.block_error'), 'error');
      }
    } else {
      setShowBlockConfirm(true);
    }
  }, [authToken, callTargetUser, isCallTargetBlocked, t]);

  const handleRemoveContact = useCallback(async () => {
    if (!callTargetUser?.username) return;
    try {
      await apiService.removeContact(callTargetUser.username, authToken);
      showToast(t('dashboard.actions_menu.contact_removed', 'Amicizia rimossa'));
    } catch (e) {
      console.error('Errore rimozione contatto:', e);
      showToast(t('dashboard.actions_menu.remove_contact_error', 'Errore rimozione contatto'), 'error');
    }
  }, [authToken, callTargetUser, t]);

  const confirmBlockUser = useCallback(async () => {
    if (!callTargetUser?.id) return;
    try {
      await apiService.blockUser(callTargetUser.id, authToken);
      ruotaRecapito(authToken, callTargetUser).catch(() => {});  // [palacan-metadati-a4.4c3] chiave di recapito nuova
      window.dispatchEvent(new CustomEvent('palacan:blocchi-cambiati'));  // [palacan-metadati-3.4d-blocco]
      setBlockedUserIds((prev) => new Set(prev).add(callTargetUser.id));
      showToast(t('dashboard.block_confirm.user_blocked'));
    } catch (e) {
      console.error('Errore blocco:', e);
      showToast(t('dashboard.block_confirm.block_error'), 'error');
    } finally {
      setShowBlockConfirm(false);
    }
  }, [authToken, callTargetUser, t]);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState(() => new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  const handleEnterSelectionMode = useCallback((messageId) => {
    setSelectionMode(true);
    setSelectedMessageIds(new Set([messageId]));
  }, []);

  const handleToggleMessageSelection = useCallback((messageId) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId); else next.add(messageId);
      return next;
    });
  }, []);

  const handleCancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
    setConfirmingBulkDelete(false);
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (typeof onDeleteMessage !== 'function') return;
    const ids = Array.from(selectedMessageIds);
    for (const id of ids) {
      const msgToDelete = messages.find((m) => String(m.id) === String(id));
      if (msgToDelete) {
        try {
          await onDeleteMessage(msgToDelete);
        } catch (e) {
          console.error('Errore eliminazione multipla:', e);
        }
      }
    }
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
    setConfirmingBulkDelete(false);
  }, [selectedMessageIds, messages, onDeleteMessage]);

  const handleSetReplyingTo = useCallback((msg) => {
    setReplyingTo({
      id: msg?.id,
      text: msg?.text || t('dashboard.chat_layout.default_message_text'),
      sender: msg?.type === 'self' ? (currentUsername || t('dashboard.chat_layout.you')) : (msg?.sender || msg?.sender_username || t('dashboard.chat_layout.default_sender')),
    });
    requestAnimationFrame(() => composerInputRef.current?.focus()); // [palacan-messaggi] dopo "Rispondi" si scrive subito
  }, [currentUsername]);
  const [searchQuery, setSearchQuery] = useState('');

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showJoinPanel, setShowJoinPanel] = useState(false);
  const [showPasswordSheet, setShowPasswordSheet] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showRenamePanel, setShowRenamePanel] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showDeviceManagementPanel, setShowDeviceManagementPanel] = useState(false);
  const [showRecoveryCodeModal, setShowRecoveryCodeModal] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [showAddFriendPanel, setShowAddFriendPanel] = useState(false);
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [openTasksCount, setOpenTasksCount] = useState(0);

  const loadTasks = useCallback(async () => {
    if (!currentRoom?.id || !authToken) return;
    setTasksLoading(true);
    try {
      const raw = await apiService.getRoomTasks(currentRoom.id, authToken);
      const decrypted = typeof decryptTaskList === 'function' ? decryptTaskList(raw) : raw;
      setTasks(decrypted);
      setOpenTasksCount(decrypted.filter((t) => t.status === 'open').length);
    } catch (err) {
      console.error('Errore caricamento task:', err);
    } finally {
      setTasksLoading(false);
    }
  }, [currentRoom?.id, authToken, apiService, decryptTaskList]);

  useEffect(() => {
    if (showTaskPanel) loadTasks();
  }, [showTaskPanel, loadTasks]);

  const handleTaskCreate = useCallback(
    async ({ title, description, dueDate, assignedToUserId }) => {
      if (!currentRoom?.id || typeof onCreateTask !== 'function') {
        throw new Error(t('dashboard.chat_layout.error_task_unavailable'));
      }
      const created = await onCreateTask(currentRoom.id, { title, description, dueDate, assignedToUserId });

      /* -- Fix: il creatore ha solo la sessione OUTBOUND per il proprio
         task, non una inbound per se stesso -- decryptTaskList fallirebbe
         sempre per lui. Lo aggiungiamo localmente col testo gia' noto,
         stesso principio dei messaggi (il mittente vede il proprio testo
         perche' lo conosce, non perche' lo decifra da server). Un
         successivo loadTasks() (es. riapertura pannello) lo sostituira'
         con la versione dal server, che a quel punto sara' comunque
         corretta per lui essendo lui stesso il creatore. ---------------- */
      if (created && created.id) {
        setTasks((prev) => {
          if (prev.some((t) => String(t.id) === String(created.id))) return prev;
          return [
            { ...created, title, description, undecryptable: false },
            ...prev,
          ];
        });
        setOpenTasksCount((prev) => prev + 1);
      } else {
        await loadTasks();
      }
    },
    [currentRoom?.id, onCreateTask, loadTasks]
  );

  const handleTaskToggle = useCallback(
    async (task) => {
      const nextStatus = task.status === 'done' ? 'open' : 'done';
      await apiService.updateTaskStatus(task.id, nextStatus, authToken);
      await loadTasks();
    },
    [apiService, authToken, loadTasks]
  );

  const handleTaskDelete = useCallback(
    async (task) => {
      await apiService.deleteTask(task.id, authToken);
      await loadTasks();
    },
    [apiService, authToken, loadTasks]
  );
  const [showInvitesPanel, setShowInvitesPanel] = useState(false);
  const [showRosterPanel, setShowRosterPanel] = useState(false);

  const [pendingRoom, setPendingRoom] = useState(null);
  const [sheetPasswordInput, setSheetPasswordInput] = useState('');
  const [createRoomNameInput, setCreateRoomNameInput] = useState('');
  const [createRoomPwdInput, setCreateRoomPwdInput] = useState('');
  const [joinIdInput, setJoinIdInput] = useState('');
  const [joinPwdInput, setJoinPwdInput] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const toastTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const contenitoreMessaggiRef = useRef(null);  // [palacan-chat-offline]
  const inFondoRef = useRef(true);
  const ultimaStanzaMostrataRef = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    setToast({ show: true, message, type });
    toastTimeoutRef.current = window.setTimeout(
      () => setToast({ show: false, message: '', type: 'success' }),
      2600
    );
  }, []);

  // [palacan-invito-richiesta] avviso a chi ha usato un link d'invito: richiesta inviata, la chat nasce quando l'invitante la accetta.
  // L'avviso aspetta in sessionStorage: arriva anche se la Dashboard si apre dopo l'accesso.
  useEffect(() => {
    const mostraAvvisoInvito = () => {
      let nome = null;
      try {
        nome = window.sessionStorage.getItem('palacan_avviso_invito');
        window.sessionStorage.removeItem('palacan_avviso_invito');
      } catch (_) { /* niente avviso */ }
      if (nome !== null) showToast(i18n.t('dashboard.contact_requests.invite_request_sent', { name: nome }));
    };
    mostraAvvisoInvito();
    window.addEventListener('palacan:invito-richiesta', mostraAvvisoInvito);
    return () => window.removeEventListener('palacan:invito-richiesta', mostraAvvisoInvito);
  }, [showToast]);

  useEffect(() => () => { if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current); }, []);

  // [palacan-chat-offline] all'apertura di una chat si parte dagli ultimi messaggi (salto immediato, come WhatsApp e Signal);
  // con un messaggio nuovo si scende solo se si era gia' in fondo o se il messaggio e' proprio.
  useEffect(() => {
    const box = contenitoreMessaggiRef.current;
    if (!box) return;
    const stanza = currentRoom?.id || null;
    const nuovaStanza = ultimaStanzaMostrataRef.current !== stanza;
    ultimaStanzaMostrataRef.current = stanza;
    const ultimo = Array.isArray(messages) && messages.length ? messages[messages.length - 1] : null;
    if (nuovaStanza || inFondoRef.current || ultimo?.type === 'self') {
      box.scrollTo({ top: box.scrollHeight, behavior: nuovaStanza ? 'auto' : 'smooth' });
      inFondoRef.current = true;
    }
  }, [messages, currentRoom?.id]);

  // il contenuto cresce dopo il caricamento (reazioni, testi decifrati): se si e' in fondo, si resta in fondo
  useEffect(() => {
    const box = contenitoreMessaggiRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const contenuto = box.firstElementChild;
    const osservatore = new ResizeObserver(() => {
      if (inFondoRef.current) box.scrollTop = box.scrollHeight;
    });
    if (contenuto) osservatore.observe(contenuto);
    return () => osservatore.disconnect();
  }, [currentRoom?.id]);

  useEffect(() => {
    if (!contactLiveEvent) return;

    switch (contactLiveEvent.type) {
      case 'room_invite_received':
        showToast(
          `${contactLiveEvent.from_username || t('dashboard.chat_layout.someone')} ${t('dashboard.chat_layout.invited_you_to')} "${
            contactLiveEvent.room_name || t('dashboard.chat_layout.default_room_name_event')
          }"`
        );
        break;
      case 'room_invite_accepted':
        showToast(`${contactLiveEvent.by_username || t('dashboard.chat_layout.default_sender')} ${t('dashboard.chat_layout.accepted_your_invite')}`);
        break;
      case 'room_invite_rejected':
        showToast(`${contactLiveEvent.by_username || t('dashboard.chat_layout.default_sender')} ${t('dashboard.chat_layout.rejected_your_invite')}`, 'error');
        break;
      case 'friend_request':
        showToast(`${contactLiveEvent.from_username || t('dashboard.chat_layout.someone')} ${t('dashboard.chat_layout.sent_contact_request')}`);
        break;
      case 'friend_request_response':
        if (contactLiveEvent.status === 'accepted') {
          showToast(`${contactLiveEvent.from_username || t('dashboard.chat_layout.default_sender')} ${t('dashboard.chat_layout.accepted_your_contact_request')}`);
        } else if (contactLiveEvent.status === 'rejected') {
          showToast(`${contactLiveEvent.from_username || t('dashboard.chat_layout.default_sender')} ${t('dashboard.chat_layout.rejected_your_contact_request')}`, 'error');
        }
        break;
      default:
        break;
    }
  }, [contactLiveEvent, showToast]);

  useEffect(() => {
    if (!sendRejectedEvent) return;
    const reasonLabel =
      sendRejectedEvent.reason === 'muted'
        ? t('dashboard.chat_layout.muted_not_sent')
        : t('dashboard.chat_layout.generic_not_sent');
    showToast(reasonLabel, 'error');
  }, [sendRejectedEvent, showToast]);

  const safeRooms = Array.isArray(recentRooms) ? recentRooms : [];

  const displayedRooms = useMemo(() => {
    const corporateRooms = safeRooms.filter((r) => r?.is_corporate === true);
    const nonCorporateRooms = safeRooms.filter((r) => r?.is_corporate !== true);
    let base = isEnterprise
      ? (corporateRooms.length > 0 ? corporateRooms : safeRooms)
      : (nonCorporateRooms.length > 0 ? nonCorporateRooms : safeRooms);

    if (activeListFilter) {
      const activeList = customLists.find((l) => l.id === activeListFilter);
      const idsInList = new Set(activeList?.room_ids || []);
      base = base.filter((r) => idsInList.has(normalizeRoomId(r?.id)));
    }

    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter((r) => {
      const name = String(r?.name || '').toLowerCase();
      const id = normalizeRoomId(r?.id).toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [safeRooms, isEnterprise, searchQuery, activeListFilter, customLists]);

  const openCreatePanel = () => { setCreateRoomNameInput(''); setCreateRoomPwdInput(''); setShowCreatePanel(true); };
  const openJoinPanel = () => { setJoinIdInput(''); setJoinPwdInput(''); setShowJoinPanel(true); };

  const handleInviteClick = async () => {
    setShowInvitePanel(true);
    if (typeof onCreateInviteLink !== 'function') return;
    setCreatingInvite(true);
    try {
      await onCreateInviteLink();
    } catch (err) {
      showToast(err?.message || t('dashboard.chat_layout.error_create_invite'), 'error');
    } finally {
      setCreatingInvite(false);
    }
  };

  const closeInvitePanel = () => {
    setShowInvitePanel(false);
    if (typeof onClearGeneratedInviteLink === 'function') onClearGeneratedInviteLink();
  };

  const handleCopyInviteLink = async () => {
    const link = (generatedInviteLink?.invite_path || generatedInviteLink?.invitePath)
      ? `${window.location.origin}${generatedInviteLink.invite_path || generatedInviteLink.invitePath}`
      : (generatedInviteLink?.url || '');
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      showToast(t('dashboard.chat_layout.invite_link_copied'));
      closeInvitePanel();  // [palacan-pannelli-chiusura] link copiato: il pannello si chiude
    } catch {
      showToast(t('dashboard.chat_layout.copy_failed'), 'error');
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!msgInput.trim() || !currentRoom?.id || isCallTargetBlocked) return;
    // [palacan-l4a] contatto verificato con una chiave mai vista: niente invio finche' non si conferma (banner rosso)
    if (isCurrentRoomDirect && otherParticipantNameFromRoomName
      && olmService.invioBloccatoPerIdentita(currentUsername, otherParticipantNameFromRoomName)) {
      showToast(t('dashboard.chat_layout.identity_changed_blocked', 'Invio bloccato: controlla il numero di sicurezza e conferma nel banner rosso.'), 'error');
      return;
    }
    onSendMessage(msgInput.trim(), replyingTo);
    setMsgInput('');
    setReplyingTo(null);
    const sentRoomId = normalizeRoomId(currentRoom?.id);
    if (sentRoomId) {
      setDrafts((prev) => {
        if (!(sentRoomId in prev)) return prev;
        const next = { ...prev };
        delete next[sentRoomId];
        saveDraftsToStorage(currentUsername, next);
        return next;
      });
    }
  };

  const handleRoomClick = async (room) => {
    const alreadyOpen = normalizeRoomId(currentRoom?.id) === normalizeRoomId(room?.id) && Boolean(room?.id);

    if (alreadyOpen) {
      setShowAccountMenu(false);
      setShowActionsMenu(false);
      if (isEnterprise && window.innerWidth < 1024) setSidebarOpen(false);
      return;
    }

    // [palacan-gruppi-solo-invito] nessuna password all'apertura: chi e' membro del gruppo lo apre
    try {
      await onSelectChat(room);
      const nextRoomId = normalizeRoomId(room?.id);
      setMsgInput(nextRoomId ? (drafts[nextRoomId] || '') : '');
      if (!isEnterprise) return;
      if (window.innerWidth < 1024) setSidebarOpen(false);
    } catch (err) {
      showToast(err?.message || t('dashboard.chat_layout.error_open_conversation'), 'error');
    }
  };

  const submitCreateRoom = async (e) => {
    e.preventDefault();
    if (!createRoomNameInput.trim()) { showToast(t('dashboard.chat_layout.enter_name'), 'error'); return; }
    setCreatingRoom(true);
    try {
      const created = await onCreateRoom(createRoomNameInput.trim(), createRoomPwdInput || '');
      setCreateRoomNameInput(''); setCreateRoomPwdInput('');
      setShowCreatePanel(false);
      showToast(t('dashboard.chat_layout.room_created'));
      if (created) await onSelectChat(created);
    } catch (err) {
      showToast(err?.message || t('dashboard.chat_layout.error_create'), 'error');
    } finally { setCreatingRoom(false); }
  };

  const submitJoinRoom = async (e) => {
    e.preventDefault();
    if (!joinIdInput.trim()) { showToast(t('dashboard.chat_layout.enter_id'), 'error'); return; }
    setJoiningRoom(true);
    try {
      const joined = await onJoinRoom(joinIdInput.trim(), joinPwdInput || '');
      setJoinIdInput(''); setJoinPwdInput('');
      setShowJoinPanel(false);
      showToast(t('dashboard.chat_layout.access_completed'));
      if (joined) await onSelectChat(joined);
    } catch (err) {
      showToast(err?.message || t('dashboard.chat_layout.error_access'), 'error');
    } finally { setJoiningRoom(false); }
  };

  const handleLeaveRoom = async () => {
    if (!currentRoom?.id) return;
    const roomId = currentRoom.id;
    try {
      if (typeof onLeaveRoom === 'function') {
        await onLeaveRoom(roomId);
      } else if (typeof apiService.leaveRoom === 'function' && authToken) {
        await apiService.leaveRoom(roomId, authToken);
      }
      showToast(t('dashboard.chat_layout.left_conversation'));
    } catch (err) {
      showToast(err?.message || t('dashboard.chat_layout.error_leave'), 'error');
    }
  };

  const handleBack = () => {
    if (typeof onBack === 'function') onBack();
  };

  const isAdminLayout = isEnterprise && isAdmin;
  const singlePane = !isAdminLayout;

  const asideClasses = singlePane
    ? currentRoom?.id
      ? 'hidden'
      : 'flex w-full flex-col'
    : [
        'fixed inset-y-0 left-0 z-40 flex w-[290px] flex-col',
        `border-r ${T.border} ${T.bg}`,
        'transition-transform duration-200 ease-out',
        'lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      ].join(' ');

  const sectionClasses = singlePane
    ? !currentRoom?.id
      ? 'hidden'
      : 'flex h-full w-full min-h-0 flex-col'
    : 'flex min-w-0 flex-1 flex-col';

  const otherParticipantNameFromRoomName = (() => {
    // [palacan-metadati-2a] il contatto dai partecipanti forniti dal server (UN solo nome: serve anche al numero di sicurezza)
    if (!isCurrentRoomDirect) return null;
    return altriPartecipantiDiretta(currentRoom, currentUsername)[0] || null;
  })();

  const headerTitle = currentRoom?.id
    ? (isCurrentRoomDirect
        ? (otherParticipantNameFromRoomName || callTargetUser?.username || currentRoom.name || t('dashboard.chat_layout.default_room_name_header'))
        : (nomeMostratoStanza(currentRoom) || t('dashboard.chat_layout.default_room_name_header')))
    : isEnterprise
      ? (currentWorkspaceName || t('dashboard.chat_layout.default_workspace_name'))
      : t('dashboard.chat_layout.conversations_title');

  const headerSubtitle = currentRoom?.id
    ? (currentRoom.room_kind === 'direct' ? t('dashboard.chat_layout.private_chat_protected') : t('dashboard.chat_layout.protected'))
    : isEnterprise
      ? (isAdminLayout
          ? `${t('dashboard.chat_layout.workspace_prefix')} · ${String(currentWorkspaceId || '').slice(0, 8)}…`
          : (currentWorkspaceName ? `@${currentUsername || ''} · ${currentWorkspaceName}` : `@${currentUsername || ''}`))
      : `@${currentUsername || ''}`;

  return (
    <div
      className={`app-shell flex overflow-hidden ${T.bg} ${T.text}`}
      style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
    >

      <aside className={asideClasses}>

        <div className={`relative border-b ${T.borderSoft} px-4 py-4`}>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setShowAccountMenu((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1.5 transition-colors duration-150 hover:bg-white/[0.03]"
              aria-label={t('dashboard.chat_layout.account_menu_aria')}
            >
              <div
                className="shrink-0 rounded-2xl p-[2px]"
                style={{
                  background: 'linear-gradient(135deg, #14B8A6 0%, #7F77DD 100%)',
                  boxShadow: '0 0 12px rgba(20,184,166,0.45)',
                }}
              >
                <UserAvatar username={currentUsername} size={32} />
              </div>
              <div className="min-w-0 text-left">
                <p className={`truncate text-sm font-medium ${T.text}`}>{currentUsername || t('dashboard.chat_layout.default_sender')}</p>
                <p className={`text-xs ${T.textFaint}`}>
                  {currentUserRole === 'consumer' ? t('dashboard.chat_layout.personal_area')
                    : currentUserRole === 'admin' ? t('dashboard.chat_layout.admin_role')
                    : t('dashboard.chat_layout.default_workspace_name')}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setShowContactRequestsPanel(true)}
              className={`relative shrink-0 rounded-full p-2.5 ${T.textMuted} ${T.surface} border ${T.borderSoft} transition-all duration-150 hover:${T.text} hover:scale-105 active:scale-95`}
              aria-label={t('dashboard.chat_layout.contacts_aria', 'Contatti')}
              title={t('dashboard.chat_layout.contacts_aria', 'Contatti')}
            >
              <UserPlus size={17} />
              {Array.isArray(pendingContactRequests) && pendingContactRequests.length > 0 && (
                <span
                  className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full ${T.accentBg} px-1 text-[10px] font-semibold text-[#0B0C11] ring-2 ring-[#EEF4F4]`}
                >
                  {pendingContactRequests.length > 9 ? '9+' : pendingContactRequests.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowContactsListPanel(true)}
              className={`relative shrink-0 rounded-full p-2.5 ${T.textMuted} ${T.surface} border ${T.borderSoft} transition-all duration-150 hover:${T.text} hover:scale-105 active:scale-95`}
              aria-label={t('dashboard.chat_layout.contacts_list_aria', 'I miei contatti')}
              title={t('dashboard.chat_layout.contacts_list_aria', 'I miei contatti')}
            >
              <Users size={17} />
            </button>

            {onOpenCallHistory && (
              <button
                type="button"
                onClick={onOpenCallHistory}
                className={`shrink-0 rounded-full p-2.5 ${T.textMuted} ${T.surface} border ${T.borderSoft} transition-all duration-150 hover:${T.text} hover:scale-105 active:scale-95`}
                aria-label={t('dashboard.chat_layout.call_history_aria', 'Cronologia chiamate')}
                title={t('dashboard.chat_layout.call_history_aria', 'Cronologia chiamate')}
              >
                <History size={17} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowInvitesPanel(true)}
              className={`relative shrink-0 rounded-full p-2.5 ${T.textMuted} ${T.surface} border ${T.borderSoft} transition-all duration-150 hover:${T.text} hover:scale-105 active:scale-95`}
              aria-label={t('dashboard.chat_layout.invites_aria', 'Notifiche')}
              title={t('dashboard.chat_layout.invites_aria', 'Notifiche')}
            >
              <Bell size={17} />
              {Array.isArray(pendingInvites) && pendingInvites.length > 0 && (
                <span
                  className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full ${T.accentBg} px-1 text-[10px] font-semibold text-[#0B0C11] ring-2 ring-[#EEF4F4]`}
                >
                  {pendingInvites.length > 9 ? '9+' : pendingInvites.length}
                </span>
              )}
            </button>

            {!isEnterprise && (
              <button
                type="button"
                onClick={handleInviteClick}
                className={`shrink-0 rounded-full p-2.5 ${T.textMuted} ${T.surface} border ${T.borderSoft} transition-all duration-150 hover:${T.text} hover:scale-105 active:scale-95`}
                aria-label={t('dashboard.chat_layout.invite_palacan_aria')}
                title={t('dashboard.chat_layout.invite_palacan_aria')}
              >
                <Share2 size={17} />
              </button>
            )}

            {!singlePane && (
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className={`rounded-xl p-2 ${T.textFaint} transition-colors duration-150 hover:bg-white/5 hover:${T.text} lg:hidden`}
                aria-label={t('dashboard.chat_layout.close_sidebar_aria')}
              >
                <X size={18} />
              </button>
            )}
          </div>

          <AnimatePresence>
            {showAccountMenu && (
              <AccountMenu
                username={currentUsername}
                userId={currentUserId}
                userRole={currentUserRole}
                onLogout={onLogout}
                onInvite={!isEnterprise ? handleInviteClick : undefined}
                onOpenAdminApp={isEnterprise && isAdmin ? onOpenAdminApp : undefined}
                onGenerateRecoveryCode={() => setShowRecoveryCodeModal(true)}
                onOpenBlockedUsers={() => setShowBlockedUsersPanel(true)}
                onOpenDeviceManagement={() => setShowDeviceManagementPanel(true)}
        onClose={() => setShowAccountMenu(false)}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {managingListId && (
              <BottomSheet title={t('dashboard.chat_layout.manage_list_title')} onClose={() => setManagingListId(null)}>
                <ManageListPanel
                  list={customLists.find((l) => l.id === managingListId)}
                  rooms={safeRooms}
                  onRename={(name) => handleRenameList(managingListId, name)}
                  onDelete={() => handleDeleteList(managingListId)}
                  onToggleRoom={(roomId) => handleToggleRoomInList(managingListId, roomId)}
                />
              </BottomSheet>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showRecoveryCodeModal && (
              <RecoveryCodeModal
                authToken={authToken}
                onClose={() => setShowRecoveryCodeModal(false)}
                showToast={showToast}
              />
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <div className={`flex flex-1 items-center gap-2 rounded-2xl border ${T.borderSoft} ${T.surface} px-3 py-2 transition-colors duration-150 focus-within:border-[#14B8A6] focus-within:ring-2 focus-within:ring-[#14B8A6]/20`}>
            <Search size={14} className={`${T.textFaint} shrink-0`} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('dashboard.chat_layout.search_placeholder')}
              className={`w-full bg-transparent text-sm ${T.text} outline-none placeholder:${T.textFaint}`}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className={`${T.textFaint} hover:${T.text}`}>
                <X size={13} />
              </button>
            )}
          </div>
          <NewConversationTrigger onCreate={openCreatePanel} variant="icon" />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2">
          <button
            type="button"
            onClick={() => setActiveListFilter(null)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ${
              !activeListFilter ? 'bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)] text-[#0B0C11]' : `${T.surface} ${T.textFaint} hover:bg-white/5`
            }`}
          >
            Tutte
          </button>
          {customLists.map((list) => {
            const isActiveList = activeListFilter === list.id;
            return (
              <div
                key={list.id}
                className={`flex shrink-0 items-center rounded-full transition-colors duration-150 ${
                  isActiveList ? `${T.accentBg} text-[#0B0C11]` : `${T.surface} ${T.textFaint} hover:bg-white/5`
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveListFilter(list.id)}
                  className={`rounded-full py-1 text-xs font-medium ${isActiveList ? 'pl-3 pr-1.5' : 'px-3'}`}
                >
                  {list.name}
                </button>
                {isActiveList && (
                  <button
                    type="button"
                    onClick={() => setManagingListId(list.id)}
                    className="rounded-full p-1 pr-2.5 opacity-80 hover:opacity-100"
                    aria-label={t('dashboard.chat_layout.manage_list_title')}
                    title={t('dashboard.chat_layout.manage_list_title')}
                  >
                    <Pencil size={11} />
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={handleCreateCustomList}
            className={`shrink-0 rounded-full border border-dashed ${T.borderSoft} p-1.5 ${T.textFaint} hover:${T.text} hover:bg-white/5`}
            aria-label={t('dashboard.chat_layout.new_list_aria')}
            title={t('dashboard.chat_layout.new_list_aria')}
          >
            <Tag size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {searchQuery.trim() && displayedRooms.length === 0 ? (
            <div className={`rounded-2xl border border-dashed ${T.borderSoft} p-4 text-sm ${T.textFaint}`}>
              {t('dashboard.chat_layout.no_results_for')} &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : displayedRooms.length === 0 ? (
            <EmptyConversationState
              currentUsername={currentUsername}
              isEnterprise={isEnterprise}
              onCreate={openCreatePanel}
              isAdmin={isAdmin}
            />
          ) : (
            <ConversationTimeline
              rooms={displayedRooms}
              currentRoom={currentRoom}
              onRoomClick={handleRoomClick}
              drafts={drafts}
              mutedOverrides={mutedOverrides}
              favoriteOverrides={favoriteOverrides}
            />
          )}
        </div>

      </aside>

      {!singlePane && sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label={t('dashboard.chat_layout.close_overlay_aria')}
        />
      )}

      <section className={sectionClasses}>

        <header className={`relative flex h-14 shrink-0 items-center justify-between border-b ${T.borderSoft} ${T.bg} px-4 shadow-sm`}>
          <div className="flex min-w-0 flex-1 items-center gap-3">

            {singlePane && currentRoom?.id ? (
              <button
                type="button" onClick={handleBack}
                className={`rounded-xl p-2 ${T.textMuted} transition-colors duration-150 hover:bg-white/5 hover:${T.text}`}
                aria-label={t('dashboard.chat_layout.back_to_conversations_aria')}
              >
                <ChevronLeft size={18} />
              </button>
            ) : !singlePane && currentRoom?.id ? (
              <button
                type="button" onClick={handleBack}
                className={`rounded-xl p-2 ${T.textMuted} transition-colors duration-150 hover:bg-white/5 hover:${T.text}`}
                aria-label={t('dashboard.chat_layout.back_to_home_aria')}
                title={t('dashboard.chat_layout.back_to_home_aria')}
              >
                <ChevronLeft size={18} />
              </button>
            ) : !singlePane ? (
              <button
                type="button" onClick={() => setSidebarOpen(true)}
                className={`rounded-xl p-2 ${T.textMuted} transition-colors duration-150 hover:bg-white/5 hover:${T.text} lg:hidden`}
                aria-label={t('dashboard.chat_layout.open_sidebar_aria')}
              >
                <Menu size={18} />
              </button>
            ) : null}

            <div
              className={`min-w-0 flex-1 ${currentRoom?.id ? `-mx-2 -my-1 cursor-pointer rounded-xl border ${T.borderSoft} px-2 py-2 transition-colors duration-150 hover:bg-white/10 active:bg-white/15` : ''}`}
              onClick={currentRoom?.id ? () => setShowActionsMenu((v) => !v) : undefined}
              role={currentRoom?.id ? 'button' : undefined}
              tabIndex={currentRoom?.id ? 0 : undefined}
              aria-label={currentRoom?.id ? t('dashboard.chat_layout.actions_aria') : undefined}
            >
              <div className="flex items-center gap-2">
                <h2 className={`truncate text-sm font-medium ${T.text}`}>{headerTitle}</h2>
                {currentRoom?.is_corporate && (
                  <span className={`rounded-full ${T.elevated} px-2 py-0.5 text-[10px] font-medium ${T.textMuted}`}>
                    {t('dashboard.chat_layout.default_workspace_name')}
                  </span>
                )}
              </div>
              <p className={`flex items-center gap-1 text-xs ${T.textFaint} truncate`}>
                {currentRoom?.id && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: T.accent }} />
                )}
                {headerSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentRoom?.id && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (!callTargetUser?.id) {
                      showToast('Impossibile avviare la chiamata: utente non trovato', 'error');
                      return;
                    }
                    // [palacan-l4d] contatto verificato con una chiave mai vista: niente chiamata finche' non si conferma
                    if (callTargetUser?.username && olmService.invioBloccatoPerIdentita(currentUsername, callTargetUser.username)) {
                      showToast(t('dashboard.chat_layout.identity_changed_blocked_call', 'Chiamata bloccata: controlla il numero di sicurezza e conferma nel banner rosso.'), 'error');
                      return;
                    }
                    callManager?.startCall(currentRoom.id, callTargetUser.id);
                  }}
                  className="flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#1DCDB0_0%,#0D9488_100%)] p-2.5 text-white shadow-[0_4px_12px_-2px_rgba(13,148,136,0.4)] transition-all duration-150 hover:shadow-[0_6px_16px_-2px_rgba(13,148,136,0.5)] hover:scale-105 active:scale-95"
                  aria-label="Chiamata"
                >
                  <Phone size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!callTargetUser?.id) {
                      showToast('Impossibile avviare la videochiamata: utente non trovato', 'error');
                      return;
                    }
                    // [palacan-l4d] contatto verificato con una chiave mai vista: niente chiamata finche' non si conferma
                    if (callTargetUser?.username && olmService.invioBloccatoPerIdentita(currentUsername, callTargetUser.username)) {
                      showToast(t('dashboard.chat_layout.identity_changed_blocked_call', 'Chiamata bloccata: controlla il numero di sicurezza e conferma nel banner rosso.'), 'error');
                      return;
                    }
                    callManager?.startCall(currentRoom.id, callTargetUser.id, true);
                  }}
                  className="flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#9089E8_0%,#6C5FD6_100%)] p-2.5 text-white shadow-[0_4px_12px_-2px_rgba(108,95,214,0.4)] transition-all duration-150 hover:shadow-[0_6px_16px_-2px_rgba(108,95,214,0.5)] hover:scale-105 active:scale-95"
                  aria-label="Videochiamata"
                >
                  <Video size={16} />
                </button>
              </>
            )}

          </div>

          <AnimatePresence>
            {showActionsMenu && currentRoom?.id && (
              <ConversationActionsMenu
                /* FIX (UX): "Aggiungi partecipante" non ha senso in una
                   chat 1:1 - una chat diretta e' pensata per restare
                   sempre tra esattamente due persone (vedi Room.direct_key
                   lato backend). Non passando la funzione, i componenti
                   figli (gia' pronti per questo: "show: Boolean(onAddFriend)"
                   e "{onAddFriend && (...)}") nascondono la voce da soli,
                   invece di mostrarla e poi rifiutarla con un errore. */
                onAddFriend={isCurrentRoomDirect ? undefined : () => setShowAddFriendPanel(true)}
                onVerifyIdentity={isCurrentRoomDirect ? () => setSafetyNumberPanelOpen(true) : undefined}
                onInfo={() => setShowInfoPanel(true)}
                onRename={() => setShowRenamePanel(true)}
                onOpenTasks={isEnterprise ? () => setShowTaskPanel(true) : undefined}
                onOpenAutoDelete={!isEnterprise ? () => setShowAutoDeletePanel(true) : undefined}
                onToggleMute={handleToggleMuteNotifications}
                isMuted={resolveRoomMuted(currentRoom, mutedOverrides)}
                onToggleFavorite={handleToggleFavorite}
                isFavorite={resolveRoomFavorite(currentRoom, favoriteOverrides)}
                onReport={() => setShowReportModal(true)}
                onBlock={handleToggleBlock}
                onRemoveContact={handleRemoveContact}
                isDirect={isCurrentRoomDirect}
                isBlocked={isCallTargetBlocked}
                onLeave={handleLeaveRoom}
                onClose={() => setShowActionsMenu(false)}
              />
            )}
          </AnimatePresence>
        </header>

        {isCurrentRoomDirect && otherParticipantNameFromRoomName && (
          <IdentityChangeWarningBanner
            username={currentUsername}
            peerUsername={otherParticipantNameFromRoomName}
          />
        )}

        {/* Pannello "Verifica identità" (numero di sicurezza) - difesa
            contro un MITM attivo al PRIMISSIMO scambio di chiavi, prima
            che TOFU abbia una storia da confrontare. Vedi
            SafetyNumberPanel.jsx per la spiegazione completa. */}
        {safetyNumberPanelOpen && isCurrentRoomDirect && otherParticipantNameFromRoomName && (
          <SafetyNumberPanel
            username={currentUsername}
            peerUsername={otherParticipantNameFromRoomName}
            myIdentityKey={(() => {
              try {
                return olmAccount ? JSON.parse(olmAccount.identity_keys()).curve25519 : null;
              } catch (e) {
                return null;
              }
            })()}
            onClose={() => setSafetyNumberPanelOpen(false)}
          />
        )}

        <div className="flex min-h-0 flex-1">
          <main className={`flex min-w-0 flex-1 flex-col ${T.bg}`}>

            <div
              className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
              ref={contenitoreMessaggiRef} /* [palacan-chat-offline] */
              onScroll={(evento) => {
                const box = evento.currentTarget;
                inFondoRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
              }}
              style={{
                background: '#EEF1F5',
                backgroundImage:
                  'radial-gradient(circle at 10% 6%, rgba(24,97,196,0.04) 0%, transparent 40%), radial-gradient(circle at 90% 94%, rgba(24,97,196,0.04) 0%, transparent 40%)',
              }}
            >
              {currentRoom?.id ? (
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5">
                  {messagesLoading ? (
                    <LoadingMessagesState />
                  ) : Array.isArray(messages) && messages.length > 0 ? (
                    messages.map((msg, idx) => (
                      <motion.div
                        key={msg?.id ?? `${msg?.sender}-${idx}`}
                        initial={{ opacity: 0, y: 14, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.28, ease: EASE }}
                      >
                        <ChatBubble
                          msg={msg}
                          isDirect={currentRoom?.room_kind === 'direct'}
                          roomId={currentRoom?.id}
                          authToken={authToken}
                          currentUsername={currentUsername}
                          encryptReaction={encryptReaction}
                          decryptReaction={decryptReaction}
                          reactionLiveEvent={reactionLiveEvent}
                          wsReconnectCount={wsReconnectCount}
                          onDelete={() => {
                            if (typeof onDeleteMessage === 'function') onDeleteMessage(msg);
                          }}
                          onHideForMe={() => {
                            if (typeof onHideMessageForMe === 'function') onHideMessageForMe(msg);
                          }}
                          onReply={() => handleSetReplyingTo(msg)}
                          selectionMode={selectionMode}
                          selected={selectedMessageIds.has(msg?.id)}
                          onLongPressStart={() => handleEnterSelectionMode(msg?.id)}
                          onToggleSelect={() => handleToggleMessageSelection(msg?.id)}
                        />
                      </motion.div>
                    ))
                  ) : (
                    <EmptyMessagesState />
                  )}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <EmptyConversationState
                  currentUsername={currentUsername}
                  isEnterprise={isEnterprise}
                  onCreate={openCreatePanel}
                  isAdmin={isAdmin}
                />
              )}
            </div>

            {currentRoom?.id && (
              <>
              {selectionMode && (
                <div className={`border-t ${T.borderSoft} ${T.bg} px-4 py-3 flex items-center justify-between gap-3`}>
                  <button type="button" onClick={handleCancelSelection} className={`text-sm ${T.textMuted}`}>
                    {t('dashboard.chat_layout.cancel_selection')}
                  </button>
                  <span className={`text-sm ${T.text}`}>
                    {selectedMessageIds.size} {selectedMessageIds.size === 1 ? t('dashboard.chat_layout.selected_one') : t('dashboard.chat_layout.selected_other')}
                  </span>
                  {confirmingBulkDelete ? (
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${T.textFaint}`}>{t('dashboard.chat_layout.confirm_delete_all')}</span>
                      <button
                        type="button"
                        onClick={() => { setConfirmingBulkDelete(false); handleBulkDelete(); }}
                        className="text-xs font-medium text-red-400"
                      >
                        {t('dashboard.chat_layout.yes')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingBulkDelete(false)}
                        className={`text-xs ${T.text} opacity-70`}
                      >
                        {t('dashboard.chat_layout.no')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={selectedMessageIds.size === 0}
                      onClick={() => setConfirmingBulkDelete(true)}
                      className={`flex items-center gap-1 rounded-xl ${T.dangerSoftBg} px-3 py-1.5 text-sm font-medium text-red-400 disabled:opacity-40`}
                    >
                      <Trash2 size={14} />
                      {t('dashboard.chat_layout.delete_button')} ({selectedMessageIds.size})
                    </button>
                  )}
                </div>
              )}
              {replyingTo && !selectionMode && (
                <div className={`border-t ${T.borderSoft} ${T.bg} px-4 py-2 flex items-center justify-between gap-3`}>
                  <div className="min-w-0 flex-1 border-l-2 border-[#14B8A6] pl-2">
                    <p className={`truncate text-xs font-medium ${T.accentText}`}>{replyingTo.sender}</p>
                    <p className={`truncate text-xs ${T.textFaint}`}>{replyingTo.text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className={`shrink-0 ${T.textFaint} hover:${T.text}`}
                    aria-label={t('dashboard.chat_layout.cancel_reply_aria')}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {isCallTargetBlocked && (
                <div className="bg-[#FCE9E0] px-4 py-2 text-center text-xs font-medium text-[#C2410C]">
                  {t('dashboard.chat_layout.blocked_composer_notice')}
                </div>
              )}
              <form onSubmit={handleSend} className={`border-t ${T.borderSoft} ${T.bg} p-4`}>
                <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
                  <motion.div
                    className={`flex flex-1 items-center gap-2 rounded-full border ${T.borderSoft} ${T.surface} px-3.5 py-2 transition-all duration-200 focus-within:border-[#7F77DD]/40 focus-within:shadow-[0_0_0_3px_rgba(127,119,221,0.12)]`}
                  >
                    <button type="button" className={`shrink-0 rounded-full p-1.5 ${T.textFaint} transition-all duration-150 hover:${T.text} hover:scale-110`} aria-label={t('dashboard.chat_layout.attach_aria')}>
                      <Camera size={16} />
                    </button>
                    <button type="button" className={`shrink-0 rounded-full p-1.5 ${T.textFaint} transition-all duration-150 hover:${T.text} hover:scale-110`} aria-label={t('dashboard.chat_layout.attach_aria')}>
                      <Paperclip size={16} />
                    </button>
                    <div className="flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)] p-1.5" aria-hidden="true">
                      <Lock size={11} className="text-white" />
                    </div>
                    <input
                      ref={composerInputRef} // [palacan-messaggi]
                      autoComplete="off"
                      disabled={isCallTargetBlocked}
                      value={msgInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        setMsgInput(value);
                        const roomId = normalizeRoomId(currentRoom?.id);
                        if (roomId) {
                          setDrafts((prev) => {
                            const next = { ...prev, [roomId]: value };
                            if (!value) delete next[roomId];
                            saveDraftsToStorage(currentUsername, next);
                            return next;
                          });
                        }
                      }}
                      onFocus={() => window.scrollTo(0, 0)}
                      onBlur={() => window.scrollTo(0, 0)}
                      placeholder={t('dashboard.chat_layout.message_placeholder')}
                      className={`w-full border-none bg-transparent py-1.5 text-sm ${T.text} outline-none placeholder:${T.textFaint}`}
                      autoFocus
                    />
                    <div className="relative shrink-0" ref={composerEmojiPickerRef}>
                      <button
                        type="button"
                        onClick={() => setShowComposerEmojiPicker((v) => !v)}
                        className={`rounded-full p-1.5 ${T.textFaint} transition-colors duration-150 hover:${T.text}`}
                        aria-label={t('dashboard.chat_layout.emoji_aria')}
                      >
                        <Smile size={16} />
                      </button>
                      {showComposerEmojiPicker && (
                        <div className="absolute bottom-full right-0 z-20 mb-2">
                          <EmojiPicker emojiStyle="native"
                            onEmojiClick={(emojiData) => setMsgInput((prev) => prev + emojiData.emoji)}
                            width={280}
                            height={340}
                            previewConfig={{ showPreview: false }}
                            searchPlaceholder="Cerca emoji..."
                            skinTonesDisabled
                          />
                        </div>
                      )}
                    </div>
                  </motion.div>
                  <button
                    type="submit" disabled={!msgInput.trim() || isCallTargetBlocked}
                    className="shrink-0 rounded-2xl bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)] p-3 text-white disabled:cursor-not-allowed disabled:opacity-40 transition-colors duration-150"
                    aria-label={t('dashboard.chat_layout.send_aria')}
                  >
                    <Send size={17} />
                  </button>
                </div>
              </form>
              </>
            )}
          </main>

          {!singlePane && adminPanel}
        </div>
      </section>

      <AnimatePresence>
        {showCreatePanel && (
          <SlideOver title={t('dashboard.chat_layout.new_conversation_title')} subtitle={t('dashboard.chat_layout.new_conversation_subtitle')} onClose={() => setShowCreatePanel(false)}>
            <form onSubmit={submitCreateRoom} className="space-y-4">
              <input
                autoFocus autoComplete="off" required
                value={createRoomNameInput}
                onChange={(e) => setCreateRoomNameInput(e.target.value)}
                placeholder={t('dashboard.chat_layout.room_name_placeholder')}
                className={`w-full rounded-2xl border ${T.border} ${T.elevated} px-4 py-3 ${T.text} outline-none transition-colors duration-150 focus:border-[#14B8A6]/40`}
              />
              <button
                disabled={creatingRoom} type="submit"
                className={`w-full rounded-2xl ${T.accentBg} ${T.accentBgHover} py-3 text-sm font-semibold text-[#0B0C11] disabled:opacity-50 transition-colors duration-150`}
              >
                {creatingRoom ? t('dashboard.chat_layout.creating_room') : t('dashboard.chat_layout.create_room_button')}
              </button>
            </form>
          </SlideOver>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showJoinPanel && (
          <SlideOver title={t('dashboard.chat_layout.join_with_id_title')} subtitle={t('dashboard.chat_layout.join_with_id_subtitle')} onClose={() => setShowJoinPanel(false)}>
            <form onSubmit={submitJoinRoom} className="space-y-4">
              <input
                autoFocus autoComplete="off" required
                value={joinIdInput}
                onChange={(e) => setJoinIdInput(e.target.value)}
                placeholder={t('dashboard.chat_layout.room_id_placeholder')}
                className={`w-full rounded-2xl border ${T.border} ${T.elevated} px-4 py-3 ${T.text} outline-none transition-colors duration-150 focus:border-[#14B8A6]/40`}
              />
              <input
                type="password" autoComplete="current-password"
                value={joinPwdInput}
                onChange={(e) => setJoinPwdInput(e.target.value)}
                placeholder={t('dashboard.chat_layout.password_if_required_placeholder')}
                className={`w-full rounded-2xl border ${T.border} ${T.elevated} px-4 py-3 ${T.text} outline-none transition-colors duration-150 focus:border-[#14B8A6]/40`}
              />
              <button
                disabled={joiningRoom} type="submit"
                className={`w-full rounded-2xl ${T.accentBg} ${T.accentBgHover} py-3 text-sm font-semibold text-[#0B0C11] disabled:opacity-50 transition-colors duration-150`}
              >
                {joiningRoom ? t('dashboard.chat_layout.joining_room') : t('dashboard.chat_layout.enter_room_button')}
              </button>
            </form>
          </SlideOver>
        )}

      {showReportModal && callTargetUser && (
        <ReportUserModal
          targetUserId={callTargetUser.id}
          roomId={currentRoom?.id}
          authToken={authToken}
          onClose={() => setShowReportModal(false)}
          showToast={showToast}
        />
      )}

      {showBlockConfirm && callTargetUser && (
        <BlockConfirmSheet
          username={callTargetUser.username}
          onConfirm={confirmBlockUser}
          onCancel={() => setShowBlockConfirm(false)}
        />
      )}

      {/* [palacan-l4c5] questo dispositivo aspetta l'approvazione: si dice subito, con il codice di confronto */}
      <AvvisoDispositivoDaApprovare onApri={() => setShowDeviceManagementPanel(true)} />

      {showDeviceManagementPanel && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowDeviceManagementPanel(false); }}
        >
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl dark:bg-neutral-900">
            <button
              type="button"
              onClick={() => setShowDeviceManagementPanel(false)}
              className="mb-2 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              {t('dashboard.common.close')}
            </button>
            <DeviceManagementPanel token={authToken} />
          </div>
        </div>
      )}

      {showBlockedUsersPanel && (
        <BlockedUsersPanel
          authToken={authToken}
          onClose={() => setShowBlockedUsersPanel(false)}
          onUnblocked={(uid) => setBlockedUserIds((prev) => {
            const next = new Set(prev);
            next.delete(uid);
            return next;
          })}
          showToast={showToast}
        />
      )}
      {showContactsListPanel && (
        <ContactsListPanel
          authToken={authToken}
          onClose={() => setShowContactsListPanel(false)}
          showToast={showToast}
        />
      )}
      </AnimatePresence>

      <AnimatePresence>
        {showPasswordSheet && pendingRoom && (
          <BottomSheet title={t('dashboard.chat_layout.protected_room_title')} subtitle={t('dashboard.chat_layout.protected_room_subtitle')} onClose={() => setShowPasswordSheet(false)}>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await onSelectChat(pendingRoom, sheetPasswordInput);
                  setShowPasswordSheet(false);
                  setPendingRoom(null);
                  setSheetPasswordInput('');
                } catch (err) {
                  showToast(err?.message || 'Password errata', 'error');
                }
              }}
              className="space-y-4"
            >
              <input
                autoComplete="current-password" type="password" autoFocus
                value={sheetPasswordInput}
                onChange={(e) => setSheetPasswordInput(e.target.value)}
                placeholder={t('dashboard.chat_layout.room_password_placeholder')}
                className={`w-full rounded-2xl border ${T.border} ${T.elevated} px-4 py-3 ${T.text} outline-none transition-colors duration-150 focus:border-[#14B8A6]/40`}
              />
              <button type="submit" className={`w-full rounded-2xl ${T.accentBg} ${T.accentBgHover} py-3 text-sm font-semibold text-[#0B0C11] transition-colors duration-150`}>
                {t('dashboard.chat_layout.unlock_room_button')}
              </button>
              <button
                type="button"
                onClick={() => { setShowPasswordSheet(false); setPendingRoom(null); setSheetPasswordInput(''); }}
                className={`w-full py-2 text-xs font-medium ${T.textFaint} hover:${T.text} transition-colors duration-150`}
              >
                {t('dashboard.chat_layout.cancel_selection')}
              </button>
            </form>
          </BottomSheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInfoPanel && currentRoom?.id && (
          <ConversationInfoPanel
            room={currentRoom}
            authToken={authToken}
            currentUsername={currentUsername}
            onClose={() => setShowInfoPanel(false)}
            onAddFriend={isCurrentRoomDirect ? undefined : () => { setShowInfoPanel(false); setShowAddFriendPanel(true); }}
            onRename={() => { setShowInfoPanel(false); setShowRenamePanel(true); }}
            onLeave={handleLeaveRoom}
            showToast={showToast}
          />
        )}
        {showAutoDeletePanel && currentRoom?.id && !isEnterprise && (
          <AutoDeleteSettingsPanel
            room={currentRoom}
            onClose={() => setShowAutoDeletePanel(false)}
            onSelect={handleSetAutoDelete}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTaskPanel && currentRoom?.id && (
          <TaskPanel
            tasks={tasks}
            tasksLoading={tasksLoading}
            onClose={() => setShowTaskPanel(false)}
            onCreateTask={handleTaskCreate}
            onToggleStatus={handleTaskToggle}
            onDeleteTask={handleTaskDelete}
            showToast={showToast}
            room={currentRoom}
            authToken={authToken}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRenamePanel && currentRoom?.id && (
          <RenamePanel
            room={currentRoom}
            authToken={authToken}
            onClose={() => setShowRenamePanel(false)}
            onSuccess={() => {}}
            showToast={showToast}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInvitePanel && (
          <InvitePanel
            onClose={closeInvitePanel}
            creatingInvite={creatingInvite}
            generatedInviteLink={generatedInviteLink}
            inviteLinkCreateError={inviteLinkCreateError}
            onCopy={handleCopyInviteLink}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddFriendPanel && currentRoom?.id && (
          <AddFriendPanel
            roomId={currentRoom.id}
            roomName={nomeVisibileStanza(currentRoom, currentUsername)}
            onClose={() => setShowAddFriendPanel(false)}
            onSearch={handleSearchOwnContacts}
            onInvite={onInviteUserToRoom}
            showToast={showToast}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInvitesPanel && (
          <IncomingInvitesPanel
            invites={pendingInvites}
            onClose={() => setShowInvitesPanel(false)}
            onAccept={onAcceptInvite}
            onReject={onRejectInvite}
            showToast={showToast}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showContactRequestsPanel && (
          <IncomingContactRequestsPanel
            requests={pendingContactRequests}
            onClose={() => setShowContactRequestsPanel(false)}
            onSearch={onSearchContacts}
            onSendRequest={handleSendContactRequest}
            onAccept={handleAcceptContactRequest}
            onReject={handleRejectContactRequest}
            showToast={showToast}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRosterPanel && currentRoom?.id && (
          <RosterPanel
            room={currentRoom}
            authToken={authToken}
            currentUsername={currentUsername}
            onClose={() => setShowRosterPanel(false)}
            onStartDirectChat={onStartDirectChat}
            showToast={showToast}
          />
        )}
      </AnimatePresence>

      <StatusToast toast={toast} />
    </div>
  );
};

function useRealViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    const setHeight = () => {
      const h = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    };
    setHeight();
    if (vv) {
      vv.addEventListener('resize', setHeight);
      vv.addEventListener('scroll', setHeight);
    } else {
      window.addEventListener('resize', setHeight);
    }
    return () => {
      if (vv) {
        vv.removeEventListener('resize', setHeight);
        vv.removeEventListener('scroll', setHeight);
      } else {
        window.removeEventListener('resize', setHeight);
      }
    };
  }, []);
}
export default function Dashboard({
  authToken, currentUsername, currentUserRole, currentWorkspaceId, currentWorkspaceName, currentUserId,
  recentRooms, currentRoom, messages, messagesLoading,
  onSelectChat, onCreateRoom, onJoinRoom, onSendMessage, onDeleteMessage, onHideMessageForMe, onLogout,
  onLeaveRoom, onBack,
  sidebarOpen, setSidebarOpen,
  setRecentRooms, persistRooms,
  peerSessions, olmAccount,
  onCreateInviteLink, generatedInviteLink, inviteLinkCreateError, onClearGeneratedInviteLink,
  contactLiveEvent,
  sendRejectedEvent,
  onCreateTask,
  decryptTaskList,
  encryptReaction,
  decryptReaction,
  reactionLiveEvent,
  wsReconnectCount,
  callManager,
  loadCallHistory,
}) {
  // Tema Palacan: attivo solo mentre la Dashboard e' aperta (vedi src/styles/palacan-tema.css).
  useEffect(() => {
    document.documentElement.classList.add('palacan-app');
    return () => document.documentElement.classList.remove('palacan-app');
  }, []);
  const { t } = useTranslation();
  const isEnterprise = currentWorkspaceId !== null && currentWorkspaceId !== undefined;
  const isAdmin = currentUserRole === 'admin';
  const isEmployee = currentUserRole === 'employee';

  /* ── nuovo (schermata "Chiamate" dedicata): stato apertura/chiusura,
     stesso schema di showAdminApp qui sotto. ─────────────────────────── */
  const [showCallsScreen, setShowCallsScreen] = useState(false);

  const [showAdminApp, setShowAdminApp] = useState(() => {
    try {
      return currentUsername
        ? localStorage.getItem(getAdminPanelOpenKey(currentUsername)) === '1'
        : false;
    } catch (_) {
      return false;
    }
  });

  useEffect(() => {
    if (!currentUsername) return;
    try {
      if (showAdminApp) {
        localStorage.setItem(getAdminPanelOpenKey(currentUsername), '1');
      } else {
        localStorage.removeItem(getAdminPanelOpenKey(currentUsername));
      }
    } catch (_) {}
  }, [showAdminApp, currentUsername]);

  const [employees, setEmployees] = useState([]);
  const [adminTab, setAdminTab] = useState('rooms');
  const [newEmpUser, setNewEmpUser] = useState('');
  const [newEmpPass, setNewEmpPass] = useState('');
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [roomNameInput, setRoomNameInput] = useState('');
  const [roomPwdInput, setRoomPwdInput] = useState('');

  const [selectedEmpRoomIds, setSelectedEmpRoomIds] = useState([]);

  const handleToggleEmpRoomSelection = useCallback((roomId) => {
    const id = normalizeRoomId(roomId);
    if (!id) return;
    setSelectedEmpRoomIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const [pendingInvites, setPendingInvites] = useState([]);

  const refreshInvites = useCallback(async () => {
    if (!authToken) return;
    try {
      const invites = await apiService.getRoomInvites(authToken);
      setPendingInvites(await apriNomiInviti(Array.isArray(invites) ? invites : []));  // [palacan-metadati-a3.2b2]
    } catch (e) {
      console.error('Errore refresh inviti stanza:', e);
    }
  }, [authToken]);

  useEffect(() => {
    refreshInvites();
  }, [refreshInvites]);
  const [pendingContactRequests, setPendingContactRequests] = useState([]);
  const [showContactRequestsPanel, setShowContactRequestsPanel] = useState(false);
  const refreshContactRequests = useCallback(async () => {
    if (!authToken) return;
    try {
      const requests = await apiService.getIncomingContactRequests(authToken);
      setPendingContactRequests(Array.isArray(requests) ? requests : []);
    } catch (e) {
      console.error('Errore refresh richieste di contatto:', e);
    }
  }, [authToken]);
  useEffect(() => {
    refreshContactRequests();
  }, [refreshContactRequests]);
  const handleAcceptContactRequest = useCallback(async (request) => {
    await apiService.acceptContactRequest(request.sender_username, authToken);
    setPendingContactRequests((prev) => prev.filter((r) => r.id !== request.id));
    await refreshRooms();
    // [palacan-pannelli-chiusura] si apre subito la chat con la persona appena accettata (la crea il server all'accettazione)
    try {
      const stanze = await apiService.getRooms(authToken);
      const diretta = (Array.isArray(stanze) ? stanze : []).find((x) => x?.room_kind === 'direct' && (x?.participant_usernames || x?.participantUsernames || []).includes(request.sender_username));
      if (diretta && typeof onSelectChat === 'function') await onSelectChat(diretta);
    } catch (_) { /* la chat resta comunque nell'elenco */ }
  }, [authToken]);
  const handleRejectContactRequest = useCallback(async (request) => {
    await apiService.rejectContactRequest(request.sender_username, authToken);
    setPendingContactRequests((prev) => prev.filter((r) => r.id !== request.id));
  }, [authToken]);

  const refreshRooms = useCallback(async () => {
    if (!authToken) return;
    try {
      const updated = await apiService.getRooms(authToken);
      const safe = Array.isArray(updated) ? updated : [];
      if (typeof setRecentRooms === 'function') setRecentRooms(safe);
      if (typeof persistRooms === 'function' && currentUsername) persistRooms(currentUsername, safe);
    } catch (e) { console.error('Errore refresh rooms:', e); }
  }, [authToken, setRecentRooms, persistRooms, currentUsername]);

  // [palacan-correzioni-prove] un nome di gruppo imparato (rinomina, chiave di stanza, stato del gruppo): elenco e intestazione subito
  const [, setVersioneNomi] = useState(0);
  useEffect(() => {
    const aggiornaNomi = () => { setVersioneNomi((v) => v + 1); refreshRooms(); };
    window.addEventListener('palacan:stanze-cambiate', aggiornaNomi);
    return () => window.removeEventListener('palacan:stanze-cambiate', aggiornaNomi);
  }, [refreshRooms]);

  useEffect(() => {
    if (!contactLiveEvent) return;
    const type = contactLiveEvent.type;

    if (
      type === 'room_invite_received' ||
      type === 'room_invite_accepted' ||
      type === 'room_invite_rejected'
    ) {
      refreshInvites();
    }

    if (type === 'room_invite_accepted') {
      refreshRooms();
    }
    if (type === 'friend_request') {
      refreshContactRequests();
    }
    if (type === 'direct_room_created') {
      refreshRooms();
    }
  }, [contactLiveEvent, refreshInvites, refreshRooms, refreshContactRequests]);

  const handleSearchContacts = useCallback(
    async (query) => {
      if (!authToken) return [];
      return apiService.searchContacts(query, authToken);
    },
    [authToken]
  );

  const handleInviteUserToRoom = useCallback(
    async (roomId, username) => {
      if (!authToken) throw new Error(t('dashboard.wrapper.not_authenticated'));
      return invitaConNome(roomId, username, authToken);  // [palacan-metadati-a3.2b2] nome sigillato per l'invitato
    },
    [authToken]
  );

  const handleAcceptInvite = useCallback(
    async (invite) => {
      if (!authToken || !invite?.id) return;

      await apiService.acceptRoomInvite(invite.id, authToken);
      setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));

      try {
        const updated = await apiService.getRooms(authToken);
        const safe = Array.isArray(updated) ? updated : [];
        if (typeof setRecentRooms === 'function') setRecentRooms(safe);
        if (typeof persistRooms === 'function' && currentUsername) persistRooms(currentUsername, safe);

        const targetRoomId = invite.room_id || invite.roomId;
        const room = safe.find((r) => String(r?.id ?? '') === String(targetRoomId ?? ''));
        if (room && typeof onSelectChat === 'function') {
          await onSelectChat(room);
        }
      } catch (e) {
        console.error('Errore apertura stanza dopo accettazione invito:', e);
      }
    },
    [authToken, currentUsername, setRecentRooms, persistRooms, onSelectChat]
  );

  const handleRejectInvite = useCallback(
    async (invite) => {
      if (!authToken || !invite?.id) return;
      try {
        await apiService.rejectRoomInvite(invite.id, authToken);
      } finally {
        setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
      }
    },
    [authToken]
  );

  const safeRooms = Array.isArray(recentRooms) ? recentRooms : [];
  const corporateRooms = useMemo(
    () => safeRooms.filter((r) => r?.is_corporate === true && r?.room_kind !== 'direct').slice(0, 12),
    [safeRooms]
  );

  useEffect(() => {
    if (!authToken || !currentWorkspaceId || !isAdmin) return;
    const load = async () => {
      try {
        const data = await apiService.getWorkspaceColleagues(authToken);
        setEmployees(Array.isArray(data) ? data : []);
      } catch (e) { console.error('Errore colleghi:', e); }
    };
    load();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 120000);  // [palacan-metadati-a1]
    return () => window.clearInterval(interval);
  }, [authToken, currentWorkspaceId, isAdmin]);

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    if (!newEmpUser.trim() || !newEmpPass.trim()) return;
    setLoadingAdmin(true);
    const tempUsername = `${newEmpUser.trim()}_temp`;
    let tempAccount = null;
    try {
      tempAccount = olmService.createOlmAccount(tempUsername);
      const idKeys = olmService.getIdentityKeys(tempAccount);
      const regId = Math.floor(Math.random() * 1000000) + 1;
      await apiService.createEmployee(
        newEmpUser.trim(),
        newEmpPass,
        idKeys?.curve25519,
        regId,
        authToken,
        selectedEmpRoomIds
      );
      setNewEmpUser(''); setNewEmpPass('');
      setSelectedEmpRoomIds([]);
      const data = await apiService.getWorkspaceColleagues(authToken);
      setEmployees(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Errore creazione dipendente:', err);
    } finally {
      try { tempAccount?.free?.(); } catch {}
      localStorage.removeItem(`olm_account_${tempUsername}`);
      setLoadingAdmin(false);
    }
  };

  const handleCreateCorporateRoom = async (e) => {
    e.preventDefault();
    if (!roomNameInput.trim()) return;
    try {
      // Punto di creazione dedicato admin: unico posto che chiede
      // as_department=true. Il server lo onora solo se davvero admin/owner
      // (validato in routes/rooms.py), mai fidandosi ciecamente di questo flag.
      await onCreateRoom(roomNameInput.trim(), roomPwdInput || '', true);
      setRoomNameInput(''); setRoomPwdInput('');
      await refreshRooms();
    } catch (e) { console.error('Errore create corporate room:', e); }
  };

  const adminPanelForAdmin = isAdmin && isEnterprise ? (
    <WorkspaceAdminPanel
      adminTab={adminTab} setAdminTab={setAdminTab}
      corporateRooms={corporateRooms} employees={employees}
      handleRoomClick={onSelectChat}
      handleCreateCorporateRoom={handleCreateCorporateRoom}
      handleCreateEmployee={handleCreateEmployee}
      roomNameInput={roomNameInput} setRoomNameInput={setRoomNameInput}
      roomPwdInput={roomPwdInput} setRoomPwdInput={setRoomPwdInput}
      newEmpUser={newEmpUser} setNewEmpUser={setNewEmpUser}
      newEmpPass={newEmpPass} setNewEmpPass={setNewEmpPass}
      loadingAdmin={loadingAdmin}
      selectedRoomIds={selectedEmpRoomIds}
      onToggleRoomSelection={handleToggleEmpRoomSelection}
    />
  ) : null;

  const adminPanelForEmployee = isEmployee && isEnterprise ? (
    <section className={`hidden h-full min-w-[280px] max-w-[320px] border-l ${T.border} ${T.bg} xl:flex xl:flex-col`}>
      <div className={`border-b ${T.borderSoft} px-4 py-4`}>
        <h3 className={`flex items-center gap-2 text-sm font-medium ${T.text}`}>
          <Building2 size={15} className={T.textMuted} />
          {t('dashboard.wrapper.workspace_label')}
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1.5">
          {corporateRooms.length > 0 ? (
            corporateRooms.map((room) => (
              <button
                key={String(room?.id || room?.name)}
                type="button" onClick={() => onSelectChat(room)}
                className={`w-full rounded-2xl border ${T.borderSoft} ${T.surface} p-3.5 text-left transition-colors duration-150 hover:bg-white/[0.03]`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${T.elevated} ${T.textMuted}`}>
                    <Building2 size={15} />
                  </div>
                  <p className={`truncate text-sm font-medium ${T.text}`}>{nomeVisibileStanza(room, null) || t('dashboard.wrapper.default_room_name')}</p>
                </div>
              </button>
            ))
          ) : (
            <div className={`rounded-2xl border border-dashed ${T.borderSoft} p-5 text-sm ${T.textFaint}`}>
              {t('dashboard.wrapper.no_workspace_conversations')}
            </div>
          )}
        </div>
      </div>
    </section>
  ) : null;

  return (
    <>
      <CallOverlay callManager={callManager} />
      <CallHistoryScreen
        open={showCallsScreen}
        onClose={() => setShowCallsScreen(false)}
        loadCallHistory={loadCallHistory}
      />
      <ChatLayout
        olmAccount={olmAccount} // [palacan-sicurezza]
        authToken={authToken}
        callManager={callManager}
        currentUsername={currentUsername}
        currentUserRole={currentUserRole}
        currentWorkspaceId={currentWorkspaceId}
        currentWorkspaceName={currentWorkspaceName}
        currentUserId={currentUserId}
        recentRooms={recentRooms}
        currentRoom={currentRoom}
        messages={messages}
        messagesLoading={messagesLoading}
        onSelectChat={onSelectChat}
        onCreateRoom={onCreateRoom}
        onJoinRoom={onJoinRoom}
        onSendMessage={onSendMessage}
        onDeleteMessage={onDeleteMessage}
        onHideMessageForMe={onHideMessageForMe}
        onLogout={onLogout}
        onLeaveRoom={onLeaveRoom}
        onBack={onBack}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        isEnterprise={isEnterprise}
        isAdmin={isAdmin}
        adminPanel={adminPanelForAdmin || adminPanelForEmployee}
        onOpenAdminApp={() => setShowAdminApp(true)}
        onOpenCallHistory={() => setShowCallsScreen(true)}
        onCreateInviteLink={onCreateInviteLink}
        generatedInviteLink={generatedInviteLink}
        inviteLinkCreateError={inviteLinkCreateError}
        onClearGeneratedInviteLink={onClearGeneratedInviteLink}
        contactLiveEvent={contactLiveEvent}
        sendRejectedEvent={sendRejectedEvent}
        pendingInvites={pendingInvites}
        onAcceptInvite={handleAcceptInvite}
        pendingContactRequests={pendingContactRequests}
        showContactRequestsPanel={showContactRequestsPanel}
        setShowContactRequestsPanel={setShowContactRequestsPanel}
        handleAcceptContactRequest={handleAcceptContactRequest}
        handleRejectContactRequest={handleRejectContactRequest}
        onRejectInvite={handleRejectInvite}
        onSearchContacts={handleSearchContacts}
        onInviteUserToRoom={handleInviteUserToRoom}
        onCreateTask={onCreateTask}
        decryptTaskList={decryptTaskList}
        refreshRooms={refreshRooms}
        encryptReaction={encryptReaction}
        decryptReaction={decryptReaction}
        reactionLiveEvent={reactionLiveEvent}
        wsReconnectCount={wsReconnectCount}
      />
      {showAdminApp && (
        <AdminApp
          authToken={authToken}
          currentUsername={currentUsername}
          onClose={() => setShowAdminApp(false)}
        />
      )}
    </>
  );
}
