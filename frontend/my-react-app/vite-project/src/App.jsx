/**
 * App.jsx — CipherTalk v1.12-C
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  REGOLA FONDAMENTALE:                                            ║
 * ║  Tutto il codice tra la riga "CRYPTO LAYER START" e             ║
 * ║  "CRYPTO LAYER END" è INTOCCABILE.                              ║
 * ║  Non modificare: initializeCryptoForUser, checkKeysHealth,      ║
 * ║  ensureRoomKeyShared, handleToDeviceEvent, olmService.*,        ║
 * ║  withAccountLock, peerSessionsRef, inboundGroupSessionsRef.     ║
 * ║                                                                  ║
 * ║  ECCEZIONE MIRATA v1.9-Q (vedi punto Q sotto): dentro           ║
 * ║  handleToDeviceEvent sono state aggiunte 8 righe, SOLO dopo     ║
 * ║  `inboundGroupSessionsRef.current = inboundMap;` (cioè dopo che ║
 * ║  la room key è già stata decifrata e salvata in locale), per    ║
 * ║  inviare un ack applicativo al server. Nessuna logica Olm/      ║
 * ║  Megolm esistente è stata toccata, spostata o riordinata.       ║
 * ║                                                                  ║
 * ║  ECCEZIONE MIRATA v1.10-V (vedi punto V sotto): SUBITO DOPO     ║
 * ║  il blocco v1.9-Q sopra (stesso punto esatto: dopo che la room  ║
 * ║  key è già salvata in locale), è stata aggiunta UNA sola riga   ║
 * ║  che invoca forceBackupUploadRef.current?.() — un ref popolato  ║
 * ║  fuori dal layer crypto — per forzare un upload immediato del   ║
 * ║  backup invece di aspettare il debounce di 30s. Nessuna logica  ║
 * ║  Olm/Megolm esistente toccata, spostata o riordinata.           ║
 * ║                                                                  ║
 * ║  ECCEZIONE MIRATA v1.10-X (vedi punto X sotto): dentro          ║
 * ║  fetchHistory, SOLO l'ultima chiamata setMessages(...) è stata  ║
 * ║  cambiata da forma non-funzionale a forma funzionale (accesso a ║
 * ║  prevMessages) per preservare messaggi ottimistici propri non   ║
 * ║  ancora confermati dal server. Nessun'altra riga di fetchHistory ║
 * ║  (fetch, decrittazione, ordinamento) è stata toccata.           ║
 * ║                                                                  ║
 * ║  ECCEZIONE MIRATA v1.10-Y (vedi punto Y sotto): dentro          ║
 * ║  fetchHistory, SOLO nel ramo messaggi propri ("v1.7-H2") è      ║
 * ║  stato aggiunto il campo client_msg_id all'oggetto push()ato, e ║
 * ║  la setMessages finale (v1.10-X) ora scarta un ottimistico      ║
 * ║  "pending" il cui id coincide con un client_msg_id già presente ║
 * ║  tra i messaggi "self" appena ricostruiti dal server. Nessuna   ║
 * ║  altra riga di fetchHistory toccata.                            ║
 * ║                                                                  ║
 * ║  ECCEZIONE MIRATA v1.11-AB (vedi punto AB sotto): DUE aggiunte, ║
 * ║  entrambe non bloccanti e avvolte in try/catch, senza toccare   ║
 * ║  o riordinare nessuna riga preesistente:                       ║
 * ║  (1) dentro handleToDeviceEvent, nel catch finale, se           ║
 * ║      l'errore è OTK_MISMATCH/BAD_MESSAGE_KEY_ID viene liberata  ║
 * ║      la sessione 1:1 stale verso il mittente e trasmesso un     ║
 * ║      sendSessionReset per la stanza (ricavata dall'envelope     ║
 * ║      data.room_id/roomId, sempre presente a prescindere dal     ║
 * ║      successo della decrittazione);                             ║
 * ║  (2) dentro handleWsMessage, nel ramo session_reset già         ║
 * ║      esistente (fix T), dopo la pulizia sessione viene ora      ║
 * ║      azzerato anche il flag "già condivisa" per quella stanza/  ║
 * ║      peer e richiamato ensureRoomKeyShared, per un re-invio     ║
 * ║      automatico della room key.                                 ║
 * ║                                                                  ║
 * ║  ECCEZIONE MIRATA v1.11-AE (vedi punto AE sotto): dentro        ║
 * ║  handleWsMessage è stato aggiunto un nuovo ramo, PRIMA del      ║
 * ║  controllo finale `if (messageType !== 'message') return;`,    ║
 * ║  che riconosce messageType === 'send_rejected' (evento emesso   ║
 * ║  dal server quando un mittente mutato prova a scrivere, vedi   ║
 * ║  main.py) e marca il messaggio ottimistico corrispondente con  ║
 * ║  `failed: true` invece di lasciarlo sparire silenziosamente.   ║
 * ║  Nessun dato crittografico coinvolto, nessuna riga preesistente ║
 * ║  toccata o riordinata: solo aggiunta in coda ai rami già        ║
 * ║  presenti (session_reset, system_join, ecc).                    ║
 * ║                                                                  ║
 * ║  ECCEZIONE MIRATA v1.13-D (vedi punto D sotto): dentro          ║
 * ║  ensureRoomKeyShared, roomKeySharedWithRef segnava "condivisa"   ║
 * ║  una room key SUBITO dopo aver chiamato sendToDevice, senza      ║
 * ║  nessuna conferma reale di consegna - se il primo invio si       ║
 * ║  perdeva per strada (connessione instabile del mittente in       ║
 * ║  quel momento), il codice non riprovava MAI PIU' per quella      ║
 * ║  sessione, lasciando il destinatario bloccato per sempre finche' ║
 * ║  il MITTENTE non ricaricava la pagina (che azzera il ref) -      ║
 * ║  osservato in produzione stasera, sintomo diverso e complementare║
 * ║  a v1.13-B (li' il problema era ordine di elaborazione lato      ║
 * ║  destinatario, qui e' mancata conferma lato mittente). Il valore ║
 * ║  salvato ora e' {sessionId, sharedAt} invece del solo sessionId, ║
 * ║  e "alreadyShared" richiede anche che siano passati meno di 20s  ║
 * ║  dall'ultimo tentativo - oltre quella soglia si riprova (mandare ║
 * ║  di nuovo la stessa chiave a chi ce l'ha gia' non fa danno).     ║
 * ║  Nessuna altra riga della funzione toccata.                      ║
 * ║                                                                  ║
 * ║  ECCEZIONE MIRATA v1.13-B (vedi punto B sotto): risolve una      ║
 * ║  corsa reale tra fetchHistory (storico, al primo apertura stanza)║
 * ║  e i messaggi room_encrypted ricevuti IN DIRETTA via WebSocket   ║
 * ║  mentre fetchHistory sta ancora processando: se un messaggio     ║
 * ║  live piu' recente veniva decifrato PRIMA che fetchHistory        ║
 * ║  arrivasse a un messaggio piu' vecchio della stessa sessione, il  ║
 * ║  ratchet Megolm avanzava e il messaggio vecchio diventava         ║
 * ║  indecifrabile per sempre (UNKNOWN_MESSAGE_INDEX, v1.11-AD) -     ║
 * ║  osservato in produzione sui primissimi messaggi tra due account  ║
 * ║  nuovi. Due nuovi ref fuori dal layer crypto (historyLoadIn-      ║
 * ║  ProgressRef, liveMessagesDuringHistoryRef). In fetchHistory:     ║
 * ║  settato a true appena dentro il try esistente, a false dentro    ║
 * ║  un NUOVO blocco finally (il try/catch esisteva gia', solo        ║
 * ║  aggiunto un finally), che poi ritenta in ordine ogni messaggio   ║
 * ║  live arrivato nel frattempo. Nel ramo room_encrypted del         ║
 * ║  dispatcher WS: se il flag e' true, il messaggio viene messo in   ║
 * ║  coda invece di essere decifrato subito. Nessuna riga             ║
 * ║  preesistente toccata in nessuna delle due funzioni, solo         ║
 * ║  aggiunte nei punti indicati.                                     ║
 * ║                                                                  ║
 * ║  ECCEZIONE MIRATA v1.13-A (vedi punto A sotto): dentro          ║
 * ║  decryptMegolmRoomMessage, nel ramo "nessuna inbound session",  ║
 * ║  il bufferizzamento per session_id (introdotto da v1.12-C, vedi ║
 * ║  sotto) ora avviene SEMPRE, non solo per i messaggi live         ║
 * ║  (append===true). Prima i messaggi dello STORICO (fetchHistory,  ║
 * ║  append=false) che fallivano la decrittazione venivano scartati  ║
 * ║  senza alcun tentativo successivo, richiedendo un ricaricamento  ║
 * ║  manuale della pagina per essere recuperati. La sola modifica:   ║
 * ║  rimossa la condizione `if (append) { ... }` che avvolgeva il    ║
 * ║  bufferizzamento — il corpo interno è IDENTICO, zero righe       ║
 * ║  toccate al suo interno. Il retry in handleToDeviceEvent (v1.12- ║
 * ║  C, invariato) già chiama sempre con append:true, quindi un      ║
 * ║  messaggio storico recuperato appare correttamente in chat non   ║
 * ║  appena la chiave arriva, senza bisogno di ricaricare.           ║
 * ║                                                                  ║
 * ║  ECCEZIONE MIRATA v1.12-C (vedi punto C sotto): due aggiunte    ║
 * ║  legate tra loro, per risolvere la race "messaggio cifrato      ║
 * ║  arriva prima della room key" (canale WebSocket stanza più      ║
 * ║  veloce del canale to-device): (1) dentro                      ║
 * ║  decryptMegolmRoomMessage, nel ramo "nessuna inbound session",  ║
 * ║  i messaggi LIVE (append=true) vengono ora bufferizzati per     ║
 * ║  session_id in pendingEncryptedMessagesRef (nuovo ref, fuori    ║
 * ║  dal layer crypto) invece di essere scartati con un semplice    ║
 * ║  return null; (2) dentro handleToDeviceEvent, SUBITO DOPO       ║
 * ║  `inboundGroupSessionsRef.current = inboundMap;` (stesso punto  ║
 * ║  esatto delle eccezioni v1.9-Q/v1.10-V sopra) e PRIMA di esse,  ║
 * ║  il buffer per quel session_id viene svuotato e ogni messaggio  ║
 * ║  in coda viene ritentato chiamando decryptMegolmRoomMessage.    ║
 * ║  Nessuna riga preesistente toccata o riordinata in nessuna      ║
 * ║  delle due funzioni, solo aggiunte nei punti indicati. Lo       ║
 * ║  storico (fetchHistory, append=false) non è coinvolto: si       ║
 * ║  autocorregge già da solo al giro successivo, come da           ║
 * ║  comportamento preesistente.                                    ║
 * ║                                                                  ║
 * ║  ECCEZIONE MIRATA v1.14-A (documentata a POSTERIORI - modifica  ║
 * ║  fatta prima di conoscere questa regola, corretto appena         ║
 * ║  scoperto): dentro ensureRoomKeyShared, nel ciclo `for (const    ║
 * ║  peer of peers)`, la singola chiamata a                          ║
 * ║  olmService.encryptRoomKeyForDevice + singolo sendToDevice è      ║
 * ║  stata sostituita da olmService.encryptRoomKeyForAllDevices        ║
 * ║  (funzione NUOVA, non tocca encryptRoomKeyForDevice) + un ciclo    ║
 * ║  interno che manda un sendToDevice per ogni dispositivo attivo    ║
 * ║  del destinatario (Fase 3 multi-device). Se il destinatario non    ║
 * ║  ha ancora nessun dispositivo registrato (praticamente tutti i     ║
 * ║  peer oggi), encryptRoomKeyForAllDevices ricade internamente sul    ║
 * ║  comportamento vecchio identico tramite encryptRoomKeyForDevice     ║
 * ║  invariata - testato con esecuzione Node reale su entrambi gli      ║
 * ║  scenari (fallback e multi-dispositivo) prima di collegarlo qui.     ║
 * ║  Nessuna altra riga della funzione toccata; roomKeySharedWithRef      ║
 * ║  resta per peer non per dispositivo (limitazione nota, non un bug).   ║
 * ║                                                                  ║
 * ║  ECCEZIONE MIRATA v1.14-B: dentro handleToDeviceEvent, un nuovo   ║
 * ║  ramo `if (eventType === 'm.room_key_request' || eventType ===    ║
 * ║  'm.forwarded_room_key')` intercetta questi due tipi PRIMA del      ║
 * ║  controllo esistente `senderUsername === username → ignora`         ║
 * ║  (quel controllo resta invariato e continua ad applicarsi           ║
 * ║  esattamente come prima per m.room_key e ogni altro tipo). I due     ║
 * ║  nuovi tipi sono SEMPRE mandati a se stessi per costruzione            ║
 * ║  (recupero room key da un proprio altro dispositivo, mai tra           ║
 * ║  persone diverse - deliberatamente fuori scope, confine di               ║
 * ║  fiducia troppo delicato). Delegano a una funzione NUOVA e                ║
 * ║  separata, handleOwnDeviceKeyEvent (dichiarata subito sopra                ║
 * ║  handleToDeviceEvent), che verifica che il dispositivo richiedente          ║
 * ║  sia un dispositivo VERO, ATTIVO e proprio (via GET /keys/devices,            ║
 * ║  Fase 4) prima di inoltrare qualunque chiave. Zero righe               ║
 * ║  preesistenti di handleToDeviceEvent toccate o riordinate.                ║
 * ║                                                                  ║
 * ║  ECCEZIONE MIRATA v1.14-C: dentro decryptMegolmRoomMessage, nel   ║
 * ║  ramo "nessuna inbound session" (dopo il bufferizzamento v1.12-C/  ║
 * ║  v1.13-A, invariato), aggiunto un timer (ROOM_KEY_REQUEST_DELAY_MS, ║
 * ║  6s) che manda m.room_key_request ai propri altri dispositivi SOLO   ║
 * ║  se la sessione non e' arrivata nel frattempo per la via normale.      ║
 * ║  Un solo timer per session_id (tracker roomKeyRequestTimers, a          ║
 * ║  livello di modulo, sezione UTILITIES - non uno stato React, non un      ║
 * ║  ref). Testato con esecuzione Node reale: dedup su chiamate               ║
 * ║  ravvicinate, nessun invio se la chiave arriva in tempo, invio vero        ║
 * ║  se non arriva mai. Nessuna riga preesistente della funzione toccata        ║
 * ║  o riordinata, solo aggiunta dopo il return null; esistente.                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * ── NOTA DI MANUTENZIONE (fix applicato in questa revisione) ──────────
 * Durante un intervento di sicurezza (rimozione del campo room_key in
 * chiaro spedito in rete/DB dentro ensureRoomKeyShared, vedi audit E2EE)
 * la funzione decryptMegolmRoomMessage era stata persa per un errore di
 * copia-incolla: veniva ancora CHIAMATA da fetchHistory e da
 * handleWsMessage, ma la sua dichiarazione `const decryptMegolmRoomMessage
 * = useCallback(...)` non esisteva più nel file, causando
 * "ReferenceError: decryptMegolmRoomMessage is not defined" a runtime.
 * È stata reinserita qui sotto, subito dopo ensureRoomKeyShared e prima
 * di decryptIncomingLegacyMessage, con lo stesso corpo/firma già in uso
 * altrove nel file (nessuna logica cambiata, solo la dichiarazione
 * ripristinata). Il fix di sicurezza originale (rimozione del blocco
 * room_key: {...} non cifrato dentro sendToDevice, in ensureRoomKeyShared)
 * resta invariato e applicato.
 *
 * Tutto il resto (v1.1 → v1.12-A) invariato, zero righe toccate a parte
 * le aggiunte descritte sopra.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ThemeProvider, useTheme } from './contexts/ThemeContext.jsx';
import { Loader2, ShieldAlert } from 'lucide-react';

import * as apiService from './apiService';
import { useCallManager } from './callManager';
import { cifraSegnale as cifraSegnaleChiamata, apriSegnale as apriSegnaleChiamata, riceviConAttesa as riceviSegnaleChiamata, segnaleDaCifrare, inCoda as inCodaSegnaliChiamata, condividiUnaVolta as condividiChiaveUnaVoltaPerChiamata } from './utils/segnaliChiamata';  // [palacan-l4e]
import DebugLogOverlay from './debugLogOverlay';
import * as olmService from './olmService';
import { registraCreatore, mittenteVerificato, valutaChiave, trovaChiaveDellaStanza } from './utils/creatoriChiavi';  // [palacan-metadati-3.1] [palacan-metadati-3.4b]
import { programmaRichiestaMembri, segnaRichiesta, destinatariRichiesta, gestisciEventoChiaveMembro } from './utils/richiesteChiavi';  // [palacan-n5]
import { confermaAutoreFirmato, mettiInAttesaDiFirma, impostaFirmatario, impostaRitentativo } from './utils/firmaAutore';  // [palacan-n5e]
import { assicuraChiaviPq } from './utils/chiaviPq';  // [palacan-pq3]
import { assicuraFirmaPq, chiavePqFirma } from './utils/firmaPq';  // [palacan-pq5b]
import { assicuraChiavePrincipale, ripristinaChiavePrincipaleDaBackup, improntaPrincipale } from './utils/chiavePrincipale';  // [palacan-l4c2]
import { ammessoDaChiavePrincipale } from './utils/fiduciaContatti';  // [palacan-l4c3]
import { impostaScaricatorePqFirma } from './utils/firmaAutore';  // [palacan-pq5b]
import { oraMessaggio } from './utils/oraMessaggio';  // [palacan-metadati-3.4a]
import { impostaBloccati, messaggioDaBloccato } from './utils/bloccati';  // [palacan-metadati-3.4d-blocco]
import { applicaReazione } from './utils/reazioni';  // [palacan-metadati-3.6]
import { salvaStanza, leggiStanza, cancellaCronologia } from './utils/cronologiaLocale';  // [palacan-cronologia-locale]
import { dimenticaReazioni } from './utils/reazioni';  // [palacan-cronologia-locale]
import { esportaStanza, importaStanza } from './utils/reazioni';  // [palacan-cronologia-reazioni]
import { salvaDato, leggiDato } from './utils/cronologiaLocale';  // [palacan-cronologia-reazioni]
import { pubblicaBustaSeServe } from './utils/busta';  // [palacan-metadati-a2.1]
import { inviaChiaveDiStanza, apriBustaRicevuta, idOriginaleConferma } from './utils/busteSigillate';  // [palacan-metadati-a2.2]
import { impostaUtenteNomi, imparaNomeStanza, nomeDaCondividere, dimenticaNomi } from './utils/nomiStanze';  // [palacan-metadati-a3.1]
import { segretoDaCondividere, imparaSegretoStanza, impostaUtenteSegreti, dimenticaSegreti } from './utils/segretiStanze';  // [palacan-metadati-a4.1b]
import { puoSbloccare } from './utils/sbloccoSessioni';  // [palacan-correzione-sblocco-olm]
import { segretoDaRinnovare } from './utils/segretiStanze';  // [palacan-correzioni-prove]
import { impostaUtenteRecapito, pubblicaImprontaSeServe, recapitoDaCondividere, imparaRecapito, ricordaMembri, dimenticaRecapito } from './utils/recapito';  // [palacan-metadati-a4.4c]
import { recapitoDaRinnovare } from './utils/recapito';  // [palacan-metadati-a4.4c3]
import { gettoneInMemoria } from './utils/segretiStanze';  // [palacan-metadati-a4.4b]
import { esportaDatiPersonali, importaDatiPersonali } from './utils/datiPersonali';  // [palacan-metadati-a4.3a]
import { sincronizzaStatoGruppo, aggiornaNomeStatoGruppo, dimenticaStati } from './utils/statoGruppo';  // [palacan-metadati-a4.2b]
import { linkConNome, prendiNomeInvitoPendente } from './utils/linkInvito';  // [palacan-metadati-a3.2b1]
import { stanzaPrivata, daAttivare, segnaAttivato, inviaAnonimo, inviaAnonimoConTentativi, leggiSegreto, leggiUscita, mettiInUscita, togliDaUscita } from './utils/invioAnonimo';  // [palacan-metadati-3.4c] [palacan-metadati-3.4d-bis] [palacan-metadati-3.4d-ter]
import { canaleDi, ritentaVoce } from './utils/invioAnonimo';  // [palacan-cl2e] coda di uscita sul canale giusto, niente ripiego legacy
import {
  connect as connectWs,
  disconnect as disconnectWs,
  sendRoomEncrypted,
  sendToDevice,
  sendAck,
  sendSessionReset,
  reconnectNow,
  isConnected as isWsConnected,
} from './wsClient';
/* ── v1.11-AA: canale di presenza, fuori dal layer crypto (vedi punto AA
   nel changelog in cima al file). Import separato da wsClient.js: nessuna
   funzione di wsClient viene toccata da questa feature. ─────────────── */
import { connectPresence, disconnectPresence, isPresenceConnected } from './presenceClient';

import Dashboard from './pages/Dashboard';

import LandingPage from './components/LandingPage.jsx';
import UnifiedAuthCard from './components/UnifiedAuthCard.jsx';
import WorkspaceActivationWizard from './components/WorkspaceActivationWizard.jsx';
import BackupPinPrompt from './components/BackupPinPrompt.jsx';
import InviteLandingPage from './components/InviteLandingPage.jsx';
import i18n from './i18n';  // [palacan-accesso-automatico] messaggi del flusso di accesso tradotti
import InviteRedeemPrompt from './components/InviteRedeemPrompt.jsx';
/* ── v1.11-AC: schermata bloccante di cambio password obbligatorio, vedi
   punto AC nel changelog in cima al file. Importa a sua volta
   PasswordRequirementsChecklist.jsx come file fratello (nessun import
   diretto necessario qui). ───────────────────────────────────────────── */
import ForcedPasswordChangeScreen from './components/ForcedPasswordChangeScreen.jsx';
/* ── v1.12-B: pagine pubbliche di contenuto statico, vedi punto AG nel
   changelog in cima al file. Cartella fratella di admin/ e components/,
   nessuna chiamata API, nessuno stato complesso: solo testo dentro il
   layout condiviso PublicLayout.jsx (importato internamente da ciascuna
   di queste pagine, nessun import diretto necessario qui). ──────────── */
import AboutPage from './public/AboutPage.jsx';
// [palacan-v1b] il pannello personale non e' piu' nel sito: npm run pannello (solo sul PC del proprietario)
import EcosistemaPage from './public/EcosistemaPage.jsx';
import SecurityPage from './public/SecurityPage.jsx';
import PrivacyPage from './public/PrivacyPage.jsx';
import TermsPage from './public/TermsPage.jsx';
import TechnologyPage from './public/TechnologyPage.jsx';
import OpenSourcePage from './public/OpenSourcePage.jsx';
import FaqPage from './public/FaqPage.jsx';
import { getSecureItem, setSecureItem, removeSecureItem, migrateLegacyPlaintextKey } from './secureStorage';
import { ID_PROVVISORIO, nuovoIdProvvisorio } from './utils/idProvvisorio';  // [palacan-m1c]
import { preparaDatiLocali, leggiLocale, salvaLocale } from './utils/datiLocaliCifrati';  // [palacan-9a2]
import { ricordaChiaveBackup, chiaveBackupSalvata } from './utils/chiaveBackup';  // [palacan-n4]
import { caricaBackupUnito } from './utils/backupUnito';  // [palacan-n6] backup unito a quello del server

/* ══════════════════════════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════════════════════════ */

/* ── FIX (m.room_key_request, recupero chiave da un proprio altro
   dispositivo): traccia, per session_id, se una richiesta e' gia'
   stata programmata/mandata di recente - evita di spammare richieste
   ripetute se lo stesso session_id compare in piu' messaggi bufferizzati
   ravvicinati. Variabile a livello di MODULO (non uno stato React, non
   un ref) - persiste per tutta la sessione della scheda, azzerata solo
   con un ricaricamento completo della pagina; nessun hook necessario,
   nessuna dichiarazione di useRef da trovare/toccare altrove nel file. */
const roomKeyRequestTimers = {};
const ROOM_KEY_REQUEST_DELAY_MS = 6000;

export const getStoredValue = (key) => {
  const val = localStorage.getItem(key);
  if (val === 'null' || val === 'undefined' || val === '') return null;
  return val;
};

export const normalizeRoomId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
};

export const normalizeMessageText = (parsed) => {
  if (typeof parsed === 'string') return parsed;
  if (parsed && typeof parsed === 'object') {
    if (typeof parsed.text === 'string') return parsed.text;
    if (typeof parsed.body === 'string') return parsed.body;
    if (typeof parsed.message === 'string') return parsed.message;
  }
  return '';
};

export const getLastReadKey = (username, roomId) => `last_read_${username}_${roomId}`;

/* ── v1.12-A: chiave localStorage per la stanza aperta corrente, per
   utente — fuori dal layer crypto (vedi punto AF nel changelog in cima
   al file). Stesso stile di getLastReadKey. ─────────────────────────── */
export const getCurrentRoomKey = (username) => `current_room_${username}`;

/* ── v1.10-X: helper puri per riconoscere un messaggio ottimistico ancora
   non confermato dal server — fuori dal layer crypto, nessuna logica Olm/
   Megolm coinvolta. L'id temporaneo è generato in handleSendMessage con
   `${Date.now()}-${Math.random()}` (13+ cifre, poi un trattino, poi un
   decimale tipo "0.123..." o, per numeri estremamente piccoli, notazione
   esponenziale "1.2e-7"): una forma che non può mai collidere con uno UUID
   reale del server (sempre 8-4-4-4-12 esadecimale). ─────────────────────── */
const OPTIMISTIC_MESSAGE_MAX_AGE_MS = 20000;

export const isOptimisticPendingId = (id) =>
  (/^\d{10,}-\d*\.?\d+(e-?\d+)?$/i.test(String(id ?? '')) || ID_PROVVISORIO.test(String(id ?? '')));  // [palacan-m1c] forma nuova (casuale) e vecchia (messaggi gia' in coda)

export const isOptimisticPendingMessage = (message) => {
  if (!message || message.type !== 'self') return false;
  if (!isOptimisticPendingId(message.id)) return false;

  const createdAtMs = new Date(message.created_at || 0).getTime();
  if (!Number.isFinite(createdAtMs)) return false;

  return Date.now() - createdAtMs < OPTIMISTIC_MESSAGE_MAX_AGE_MS;
};

/* ── v1.11-AB: helper puro per riconoscere un fallimento di decrittazione
   riconducibile alla race di scambio simultaneo della room key — fuori dal
   layer crypto, non esegue nessuna operazione Olm, solo ispezione del
   messaggio/codice di un errore già lanciato da olmService. Vedi punto AB
   nel changelog in cima al file. olmService imposta e.code = 'OTK_MISMATCH'
   come fallback per qualunque fallimento di attemptInboundCreation privo di
   un codice proprio (incluso il caso BAD_MESSAGE_KEY_ID, che nella libreria
   Olm arriva come semplice Error senza .code): per questo controlliamo sia
   il codice sia il testo del messaggio, per sicurezza. ─────────────────── */
export const isRoomKeyResendTrigger = (e) => {
  const code = e?.code || null;
  const message = String(e?.message || e || '');
  return (
    code === 'OTK_MISMATCH' ||
    message.includes('BAD_MESSAGE_KEY_ID') ||
    message.includes('OTK_MISMATCH') ||
    /* v1.11-AC: sessione 1:1 stale (localStorage residuo di test precedenti)
       produce "non è pre-key" invece di BAD_MESSAGE_KEY_ID — stesso scenario,
       stesso fix di recovery, solo messaggio diverso lato getOrCreateInboundSessionInternal. */
    message.includes('non è pre-key') ||
    /* v1.14-B: il self-healing di withPeerLock (8s) libera un lock rimasto
       occupato, ma senza questo la room key di QUESTO evento andava persa
       per sempre — nessun re-invio veniva richiesto. Stesso identico
       trattamento di recovery degli altri trigger sopra: azzeriamo la
       sessione 1:1 stale e chiediamo un session_reset. */
    message.includes('PEER_LOCK_TIMEOUT')
  );
};
/* ── v1.8-L: persistenza sentMessagesCacheRef — fuori dal layer crypto ────
   Chiave localStorage: sent_msg_cache_${username}. Non contiene nessun
   materiale crittografico, solo testo in chiaro dei propri messaggi
   indicizzato per client_msg_id, esattamente ciò che prima viveva solo
   in RAM in sentMessagesCacheRef. Cap a 500 entry più recenti per evitare
   crescita illimitata di localStorage nel tempo. ─────────────────────── */

const SENT_CACHE_MAX_ENTRIES = 500;

export const getSentCacheKey = (username) => `sent_msg_cache_${username}`;

// [palacan-9a2] il testo e' salvato CIFRATO con la chiave del dispositivo (utils/datiLocaliCifrati.js); qui si
// legge dalla memoria, caricata prima dell'uso da preparaDatiLocali (all'avvio e a ogni accesso).
export const loadSentMessagesCache = (username) => {
  if (!username) return {};
  const salvata = leggiLocale(getSentCacheKey(username));
  return salvata && typeof salvata === 'object' ? { ...salvata } : {};
};

export const saveSentMessagesCache = (username, cache) => {
  if (!username || !cache) return;
  try {
    const entries = Object.entries(cache);
    const trimmed =
      entries.length > SENT_CACHE_MAX_ENTRIES
        ? entries.slice(entries.length - SENT_CACHE_MAX_ENTRIES)
        : entries;
    salvaLocale(getSentCacheKey(username), Object.fromEntries(trimmed));
  } catch (_) {}
};

/* ── v1.9-O: debounce upload backup chiavi — fuori dal layer crypto ─────
   30s dopo l'ultima modifica rilevante (nuove sessioni/messaggi), più un
   upload forzato al logout. Vedi scheduleBackupUpload/forceBackupUploadNow
   più sotto. ────────────────────────────────────────────────────────── */
const BACKUP_UPLOAD_DEBOUNCE_MS = 30000;

/* ══════════════════════════════════════════════════════════════════════════
   APP CONTENT
══════════════════════════════════════════════════════════════════════════ */

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();

  /* ── Auth state ──────────────────────────────────────────────────────── */
  // FIX (cifratura dati di sessione, audit sicurezza "pensa da hacker"):
  // questi 6 valori erano letti SINCRONAMENTE da localStorage in chiaro
  // qui dentro useState(() => ...). Decifrare con AES-GCM (vedi
  // secureStorage.js) e' pero' SEMPRE asincrono - non si puo' restituire
  // da un inizializzatore di useState, che deve essere sincrono. Partono
  // quindi vuoti, e vengono ripristinati dal vero valore cifrato tramite
  // l'effetto isRestoringSession qui sotto, PRIMA che qualsiasi decisione
  // di rendering (mostrare login o dashboard) venga presa - altrimenti un
  // utente gia' loggato vedrebbe per un istante la schermata di login
  // ogni volta che ricarica la pagina.
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [authToken, setAuthToken] = useState(null);
  const [currentUsername, setCurrentUsername] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState('consumer');
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(null);
  /* ── v1.11-AD (Fase 3, vedi punto AD nel changelog in cima al file) ─────
     Nome azienda, di fianco all'id. Inizializzato da localStorage così
     sopravvive a un refresh pagina senza dover richiamare /auth/me (vedi
     nota residua nel changelog). */
  const [currentWorkspaceName, setCurrentWorkspaceName] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  // FIX (cifratura dati di sessione): ripristina i 6 valori sopra dal
  // formato cifrato (o li migra dal vecchio formato in chiaro, se
  // presenti da prima di questo fix) - un'unica volta, al primo render.
  useEffect(() => {
    let annullato = false;
    (async () => {
      const CHIAVI = ['token', 'username', 'user_role', 'workspace_id', 'workspace_name', 'user_id'];
      for (const chiave of CHIAVI) {
        await migrateLegacyPlaintextKey(chiave);
      }
      const [tokenSalvato, usernameSalvato, ruoloSalvato, workspaceIdSalvato, workspaceNameSalvato, userIdSalvato] =
        await Promise.all(CHIAVI.map((chiave) => getSecureItem(chiave)));
      await preparaDatiLocali(usernameSalvato);  // [palacan-9a2] cache inviati e bozze (cifrate) pronte prima del primo disegno
      if (usernameSalvato && !backupPassphraseRef.current) backupPassphraseRef.current = await chiaveBackupSalvata(usernameSalvato);  // [palacan-n4] dopo un ricaricamento il backup continua con la chiave conservata

      if (annullato) return;

      setAuthToken(tokenSalvato);
      setCurrentUsername(usernameSalvato);
      setCurrentUserRole(ruoloSalvato || 'consumer');
      setCurrentWorkspaceId(workspaceIdSalvato);
      setCurrentWorkspaceName(workspaceNameSalvato);
      setCurrentUserId(userIdSalvato);
      setIsRestoringSession(false);
    })();

    return () => {
      annullato = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── v1.11-AC: forcePasswordChange — fuori dal layer crypto (vedi punto
     AC nel changelog in cima al file). Quando true, il render (più sotto)
     blocca fisicamente l'accesso alla Dashboard mostrando SOLO
     ForcedPasswordChangeScreen, finché l'utente non sceglie una password
     propria che soddisfi PasswordRequirementsChecklist. ────────────────── */
  const [forcePasswordChange, setForcePasswordChange] = useState(false);

  /* ── UI state (landing / auth modals) ───────────────────────────────── */
  const [showPersonalLogin, setShowPersonalLogin] = useState(false);
  const [view, setView] = useState('login');

  const [showEnterpriseModal, setShowEnterpriseModal] = useState(false);
  const [isActivationMode, setIsActivationMode] = useState(false);

  /* ── Enterprise form state ───────────────────────────────────────────── */
  const [companyName, setCompanyName] = useState('');
  const [enterpriseUsername, setEnterpriseUsername] = useState('');
  const [enterprisePassword, setEnterprisePassword] = useState('');
  const [licenseToken, setLicenseToken] = useState('');

  /* ── Consumer form state ─────────────────────────────────────────────── */
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');

  /* ── Feedback state ──────────────────────────────────────────────────── */
  const [authError, setAuthError] = useState('');
  const [enterpriseError, setEnterpriseError] = useState('');
  const [loading, setLoading] = useState(false);

  /* ── Room / message state ────────────────────────────────────────────── */
  const [recentRooms, setRecentRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState({ id: null, name: '' });
  const [messages, setMessages] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* ── v1.4-A: messagesLoading — fuori dal layer crypto ───────────────── */
  const [messagesLoading, setMessagesLoading] = useState(false);

  /* ── v1.7-G: cache locale testi propri inviati — fuori dal layer crypto
     Indicizzata per client_msg_id (== tempId generato in handleSendMessage).
     Serve a fetchHistory() (dentro il layer crypto) per recuperare il testo
     dei propri messaggi, dato che il backend E2EE non lo restituisce mai.
     v1.8-L: ora fa write-through su localStorage (loadSentMessagesCache /
     saveSentMessagesCache) così sopravvive a logout/relogin e refresh. */
  const sentMessagesCacheRef = useRef({});

  /* ── v1.12-C: buffer messaggi cifrati "orfani" — fuori dal layer crypto
     (vedi voce v1.12-C nel changelog in cima al file). Indicizzato per
     session_id -> array di { senderUsername, roomId, sessionId, cipherBody,
     messageId, createdAt }. Risolve la race in cui un messaggio room_encrypted
     arriva sul canale WebSocket della stanza PRIMA che la relativa m.room_key
     sia stata processata sul canale to-device: invece di scartarlo per
     sempre, viene messo in coda qui e ritentato non appena la room key
     corrispondente viene salvata (vedi flush in handleToDeviceEvent). Non
     persistito: sopravvive solo per la sessione corrente del tab, esattamente
     come inboundGroupSessionsRef prima del salvataggio su localStorage. */
  const pendingEncryptedMessagesRef = useRef({});
  /* ── FIX race fetchHistory: numero di turno per ogni chiamata. Se
     una chiamata scopre, subito prima di scrivere lo stato, che nel
     frattempo ne e' partita una piu' recente, si ritira senza
     sovrascrivere. ──────────────────────────────────────────────── */
  const fetchHistoryRequestIdRef = useRef(0);
  /* ── v1.13-B (ECCEZIONE MIRATA, vedi header del file) ─────────────── */
  const historyLoadInProgressRef = useRef(false);
  const liveMessagesDuringHistoryRef = useRef([]);
  /* ── fine v1.13-B (dichiarazione ref) ──────────────────────────────── */

  /* ── v1.9-O: key backup — stato UI + refs fuori dal layer crypto ────────
     backupPrompt: { mode: 'create'|'recover', error: string } | null
     backupPromiseResolverRef: risolutore della Promise in attesa che
     l'utente interagisca con BackupPinPrompt (submit o skip).
     backupPassphraseRef: la passphrase resta SOLO in memoria per la
     sessione corrente del tab, mai persistita, mai loggata.
     backupUploadTimeoutRef: timer del debounce di sincronizzazione.
     v1.10-V/W: forceBackupUploadRef — ref popolato più sotto (subito dopo
     scheduleBackupUpload) con una funzione che annulla il debounce
     pendente e forza subito un upload. Dichiarato qui (semplice ref,
     nessuna logica) così può essere letto sia dentro handleToDeviceEvent
     (eccezione mirata v1.10-V, dentro il layer crypto) sia dal listener
     visibilitychange/pagehide (v1.10-W, fuori dal layer crypto). ─────── */
  const [backupPrompt, setBackupPrompt] = useState(null);
  const backupPromiseResolverRef = useRef(null);
  const backupPassphraseRef = useRef(null);
  const backupUploadTimeoutRef = useRef(null);
  const forceBackupUploadRef = useRef(null);

  /* ── v1.10 (NEW): invite link — redeem di un invito pendente dopo
     login/registrazione CONSUMER. SOLO flusso consumer/free: il flusso
     enterprise (handleEnterpriseSubmit) non tocca nessuno di questi stati.
     Stesso pattern di backupPrompt: uno stato per il prompt password (se
     l'invito la richiede) + un resolver per la Promise in attesa
     dell'input utente. ─────────────────────────────────────────────────── */
  const [inviteRedeemPrompt, setInviteRedeemPrompt] = useState(null); // { error: string } | null
  const inviteRedeemResolverRef = useRef(null);

  /* ── v1.10 (NEW): "Invita amico" — link generato da mostrare in
     Dashboard, e relativo eventuale errore di creazione. */
  const [generatedInviteLink, setGeneratedInviteLink] = useState(null); // { url, hasPassword } | null
  const [inviteLinkCreateError, setInviteLinkCreateError] = useState('');

  /* ── v1.11-AA: canale di presenza — stato UI + ref, fuori dal layer
     crypto (vedi punto AA nel changelog in cima al file).
     contactLiveEvent: ultimo evento contatto ricevuto sul canale di
     presenza (es. contact_request_received), arricchito con _receivedAt
     (timestamp) così anche due eventi "uguali" in rapida successione
     vengono riconosciuti come "nuovi" da un useEffect in Dashboard che
     osserva questa prop. presenceConnectedRef: solo per diagnostica/
     evitare doppie connect in StrictMode; nessuna logica di business
     dipende da questo ref. ─────────────────────────────────────────── */
  const [contactLiveEvent, setContactLiveEvent] = useState(null);
  const [reactionLiveEvent, setReactionLiveEvent] = useState(null);
  const [wsReconnectCount, setWsReconnectCount] = useState(0);
  const [callSignalEvent, setCallSignalEvent] = useState(null);
  // [palacan-l4e] dati per avviare le chiamate cifrati end-to-end: le funzioni vere si collegano piu' sotto, dove ci
  // sono la sessione di invio della chat e le chiavi in entrata
  const cifraSegnaleChiamataRef = useRef(null);
  const apriSegnaleChiamataRef = useRef(null);
  /* ── fix doppia consegna: un segnale di chiamata puo' ora arrivare sia
     dal canale di presenza (sempre connesso) sia dal canale della stanza
     (connesso solo se quella chat e' gia' aperta) - se ENTRAMBI sono
     connessi nello stesso momento, lo stesso segnale arriverebbe due
     volte, rischiando una doppia elaborazione (es. setRemoteDescription
     chiamata due volte sulla stessa risposta, che fallirebbe la seconda
     volta interrompendo una chiamata altrimenti riuscita). Questo ref
     tiene traccia delle "impronte" dei segnali visti di recente, per
     scartare i doppioni entro una finestra breve. */
  const recentCallSignalKeysRef = useRef(new Map());
  const dispatchCallSignalEvent = useCallback((data) => {
    try {
      const key = `${data?.type}|${data?.signal_type}|${data?.room_id}|${data?.from_user_id}|${JSON.stringify(data?.data)}`;
      const now = Date.now();
      const seenAt = recentCallSignalKeysRef.current.get(key);
      if (seenAt && now - seenAt < 2000) {
        return; // doppione arrivato dall'altro canale, scartato
      }
      recentCallSignalKeysRef.current.set(key, now);
      // pulizia leggera: rimuove voci più vecchie di 5s per non accumulare all'infinito
      for (const [k, t] of recentCallSignalKeysRef.current) {
        if (now - t > 5000) recentCallSignalKeysRef.current.delete(k);
      }
    } catch (_) {
      // se la deduplicazione fallisce per qualsiasi motivo, procediamo comunque
    }
    console.log(`[DIAG-CALL] dispatchCallSignalEvent: signal_type=${data?.signal_type} room_id=${data?.room_id} from=${data?.from_username} video=${data?.data?.video}`);
    // [palacan-l4e] offerta, risposta e candidati si aprono qui: in chiaro, non decifrabili, di altri o vecchi si scartano
    if (apriSegnaleChiamataRef.current) {
      apriSegnaleChiamataRef.current(data);
      return;
    }
    if (!segnaleDaCifrare(data?.signal_type)) setCallSignalEvent({ ...data, _receivedAt: Date.now() });
  }, []);
  const presenceConnectedRef = useRef(false);

  /* ── nuovo (sessione corrente, Fase 1 chiamate): logica WebRTC vera,
     isolata nel modulo dedicato callManager.js. Riceve solo authToken e
     callSignalEvent (gia' esistenti), nessuna modifica al layer crypto. */
  /* ── nuovo (registro chiamate cifrato): sendCallLogMessage e' definita
     molto piu' sotto nel file (vicino a handleSendMessage, riusa lo stesso
     schema di cifratura) - non puo' essere referenziata direttamente qui
     perche' in JS non e' ancora stata dichiarata a questo punto
     dell'esecuzione. Stesso schema di indirection gia' usato altrove nel
     file (es. forceBackupUploadRef) per questo tipo di ordine invertito:
     un ref stabile creato subito, popolato piu' sotto una volta che la
     funzione vera esiste. */
  const sendCallLogMessageRef = useRef(null);
  const callManager = useCallManager({
    authToken,
    callSignalEvent,
    onCallEnded: (info) => sendCallLogMessageRef.current?.(info),
    cifraSegnale: (...argomenti) => cifraSegnaleChiamataRef.current?.(...argomenti),  // [palacan-l4e]
  });

  /* ── nuovo (sessione corrente): su mobile, quando lo schermo si blocca
     o la scheda del browser va in background, il sistema spesso sospende
     le connessioni WebSocket (e i timer che le tengono in vita) senza
     generare un evento di chiusura pulito - l'app resta convinta di
     essere ancora connessa, ma non riceve piu' nulla in tempo reale
     finche' non viene ricaricata manualmente. Questo listener forza la
     riconnessione di ENTRAMBI i canali WS ogni volta che la pagina torna
     visibile: (1) reconnectNow() (gia' esistente in wsClient.js) per il
     canale messaggi/stanza; (2) connectPresence() (gia' esistente in
     presenceClient.js, gestisce gia' da sola la sostituzione di una
     connessione precedente) per il canale presenza/to-device, da cui
     arrivano le chiavi di cifratura - questo secondo canale NON aveva
     nessuna riconnessione forzata prima d'ora, solo il proprio heartbeat
     interno (che pero' dipende da timer JS, anch'essi sospesi in
     background). Cosi' il recupero (ensureRoomKeyShared + fetchHistory,
     gia' esistenti, si attivano automaticamente al nuovo WS onOpen)
     avviene da solo, senza bisogno di un reload manuale. Puramente
     additivo, nessuna riga preesistente toccata, stesse identiche
     callback gia' in uso per connectPresence poco piu' sotto nel file.
     Dipendenza [authToken] (non authTokenRef, dichiarato piu' sotto nel
     file e quindi non ancora in scope in questo punto) cosi' l'effetto
     si riaggancia sempre al token corrente. */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      /* ── v1.13-C (fix tempesta di riconnessioni): visibilitychange puo'
         scattare piu' spesso del previsto su alcuni browser mobili (non
         solo un vero passaggio background->foreground) - riconnettere
         INCONDIZIONATAMENTE ad ogni sua emissione buttava giu' e
         ricostruiva connessioni gia' sane in loop rapido, causando
         instabilita' e blocchi osservati su cellulare in produzione.
         Ora si riconnette SOLO se la connessione risulta davvero non
         attiva in questo momento. */
      try {
        if (!isWsConnected()) {
          reconnectNow();
        }
      } catch (e) {
        console.error('Errore riconnessione canale messaggi dopo ritorno in primo piano:', e);
      }
      try {
        if (authToken && !isPresenceConnected()) {
          connectPresence(authToken, {
            onOpen: () => {
              presenceConnectedRef.current = true;
              console.log('🟢 Canale di presenza riconnesso (ritorno in primo piano)');
            },
            onMessage: (data) => {
              /* ── fix BUG PRINCIPALE chiamate mancate: i segnali di
                 chiamata (invito, risposta, chiusura) prima venivano
                 riconosciuti SOLO dal canale legato a una stanza
                 specifica, attivo solo quando quella chat e' gia' aperta.
                 Il canale di presenza (sempre connesso, indipendentemente
                 da quale chat e' aperta) li riceveva comunque dal server,
                 ma li scartava passandoli solo a setContactLiveEvent, che
                 non li riconosce. Ora vengono riconosciuti anche qui,
                 cosi' una chiamata in arrivo funziona anche quando non si
                 ha gia' aperta proprio quella chat - il caso normale di
                 una chiamata vera. */
              if (data?.type === 'rooms_changed') {  // [palacan-metadati-a1] avviso senza contenuto: le stanze sono cambiate
                window.dispatchEvent(new CustomEvent('palacan:stanze-cambiate'));
                return;
              }
              if (data?.type === 'call_signal') {
                dispatchCallSignalEvent(data);
                return;
              }
              setContactLiveEvent({ ...data, _receivedAt: Date.now() });
            },
          });
        }
      } catch (e) {
        console.error('Errore riconnessione canale presenza dopo ritorno in primo piano:', e);
      }
      /* ── fine v1.13-C ─────────────────────────────────────────────────── */
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authToken]);

  /* ── v1.11-AE: sendRejectedEvent — stato UI, fuori dal layer crypto
     (vedi punto AE nel changelog in cima al file). Stesso pattern di
     contactLiveEvent: arricchito con _receivedAt così un rifiuto identico
     al precedente (stesso reason/client_msg_id, es. l'utente riprova a
     scrivere subito dopo essere stato mutato di nuovo) viene comunque
     riconosciuto come "nuovo" da Dashboard.jsx. ────────────────────────── */
  const [sendRejectedEvent, setSendRejectedEvent] = useState(null);

  /* ── v1.12-A: lastActiveUsernameRef — fuori dal layer crypto (vedi
     punto AF nel changelog in cima al file). A differenza di
     currentUsernameRef (dentro il layer, sincronizzato 1:1 con lo state,
     quindi diventa null al logout), questo ref mantiene l'ULTIMO
     username non-null visto. Serve all'effect di persistenza della
     stanza corrente qui sotto per sapere DI CHI ripulire la chiave
     localStorage quando currentRoom viene azzerato in performLogout
     (che, dentro il layer, azzera currentUsername e currentRoom nello
     stesso commit — un ref sincronizzato anche sul null arriverebbe
     troppo tardi). Aggiornato SOLO su valori non-null. ───────────────── */
  const lastActiveUsernameRef = useRef(null);

  useEffect(() => {
    if (currentUsername) {
      lastActiveUsernameRef.current = currentUsername;
    }
  }, [currentUsername]);

  /* ══════════════════════════════════════════════════════════════════════
     CRYPTO LAYER START — NON MODIFICARE
  ══════════════════════════════════════════════════════════════════════ */

  const [olmAccount, setOlmAccount] = useState(null);
  const olmAccountRef = useRef(null);

  const [peerSessions, setPeerSessions] = useState({});
  const peerSessionsRef = useRef({});

  const inboundGroupSessionsRef = useRef({});
  const roomKeySharedWithRef = useRef({});

  const [isOlmReady, setIsOlmReady] = useState(false);

  const currentRoomRef = useRef(currentRoom);
  const authTokenRef = useRef(authToken);
  const currentUsernameRef = useRef(currentUsername);
  const wsRoomIdRef = useRef(null);

  useEffect(() => { currentRoomRef.current = currentRoom; }, [currentRoom]);
  useEffect(() => { authTokenRef.current = authToken; }, [authToken]);
  useEffect(() => { currentUsernameRef.current = currentUsername; }, [currentUsername]);

  const setCurrentOlmAccount = useCallback((account) => {
    if (!account) return;
    olmAccountRef.current = account;
    setOlmAccount(account);
  }, []);

  const persistRooms = useCallback((username, rooms) => {
    if (!username) return;
    localStorage.setItem(`rooms_${username}`, JSON.stringify(rooms));
  }, []);

  /* ── v1.8-I: clearUserLocalState — SOLO stato di sessione applicativa.
     Non tocca più nessuna chiave crittografica persistita (olm_account_*,
     olm_sessions_*, megolm_inbound_*, room_key_shared_*, megolm_outbound_*).
     Un logout normale deve chiudere la sessione utente, non simulare un
     cambio dispositivo. Il wipe crittografico completo è stato spostato
     nella funzione dedicata resetDeviceCrypto() qui sotto, che NON viene
     chiamata automaticamente da nessuna parte in questo file.
     v1.8-L: non tocca nemmeno sent_msg_cache_${username} — non è materiale
     crittografico, è testo in chiaro locale che deve sopravvivere al
     logout esattamente come le chiavi Olm/Megolm.
     v1.11-AD: rimossa anche 'workspace_name', accanto a 'workspace_id' —
     stesso ciclo di vita, stessa ragione (stato di sessione applicativa,
     non materiale crittografico). */
  const clearUserLocalState = useCallback((username) => {
    // FIX (cifratura dati di sessione): removeSecureItem e' sincrona
    // (rimuovere non richiede mai decifratura) - stesso comportamento
    // di prima, solo passata attraverso il nuovo modulo per coerenza.
    removeSecureItem('token');
    removeSecureItem('username');
    removeSecureItem('user_role');
    removeSecureItem('workspace_id');
    removeSecureItem('workspace_name');
    removeSecureItem('user_id');

    if (username) {
      localStorage.removeItem(`rooms_${username}`);
    }
  }, []);

  /* ── v1.8-J: resetDeviceCrypto — wipe crittografico completo.
     Contiene il comportamento che PRIMA scattava automaticamente ad ogni
     logout (bug root cause dei BAD_MESSAGE_KEY_ID / OTK_MISMATCH / identity
     key che cambiava ad ogni rilogin). Ora è isolata e va invocata solo in
     modo esplicito, es. da una futura azione "Reset dispositivo" nelle
     impostazioni (account compromesso, cambio device volontario, debug). */
  const resetDeviceCrypto = useCallback((username) => {
    if (!username) return;

    localStorage.removeItem(`olm_account_${username}`);
    localStorage.removeItem(`olm_sessions_${username}`);
    localStorage.removeItem(`megolm_inbound_${username}`);
    localStorage.removeItem(`room_key_shared_${username}`);

    try {
      const keysToDelete = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`megolm_outbound_${username}_`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => localStorage.removeItem(key));
    } catch (_) {}
  }, []);

  const syncSessionsState = useCallback((updatedSessions) => {
    const safe = updatedSessions || {};
    peerSessionsRef.current = safe;
    setPeerSessions({ ...safe });

    const username = currentUsernameRef.current;
    if (username) {
      olmService.saveSessions(username, safe);
    }
  }, []);

  const updateSession = useCallback(
    (peerUsername, sessionOrSessions) => {
      if (!peerUsername || !sessionOrSessions) return;
      const updated = {
        ...peerSessionsRef.current,
        [peerUsername]: sessionOrSessions,
      };
      syncSessionsState(updated);
    },
    [syncSessionsState]
  );

  /* ── v1.9-N: performLogout(hardResetDevice = false, reason = null).
     Nuovo secondo parametro OPZIONALE, retrocompatibile al 100%: tutte le
     chiamate esistenti (onLogout={performLogout} in Dashboard, performLogout()
     senza argomenti nel restore sessione) continuano a funzionare identiche.
     Se `reason` è valorizzato (es. da apiService.onAuthExpired), viene
     mostrato come messaggio nella schermata di login invece del solito
     azzeramento silenzioso di authError.
     v1.11-AA: NON tocca il canale di presenza. La disconnessione avviene
     automaticamente tramite la funzione di cleanup dello useEffect
     "Presence channel lifecycle" (fuori dal layer crypto, vedi più sotto),
     che si attiva da solo quando questa funzione azzera authToken/
     currentUsername qualche riga più sotto in questo stesso file. Per
     questo motivo non è stata aggiunta nessuna chiamata a
     disconnectPresence() qui dentro: farlo avrebbe significato modificare
     una riga dentro CRYPTO LAYER START/END senza alcun bisogno reale.
     v1.11-AC: stessa logica per forcePasswordChange — non viene azzerato
     qui dentro, ma da un useEffect fuori dal layer che osserva authToken
     diventare null (vedi più sotto), per lo stesso identico motivo.
     v1.11-AD: currentWorkspaceName viene azzerato qui, accanto a
     currentWorkspaceId — stesso ciclo di vita, nessun motivo per un
     effect separato: è già dentro CRYPTO LAYER (performLogout), quindi lo
     aggiungiamo semplicemente di fianco all'omologo esistente.
     v1.12-A: stessa identica logica per la persistenza di currentRoom —
     NON viene azzerata qui dentro. Quando questa funzione imposta
     setCurrentRoom({ id: null, name: '' }) qualche riga più sotto, il
     nuovo effect "Persistenza stanza corrente" (fuori dal layer, vedi
     punto AF) osserva il cambio e ripulisce da solo la chiave
     localStorage, usando lastActiveUsernameRef per sapere di chi. */
  /* ── FIX (corsa backup/revoca): performLogout ora è async. Prima, sia
     il flush del backup sia la revoca della sessione erano "spara e
     dimentica" paralleli (due IIFE indipendenti) - JavaScript non
     garantisce quale dei due finisce prima, e la revoca (una chiamata
     semplice) di solito vinceva la corsa contro il backup (che deve
     prima cifrare tutto con Argon2id, un passaggio lento apposta per
     sicurezza). Risultato osservato: il token veniva invalidato PRIMA
     che il salvataggio del backup fosse anche solo partito, con
     conseguente 401 sull'ultimo PUT /keys/backup. Ora il backup viene
     aspettato per davvero (await) prima di procedere alla revoca. */
  const performLogout = useCallback(async (hardResetDevice = false, reason = null) => {
    const username = currentUsernameRef.current;
    // [palacan-n1] eccezione mirata approvata: la cronologia del dispositivo si cancella piu' sotto, DOPO il backup forzato
    cacheStanzeRef.current = {};
    stanzaInAperturaRef.current = '';
    dimenticaReazioni();
    dimenticaNomi();  // [palacan-metadati-a3.1]
    dimenticaSegreti();  // [palacan-metadati-a4.1b]
    dimenticaRecapito();  // [palacan-metadati-a4.4c]
    dimenticaStati();  // [palacan-metadati-a4.2b]
    impostaBloccati([]);

    /* v1.9-O: upload forzato dell'ultimo stato del backup prima di
       distruggere tutto in RAM. */
    if (backupUploadTimeoutRef.current) {
      clearTimeout(backupUploadTimeoutRef.current);
      backupUploadTimeoutRef.current = null;
    }
    if (backupPassphraseRef.current && username && authTokenRef.current) {
      const passphraseToFlush = backupPassphraseRef.current;
      const tokenToFlush = authTokenRef.current;
      try {
        // [palacan-n6] eccezione mirata approvata: unito al backup del server (mai sostituito alla cieca), dati personali compresi
        const esitoBackup = await caricaBackupUnito({ username, token: tokenToFlush, segreto: passphraseToFlush, olm: olmService, api: apiService, esportaDati: esportaDatiPersonali });
        if (esitoBackup.esito === 'errore') throw esitoBackup.errore;
        if (esitoBackup.esito === 'fermo') console.warn(`⚠️ Backup all'uscita non caricato (${esitoBackup.motivo}): il backup del server resta com'era.`);
      } catch (e) {
        console.error('❌ Backup upload forzato (logout) fallito:', e);
      }
    }

    // [palacan-cronologia-locale] uscita: via la cronologia del dispositivo e i dati della sessione (chi entra dopo su questo
    // browser non li vede). [palacan-n1] eccezione mirata approvata: DOPO il backup forzato qui sopra, che legge dalla
    // cronologia nomi dei gruppi e segreti di stanza (prima si cancellava prima e il backup sul server li perdeva);
    // e si aspetta che finisca, perche' alla fine dell'uscita la pagina si ricarica.
    if (username) await cancellaCronologia(username);

    /* Fase B (audit sicurezza login): revoca la sessione lato server
       DOPO che il backup ha finito di salvarsi (vedi commento sopra la
       firma della funzione). */
    if (authTokenRef.current) {
      const tokenToRevoke = authTokenRef.current;
      try {
        await apiService.logout(tokenToRevoke);
      } catch (e) {
        console.warn('⚠️ Revoca sessione server (logout) fallita:', e);
      }
    }

    backupPassphraseRef.current = null;
    disconnectWs();

    try { olmService.freeOlmAccount(olmAccountRef.current); } catch (_) {}
    /* Fix use-after-free WASM: senza questa riga, un re-login con lo
       stesso username nella stessa scheda riusa dalla cache di modulo
       l'oggetto appena liberato sopra -> crash sincrono che blocca tutto
       il thread (schermo bianco, niente click, niente F12). */
    try { olmService.invalidateOlmAccountCache(username); } catch (_) {}
    try { olmService.freeSessionsMap(peerSessionsRef.current); } catch (_) {}
    try { olmService.freeGroupSessionsMap(inboundGroupSessionsRef.current); } catch (_) {}

    clearUserLocalState(username);
    if (hardResetDevice) {
      resetDeviceCrypto(username);
    }

    olmAccountRef.current = null;
    peerSessionsRef.current = {};
    inboundGroupSessionsRef.current = {};
    roomKeySharedWithRef.current = {};
    wsRoomIdRef.current = null;

    /* v1.8-L: la cache in RAM va comunque azzerata qui (stiamo per
       cambiare/azzerare currentUsername), ma il contenuto resta salvato
       su localStorage sotto sent_msg_cache_${username} e verrà ricaricato
       al prossimo login di quello stesso username. */
    sentMessagesCacheRef.current = {};

    /* v1.12-C: il buffer di messaggi orfani è legato alla sessione
       crittografica corrente (session_id delle outbound Megolm attive):
       azzerarlo al logout evita di ritentare in futuro, per un utente
       diverso, la decrittazione di payload che non gli appartengono più. */
    pendingEncryptedMessagesRef.current = {};

    setAuthToken(null);
    setCurrentUsername(null);
    setCurrentUserRole('consumer');
    setCurrentWorkspaceId(null);
    setCurrentWorkspaceName(null);
    setCurrentUserId(null);

    setOlmAccount(null);
    setPeerSessions({});
    setRecentRooms([]);
    setCurrentRoom({ id: null, name: '' });
    setMessages([]);

    setShowEnterpriseModal(false);

    if (reason) {
      // v1.9-N: sessione scaduta/logout forzato — mostriamo direttamente
      // la card di login con il messaggio, invece di lasciare l'utente
      // sulla landing page senza spiegazioni.
      setShowPersonalLogin(true);
      setView('login');
      setAuthError(reason);
    } else {
      setShowPersonalLogin(false);
      setView('login');
      setAuthError('');
    }

    setSidebarOpen(false);
    setEnterpriseError('');
    setBackupPrompt(null);
    backupPromiseResolverRef.current = null;    /* FIX MIRATO (sessione corrente): navigate('/') e' una navigazione


       SPA "soft" - non ricarica il bundle JS, quindi il modulo WASM di


       Olm resta lo stesso tra un logout e il login successivo nella


       stessa tab. I log diagnostici di stasera mostrano che questo causa


       "RuntimeError: memory access out of bounds" quando il prossimo


       login prova a ricostruire sessioni Olm/Megolm dal localStorage


       (anche cambiando account, non solo rientrando con lo stesso) -


       corruzione che poi impedisce di decifrare i messaggi storici e


       aggiunge fino a 8s di ritardo (timeout di withPeerLock) prima di


       condividere le chiavi stanza. Sostituendo con una navigazione HARD


       del browser, il prossimo login riparte sempre con un modulo WASM


       fresco, aggirando l'intera classe di bug senza toccare nessuna


       riga di olmService.js. */


    window.location.href = '/';
  }, [clearUserLocalState, resetDeviceCrypto, navigate]);

const checkKeysHealth = useCallback(
    async (forceAccount = null) => {
      const token = authTokenRef.current;
      const username = currentUsernameRef.current;
      if (!token || !username) return forceAccount || olmAccountRef.current;

      const acc = forceAccount || olmAccountRef.current;
      if (!acc) return acc;

      try {
        const result = await olmService.ensureEnoughOTKs(acc, username, token, 10, 50);
        if (result?.account) {
          setCurrentOlmAccount(result.account);
          return result.account;
        }
        return acc;
      } catch (e) {
        console.warn('Silent check keys failed:', e);
        return acc;
      }
    },
    [setCurrentOlmAccount]
  );
  const ensureSession = useCallback(
    async (peerUsername) => {
      const existing = peerSessionsRef.current[peerUsername];

      if (Array.isArray(existing) && existing.length > 0) return existing[0];
      if (existing && !Array.isArray(existing)) return existing;

      const acc = olmAccountRef.current;
      const token = authTokenRef.current;
      const username = currentUsernameRef.current;

      if (!acc || !token || !username) return null;

      try {
        const session = await olmService.getOrCreateOutboundSession({
          account: acc,
          username,
          targetUsername: peerUsername,
          sessions: peerSessionsRef.current,
          token,
        });

        if (session) syncSessionsState({ ...peerSessionsRef.current });

        return session;
      } catch (e) {
        console.error('Session creation failed:', e);
        return null;
      }
    },
    [syncSessionsState]
  );

  const ensureRoomKeyShared = useCallback(
    async (roomId) => {
      const token = authTokenRef.current;
      const username = currentUsernameRef.current;
      const normalizedRoom = normalizeRoomId(roomId);

      if (!normalizedRoom || !token || !username) return;

      /* ── FIX: getRoomUsers spostata FUORI da withAccountLock. E' una
         semplice richiesta di rete che non tocca mai l'account Olm - non
         aveva alcun bisogno reale di stare dentro al lucchetto. Prima ci
         stava dentro, e ogni chiamata concorrente a ensureRoomKeyShared
         (riconnessione WS, ritentativo, session_reset) doveva aspettare in
         coda l'INTERA esecuzione precedente, richiesta di rete lenta
         compresa, prima di poter anche solo iniziare la propria. Con più
         trigger ravvicinati si formava un ingorgo che si allungava da
         solo. Ora più chiamate concorrenti possono recuperare i
         partecipanti in parallelo; resta dentro al lucchetto solo il
         lavoro che tocca davvero l'account Olm. */
      console.log(`[DIAG ${performance.now().toFixed(0)}ms] ensureRoomKeyShared: PRIMA getRoomUsers`);
      let users;
      try {
        users = await apiService.getRoomUsers(normalizedRoom, token);
      } catch (e) {
        console.error('❌ ensureRoomKeyShared getRoomUsers error:', e);
        return;
      }
      console.log(`[DIAG ${performance.now().toFixed(0)}ms] ensureRoomKeyShared: DOPO getRoomUsers`);

      /* ── FIX (rotazione Megolm su cambio composizione gruppo, Fase A -
         riconciliazione): confronta la versione della composizione
         appena ricevuta dal server con l'ultima conosciuta localmente.
         Se sono diverse (qualcuno e' entrato o uscito da quando questo
         client ha controllato l'ultima volta), abbandona la sessione
         Megolm di invio attuale - la prossima riga sotto (dentro il
         lucchetto) ne creera' una nuova da zero, condivisa solo con chi
         e' membro ORA (peers, gia' filtrato sopra dalla lista fresca).
         Prima esecuzione in assoluto per questa stanza (nessuna
         versione salvata ancora): NON ruota, si limita a salvare la
         versione attuale come punto di partenza - non e' un cambio
         vero, e' solo la prima volta che la controlliamo. */
      const serverMembershipVersion = users?.membershipVersion;
      if (typeof serverMembershipVersion === 'number') {
        const lastKnownMembershipVersion = olmService.loadRoomMembershipVersion(
          username,
          normalizedRoom
        );
        if (
          lastKnownMembershipVersion !== null &&
          lastKnownMembershipVersion !== serverMembershipVersion
        ) {
          console.log(
            `🔄 [DIAG-KEY] Composizione stanza cambiata (v${lastKnownMembershipVersion}→v${serverMembershipVersion}), rotazione sessione Megolm per room=${normalizedRoom}`
          );
          olmService.clearOutboundGroupSession(username, normalizedRoom);
          delete roomKeySharedWithRef.current[normalizedRoom];
        }
        olmService.saveRoomMembershipVersion(username, normalizedRoom, serverMembershipVersion);
      }

      // [palacan-l3b] un dispositivo che aveva la chiave non c'e' piu' (revocato, copia superata, utente disattivato):
      // si cambia la sessione, stesso meccanismo. Un dispositivo in PIU' riceve la chiave in corso, come oggi.
      if (Array.isArray(users?.dispositivi)) {
        const dispositiviPrima = olmService.loadRoomDevices(username, normalizedRoom);
        if (olmService.deviceRemovedFromRoom(dispositiviPrima, users.dispositivi)) {
          console.log(`🔄 [DIAG-KEY] Un dispositivo della stanza non c'e' piu', rotazione sessione Megolm per room=${normalizedRoom}`);
          olmService.clearOutboundGroupSession(username, normalizedRoom);
          delete roomKeySharedWithRef.current[normalizedRoom];
        }
        olmService.saveRoomDevices(username, normalizedRoom, users.dispositivi);
      }

      /* ── nuovo: rotazione periodica Megolm per eta' (7 giorni), non solo
         su cambio di composizione. Prima, una stanza dove nessuno entra/
         esce mai non ruotava MAI la sessione di invio, anche se rimasta
         attiva per mesi - non un bug di sicurezza vero e proprio (Megolm
         resta valido nel tempo), ma una pratica raccomandata da
         Matrix/Signal per limitare quanto viene cifrato sotto la stessa
         chiave. Stesso identico meccanismo di rotazione gia' usato sopra:
         pulisce la sessione attuale, la riga sotto (dentro il lucchetto)
         ne creera' una nuova da zero. */
      const ROOM_KEY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 giorni
      if (olmService.shouldRotateOutboundSessionByAge(username, normalizedRoom, ROOM_KEY_MAX_AGE_MS)) {
        console.log(
          `🔄 [DIAG-KEY] Sessione Megolm per room=${normalizedRoom} piu' vecchia di 7 giorni, rotazione periodica`
        );
        olmService.clearOutboundGroupSession(username, normalizedRoom);
        delete roomKeySharedWithRef.current[normalizedRoom];
      }

      // [palacan-l3a] rotazione anche per numero di messaggi (come Matrix): una chiave rubata vale al massimo 100
      // messaggi. Stesso meccanismo: si butta la sessione, sotto (dentro il lucchetto) ne nasce una nuova.
      const ROOM_KEY_MAX_MESSAGES = 100;
      if (olmService.shouldRotateOutboundSessionByMessages(username, normalizedRoom, ROOM_KEY_MAX_MESSAGES)) {
        console.log(`🔄 [DIAG-KEY] Sessione Megolm per room=${normalizedRoom} arrivata a ${ROOM_KEY_MAX_MESSAGES} messaggi, rotazione`);
        olmService.clearOutboundGroupSession(username, normalizedRoom);
        delete roomKeySharedWithRef.current[normalizedRoom];
      }

      const peers = (Array.isArray(users) ? users : []).filter(
        (u) => u.username && u.username !== username
      );
      // [palacan-metadati-a4.2b] stato del gruppo cifrato e firmato: sincronizzato in sottofondo (non blocca la condivisione delle chiavi)
      if (olmAccountRef.current) sincronizzaStatoGruppo({ roomId: normalizedRoom, utenti: users, io: username, token: authTokenRef.current, firmatore: (testo) => olmAccountRef.current.sign(testo), miaChiave: olmService.getEd25519Key(olmAccountRef.current) }).catch(() => {});
      ricordaMembri(normalizedRoom, users, username); pubblicaImprontaSeServe(authTokenRef.current).catch(() => {});  // [palacan-metadati-a4.4c]
      if (recapitoDaRinnovare(normalizedRoom, peers)) { olmService.clearOutboundGroupSession(username, normalizedRoom); delete roomKeySharedWithRef.current[normalizedRoom]; }  // [palacan-metadati-a4.4c3] porta la chiave di recapito nuova
      if (segretoDaRinnovare(normalizedRoom)) { olmService.clearOutboundGroupSession(username, normalizedRoom); delete roomKeySharedWithRef.current[normalizedRoom]; }  // [palacan-correzioni-prove] porta il segreto di stanza anche a chi aveva gia' la chiave

      await olmService.withAccountLock(async () => {
        const account = olmAccountRef.current;
        if (!account) return;

        try {
          const outboundGroupSession = olmService.getOrCreateOutboundGroupSession(
            username,
            normalizedRoom
          );
          olmService.saveOutboundGroupSession(username, normalizedRoom, outboundGroupSession);

          const roomKeyContent = olmService.createRoomKeyEventContent(
            normalizedRoom,
            outboundGroupSession,
            username
          );
          // [palacan-metadati-a3.1] il nome di un gruppo privato viaggia dentro la chiave (cifrato con Olm): chi entra dopo lo riceve
          { const nomeGruppo = nomeDaCondividere(normalizedRoom); if (nomeGruppo) roomKeyContent.room_name = nomeGruppo; }
          { const segretoStanza = segretoDaCondividere(normalizedRoom); if (segretoStanza) roomKeyContent.room_secret = segretoStanza; }  // [palacan-metadati-a4.1b]
          { const recapito = recapitoDaCondividere(peers); if (recapito) roomKeyContent.recapito = recapito; }  // [palacan-metadati-a4.4c] [palacan-metadati-a4.4c3] mai verso un bloccato
          const sessionId = roomKeyContent.session_id || roomKeyContent.sessionId;
          console.log(`🔑 [DIAG-KEY] ensureRoomKeyShared: sto per condividere session_id=${sessionId} per room=${normalizedRoom} con ${peers.length} peer`);

          /* ── nuovo: import "in entrata" della propria sessione, cosi' i
             propri messaggi si decifrano con lo stesso meccanismo usato per
             quelli ricevuti (vera cifratura, sopravvive a backup/recupero
             con passphrase) invece di dipendere solo da una cache locale
             fragile. Idempotente: receiveRoomKeyEvent ritorna subito se la
             sessione esiste gia'. */
          try {
            olmService.receiveRoomKeyEvent({
              username,
              roomKeyContent,
              inboundGroupSessions: inboundGroupSessionsRef.current,
            });
            registraCreatore(username, sessionId, { utente: username, verifica: 'propria', stanza: normalizedRoom });  // [palacan-metadati-3.1] [palacan-metadati-3.4b]
          } catch (e) {
            console.warn('⚠️ Import sessione propria (self room key) fallito:', e);
          }

          if (!roomKeySharedWithRef.current[normalizedRoom]) {
            roomKeySharedWithRef.current[normalizedRoom] = {};
          }

          for (const peer of peers) {
            /* ── v1.13-B (ECCEZIONE MIRATA, vedi header del file) ────────── */
            const sharedEntry = roomKeySharedWithRef.current[normalizedRoom][peer.username];
            const ROOM_KEY_RETRY_COOLDOWN_MS = 20000;
            /* ── nuovo: vero ciclo manda -> aspetta ack -> ritenta, stile
               Signal/WhatsApp. Se la chiave e' confermata (ack ricevuto), vale
               il normale raffreddamento sopra. Se NON e' ancora confermata, le
               si da' solo una finestra breve (ROOM_KEY_ACK_TIMEOUT_MS) prima di
               considerarla "in ritardo" e ritentare - non tutto il raffredda-
               mento, altrimenti la finestra di rischio (messaggi arrivati
               prima che la chiave sia confermata) resta troppo larga. Dopo
               ROOM_KEY_MAX_ATTEMPTS tentativi falliti ci si ferma (nessun ciclo
               infinito) fino al raffreddamento pieno. */
            const ROOM_KEY_ACK_TIMEOUT_MS = 6000;
            const ROOM_KEY_MAX_ATTEMPTS = 3;
            const sameSession = Boolean(sharedEntry && sharedEntry.sessionId === sessionId);
            const elapsedSinceShared = sharedEntry ? Date.now() - sharedEntry.sharedAt : Infinity;
            const confirmedAndFresh = sameSession && sharedEntry.confirmed && elapsedSinceShared < ROOM_KEY_RETRY_COOLDOWN_MS;
            const pendingAckAndRecent = sameSession && !sharedEntry.confirmed && elapsedSinceShared < ROOM_KEY_ACK_TIMEOUT_MS;
            const pendingButExhausted =
              sameSession && !sharedEntry.confirmed &&
              (sharedEntry.attempt || 1) >= ROOM_KEY_MAX_ATTEMPTS &&
              elapsedSinceShared < ROOM_KEY_RETRY_COOLDOWN_MS;
            const alreadyShared = confirmedAndFresh || pendingAckAndRecent || pendingButExhausted;
            /* ── fine v1.13-B (condizione) ─────────────────────────────────── */

            if (alreadyShared) continue;

            try {
              const liveAccount = olmAccountRef.current;

              /* ── FASE 3 multi-device: encryptRoomKeyForAllDevices al
                 posto di encryptRoomKeyForDevice - restituisce un array
                 (un elemento per dispositivo raggiunto). Se il peer non
                 ha ancora nessun dispositivo registrato (oggi la
                 stragrande maggioranza), l'array ha comunque un solo
                 elemento tramite il fallback interno - stesso identico
                 comportamento di prima in quel caso.
                 NOTA (semplificazione nota, non un bug): il tracciamento
                 conferma/ritentativo sotto (roomKeySharedWithRef) resta
                 per PEER, non per singolo dispositivo - un miglioramento
                 futuro, non necessario oggi dato che la maggior parte
                 dei peer ha ancora un solo dispositivo effettivo. */
              const encryptedResults = await olmService.encryptRoomKeyForAllDevices({
                account: liveAccount,
                username,
                targetUsername: peer.username,
                sessions: peerSessionsRef.current,
                token,
                roomKeyContent,
              });

              if (!encryptedResults || encryptedResults.length === 0) {
                console.warn(`⚠️ nessun dispositivo raggiungibile per ${peer.username}`);
                continue;
              }

              const mySenderKey = olmService.getCurve25519Key(liveAccount);

              if (!mySenderKey) {
                console.warn(
                  `⚠️ sender identity key locale non disponibile, skip invio room_key a ${peer.username}`
                );
                continue;
              }

              syncSessionsState({ ...peerSessionsRef.current });

              let sentAtLeastOne = false;

              for (const encrypted of encryptedResults) {
                const peerIdentityKey = encrypted.peerIdentityKey || null;

                if (!peerIdentityKey) {
                  console.warn(
                    `⚠️ identity key mancante per dispositivo di ${peer.username}`
                  );
                  continue;
                }

                /* ── FIX SICUREZZA (audit E2EE): rimosso il campo
                   room_key: { algorithm, room_id, session_id, session_key }
                   che veniva spedito in chiaro come sibling di ciphertext.
                   Il ricevente (vedi handleToDeviceEvent più sotto) legge la
                   room key SOLO dal contenuto già decifrato via Olm
                   (result.plaintext), mai da questo campo: rimuoverlo non
                   rompe nulla lato ricezione. ─────────────────────────── */
                await inviaChiaveDiStanza(currentUsernameRef.current, authTokenRef.current, {  // [palacan-metadati-a2.2] busta se il destinatario ne ha una
                  eventType: 'm.room_key',
                  targetUsername: peer.username,
                  roomId: normalizedRoom,
                  clientMsgId: `roomkey-${normalizedRoom}-${sessionId}-${peer.username}-${encrypted.deviceId || 'legacy'}`,
                  algorithm: 'm.olm.v1.curve25519-aes-sha2',
                  senderKey: mySenderKey,
                  content: {
                    algorithm: 'm.olm.v1.curve25519-aes-sha2',
                    sender_key: mySenderKey,
                    ciphertext: {
                      [peerIdentityKey]: {
                        type: encrypted.type,
                        body: encrypted.body,
                      },
                    },
                  },
                });

                sentAtLeastOne = true;
              }

              if (!sentAtLeastOne) continue;

              const previousAttempt = sameSession ? (sharedEntry.attempt || 0) : 0;
              const currentAttempt = previousAttempt + 1;

              roomKeySharedWithRef.current[normalizedRoom][peer.username] = {
                sessionId,
                sharedAt: Date.now(),
                confirmed: false,
                attempt: currentAttempt,
              };

              if (currentAttempt < ROOM_KEY_MAX_ATTEMPTS) {
                setTimeout(() => {
                  const entry = roomKeySharedWithRef.current?.[normalizedRoom]?.[peer.username];
                  if (entry && entry.sessionId === sessionId && !entry.confirmed) {
                    console.log(
                      `🔁 [DIAG-KEY] nessun ack per session_id=${sessionId} verso ${peer.username}, ritento (tentativo ${currentAttempt + 1}/${ROOM_KEY_MAX_ATTEMPTS})`
                    );
                    ensureRoomKeyShared(normalizedRoom).catch(() => {});
                  }
                }, ROOM_KEY_ACK_TIMEOUT_MS);
              } else {
                console.warn(
                  `⚠️ [DIAG-KEY] room key verso ${peer.username} non confermata dopo ${ROOM_KEY_MAX_ATTEMPTS} tentativi, mi fermo fino al prossimo giro`
                );
                // [palacan-correzione-sblocco-olm] se anche l'ultimo tentativo non viene confermato, la sessione Olm verso questa persona e'
                // incastrata: la si butta e se ne apre una nuova con una chiave usa e getta nuova (al massimo una volta
                // ogni 10 minuti per persona). Il reset dell'altra parte (v1.11-AB) dall'A2 non parte piu'.
                setTimeout(() => {
                  const entry = roomKeySharedWithRef.current?.[normalizedRoom]?.[peer.username];
                  if (!entry || entry.sessionId !== sessionId || entry.confirmed || !puoSbloccare(peer.username)) return;
                  console.warn(`🔧 [DIAG-KEY] sessione Olm verso ${peer.username} incastrata: la sostituisco con una nuova`);
                  try {
                    if (olmService.dropStaleSessionForPeer(username, peer.username, peerSessionsRef.current)) syncSessionsState({ ...peerSessionsRef.current });
                  } catch (_) { /* il prossimo giro ci riprova */ }
                  if (roomKeySharedWithRef.current?.[normalizedRoom]) delete roomKeySharedWithRef.current[normalizedRoom][peer.username];
                  ensureRoomKeyShared(normalizedRoom).catch(() => {});
                }, ROOM_KEY_ACK_TIMEOUT_MS);
              }
            } catch (e) {
              console.error(`❌ Room key share failed verso ${peer.username}:`, e);
            }
          }
        } catch (e) {
          console.error('❌ ensureRoomKeyShared error:', e);
        }
      });
    },
    [syncSessionsState]
  );

  /* ── RIPRISTINATA: decryptMegolmRoomMessage ─────────────────────────────
     Questa funzione era stata persa in un precedente copia-incolla (la
     dichiarazione mancava pur essendo ancora chiamata da fetchHistory e da
     handleWsMessage più sotto, causando ReferenceError a runtime). Corpo e
     firma invariati rispetto alla versione originariamente presente nel
     file, coerenti con tutte le chiamate esistenti. ─────────────────────── */
  /* [palacan-correzione-sessione-invio] sessione di invio GIA' condivisa con i membri. Prima si condivide (ensureRoomKeyShared, che puo'
     ruotare la sessione: composizione cambiata, eta', recapito, segreto), poi si prende la sessione e si
     verifica che sia quella condivisa; se un'altra rotazione l'ha cambiata nel frattempo, si ricondivide.
     Chi la usa cifra subito, senza altre attese: un messaggio non parte mai con una sessione che nessuno ha. */
  const sessioneCondivisaPerInviare = useCallback(
    async (stanzaDaUsare) => {
      const utente = currentUsernameRef.current;
      const stanzaNormalizzata = normalizeRoomId(stanzaDaUsare);
      let sessione = null;
      for (let tentativo = 0; tentativo < 3; tentativo += 1) {
        await ensureRoomKeyShared(stanzaDaUsare);
        sessione = olmService.getOrCreateOutboundGroupSession(utente, stanzaDaUsare);
        const condivise = roomKeySharedWithRef.current?.[stanzaNormalizzata];
        const voci = condivise ? Object.values(condivise) : [];
        if (voci.length === 0 || voci.some((voce) => voce && voce.sessionId === sessione.session_id())) break;
        console.warn(`🔁 [DIAG-KEY] la sessione di invio non e' quella condivisa (rotazione in corso): ricondivido (tentativo ${tentativo + 2}/3)`);
      }
      return sessione;
    },
    [ensureRoomKeyShared]
  );

  /* [palacan-l4e] (ECCEZIONE MIRATA, approvata) dati per avviare le chiamate cifrati end-to-end (utils/segnaliChiamata.js).
     In uscita: prima si condivide la chiave della chat (solo ai dispositivi firmati, L4c3); poi, nello stesso istante e
     senza pause, si carica la sessione di invio, si cifra e la si salva: due cifrature non usano mai lo stesso indice.
     Una cifratura alla volta (i candidati ICE arrivano a raffica).
     In arrivo: si apre con le chiavi in entrata; se la chiave della chat arriva un attimo dopo, si riprova. */
  cifraSegnaleChiamataRef.current = (stanza, tipo, dati) => inCodaSegnaliChiamata(async () => {
    const utente = currentUsernameRef.current;
    await condividiChiaveUnaVoltaPerChiamata(normalizeRoomId(stanza), () => sessioneCondivisaPerInviare(stanza));  // [palacan-r1] L4e-bis
    const sessione = olmService.getOrCreateOutboundGroupSession(utente, stanza);
    const busta = cifraSegnaleChiamata({ olm: olmService, sessione, stanza: normalizeRoomId(stanza), tipo, mittente: utente, dati });
    olmService.saveOutboundGroupSession(utente, stanza, sessione);
    return busta;
  });
  apriSegnaleChiamataRef.current = (evento) => {
    riceviSegnaleChiamata({
      apri: () => apriSegnaleChiamata({
        olm: olmService, evento, sessioni: inboundGroupSessionsRef.current || {}, io: currentUsernameRef.current, normalizza: normalizeRoomId,
      }),
      consegna: (dati) => setCallSignalEvent({ ...evento, data: dati, _receivedAt: Date.now() }),
      scarta: (motivo) => console.warn(`⚠️ [L4e] segnale di chiamata scartato (${evento?.signal_type}): ${motivo}`),
    });
  };

  // [palacan-n5] eccezione mirata (approvata): le chiavi di stanza mancanti si chiedono anche agli ALTRI membri
  // della stanza (regole e controlli in utils/richiesteChiavi.js). La richiesta non porta l'identificativo della
  // chiave (il server non deve sapere quale chiave cifra quali messaggi). Parte solo se dopo qualche secondo ci
  // sono ancora messaggi di quella stanza in attesa; al massimo una volta al minuto per stanza.
  const chiediChiaviAiMembri = (stanza) => programmaRichiestaMembri(stanza, async () => {
    const io = currentUsernameRef.current;
    const token = authTokenRef.current;
    const miaChiave = olmService.getCurve25519Key(olmAccountRef.current);
    if (!io || !token || !miaChiave) return false;
    const ancoraInAttesa = Object.values(pendingEncryptedMessagesRef.current || {}).some(
      (elenco) => Array.isArray(elenco) && elenco.some((m) => String(m.roomId) === String(stanza))
    );
    if (!ancoraInAttesa) return false;
    const destinatari = destinatariRichiesta(await apiService.getRoomUsers(stanza, token), io);
    if (destinatari.length === 0) return false;
    segnaRichiesta(stanza);
    const mioDispositivo = olmService.getOrCreateDeviceId();
    for (const nome of destinatari) {
      sendToDevice({
        eventType: 'm.room_key_request',
        targetUsername: nome,
        roomId: stanza,
        clientMsgId: `richiestachiavi-${stanza}-${mioDispositivo}-${nome}-${Date.now()}`,
        algorithm: 'm.olm.v1.curve25519-aes-sha2',
        senderKey: miaChiave,
        content: { room_id: stanza, requesting_device_id: mioDispositivo },
      });
    }
    console.log(`📮 [N5] chiavi mancanti chieste a ${destinatari.length} membro/i della stanza ${stanza}`);
    return true;
  });
  // [palacan-n5] fine

  const decryptMegolmRoomMessage = useCallback(
    async ({
      senderUsername,
      roomId,
      sessionId,
      cipherBody,
      messageId,
      createdAt,
      append = true,
    }) => {
      const username = currentUsernameRef.current;
      const normalizedRoom = normalizeRoomId(roomId);

      /* ── FIX: rimossa la condizione "senderUsername === username" che
         impediva di provare a decifrare i propri messaggi. Ora che
         ensureRoomKeyShared importa anche una copia "in entrata" della
         propria sessione, questa funzione funziona correttamente anche
         per i messaggi mandati da se stessi. */
      // [palacan-metadati-3.4b] canale anonimo: il mittente dichiarato e il session_id possono mancare. Il mittente lo
      // ricava il creatore della chiave (3.1); senza session_id si provano le chiavi di questa stanza.
      if (!normalizedRoom || !cipherBody) return null;
      if (!sessionId) {
        const trovata = trovaChiaveDellaStanza(
          currentUsernameRef.current, normalizedRoom, cipherBody,
          inboundGroupSessionsRef.current || {}, olmService.decryptGroupMessage,
        );
        if (!trovata) {
          const attesa = pendingEncryptedMessagesRef.current;
          const chiaveAttesa = `stanza:${normalizedRoom}`;
          if (!attesa[chiaveAttesa]) attesa[chiaveAttesa] = [];
          if (!attesa[chiaveAttesa].some((m) => String(m.messageId) === String(messageId))) {
            attesa[chiaveAttesa].push({ senderUsername, roomId: normalizedRoom, sessionId: null, cipherBody, messageId, createdAt });
          }
          console.log(`📥 [DIAG-ANON] messaggio ${messageId} in attesa di una chiave della stanza ${normalizedRoom}`);  // [palacan-correzione-cronologia-vivo]
          chiediChiaviAiMembri(normalizedRoom);  // [palacan-n5] anche agli altri membri della stanza
          return null;
        }
        sessionId = trovata;
      }

      const inboundMap = inboundGroupSessionsRef.current || {};
      const inboundSession = inboundMap[sessionId];

      if (!inboundSession) {
        console.warn(`⚠️ Nessuna inbound group session per session_id=${sessionId}`);

        /* ── v1.12-C (ECCEZIONE MIRATA, vedi header del file) ─────────────
           Solo per messaggi LIVE (append === true, cioè arrivati dal
           WebSocket in tempo reale, non dallo storico di fetchHistory, che
           si autocorregge da solo al prossimo giro): bufferizziamo il
           payload invece di scartarlo, indicizzato per session_id. Verrà
           ritentato automaticamente da handleToDeviceEvent non appena la
           m.room_key con questo stesso session_id viene salvata (di solito
           pochi istanti dopo, arriva su un canale separato). Dedup per
           messageId per sicurezza in caso di doppia consegna dal server. */
        /* ── v1.13-A (ECCEZIONE MIRATA, vedi header del file): rimossa la
           condizione `if (append)` che c'era qui — ora bufferizziamo
           SEMPRE, anche per i messaggi dello storico (fetchHistory,
           append=false), non solo per quelli live. Corpo interno
           invariato rispetto a v1.12-C. ─────────────────────────────── */
        {
          const buffer = pendingEncryptedMessagesRef.current;
          if (!buffer[sessionId]) buffer[sessionId] = [];

          const alreadyBuffered = buffer[sessionId].some(
            (m) => String(m.messageId) === String(messageId)
          );

          if (!alreadyBuffered) {
            buffer[sessionId].push({
              senderUsername,
              roomId: normalizedRoom,
              sessionId,
              cipherBody,
              messageId,
              createdAt,
            });
            console.log(
              `📥 Messaggio ${messageId} bufferizzato in attesa della room key (session_id=${sessionId})`
            );
          }
        }
        /* ── fine v1.13-A / v1.12-C ───────────────────────────────────── */

        /* ── ECCEZIONE MIRATA v1.14-C (m.room_key_request): se la chiave
           non arriva entro ROOM_KEY_REQUEST_DELAY_MS dal primo tentativo
           di decifratura per questo session_id, proviamo a recuperarla
           da un PROPRIO altro dispositivo. Un solo timer per session_id
           (tracker a livello di modulo, sezione UTILITIES) - messaggi
           successivi con lo stesso session_id non ne programmano un
           secondo. Al momento in cui il timer scatta, ricontrolliamo se
           la sessione e' nel frattempo arrivata per la via normale
           (condivisione diretta) - in quel caso non mandiamo nulla,
           evitando una richiesta inutile per il caso comune (si e' solo
           aperta la stanza da poco, la condivisione normale arrivera' a
           breve). Nessuna riga precedente di questo blocco toccata. */
        if (!roomKeyRequestTimers[sessionId]) {
          roomKeyRequestTimers[sessionId] = setTimeout(() => {
            delete roomKeyRequestTimers[sessionId];

            if (inboundGroupSessionsRef.current?.[sessionId]) return;

            const requestUsername = currentUsernameRef.current;
            const requestToken = authTokenRef.current;
            if (!requestUsername || !requestToken) return;

            const myDeviceId = olmService.getOrCreateDeviceId();
            const mySenderKey = olmService.getCurve25519Key(olmAccountRef.current);
            if (!mySenderKey) return;

            try {
              sendToDevice({
                eventType: 'm.room_key_request',
                targetUsername: requestUsername,
                roomId: normalizedRoom,
                clientMsgId: `roomkeyrequest-${normalizedRoom}-${sessionId}-${myDeviceId}`,
                algorithm: 'm.olm.v1.curve25519-aes-sha2',
                senderKey: mySenderKey,
                content: {
                  room_id: normalizedRoom,
                  session_id: sessionId,
                  requesting_device_id: myDeviceId,
                },
              });
              console.log(
                `📮 Richiesta room key mandata ai miei altri dispositivi (session_id=${sessionId})`
              );
            } catch (e) {
              console.error('❌ invio m.room_key_request fallito (non bloccante):', e);
            }
          }, ROOM_KEY_REQUEST_DELAY_MS);
        }
        /* ── fine v1.14-C ─────────────────────────────────────────────── */
        chiediChiaviAiMembri(normalizedRoom);  // [palacan-n5] anche agli altri membri della stanza

        return null;
      }

      try {
        const decrypted = olmService.decryptGroupMessage(inboundSession, cipherBody);
        const parsed = olmService.safeParseOlmPayload(decrypted.plaintext);
        const text = normalizeMessageText(parsed);
        const replyTo = (parsed && typeof parsed === 'object' && parsed.replyTo) || undefined;

        // [palacan-correzione-blocco-reazioni] una reazione non ha testo: deve arrivare al suo ramo (piu' sotto), non essere scartata qui
        if (!text && !(parsed && typeof parsed === 'object' && (parsed.tipo === 'reazione' || parsed.tipo === 'nome_stanza'))) return null;  // [palacan-metadati-a3.2b1]

        /* [palacan-n5e] (ECCEZIONE MIRATA, approvata) autore dimostrato dall'attestato firmato dentro il messaggio:
           corregge il registro se un inoltro o il server dicevano altro; se la firma non e' ancora verificabile e non
           coincide, il messaggio non si mostra con un autore sbagliato: aspetta la chiave di firma e si ritenta da solo */
        const esitoFirma = confermaAutoreFirmato(username, sessionId, normalizedRoom, parsed, senderUsername);
        if (esitoFirma.sospetto) {
          mettiInAttesaDiFirma(esitoFirma.utente, { senderUsername, roomId: normalizedRoom, sessionId, cipherBody, messageId, createdAt });
          return null;
        }
        const verificaMittente = mittenteVerificato(username, sessionId, senderUsername);  // [palacan-metadati-3.1]
        if (!verificaMittente.mittente) return null;  // [palacan-metadati-3.4b] mai un messaggio senza autore verificabile
        if (!verificaMittente.verificato && verificaMittente.mittente && sessionId) registraCreatore(username, sessionId, { utente: verificaMittente.mittente, verifica: 'server', stanza: normalizedRoom });  // [palacan-verifica-d1b] autore dei messaggi vecchi sul dispositivo
        // [palacan-metadati-3.4d-blocco] chat diretta con un contatto bloccato: i suoi messaggi scritti dopo il blocco non si mostrano
        if (messaggioDaBloccato(
          verificaMittente.mittente,
          oraMessaggio(parsed, createdAt),
          Boolean(currentRoomRef.current) && String(currentRoomRef.current.id) === String(normalizedRoom) && currentRoomRef.current.room_kind === 'direct',
        )) return null;
        // [palacan-metadati-3.6] reazione: non e' un messaggio da mostrare, aggiorna le reazioni del messaggio bersaglio
        if (parsed && typeof parsed === 'object' && parsed.tipo === 'reazione') {
          applicaReazione({ roomId: normalizedRoom, bersaglio: parsed.bersaglio, autore: verificaMittente.mittente, emoji: parsed.emoji || null, ordine: Date.parse(oraMessaggio(parsed, createdAt)) || 0 });
          return null;
        }
        // [palacan-metadati-a3.2b1] nome nuovo di un gruppo privato da un membro verificato: si impara, non si mostra
        if (parsed && typeof parsed === 'object' && parsed.tipo === 'nome_stanza') {
          imparaNomeStanza(normalizedRoom, parsed.nome, Date.parse(oraMessaggio(parsed, createdAt)) || Date.now());
          return null;
        }
        const normalized = {
          id: messageId,
          text,
          replyTo,
          sender: verificaMittente.mittente,  // [palacan-metadati-3.1] creatore della chiave, non il nome dato dal server
          mittenteDiscrepante: verificaMittente.discrepanza,
          type: 'peer',
          created_at: oraMessaggio(parsed, createdAt),  // [palacan-metadati-3.4a] ora dal messaggio cifrato, se vicina a quella del server
          room_id: normalizedRoom,
          session_id: sessionId,
        };

        if (append) {
          setMessages((prev) => {
            if (prev.some((m) => String(m.id) === String(messageId))) return prev;
            return [...prev, normalized];
          });
        }

        return normalized;
      } catch (e) {
        /* ── v1.11-AD (ECCEZIONE MIRATA, vedi header del file) ─────────────
           OLM.UNKNOWN_MESSAGE_INDEX è un fallimento TERMINALE, non
           temporaneo: significa che l'inbound session locale parte da un
           ratchet index successivo a quello con cui questo specifico
           messaggio è stato cifrato (tipico dopo un session_reset che
           ricondivide la room key da un punto avanzato — vedi v1.11-AC).
           Non è recuperabile con retry: il messaggio resta indecifrabile
           per questo dispositivo per sempre, coerente con la forward
           secrecy di Megolm. Invece di limitarsi a un console.error (che
           lascia il messaggio silenziosamente assente dalla UI e rischia
           di essere ritentato ad ogni fetchHistory), lo trattiamo come
           caso esplicito: nessun retry, e se append è richiesto, mostriamo
           un placeholder visibile invece di ometterlo. Nessuna riga
           preesistente toccata, solo il ramo catch esteso. */
        const isTerminalIndexError = String(e?.message || e || '').includes(
          'UNKNOWN_MESSAGE_INDEX'
        );

        if (isTerminalIndexError) {
          console.warn(
            `🔒 Messaggio ${messageId} non decifrabile su questo dispositivo (session index avanzato dopo un reset)`
          );

          if (append) {
            const placeholder = {
              id: messageId,
              text: null,
              undecryptable: true,
              sender: senderUsername,
              type: 'peer',
              created_at: createdAt || null,
              room_id: normalizedRoom,
              session_id: sessionId,
            };
            setMessages((prev) => {
              if (prev.some((m) => String(m.id) === String(messageId))) return prev;
              return [...prev, placeholder];
            });
            return placeholder;
          }

          return null;
        }

        console.error('❌ decryptMegolmRoomMessage error:', e);
        return null;
      }
    },
    []
  );
  /* -- fine decryptMegolmRoomMessage ------------------------------------- */

  /* -- encryptReaction / decryptReaction: stessa sequenza Megolm di
     handleSendMessage/decryptMegolmRoomMessage, applicata a un'emoji invece
     che al testo del messaggio. Nessuna nuova primitiva di cifratura, stesso
     layer, stesso codice. Aggiunte pure, nessuna riga esistente toccata. -- */
  const encryptReaction = useCallback(async (roomId, emoji) => {
    const username = currentUsernameRef.current;
    const normalizedRoom = normalizeRoomId(roomId);
    if (!normalizedRoom || !username || !emoji) {
      throw new Error('Parametri non validi per cifrare la reazione.');
    }

    const outboundGroupSession = await sessioneCondivisaPerInviare(normalizedRoom);  // [palacan-correzione-sessione-invio]

    const encryptedPayload = olmService.encryptGroupMessage(outboundGroupSession, {
      type: 'reaction',
      emoji,
    });

    /* stesso motivo del fix v1.6-F su handleSendMessage: ri-salvare SUBITO
       dopo encryptGroupMessage, altrimenti il prossimo encrypt su questa
       stanza ricarica da localStorage lo stato PRE-encrypt. */
    olmService.saveOutboundGroupSession(username, normalizedRoom, outboundGroupSession);

    const senderKey = await olmService.withAccountLock(async () =>
      olmService.getCurve25519Key(olmAccountRef.current)
    );

    return {
      cipherBody: encryptedPayload,
      sessionId: outboundGroupSession.session_id(),
      algorithm: 'm.megolm.v1.aes-sha2',
      senderKey,
    };
  }, [ensureRoomKeyShared]);

  const decryptReaction = useCallback(({ sessionId, cipherBody }) => {
    if (!sessionId || !cipherBody) return null;

    const inboundMap = inboundGroupSessionsRef.current || {};
    const inboundSession = inboundMap[sessionId];
    if (!inboundSession) return null;

    try {
      const decrypted = olmService.decryptGroupMessage(inboundSession, cipherBody);
      const parsed = olmService.safeParseOlmPayload(decrypted.plaintext);
      if (parsed && typeof parsed === 'object' && parsed.type === 'reaction' && parsed.emoji) {
        return parsed.emoji;
      }
      return null;
    } catch (e) {
      console.warn('Errore decrittazione reazione (session_id=' + sessionId + '):', e);
      return null;
    }
  }, []);
  /* -- fine encryptReaction / decryptReaction ----------------------------- */

  // [palacan-metadati-3.6] reazione come piccolo messaggio cifrato: stesso canale dei messaggi, nessun autore sul server.
  // emoji vuota = reazione tolta. La raccolta locale si aggiorna subito (poi arriva la conferma).
  const inviaReazione = useCallback(async (roomId, bersaglio, emoji) => {
    const username = currentUsernameRef.current;
    const token = authTokenRef.current;
    const stanza = normalizeRoomId(roomId);
    if (!stanza || !username || !bersaglio) throw new Error('Parametri non validi per la reazione.');
    applicaReazione({ roomId: stanza, bersaglio: String(bersaglio), autore: username, emoji: emoji || null, ordine: Date.now() });
    const sessione = await sessioneCondivisaPerInviare(stanza);  // [palacan-correzione-sessione-invio]
    const cifrato = olmService.encryptGroupMessage(sessione, { tipo: 'reazione', bersaglio: String(bersaglio), emoji: emoji || null });
    olmService.saveOutboundGroupSession(username, stanza, sessione);
    const idLocale = `reazione-${nuovoIdProvvisorio()}`;  // [palacan-m1c] eccezione mirata approvata: identificativo casuale, senza l'ora
    if (stanzaPrivata(currentRoomRef.current)) {
      await inviaAnonimoConTentativi({ roomId: stanza, token, username, cipherBody: cifrato, clientMsgId: idLocale, eventKind: 'reaction' });
    } else {
      await apiService.sendReactionEvent(stanza, { cipher_body: cifrato, client_msg_id: idLocale }, token);
    }
  }, [ensureRoomKeyShared]);

  // [palacan-metadati-a3.2b1] rinomina di un gruppo privato: il nome nuovo va ai membri come piccolo messaggio cifrato,
  // sullo stesso canale anonimo delle reazioni (il server non vede ne' il nome ne' chi rinomina)
  const inviaNomeGruppo = useCallback(async (roomId, nome) => {
    const username = currentUsernameRef.current;
    const token = authTokenRef.current;
    const stanza = normalizeRoomId(roomId);
    const pulito = String(nome || '').trim().slice(0, 100);
    if (!stanza || !username || !token || !pulito) return;
    const sessione = await sessioneCondivisaPerInviare(stanza);  // [palacan-correzione-sessione-invio]
    const cifrato = olmService.encryptGroupMessage(sessione, { tipo: 'nome_stanza', nome: pulito });
    olmService.saveOutboundGroupSession(username, stanza, sessione);
    const idLocale = `nome-${nuovoIdProvvisorio()}`;  // [palacan-m1c] eccezione mirata approvata: identificativo casuale, senza l'ora
    await inviaAnonimoConTentativi({ roomId: stanza, token, username, cipherBody: cifrato, clientMsgId: idLocale, eventKind: 'reaction' });
    if (olmAccountRef.current) aggiornaNomeStatoGruppo({ roomId: stanza, nome: pulito, io: username, token, firmatore: (testo) => olmAccountRef.current.sign(testo), miaChiave: olmService.getEd25519Key(olmAccountRef.current) }).catch(() => {});  // [palacan-metadati-a4.2b] nome anche nello stato
  }, [ensureRoomKeyShared]);

  useEffect(() => {
    const suRinomina = (evento) => {
      const dati = evento?.detail || {};
      inviaNomeGruppo(dati.roomId, dati.nome).catch((errore) => console.warn('Invio del nome del gruppo non riuscito:', errore));
    };
    window.addEventListener('palacan:rinomina-gruppo', suRinomina);
    return () => window.removeEventListener('palacan:rinomina-gruppo', suRinomina);
  }, [inviaNomeGruppo]);

  /* -- handleCreateTask: stessa sequenza Megolm di handleSendMessage
     (ensureRoomKeyShared -> getOrCreateOutboundGroupSession ->
     encryptGroupMessage -> RE-SAVE della sessione, fix v1.6-F, -> senderKey),
     applicata al contenuto del task invece che al testo del messaggio.
     Nessuna nuova primitiva di cifratura: stesso layer, stesso codice. ---- */
  const handleCreateTask = useCallback(
    async (roomId, { title, description = '', assignedToUserId = null, dueDate = null }) => {
      const username = currentUsernameRef.current;
      const token = authTokenRef.current;
      const normalizedRoom = normalizeRoomId(roomId);

      if (!normalizedRoom || !token || !username) {
        throw new Error('Sessione non valida per creare un task.');
      }
      if (!title || !title.trim()) {
        throw new Error('Il titolo del task e\' obbligatorio.');
      }

      await ensureRoomKeyShared(normalizedRoom);

      const outboundGroupSession = olmService.getOrCreateOutboundGroupSession(
        username,
        normalizedRoom
      );
      olmService.saveOutboundGroupSession(username, normalizedRoom, outboundGroupSession);

      const encryptedPayload = olmService.encryptGroupMessage(outboundGroupSession, {
        title: title.trim(),
        description: description || '',
      });

      /* -- stesso fix v1.6-F di handleSendMessage: encryptGroupMessage avanza
         il ratchet SOLO in memoria. Senza ri-persistere subito, il prossimo
         task/messaggio in questa stanza ricaricherebbe da localStorage lo
         stato PRE-encrypt, causando riuso del message_index Megolm. ------- */
      olmService.saveOutboundGroupSession(username, normalizedRoom, outboundGroupSession);

      const senderKey = await olmService.withAccountLock(async () =>
        olmService.getCurve25519Key(olmAccountRef.current)
      );

      const created = await apiService.createTask(
        normalizedRoom,
        {
          assigned_to_user_id: assignedToUserId || null,
          due_date: dueDate || null,
          payload: {
            algorithm: 'm.megolm.v1.aes-sha2',
            session_id: outboundGroupSession.session_id(),
            sender_key: senderKey,
            cipher_type: null,
            cipher_body: encryptedPayload,
          },
        },
        token
      );

      return created;
    },
    [ensureRoomKeyShared]
  );

  /* -- decryptTaskList: stesso pattern di decryptMegolmRoomMessage, ma
     senza la logica di buffering v1.12-C (qui non serve: i task si
     ricaricano on-demand quando si riapre il pannello, non arrivano in
     streaming dal WebSocket -- se la inbound session non c'e' ancora, il
     prossimo refresh la trovera'). Un task non decifrabile viene marcato
     undecryptable invece di essere scartato. ----------------------------- */
  const decryptTaskList = useCallback((rawTasks) => {
    const inboundMap = inboundGroupSessionsRef.current || {};

    return (Array.isArray(rawTasks) ? rawTasks : []).map((task) => {
      const sessionId = task?.payload?.session_id;
      const cipherBody = task?.payload?.cipher_body;

      if (!sessionId || !cipherBody) {
        return { ...task, title: '', description: '', undecryptable: true };
      }

      const inboundSession = inboundMap[sessionId];
      if (!inboundSession) {
        console.warn(`⚠️ Nessuna inbound group session per task (session_id=${sessionId})`);
        return { ...task, title: '', description: '', undecryptable: true };
      }

      try {
        const decrypted = olmService.decryptGroupMessage(inboundSession, cipherBody);
        const parsed = olmService.safeParseOlmPayload(decrypted.plaintext);

        return {
          ...task,
          title: (parsed && parsed.title) || '',
          description: (parsed && parsed.description) || '',
          undecryptable: false,
        };
      } catch (e) {
        console.error('❌ decryptTaskList error:', e);
        return { ...task, title: '', description: '', undecryptable: true };
      }
    });
  }, []);

  const decryptIncomingLegacyMessage = useCallback(
    async ({
      senderUsername,
      senderIdentityKey = null,
      cipherBody,
      cipherType,
      messageId,
      createdAt,
      append = true,
    }) => {
      const acc = olmAccountRef.current;
      const token = authTokenRef.current;
      const username = currentUsernameRef.current;

      if (!acc || !token || !username) return null;
      if (!senderUsername || senderUsername === username) return null;
      if (cipherBody === undefined || cipherBody === null) return null;
      if (cipherType === undefined || cipherType === null) return null;

      try {
        const result = await olmService.decryptOlmEvent({
          account: acc,
          username,
          senderUsername,
          senderIdentityKey,
          messageType: Number(cipherType),
          messageBody: cipherBody,
          sessions: peerSessionsRef.current,
          token,
        });

        if (result?.account) setCurrentOlmAccount(result.account);
        if (!result?.plaintext) return null;

        syncSessionsState({ ...peerSessionsRef.current });

        const parsed = olmService.safeParseOlmPayload(result.plaintext);
        const text = typeof parsed === 'string' ? parsed : normalizeMessageText(parsed);

        if (!text) return null;

        const normalized = {
          id: messageId,
          text,
          sender: senderUsername,
          type: 'peer',
          created_at: createdAt || null,
        };

        if (append) {
          setMessages((prev) => {
            if (prev.some((m) => String(m.id) === String(messageId))) return prev;
            return [...prev, normalized];
          });
        }

        return normalized;
      } catch (e) {
        console.error('Decryption error:', e, { senderUsername, cipherType, messageId });
        return null;
      }
    },
    [setCurrentOlmAccount, syncSessionsState]
  );

  const fetchHistory = useCallback(async () => {
    const roomId = currentRoomRef.current?.id;
    const token = authTokenRef.current;
    const username = currentUsernameRef.current;
    const acc = olmAccountRef.current;

    if (!roomId || !token || !username || !acc) return;

    const requestId = ++fetchHistoryRequestIdRef.current;

    try {
      /* ── v1.13-B (ECCEZIONE MIRATA, vedi header del file) ────────────── */
      historyLoadInProgressRef.current = true;
      /* ── fine v1.13-B (inizio) ────────────────────────────────────────── */
      const msgs = await apiService.getRoomMessages(roomId, token);
      if (!Array.isArray(msgs)) return;

      const decrypted = [];
      /* ── FIX bug primo messaggio (vedi commento piu' sotto, dopo il
         giro principale): raccoglie qui i messaggi room_encrypted il
         cui PRIMO tentativo di decrittazione e' fallito in questo
         stesso giro di fetchHistory, per ritentarli una volta sola
         subito dopo, prima di costruire il setMessages finale. ──── */
      const pendingRetryThisPass = [];

      for (const msg of msgs) {
        const senderUsername = msg.sender_username || msg.sender || msg.senderUsername;
        const senderIdentityKey = msg.sender_key || msg.senderKey || msg.curve25519 || null;
        const messageId = msg.id;
        const createdAt = msg.created_at || msg.createdAt || null;

        // [palacan-metadati-3.4c] messaggio del canale anonimo: il server non dice chi l'ha scritto; lo dice il creatore
        // della chiave (3.1). Se l'autore e' questo utente, e' un messaggio proprio.
        if (msg.anonimo === true && (msg.event_kind === 'room_encrypted' || msg.event_type === 'm.room.encrypted')) {
          const parametriAnonimi = {
            senderUsername: null,
            roomId: msg.room_id || msg.roomId || roomId,
            sessionId: msg.session_id || msg.sessionId || null,
            cipherBody: msg.cipher_body || msg.ciphertext,
            messageId,
            createdAt,
            clientMsgId: msg.client_msg_id || msg.clientMsgId || null,
          };
          const itemAnonimo = await decryptMegolmRoomMessage({ ...parametriAnonimi, append: false });
          if (itemAnonimo && itemAnonimo.sender === username) {
            decrypted.push({ ...itemAnonimo, type: 'self', client_msg_id: parametriAnonimi.clientMsgId });
          } else if (itemAnonimo) {
            decrypted.push(itemAnonimo);
          } else {
            pendingRetryThisPass.push(parametriAnonimi);
          }
          continue;
        }
        if (!senderUsername) continue;

        /* ── v1.7-H1: system_join — testo di sistema già in chiaro ────────
           Il backend genera cipher_body in chiaro solo per event_kind
           'system_join' (mai per messaggi utente reali). Nessun passaggio
           da Olm/Megolm: si legge direttamente. Va controllato PRIMA del
           ramo "senderUsername === username" perché chi si unisce riceve
           anche il proprio system message come sender. ────────────────── */
        const eventKind = msg.event_kind || msg.eventKind;

        if (eventKind === 'system_join') {
          const systemText =
            typeof msg.cipher_body === 'string'
              ? msg.cipher_body
              : typeof msg.cipherBody === 'string'
              ? msg.cipherBody
              : typeof msg.ciphertext === 'string'
              ? msg.ciphertext
              : null;

          if (systemText) {
            decrypted.push({
              id: messageId,
              text: systemText,
              sender: null,
              type: 'system',
              created_at: createdAt,
              room_id: msg.room_id || msg.roomId || roomId,
            });
          }
          continue;
        }
        /* ── fine v1.7-H1 ─────────────────────────────────────────────── */

        if (senderUsername === username) {
          /* ── FIX end-to-end: i messaggi propri ora si decifrano con la
             vera sessione Megolm (auto-importata "in entrata" al momento
             della creazione - vedi ensureRoomKeyShared), esattamente come
             quelli ricevuti da altri. Prima si dipendeva SOLO dalla cache
             locale sentMessagesCacheRef, che non sopravvive alla chiusura
             di una finestra in incognito ne' viene mai inclusa nel backup
             con passphrase. La cache resta come riserva finale, usata solo
             se la decifrazione vera fallisse comunque. */
          const clientMsgId = msg.client_msg_id || msg.clientMsgId || null;
          let text = null;
          let replyTo = undefined;

          if (msg.event_kind === 'room_encrypted' || msg.event_type === 'm.room.encrypted') {
            const item = await decryptMegolmRoomMessage({
              senderUsername,
              roomId: msg.room_id || msg.roomId || roomId,
              sessionId: msg.session_id || msg.sessionId,
              cipherBody: msg.cipher_body || msg.ciphertext,
              messageId,
              createdAt,
              append: false,
            });
            if (item) {
              text = item.text;
              replyTo = item.replyTo;
            }
          }

          if (!text) {
            const cachedEntry = clientMsgId ? sentMessagesCacheRef.current[clientMsgId] : null;
            text = cachedEntry && typeof cachedEntry === 'object' ? cachedEntry.text : cachedEntry;
            if (!replyTo) {
              replyTo = cachedEntry && typeof cachedEntry === 'object' ? cachedEntry.replyTo : null;
            }
          }

          decrypted.push({
            id: messageId,
            text: text || '[messaggio inviato]',
            replyTo: replyTo || undefined,
            sender: username,
            type: 'self',
            created_at: createdAt,
            room_id: msg.room_id || msg.roomId || roomId,
            client_msg_id: clientMsgId,
          });
          /* ── fine FIX end-to-end ───────────────────────────────────────── */
          continue;
        }

        if (msg.event_kind === 'room_encrypted' || msg.event_type === 'm.room.encrypted') {
          const roomEncryptedParams = {
            senderUsername,
            roomId: msg.room_id || msg.roomId || roomId,
            sessionId: msg.session_id || msg.sessionId,
            cipherBody: msg.cipher_body || msg.ciphertext,
            messageId,
            createdAt,
          };
          const item = await decryptMegolmRoomMessage({ ...roomEncryptedParams, append: false });
          console.log(`[DIAG ${performance.now().toFixed(0)}ms] fetchHistory: messaggio ${messageId} da ${senderUsername}, session=${msg.session_id || msg.sessionId} -> ${item ? 'DECIFRATO OK' : 'FALLITO/SCARTATO (item=null)'}`);
          if (item) {
            decrypted.push(item);
          } else {
            /* ── FIX bug primo messaggio: la sessione potrebbe arrivare
               (ed essere drenata dal buffer v1.12-C) DURANTE il resto
               di questo stesso giro - lo ritentiamo dopo il giro
               principale invece di lasciarlo solo al drenaggio
               asincrono, il cui setMessages viene poi sovrascritto dal
               setMessages finale di fetchHistory (v1.10-X piu' sotto),
               che si basa solo su `decrypted`. ─────────────────────── */
            pendingRetryThisPass.push(roomEncryptedParams);
          }
          continue;
        }

        const item = await decryptIncomingLegacyMessage({
          senderUsername,
          senderIdentityKey,
          cipherBody: msg.cipher_body || msg.ciphertext,
          cipherType: msg.cipher_type ?? msg.cipherType,
          messageId,
          createdAt,
          append: false,
        });

        if (item) decrypted.push(item);
      }

      /* ── FIX bug primo messaggio: secondo (e ultimo) tentativo, alla
         fine dello stesso giro, per ogni messaggio room_encrypted
         fallito la prima volta - se la sessione e' nel frattempo
         diventata disponibile (vedi log reali: messaggi successivi
         nella STESSA sessione decifravano subito dopo), lo recupera
         dentro `decrypted` invece di lasciarlo dipendere dalla
         tempistica del drenaggio asincrono del buffer. append:false
         come il primo tentativo: non deve fare un proprio setMessages
         parallelo, solo contribuire a `decrypted` per il setMessages
         finale qui sotto. ──────────────────────────────────────────── */
      for (const failedItem of pendingRetryThisPass) {
        const retryItem = await decryptMegolmRoomMessage({ ...failedItem, append: false });
        if (retryItem) {
          console.log(
            `[DIAG ${performance.now().toFixed(0)}ms] fetchHistory: secondo tentativo per messaggio ${failedItem.messageId} -> RECUPERATO`
          );
          decrypted.push(retryItem.sender === username ? { ...retryItem, type: 'self', client_msg_id: failedItem.clientMsgId || null } : retryItem);  // [palacan-metadati-3.4c]
        }
      }
      /* ── fine fix bug primo messaggio ─────────────────────────────── */

      /* ── v1.10-X (ECCEZIONE MIRATA, vedi header del file) ──────────────
         Forma funzionale invece di setMessages(() => ...): serve SOLO per
         leggere prevMessages e ripescare eventuali messaggi ottimistici
         propri non ancora confermati dal server (vedi punto X per la
         spiegazione completa della race che altrimenti li cancellava).
         v1.10-Y: aggiunto un controllo in più (confirmedClientMsgIds) per
         NON ripescare un ottimistico il cui client_msg_id corrisponde già
         a un messaggio "self" appena ricostruito da `decrypted` — altrimenti
         quel messaggio finirebbe duplicato (una volta come messaggio reale
         dal server, una volta come ottimistico ripescato), visibile solo
         nella chat del mittente. Nessun'altra riga di questa funzione è
         stata toccata: il fetch, la decrittazione di ogni messaggio e
         l'ordinamento finale sono identici a prima. */
      // [palacan-metadati-3.4d-ter] messaggi in coda di uscita (non ancora partiti): ricompaiono come "non inviato" dopo un ricaricamento
      for (const voce of leggiUscita(username)) {
        if (String(voce.roomId) !== String(roomId)) continue;
        if (decrypted.some((m) => String(m.client_msg_id || '') === String(voce.clientMsgId))) {
          togliDaUscita(username, voce.clientMsgId);
          continue;
        }
        const salvato = sentMessagesCacheRef.current[voce.clientMsgId];
        decrypted.push({
          id: voce.clientMsgId,
          text: (salvato && typeof salvato === 'object' ? salvato.text : salvato) || '…',
          replyTo: salvato && typeof salvato === 'object' && salvato.replyTo ? salvato.replyTo : undefined,
          sender: username,
          type: 'self',
          created_at: new Date(voce.creato || Date.now()).toISOString(),
          room_id: roomId,
          failed: true,
          failReason: 'offline',
        });
      }
      const confirmedClientMsgIds = new Set(
        decrypted
          .filter((item) => item.type === 'self' && item.client_msg_id)
          .map((item) => String(item.client_msg_id))
      );

      /* ── FIX race fetchHistory: se nel frattempo e' partita una
         chiamata piu' recente, questa e' superata - ci ritiriamo
         senza scrivere. ───────────────────────────────────────────── */
      if (fetchHistoryRequestIdRef.current !== requestId) {
        console.log(
          `[DIAG ${performance.now().toFixed(0)}ms] fetchHistory: chiamata #${requestId} superata da una piu' recente, setMessages saltato`
        );
        return;
      }

      setMessages((prevMessages) => {
        const unique = new Map();
        for (const item of decrypted) unique.set(String(item.id), item);

        for (const prevItem of prevMessages) {
          const key = String(prevItem?.id);
          if (unique.has(key)) continue;
          if (confirmedClientMsgIds.has(key)) continue;
          if (isOptimisticPendingMessage(prevItem)) {
            unique.set(key, prevItem);
          }
        }

        return Array.from(unique.values()).sort((a, b) => {
          const at = new Date(a.created_at || 0).getTime();
          const bt = new Date(b.created_at || 0).getTime();
          return at - bt;
        });
      });
      /* ── fine v1.10-X / v1.10-Y ───────────────────────────────────── */
    } catch (e) {
      console.error('History error:', e);
      // [palacan-chat-offline] server non raggiungibile: restano i messaggi mostrati, piu' quelli in coda di uscita
      const inCoda = leggiUscita(username).filter((v) => String(v.roomId) === String(roomId));
      if (inCoda.length) {
        setMessages((prev) => {
          const presenti = new Set(prev.map((m) => String(m.id)));
          const aggiunti = inCoda
            .filter((v) => !presenti.has(String(v.clientMsgId)))
            .map((v) => {
              const salvato = sentMessagesCacheRef.current[v.clientMsgId];
              return {
                id: v.clientMsgId,
                text: (salvato && typeof salvato === 'object' ? salvato.text : salvato) || '…',
                sender: username,
                type: 'self',
                created_at: new Date(v.creato || Date.now()).toISOString(),
                room_id: roomId,
                failed: true,
                failReason: 'offline',
              };
            });
          return aggiunti.length ? [...prev, ...aggiunti] : prev;
        });
      }
    } finally {
      /* ── v1.13-B (ECCEZIONE MIRATA, vedi header del file) ────────────── */
      // [palacan-correzione-cronologia-vivo] solo il ricaricamento piu' recente chiude il caricamento e svuota la coda dei messaggi dal
      // vivo: se lo facesse anche uno superato, un messaggio arrivato in quel momento si mostrerebbe e poi
      // verrebbe cancellato dalla lista del ricaricamento in corso (chiesta al server prima di quel messaggio).
      if (fetchHistoryRequestIdRef.current === requestId) {
      historyLoadInProgressRef.current = false;
      const queuedLiveMessages = liveMessagesDuringHistoryRef.current;
      liveMessagesDuringHistoryRef.current = [];
      for (const queuedItem of queuedLiveMessages) {
        try {
          await decryptMegolmRoomMessage({ ...queuedItem, append: true });
        } catch (drainError) {
          console.error('❌ v1.13-B drain messaggio live in coda fallito:', drainError);
        }
      }
      }  // [palacan-correzione-cronologia-vivo]
      /* ── fine v1.13-B (finally) ───────────────────────────────────────── */
    }
  }, [decryptIncomingLegacyMessage, decryptMegolmRoomMessage]);

  /* ── nuovo (schermata "Chiamate" dedicata): raccoglie e decifra i
     messaggi di registro chiamata (testo che inizia con l'emoji 📞/📹,
     stesso formato scelto da sendCallLogMessage) da TUTTE le stanze
     dirette dell'utente, non solo quella aperta al momento. Riusa
     decryptMegolmRoomMessage COSI' COM'E' (zero modifiche al layer
     crypto) chiamandola con append:false esattamente come fa gia'
     fetchHistory per lo storico di una singola stanza - qui lo si fa
     su piu' stanze in sequenza, senza mai toccare lo stato globale
     `messages` (che resta quello della chat aperta, invariato). */
  const loadCallHistory = useCallback(async () => {
    const token = authTokenRef.current;
    const username = currentUsernameRef.current;
    const acc = olmAccountRef.current;
    if (!token || !username || !acc) return [];

    const directRooms = (Array.isArray(recentRooms) ? recentRooms : []).filter(
      (r) => (r.room_kind || r.roomKind) === 'direct'
    );

    const allEntries = [];

    for (const room of directRooms) {
      const roomId = room.id || room.room_id || room.roomId;
      if (!roomId) continue;

      const otherUsernames = room.participant_usernames || room.participantUsernames || [];
      const otherUsername =
        otherUsernames.find((u) => u && u.toLowerCase() !== username.toLowerCase()) || null;

      try {
        const msgs = await apiService.getRoomMessages(roomId, token);
        if (!Array.isArray(msgs)) continue;

        for (const msg of msgs) {
          const senderUsername = msg.sender_username || msg.sender || msg.senderUsername;
          const messageId = msg.id;
          const createdAt = msg.created_at || msg.createdAt || null;
          if (!senderUsername) continue;
          if (msg.event_kind !== 'room_encrypted' && msg.event_type !== 'm.room.encrypted') continue;

          /* ── FIX end-to-end (stesso schema del fix sui messaggi normali):
             prova prima la vera decifrazione anche per le proprie voci del
             registro chiamate, dato che ora esiste una sessione "in
             entrata" anche per se stessi. La cache locale resta solo come
             riserva finale. */
          const item = await decryptMegolmRoomMessage({
            senderUsername,
            roomId,
            sessionId: msg.session_id || msg.sessionId,
            cipherBody: msg.cipher_body || msg.ciphertext,
            messageId,
            createdAt,
            append: false,
          });
          let text = item?.text || null;

          if (!text && senderUsername === username) {
            const clientMsgId = msg.client_msg_id || msg.clientMsgId || null;
            const cachedEntry = clientMsgId ? sentMessagesCacheRef.current[clientMsgId] : null;
            text = cachedEntry && typeof cachedEntry === 'object' ? cachedEntry.text : cachedEntry;
          }

          if (!text) continue;
          if (!text.startsWith('📞') && !text.startsWith('📹')) continue;

          allEntries.push({
            id: messageId,
            roomId,
            otherUsername,
            isVideo: text.startsWith('📹'),
            text,
            createdAt,
            isOutgoing: senderUsername === username,
          });
        }
      } catch (e) {
        console.error(`Errore caricamento cronologia chiamate per stanza ${roomId}:`, e);
      }
    }

    allEntries.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    return allEntries;
  }, [recentRooms, decryptMegolmRoomMessage]);
  /* ── fine loadCallHistory ────────────────────────────────────────────── */

  /* ── FIX (m.room_key_request/m.forwarded_room_key): gestisce il
     recupero di una room key mancante da un PROPRIO altro dispositivo.
     Mai tra persone diverse - quello resta deliberatamente fuori
     scope, e' un problema di fiducia molto piu' delicato (vedi analisi
     fatta prima di iniziare a scrivere questo codice). Qui il confine
     di fiducia e' sempre "e' davvero un MIO dispositivo attivo?",
     verificabile con certezza tramite lo stesso elenco dispositivi
     gia' costruito nella Fase 4 multi-device (GET /keys/devices). */
  const handleOwnDeviceKeyEvent = useCallback(
    async ({ data, eventType, content, username, token, account }) => {
      const myDeviceId = olmService.getOrCreateDeviceId();

      if (eventType === 'm.room_key_request') {
        const { room_id: roomId, session_id: sessionId, requesting_device_id: requestingDeviceId } =
          content || {};

        if (!roomId || !sessionId || !requestingDeviceId) return;

        // Eco della propria richiesta (arriva a tutte le proprie
        // connessioni live, inclusa quella che l'ha mandata) - ignorare.
        if (requestingDeviceId === myDeviceId) return;

        const exportedSessionKey = olmService.exportRoomKeyForForwarding(
          inboundGroupSessionsRef.current,
          sessionId
        );

        // Non abbiamo quella sessione - non possiamo aiutare, nessun
        // errore, e' una situazione normale (magari nemmeno noi siamo
        // mai stati membri attivi con quella chiave specifica).
        if (!exportedSessionKey) return;

        // Verifica di sicurezza: il dispositivo richiedente deve essere
        // un dispositivo VERO, ATTIVO e PROPRIO - mai fidarsi solo del
        // device_id dichiarato nel payload. Riusa lo stesso endpoint
        // della Fase 4 (chiamato con il proprio username, che funziona
        // esattamente come con un altro username: nessuna restrizione
        // lato backend sul "vedere i bundle di se stessi").
        let deviceBundles = [];
        try {
          deviceBundles = await apiService.getDeviceBundles(username, token);
        } catch (e) {
          console.warn('⚠️ getDeviceBundles fallito per verifica richiesta chiave:', e);
          return;
        }

        const requestingBundle = deviceBundles.find(
          (b) => b.device_id === requestingDeviceId
        );

        if (!requestingBundle || !requestingBundle.identity_key) {
          console.warn(
            `⚠️ Richiesta room key da un device_id non riconosciuto o non attivo: ${requestingDeviceId}`
          );
          return;
        }
        // [palacan-l4c3] solo i propri dispositivi FIRMATI dalla chiave principale (se l'account ne ha una)
        if (!(await ammessoDaChiavePrincipale({ io: username, utente: username, bundle: requestingBundle, bundles: deviceBundles }))) {
          console.warn(`⚠️ [L4c] richiesta di chiavi da un mio dispositivo non firmato: ${requestingDeviceId}`);
          return;
        }

        const encrypted = await olmService.encryptForwardedRoomKeyForDevice({
          account,
          username,
          targetDeviceId: requestingDeviceId,
          targetIdentityKey: requestingBundle.identity_key,
          targetOneTimeKey: requestingBundle.one_time_key,
          sessions: peerSessionsRef.current,
          roomId,
          sessionId,
          exportedSessionKey,
          token,  // [palacan-pq4] eccezione mirata approvata: busta post-quantum anche tra i propri dispositivi
        });

        const mySenderKey = olmService.getCurve25519Key(account);
        if (!mySenderKey) return;

        syncSessionsState({ ...peerSessionsRef.current });

        sendToDevice({
          eventType: 'm.forwarded_room_key',
          targetUsername: username,
          roomId,
          clientMsgId: `forwardedkey-${roomId}-${sessionId}-${requestingDeviceId}`,
          algorithm: 'm.olm.v1.curve25519-aes-sha2',
          senderKey: mySenderKey,
          content: {
            algorithm: 'm.olm.v1.curve25519-aes-sha2',
            sender_key: mySenderKey,
            ciphertext: {
              [requestingBundle.identity_key]: {
                type: encrypted.type,
                body: encrypted.body,
              },
            },
          },
        });

        console.log(
          `📤 Room key inoltrata al mio dispositivo ${requestingDeviceId} (session_id=${sessionId})`
        );

        return;
      }

      if (eventType === 'm.forwarded_room_key') {
        const myIdentityKey = olmService.getCurve25519Key(account);
        if (!myIdentityKey) return;

        const ciphertextMap = content?.ciphertext;
        const encryptedForMe =
          ciphertextMap && typeof ciphertextMap === 'object'
            ? ciphertextMap[myIdentityKey] || null
            : null;

        const cipherBody = encryptedForMe?.body ?? null;
        const messageType = encryptedForMe?.type ?? null;
        const senderIdentityKey = data.sender_key || data.senderKey || content?.sender_key || null;

        if (cipherBody == null || messageType == null || !senderIdentityKey) return;

        const result = await olmService.decryptOlmEvent({
          account,
          username,
          senderUsername: username,
          senderIdentityKey,
          messageType: Number(messageType),
          messageBody: cipherBody,
          sessions: peerSessionsRef.current,
          token,
        });

        if (result?.account) setCurrentOlmAccount(result.account);
        syncSessionsState({ ...peerSessionsRef.current });

        const parsed = olmService.safeParseOlmPayload(result?.plaintext);
        const roomKeyContent = parsed?.content || null;

        const normalizedRoomId = roomKeyContent?.room_id || null;
        const normalizedSessionId = roomKeyContent?.session_id || null;
        const normalizedSessionKey = roomKeyContent?.session_key || null;

        if (!normalizedSessionId || !normalizedSessionKey) return;

        const inboundMap = inboundGroupSessionsRef.current || {};
        olmService.receiveForwardedRoomKey({
          username,
          roomKeyContent: {
            algorithm: 'm.megolm.v1.aes-sha2',
            room_id: normalizedRoomId,
            session_id: normalizedSessionId,
            session_key: normalizedSessionKey,
          },
          inboundGroupSessions: inboundMap,
        });
        inboundGroupSessionsRef.current = inboundMap;

        console.log(`✅ m.forwarded_room_key importata per session_id=${normalizedSessionId}`);

        // Stesso identico pattern di flush del buffer gia' usato per
        // m.room_key (v1.12-C) - un messaggio arrivato prima di questa
        // chiave non deve restare bufferizzato in eterno.
        try {
          const buffered = pendingEncryptedMessagesRef.current[normalizedSessionId];
          if (Array.isArray(buffered) && buffered.length > 0) {
            delete pendingEncryptedMessagesRef.current[normalizedSessionId];
            for (const item of buffered) {
              await decryptMegolmRoomMessage({ ...item, append: true });
            }
          }
        } catch (flushError) {
          console.error('❌ flush buffer dopo forwarded_room_key fallito (non bloccante):', flushError);
        }

        if (
          currentRoomRef.current?.id &&
          normalizedRoomId &&
          String(currentRoomRef.current.id) === String(normalizedRoomId)
        ) {
          await fetchHistory();
        }
      }
    },
    [decryptMegolmRoomMessage, fetchHistory, setCurrentOlmAccount, syncSessionsState]
  );

  const handleToDeviceEvent = useCallback(
    async (data) => {
      const username = currentUsernameRef.current;
      const token = authTokenRef.current;
      const account = olmAccountRef.current;

      if (!data) return;

      const isToDevice =
        data.type === 'to_device' ||
        data.type === 'to_device_event' ||
        data?._meta?.isToDevice === true ||
        data?.meta?.isToDevice === true;

      if (!isToDevice) return;
      if (!username || !token || !account) return;
      // [palacan-metadati-a2.2] busta sigillata: si apre con la chiave busta e si VERIFICA il mittente dichiarato
      // (chiave d'identita' pubblicata); da qui in poi l'evento e' identico a quelli di sempre
      if ((data.event_type || data.eventType) === 'm.sealed') {
        const aperta = await apriBustaRicevuta(username, token, data);
        if (!aperta) return;
        data = aperta;
      }

      const senderUsername = data.sender || data.sender_username || data.senderUsername || null;
      const eventType = data.event_type || data.eventType || null;
      const content = data.content || {};

      /* ── FIX (m.room_key_request/m.forwarded_room_key, recupero chiave
         tra PROPRI dispositivi): questi due tipi di evento sono SEMPRE
         mandati a se stessi per costruzione (vedi requestOwnRoomKey e
         handleOwnDeviceKeyEvent) - il mittente E il destinatario sono la
         stessa persona. Il controllo subito sotto (`senderUsername ===
         username` → ignora) esiste per un motivo diverso e valido per
         m.room_key: evitare di rielaborare le proprie condivisioni.
         Va intercettato PRIMA, con un ramo separato che non tocca in
         alcun modo il resto della funzione - se eventType non e' uno
         dei due nuovi tipi, tutto il codice sotto (invariato) si
         applica esattamente come prima di questa modifica. */
      if (eventType === 'm.room_key_request' || eventType === 'm.forwarded_room_key') {
        try {
          // [palacan-n5] eccezione mirata (approvata): da un ALTRO utente -> richieste/chiavi tra membri della stanza
          // (utils/richiesteChiavi.js, con tutti i controlli); dai propri dispositivi -> v1.14-B come prima.
          if (senderUsername && senderUsername !== username) {
            await gestisciEventoChiaveMembro({ data, eventType, content, mittente: senderUsername }, {
              io: username, token, account, olm: olmService, api: apiService, inviaToDevice: sendToDevice,
              sessioniEntranti: () => inboundGroupSessionsRef.current || {},
              aggiornaSessioniEntranti: (mappa) => { inboundGroupSessionsRef.current = mappa; },
              sessioniPeer: peerSessionsRef.current,
              sincronizzaSessioni: () => syncSessionsState({ ...peerSessionsRef.current }),
              aggiornaAccount: setCurrentOlmAccount,
              inAttesa: pendingEncryptedMessagesRef.current,
              ritenta: (item) => decryptMegolmRoomMessage({ ...item, append: true }),
              stanzaAperta: () => currentRoomRef.current?.id || null,
              ricaricaCronologia: fetchHistory,
              salvaBackup: () => forceBackupUploadRef.current?.(),
            });
          } else {
            await handleOwnDeviceKeyEvent({ data, eventType, content, username, token, account });
          }
        } catch (e) {
          console.error('❌ handleOwnDeviceKeyEvent error (non bloccante):', e);
        }
        return;
      }
      /* ── fine gestione own-device key request/forward ─────────────────── */

      if (!senderUsername || senderUsername === username) return;

      try {
        if (eventType !== 'm.room_key') return;

        const myIdentityKey = olmService.getCurve25519Key(account);
        if (!myIdentityKey) {
          console.warn('⚠️ identity key locale mancante');
          return;
        }

        const ciphertextMap = content?.ciphertext;
        const encryptedForMe =
          ciphertextMap && typeof ciphertextMap === 'object'
            ? ciphertextMap[myIdentityKey] || null
            : null;

        const cipherBody =
          encryptedForMe?.body ?? content?.cipherBody ?? content?.cipher_body ?? null;

        const messageType =
          encryptedForMe?.type ?? content?.message_type ?? content?.messageType ?? null;

        const senderIdentityKey =
          data.sender_key || data.senderKey || content?.sender_key || content?.senderKey || null;

        if (cipherBody == null || messageType == null) {
          console.warn('⚠️ to_device m.room_key senza payload Olm valido per questo device');
          return;
        }

        if (!senderIdentityKey) {
          console.warn('⚠️ to_device m.room_key senza sender identity key');
          return;
        }

        const result = await olmService.decryptOlmEvent({
          account,
          username,
          senderUsername,
          senderIdentityKey,
          messageType: Number(messageType),
          messageBody: cipherBody,
          sessions: peerSessionsRef.current,
          token,
        });

        if (result?.account) setCurrentOlmAccount(result.account);

        syncSessionsState({ ...peerSessionsRef.current });

        const parsed = olmService.safeParseOlmPayload(result?.plaintext);

        const roomKeyContent =
          parsed?.type === 'm.room_key' ? parsed.content : parsed?.content || null;
        if (roomKeyContent?.room_name) imparaNomeStanza(roomKeyContent.room_id || roomKeyContent.roomId, roomKeyContent.room_name);  // [palacan-metadati-a3.1]
        if (roomKeyContent?.room_secret) imparaSegretoStanza(roomKeyContent.room_id || roomKeyContent.roomId, roomKeyContent.room_secret);  // [palacan-metadati-a4.1b]
        if (roomKeyContent?.recapito) imparaRecapito(roomKeyContent.session_id || roomKeyContent.sessionId, roomKeyContent.recapito);  // [palacan-metadati-a4.4c]

        const normalizedRoomId = roomKeyContent?.room_id || roomKeyContent?.roomId || null;
        const normalizedSessionId =
          roomKeyContent?.session_id || roomKeyContent?.sessionId || null;
        const normalizedSessionKey =
          roomKeyContent?.session_key || roomKeyContent?.sessionKey || null;
        console.log(`🔑 [DIAG-KEY] room_key ricevuta da ${senderUsername}: session_id=${normalizedSessionId}, ha session_key=${Boolean(normalizedSessionKey)}`);

        if (!normalizedSessionId || !normalizedSessionKey) {
          console.warn('⚠️ room_key content incompleto', {
            hasSessionId: Boolean(normalizedSessionId),
            hasSessionKey: Boolean(normalizedSessionKey),
            parsedType: parsed?.type,
          });
          return;
        }

        const inboundMap = inboundGroupSessionsRef.current || {};
        olmService.receiveRoomKeyEvent({
          username,
          roomKeyContent: {
            algorithm: roomKeyContent?.algorithm || 'm.megolm.v1.aes-sha2',
            room_id: normalizedRoomId,
            roomId: normalizedRoomId,
            session_id: normalizedSessionId,
            sessionId: normalizedSessionId,
            session_key: normalizedSessionKey,
            sessionKey: normalizedSessionKey,
          },
          inboundGroupSessions: inboundMap,
        });
        // [palacan-metadati-3.1] chi ha creato questa chiave di stanza: la chiave di identita' e' quella con cui
        // Olm ha appena decifrato; il nome si confronta con la chiave nota per quel contatto.
        registraCreatore(username, normalizedSessionId, {
          stanza: normalizedRoomId,  // [palacan-metadati-3.4b]
          utente: senderUsername,
          chiave: senderIdentityKey,
          verifica: valutaChiave(olmService.loadPeerIdentityKey(username, senderUsername), senderIdentityKey),
        });
        inboundGroupSessionsRef.current = inboundMap;

        /* ── v1.12-C (ECCEZIONE MIRATA, vedi header del file), parte 2 ────
           La room key per normalizedSessionId è appena stata salvata sopra.
           Se uno o più messaggi cifrati erano arrivati PRIMA sul canale
           WebSocket della stanza (race col canale to-device), sono stati
           bufferizzati da decryptMegolmRoomMessage invece di essere persi
           (vedi eccezione v1.12-C, stesso nome, nel corpo di quella
           funzione). Li ritentiamo ora, in ordine. Il buffer per questo
           session_id viene rimosso PRIMA del retry, non dopo: se uno dei
           payload fosse corrotto o non decifrabile, non vogliamo un loop
           di retry infinito ad ogni nuova m.room_key con lo stesso
           session_id (non dovrebbe capitare, ma è una garanzia difensiva
           economica). Ogni fallimento individuale resta comunque loggato/
           gestito dentro decryptMegolmRoomMessage stessa (incluso il caso
           UNKNOWN_MESSAGE_INDEX già gestito lì, v1.11-AD). Non bloccante:
           un eventuale errore qui non impedisce il resto del flusso di
           handleToDeviceEvent (ack, backup forzato, ecc, subito sotto). */
        try {
          const buffered = pendingEncryptedMessagesRef.current[normalizedSessionId];

          if (Array.isArray(buffered) && buffered.length > 0) {
            delete pendingEncryptedMessagesRef.current[normalizedSessionId];

            console.log(
              `📤 Ritento decrittazione di ${buffered.length} messaggio/i bufferizzato/i per session_id=${normalizedSessionId}`
            );

            for (const item of buffered) {
              await decryptMegolmRoomMessage({ ...item, append: true });
            }
          }
        } catch (flushError) {
          console.error('❌ v1.12-C flush buffer messaggi fallito (non bloccante):', flushError);
        }
        // [palacan-metadati-3.4b] messaggi del canale anonimo in attesa di una chiave di questa stanza
        try {
          const chiaveAttesa = `stanza:${normalizedRoomId}`;
          const inAttesa = pendingEncryptedMessagesRef.current[chiaveAttesa];
          if (Array.isArray(inAttesa) && inAttesa.length > 0) {
            delete pendingEncryptedMessagesRef.current[chiaveAttesa];
            for (const item of inAttesa) {
              await decryptMegolmRoomMessage({ ...item, append: true });
            }
          }
        } catch (erroreAttesa) {
          console.error('Nuovo tentativo dei messaggi anonimi in attesa non riuscito (non bloccante):', erroreAttesa);
        }
        /* ── fine v1.12-C parte 2 ─────────────────────────────────────── */

        /* ── v1.9-Q (ECCEZIONE MIRATA, vedi header del file) ─────────────
           Arriviamo qui SOLO se la room key è stata decifrata e salvata
           con successo in inboundGroupSessionsRef (riga sopra). Ack
           applicativo al server: nessun segreto incluso, solo metadati
           (id evento, room, client_msg_id, mittente). data.id è il campo
           usato da build_to_device_outbound_event in main.py (non
           event_id). Fallimento non bloccante: la room key è comunque
           già salvata in locale a prescindere dall'esito di questo ack. */
        try {
          sendAck({
            eventId: data.id || null,
            clientMsgId: data.client_msg_id || data.clientMsgId || null,
            roomId: data._sigillata ? null : (normalizedRoomId || null),  // [palacan-metadati-a2.2] busta: niente stanza
            targetUsername: data._sigillata ? null : (senderUsername || null),  // [palacan-metadati-a2.2]
          });
        } catch (ackError) {
          console.error('❌ sendAck fallito (non bloccante):', ackError);
        }
        /* ── fine v1.9-Q ──────────────────────────────────────────────── */

        /* ── v1.10-V (ECCEZIONE MIRATA, vedi header del file) ────────────
           Stesso identico punto di v1.9-Q: la room key è già decifrata e
           salvata in locale. Forziamo subito l'upload del backup (invece
           di aspettare il debounce di 30s in scheduleBackupUpload) perché
           un tab chiuso in quella finestra farebbe perdere sul server
           l'unica copia di questa sessione Megolm, rendendo tutti i
           messaggi futuri di questo peer illeggibili dopo un recupero
           backup (vedi punto V per la spiegazione completa). Il ref è
           definito e popolato interamente fuori dal layer crypto: se
           nessuna passphrase di backup è attiva in questa sessione del
           tab, la funzione esposta è un no-op sicuro. Non bloccante. */
        try {
          forceBackupUploadRef.current?.();
        } catch (backupForceError) {
          console.error('❌ forceBackupUploadRef fallito (non bloccante):', backupForceError);
        }
        /* ── fine v1.10-V ─────────────────────────────────────────────── */

        console.log(`✅ m.room_key ricevuta per room ${normalizedRoomId}`);

        if (
          currentRoomRef.current?.id &&
          normalizedRoomId &&
          String(currentRoomRef.current.id) === String(normalizedRoomId)
        ) {
          await fetchHistory();
        }
      } catch (e) {
        console.error('❌ handleToDeviceEvent error:', e, data);

        /* ── v1.11-AB (ECCEZIONE MIRATA, vedi header del file) ───────────
           Se il fallimento è OTK_MISMATCH/BAD_MESSAGE_KEY_ID (race di
           scambio simultaneo della room key, tipicamente subito dopo un
           redeem invito quando entrambi i lati condividono la propria
           room key nello stesso istante), la room key di QUESTO evento è
           persa per sempre senza un segnale esplicito al mittente. Fix:
           (1) liberiamo la nostra sessione 1:1 stale verso il mittente
           (stesso pattern del fix T: .free() pubblico, poi
           syncSessionsState, funzione già esistente nel layer, qui solo
           richiamata); (2) trasmettiamo sendSessionReset({ roomId }) —
           funzione GIÀ ESISTENTE in wsClient.js, riusata as-is. La stanza
           si ricava da data.room_id/data.roomId: presente nell'envelope
           del to-device event indipendentemente dal successo della
           decrittazione, perché impostato da sendToDevice lato mittente
           prima della cifratura. Il ramo che riceve session_reset (stessa
           eccezione v1.11-AB, in handleWsMessage più sotto) è stato esteso
           per forzare un re-invio automatico della room key da parte del
           mittente originale. Non bloccante: se anche questo fallisce, ci
           riproveremo al prossimo scambio naturale (nuovo login, nuova
           apertura stanza, ecc). Nessuna riga preesistente di questo
           catch toccata o riordinata: solo aggiunta in coda. */
        if (isRoomKeyResendTrigger(e)) {
          try {
            const failedRoomId = data.room_id || data.roomId || wsRoomIdRef.current || null;  // [palacan-n3b] eccezione mirata approvata: la busta non porta piu' la stanza (metadati), si usa quella aperta
            const failedSender =
              senderUsername || data.sender || data.sender_username || data.senderUsername || null;

            if (failedSender) {
              const current = { ...peerSessionsRef.current };
              const existing = current[failedSender];

              if (existing) {
                const list = Array.isArray(existing) ? existing : [existing];
                for (const s of list) {
                  try { s?.free?.(); } catch (_) {}
                }
                delete current[failedSender];
                syncSessionsState(current);
                console.log(
                  `♻️ Sessione 1:1 verso ${failedSender} azzerata dopo fallimento decrypt room_key`
                );
              }
            }

            if (failedRoomId) {
              sendSessionReset({ roomId: failedRoomId });
              console.log(
                `📡 session_reset inviato per room ${failedRoomId} (richiesta implicita re-invio room_key)`
              );
            }
          } catch (recoveryError) {
            console.error('❌ v1.11-AB recovery fallita (non bloccante):', recoveryError);
          }
        }
        /* ── fine v1.11-AB ────────────────────────────────────────────── */
      }
    },
    [fetchHistory, setCurrentOlmAccount, syncSessionsState, decryptMegolmRoomMessage]
  );

  const handleWsMessage = useCallback(
    async (data) => {
      const username = currentUsernameRef.current;
      const roomId = currentRoomRef.current?.id;

      if (!data) return;

      const messageType = data.type;
      console.log(`[DIAG-WS] messaggio ricevuto: type=${messageType}`);

      /* ── v1.4-D: system message "X si è unito alla chat" (LEGACY) ───────
         Ramo storico per un formato { type: 'room_membership', ... } che
         il backend attuale non emette più (vedi ramo Z qui sotto per il
         formato realmente usato oggi). Lasciato per compatibilità nel
         caso in futuro si aggiunga un evento dedicato con questo type. */
      if (messageType === 'room_membership') {
        const memberUsername =
          data.username || data.sender_username || data.senderUsername || null;
        const incomingRoomId = data.room_id || data.roomId || null;

        if (
          memberUsername &&
          memberUsername !== username &&
          incomingRoomId &&
          roomId &&
          String(roomId) === String(incomingRoomId)
        ) {
          setMessages((prev) => [
            ...prev,
            {
              id: `system-${Date.now()}-${Math.random()}`,
              text: `${memberUsername} si è unito alla chat`,
              sender: null,
              type: 'system',
              created_at: data.created_at || data.timestamp || new Date().toISOString(),
              room_id: incomingRoomId,
            },
          ]);
        }
        return;
      }
      /* ── fine v1.4-D ──────────────────────────────────────────────────── */

      /* ── v1.10-Z: system_join live dal backend (FIX, vedi punto Z nel
         changelog in cima al file) ─────────────────────────────────────
         Il payload reale che routes/rooms.py e routes/invite_links.py
         trasmettono via manager.broadcast_room_event per l'annuncio "X si
         è unito alla chat" è quello prodotto da _serialize_room_message:
         NON ha un campo `type`, ma ha `event_kind`/`eventKind` ===
         'system_join' e il testo già in chiaro in
         cipher_body/cipherBody/ciphertext (stesso identico formato che
         fetchHistory() legge sopra nel ramo v1.7-H1). Senza questo ramo,
         messageType sarebbe undefined per questo payload e la funzione
         sarebbe tornata silenziosamente al controllo finale
         "if (messageType !== 'message') return;", cioè l'annuncio non
         sarebbe MAI comparso in tempo reale, solo al prossimo
         fetchHistory() (riapertura/ricarica della chat) — esattamente il
         bug segnalato. L'id usato per l'append è lo stesso (stringa)
         `id` che il record ha nel DB, così un fetchHistory() successivo lo
         sovrascrive nello stesso slot della Map invece di duplicarlo
         (stesso meccanismo di dedup usato in v1.10-X/Y). ──────────────── */
      const eventKindLive = data.event_kind || data.eventKind || null;

      if (eventKindLive === 'system_join') {
        const incomingRoomId = data.room_id || data.roomId || null;
        const systemText =
          typeof data.cipher_body === 'string'
            ? data.cipher_body
            : typeof data.cipherBody === 'string'
            ? data.cipherBody
            : typeof data.ciphertext === 'string'
            ? data.ciphertext
            : null;

        if (systemText && roomId && incomingRoomId && String(roomId) === String(incomingRoomId)) {
          const messageId =
            data.id != null ? String(data.id) : `system-${Date.now()}-${Math.random()}`;

          setMessages((prev) => {
            if (prev.some((m) => String(m.id) === messageId)) return prev;
            return [
              ...prev,
              {
                id: messageId,
                text: systemText,
                sender: null,
                type: 'system',
                created_at:
                  data.created_at || data.createdAt || data.timestamp || new Date().toISOString(),
                room_id: incomingRoomId,
              },
            ];
          });
        }
        return;
      }
      /* ── fine v1.10-Z ─────────────────────────────────────────────────── */

      /* ── v1.10-T (ECCEZIONE MIRATA, stesso principio della Q): un peer
         che ha recuperato il backup (v1.9-P) ha azzerato le sue sessioni
         1:1 locali. Senza questo segnale noi continueremmo a riusare la
         nostra sessione 1:1 "vecchia" verso di lui, producendo un
         messaggio Olm non decryptabile lato suo. Nessun dato crittografico
         qui: solo mittente. Rimuoviamo la sessione stale verso quel peer
         e liberiamo l'oggetto Olm col suo metodo pubblico .free() — non
         viene toccato nessun internal di olmService.js. syncSessionsState
         è una funzione già esistente nel layer protetto, qui solo
         chiamata, non modificata.
         v1.11-AB (ECCEZIONE MIRATA, vedi header): dopo la pulizia sessione
         (comportamento originale invariato), se il segnale porta un
         room_id (sempre presente sia per il caso T originale — dopo
         recupero backup, vedi sendSessionReset in handleLogin/
         handleEnterpriseSubmit — sia per il nuovo caso AB, vedi
         handleToDeviceEvent più sopra), azzeriamo il flag "già condivisa"
         per quella stanza/peer in roomKeySharedWithRef e richiamiamo
         ensureRoomKeyShared(roomId): questo forza il mittente originale
         (chi riceve QUESTO session_reset) a ritentare l'invio della room
         key con una sessione 1:1 fresca pre-key, sempre decryptabile.
         Nessuna riga preesistente di questo ramo toccata o riordinata:
         solo aggiunta in coda, avvolta nello stesso if. ───────────────── */
      if (messageType === 'session_reset') {
        const resetSender =
          data.sender_username || data.sender || data.senderUsername || null;
        const resetRoomId = data.room_id || data.roomId || null;

        if (resetSender && resetSender !== username) {
          /* [palacan-reset-incrociati] (ECCEZIONE MIRATA, approvata): le sessioni 1:1 verso chi ha mandato il reset
             non si cancellano piu': si ritirano dall'invio (al prossimo invio parte una sessione nuova pre-key) ma
             restano per decifrare. Prima si cancellava anche la sessione appena nata e valida, e con due recuperi
             quasi simultanei il messaggio successivo dell'altro diventava "non e' pre-key" (altro reset, chiave persa). */
          const current = { ...peerSessionsRef.current };
          const ritirate = olmService.ritiraSessioniPerInvio(username, resetSender, current);
          if (ritirate > 0) {
            syncSessionsState(current);
            console.log(`♻️ ${ritirate} sessione/i 1:1 verso ${resetSender} ritirata/e dall'invio (session_reset ricevuto): restano per decifrare`);
          }

          /* ── v1.11-AB ──────────────────────────────────────────────── */
          try {
            if (resetRoomId) {
              if (roomKeySharedWithRef.current[resetRoomId]) {
                delete roomKeySharedWithRef.current[resetRoomId][resetSender];
              }
              ensureRoomKeyShared(resetRoomId);
            }
          } catch (resendError) {
            console.error('❌ v1.11-AB re-invio room_key fallito (non bloccante):', resendError);
          }
          /* ── fine v1.11-AB ─────────────────────────────────────────── */
        }
        return;
      }
      /* ── fine v1.10-T / v1.11-AB ──────────────────────────────────────── */

      if (
        messageType === 'to_device' ||
        messageType === 'to_device_event' ||
        data?._meta?.isToDevice ||
        data?.meta?.isToDevice
      ) {
        await handleToDeviceEvent(data);
        return;
      }

      if (
        messageType === 'room_encrypted' ||
        data?._meta?.isRoomEncrypted ||
        data?.meta?.isRoomEncrypted
      ) {
        const senderUsername = data.sender_username || data.sender || data.senderUsername;
        const incomingRoomId = data.room_id || data.roomId || null;
        const sessionId = data.session_id || data.sessionId;
        const cipherBody = data.cipher_body || data.ciphertext;
        const messageId =
          data.id || data.client_msg_id || data.clientMsgId || `${Date.now()}-${Math.random()}`;
        const createdAt = data.created_at || data.timestamp || null;

        const anonimo = data.anonimo === true;  // [palacan-metadati-3.4c] canale anonimo: nessun mittente dal server
        if (!anonimo && (!senderUsername || senderUsername === username)) return;
        if (anonimo) {
          // il canale anonimo consegna il messaggio anche a chi l'ha scritto: la propria copia e' gia' mostrata
          const propriaCopia = data.client_msg_id || data.clientMsgId || null;
          if (propriaCopia && sentMessagesCacheRef.current && sentMessagesCacheRef.current[propriaCopia]) return;
        }
        if (roomId && incomingRoomId && String(roomId) !== String(incomingRoomId)) return;

        /* ── v1.13-B (ECCEZIONE MIRATA, vedi header del file) ────────────── */
        if (historyLoadInProgressRef.current) {
          liveMessagesDuringHistoryRef.current.push({
            senderUsername,
            roomId: incomingRoomId || roomId,
            sessionId,
            cipherBody,
            messageId,
            createdAt,
          });
          console.log(`📥 [DIAG-ANON] messaggio ${messageId} in coda: la cronologia si sta ricaricando`);  // [palacan-correzione-cronologia-vivo]
          return;
        }
        /* ── fine v1.13-B (accodamento) ───────────────────────────────────── */

        await decryptMegolmRoomMessage({
          senderUsername,
          roomId: incomingRoomId || roomId,
          sessionId,
          cipherBody,
          messageId,
          createdAt,
          append: true,
        });

        return;
      }

      /* ── v1.11-AE (ECCEZIONE MIRATA, vedi header del file) ────────────
         Il server (main.py, ramo room_encrypted / message legacy) invia
         questo evento SOLO come rifiuto di trasporto quando il mittente
         (cioè noi) risulta mutato in quella stanza: il messaggio non è
         mai stato salvato né inoltrato. Payload: reason ('muted'),
         room_id/roomId, client_msg_id/clientMsgId — mai testo del
         messaggio. Il client_msg_id coincide con il tempId ottimistico
         generato in handleSendMessage (stesso formato usato ovunque in
         questo file, es. v1.10-Y): lo usiamo per trovare quel messaggio
         in `messages` e marcarlo `failed: true` invece di rimuoverlo,
         così l'utente vede un avviso invece del messaggio che sparisce
         silenziosamente. Nessun dato crittografico coinvolto. Posizionato
         PRIMA del controllo finale (messageType !== 'message'), stesso
         stile additivo dei rami session_reset/system_join sopra. */
      /* ── nuovo (sessione corrente): reazioni emoji cifrate, evento live
         inviato dal backend via REST (routes/rooms.py, POST/DELETE
         reactions) subito dopo il salvataggio - non dal loop WS di
         main.py, che resta invariato. Nessuna riga preesistente toccata,
         solo aggiunta in coda, stesso stile additivo dei rami sopra. */
      if (messageType === 'reaction_event') {
        const incomingRoomId = data.room_id || data.roomId || null;
        console.log(`[DIAG] reaction_event RICEVUTO: action=${data.action} message_id=${data.message_id} da=${data.username} incomingRoomId=${incomingRoomId} roomId(corrente)=${roomId}`);
        if (roomId && incomingRoomId && String(roomId) !== String(incomingRoomId)) {
          console.log('[DIAG] reaction_event SCARTATO: room diversa dalla corrente');
          return;
        }
        setReactionLiveEvent({ ...data, _receivedAt: Date.now() });
        return;
      }
      /* ── fine reaction_event ──────────────────────────────────────────── */

      /* ── nuovo: eliminazione messaggio "per tutti" dal vivo. Il backend
         manda questo evento subito dopo aver cancellato il messaggio dal
         database - senza questo ramo, il messaggio spariva solo per chi
         ha premuto elimina, non per l'altro utente. Stesso schema di
         reaction_event qui sopra. */
      if (messageType === 'message_deleted') {
        const incomingRoomId = data.room_id || data.roomId || null;
        const deletedMessageId = data.message_id || data.messageId || null;

        if (roomId && incomingRoomId && String(roomId) !== String(incomingRoomId)) {
          return;
        }
        if (deletedMessageId) {
          setMessages((prev) => prev.filter((m) => String(m?.id) !== String(deletedMessageId)));
        }
        return;
      }
      /* ── fine message_deleted ─────────────────────────────────────────── */

      /* ── nuovo: rotazione Megolm dal vivo dopo cambio composizione
         gruppo (Fase B - segnale in tempo reale). Il backend manda
         questo evento subito dopo che qualcuno entra o esce dalla
         stanza. Non serve confrontare qui la versione con quella gia'
         salvata: basta richiamare ensureRoomKeyShared, che fa gia' da
         sola il confronto e la rotazione (stesso identico codice della
         Fase A - riconciliazione - nessuna logica duplicata). La Fase A
         resta comunque il paracadute se questo evento venisse perso per
         qualunque motivo (es. client offline in quel momento). */
      if (messageType === 'rooms_changed') {  // [palacan-metadati-a1] avviso senza contenuto: le stanze sono cambiate
        window.dispatchEvent(new CustomEvent('palacan:stanze-cambiate'));
        return;
      }
      if (messageType === 'room_membership_changed') {
        const incomingRoomId = data.room_id || data.roomId || null;

        if (roomId && incomingRoomId && String(roomId) === String(incomingRoomId)) {
          console.log(`🔄 [DIAG-KEY] room_membership_changed ricevuto dal vivo per room=${incomingRoomId}, richiamo ensureRoomKeyShared`);
          ensureRoomKeyShared(roomId);
        }
        return;
      }
      /* ── fine room_membership_changed ─────────────────────────────────── */

      /* ── nuovo: gestore dell'ack in arrivo per le room key condivise.
         Il backend conferma gia' quando l'altro utente ha ricevuto ed
         elaborato una m.room_key, ma prima questa conferma non veniva mai
         ascoltata dal frontend - la chiave veniva segnata "condivisa" nello
         stesso istante in cui partiva l'invio. Ora, quando arriva l'ack, si
         cerca quale room key in attesa corrisponde (per client_msg_id, che
         ha un formato prevedibile: roomkey-{room}-{sessionId}-{username}) e
         la si segna come confermata per davvero. */
      if (messageType === 'ack') {
        {  // [palacan-metadati-a2.2] conferma di una busta: dal codice casuale all'identificativo di sempre
          const originale = idOriginaleConferma(data?.client_msg_id || data?.clientMsgId);
          if (originale) { data.client_msg_id = originale; data.clientMsgId = originale; }
        }
        const clientMsgId = data.client_msg_id || data.clientMsgId || null;
        if (clientMsgId && clientMsgId.startsWith('roomkey-')) {
          const allRooms = roomKeySharedWithRef.current || {};
          for (const roomKey of Object.keys(allRooms)) {
            const peersMap = allRooms[roomKey] || {};
            for (const peerUsername of Object.keys(peersMap)) {
              const entry = peersMap[peerUsername];
              if (entry && !entry.confirmed) {
                // FIX (bug reale trovato controllando un avviso apparentemente
                // innocuo: "room key non confermata dopo 3 tentativi" appariva
                // SEMPRE, anche quando la room key veniva consegnata e i
                // messaggi si decifravano correttamente). L'invio (vedi
                // sendToDevice sopra, dentro il ciclo sui dispositivi) genera
                // un clientMsgId CON un suffisso per dispositivo
                // (...-${peer.username}-${encrypted.deviceId || 'legacy'}),
                // dato che un peer puo' avere piu' dispositivi e ciascuno
                // riceve un proprio invio separato. Il confronto qui
                // ricostruiva pero' l'id SENZA quel suffisso, e lo confrontava
                // con === (uguaglianza esatta): non poteva MAI combaciare con
                // l'id vero che il backend rimanda nell'ack, quindi
                // entry.confirmed non veniva mai impostato a true - un falso
                // "nessun ack" ripetuto ad ogni invio, anche quando l'ack
                // arrivava davvero. Ora si usa un confronto per prefisso
                // (ignorando il suffisso del dispositivo, che l'ack-matching
                // non ha comunque bisogno di distinguere).
                const expectedClientMsgIdPrefix = `roomkey-${roomKey}-${entry.sessionId}-${peerUsername}-`;
                if (clientMsgId.startsWith(expectedClientMsgIdPrefix)) {
                  entry.confirmed = true;
                  console.log(
                    `✅ [DIAG-KEY] ack ricevuto, room key confermata per ${peerUsername} in room=${roomKey}, session_id=${entry.sessionId}`
                  );
                }
              }
            }
          }
        }
        return;
      }
      /* ── fine gestore ack ─────────────────────────────────────────────── */

      /* ── nuovo (sessione corrente, Fase 1 chiamate): segnalazione WebRTC
         1:1. Stesso schema di reaction_event: il backend (routes/calls.py,
         POST /calls/signal) invia questo evento via manager.send_to_user
         subito dopo la richiesta REST - non dal loop WS di main.py, che
         resta invariato. Nessuna riga preesistente toccata. */
      if (messageType === 'call_signal') {
        dispatchCallSignalEvent(data);
        return;
      }
      /* ── fine call_signal ─────────────────────────────────────────────── */

      if (messageType === 'send_rejected') {
        const rejectedClientMsgId = data.client_msg_id || data.clientMsgId || null;
        const reason = data.reason || 'rejected';

        if (rejectedClientMsgId) {
          setMessages((prev) =>
            prev.map((m) =>
              String(m.id) === String(rejectedClientMsgId)
                ? { ...m, failed: true, failReason: reason }
                : m
            )
          );
        }

        setSendRejectedEvent({ reason, clientMsgId: rejectedClientMsgId, _receivedAt: Date.now() });
        return;
      }
      /* ── fine v1.11-AE ────────────────────────────────────────────────── */

      if (messageType !== 'message') return;

      const senderUsername = data.sender_username || data.sender || data.senderUsername;
      const senderIdentityKey = data.sender_key || data.senderKey || null;
      const cipherBody = data.cipher_body || data.ciphertext;
      const cipherType = data.cipher_type ?? data.cipherType;
      const messageId =
        data.id || data.client_msg_id || data.clientMsgId || `${Date.now()}-${Math.random()}`;
      const createdAt = data.created_at || data.timestamp || null;
      const incomingRoomId = data.room_id || data.roomId || null;

      if (!senderUsername || senderUsername === username) return;
      if (roomId && incomingRoomId && String(roomId) !== String(incomingRoomId)) return;

      await decryptIncomingLegacyMessage({
        senderUsername,
        senderIdentityKey,
        cipherBody,
        cipherType,
        messageId,
        createdAt,
        append: true,
      });
    },
    [
      decryptIncomingLegacyMessage,
      decryptMegolmRoomMessage,
      handleToDeviceEvent,
      syncSessionsState,
      ensureRoomKeyShared,
    ]
  );

  /* ── Crypto init helpers ─────────────────────────────────────────────── */

  const generateKeysForRegistration = async (username) => {
    if (!isOlmReady) throw new Error('Sistema crittografico non pronto');

    const acc = olmService.createOlmAccount(username);
    const identityKeys = olmService.getIdentityKeys(acc);

    return {
      account: acc,
      identityKey: identityKeys.curve25519,
      registrationId: Math.floor(Math.random() * 1000000) + 1,
    };
  };

  const uploadInitialOTKs = async (account, username, token) => {
    // FIX (BUG DI SICUREZZA/DATI REALE, scoperto usando l'app vera con
    // account veri - mai catturato dai test perche' nessuno usava un
    // database reale con vincoli di chiave esterna reali): questa
    // funzione NON passava mai device_id a uploadOneTimeKeys - se
    // uploadIdentityKey (vedi sotto) non aveva MAI registrato una riga
    // Device per questo device_id, un successivo refill OTK (che INVECE
    // lo passa, vedi ensureEnoughOTKs in olmService.js) falliva con un
    // errore 500 (violazione di chiave esterna: one_time_keys.device_id
    // punta a un device_id mai esistito nella tabella devices).
    const otks = olmService.generateAndGetOTKs(account, username, 50);
    await apiService.uploadOneTimeKeys(otks, token, olmService.getOrCreateDeviceId());

    const refreshed = olmService.loadOlmAccount(username) || account;
    olmService.saveOlmAccount(username, refreshed);
    setCurrentOlmAccount(refreshed);

    return refreshed;
  };

  /* ══════════════════════════════════════════════════════════════════════
     CRYPTO LAYER END
  ══════════════════════════════════════════════════════════════════════ */

  // [palacan-n5e] autore firmato: chi firma da questo dispositivo (l'account attuale) e il nuovo tentativo dei messaggi
  // rimasti in attesa della chiave di firma del loro autore. Fuori dal CRYPTO LAYER: usa olmAccountRef e
  // decryptMegolmRoomMessage senza cambiarli.
  useEffect(() => {
    const conto = olmAccountRef.current || olmAccount;
    let chiave = null;
    let curva = null;
    try {
      chiave = conto ? olmService.getEd25519Key(conto) : null;
      curva = conto ? olmService.getCurve25519Key(conto) : null;
    } catch (_) {
      chiave = null;
    }
    if (!conto || !currentUsername || !chiave) {
      impostaFirmatario(null);
      impostaRitentativo(null);
      impostaScaricatorePqFirma(null);  // [palacan-pq5b]
      return;
    }
    impostaFirmatario({ io: currentUsername, chiave, curva, firma: (testo) => (olmAccountRef.current || conto).sign(testo) });
    // [palacan-pq5b] impronta ML-DSA-65 imparata via Olm -> la chiave si scarica e si verifica subito, in sottofondo
    impostaScaricatorePqFirma((v) => chiavePqFirma({ io: currentUsername, ...v, token: authTokenRef.current }));
    impostaRitentativo((voci) => {
      for (const voce of voci) {
        // si aggiunge alla vista solo se e' la stanza aperta (le altre lo ritrovano alla prossima apertura)
        const aperta = Boolean(currentRoomRef.current) && String(currentRoomRef.current.id) === String(voce.roomId);
        Promise.resolve(decryptMegolmRoomMessage({ ...voce, append: aperta })).catch(() => {});
      }
    });
  }, [olmAccount, currentUsername, decryptMegolmRoomMessage]);

  // [palacan-pq3] chiavi post-quantum di questo dispositivo: controllate dopo l'accesso (5 secondi, quando il dispositivo
  // e' gia' registrato) e poi ogni 30 minuti; si ricaricano solo se servono. Fuori dal CRYPTO LAYER.
  useEffect(() => {
    if (!olmAccount || !currentUsername || !authToken) return undefined;
    const controlla = () => assicuraChiaviPq({
      io: currentUsername,
      token: authTokenRef.current || authToken,
      dispositivo: olmService.getOrCreateDeviceId(),
      firma: (testo) => (olmAccountRef.current || olmAccount).sign(testo),
      curva: olmService.getCurve25519Key(olmAccountRef.current || olmAccount),  // [palacan-pq4] per registrare il dispositivo se manca
      soloConFirmaIbrida: true,  // [palacan-pq7g] mai chiavi ML-KEM senza firma ibrida, nemmeno dopo un ripristino
    }).then(() => assicuraFirmaPq({  // [palacan-pq5b] dopo le chiavi PQ: il dispositivo e' gia' registrato sul server
      io: currentUsername,
      token: authTokenRef.current || authToken,
      dispositivo: olmService.getOrCreateDeviceId(),
      ed: olmService.getEd25519Key(olmAccountRef.current || olmAccount),
      curva: olmService.getCurve25519Key(olmAccountRef.current || olmAccount),
      firmaEd: (testo) => (olmAccountRef.current || olmAccount).sign(testo),
    })).then(() => assicuraChiaviPq({  // [palacan-pq5d] chiave ML-DSA-65 pronta: chiavi ML-KEM con la firma ibrida
      io: currentUsername,
      token: authTokenRef.current || authToken,
      dispositivo: olmService.getOrCreateDeviceId(),
      firma: (testo) => (olmAccountRef.current || olmAccount).sign(testo),
      curva: olmService.getCurve25519Key(olmAccountRef.current || olmAccount),
    }));
    const primo = setTimeout(controlla, 5000);
    const giro = setInterval(controlla, 30 * 60 * 1000);
    return () => {
      clearTimeout(primo);
      clearInterval(giro);
    };
  }, [olmAccount, currentUsername, authToken]);

  /* ── v1.9-O: Key backup — helper fuori dal layer crypto ─────────────────
     askBackupPassphrase(mode, error?) apre BackupPinPrompt e ritorna una
     Promise che si risolve con la passphrase inserita, oppure `null` se
     l'utente sceglie "Salta" (solo in modalità 'recover'). Il prompt resta
     visibile fino a submitBackupPrompt/skipBackupPrompt. ────────────────── */

  const askBackupPassphrase = useCallback((mode, error = '') => {
    return new Promise((resolve) => {
      backupPromiseResolverRef.current = resolve;
      setBackupPrompt({ mode, error });
    });
  }, []);

  const submitBackupPrompt = useCallback((passphrase) => {
    const resolve = backupPromiseResolverRef.current;
    backupPromiseResolverRef.current = null;
    setBackupPrompt(null);
    resolve?.(passphrase);
  }, []);

  const skipBackupPrompt = useCallback(() => {
    const resolve = backupPromiseResolverRef.current;
    backupPromiseResolverRef.current = null;
    setBackupPrompt(null);
    resolve?.(null);
  }, []);

  /* ── [palacan-n4b] rientro sullo stesso browser (chiavi gia' presenti) senza passphrase nota ──────────────
     Prima il backup restava fermo per tutta la sessione, senza dirlo. Ora: la chiave del backup conservata (N4)
     se c'e'; altrimenti si chiede la passphrase UNA volta e la si verifica aprendo il backup del server, senza
     ripristinare niente (le chiavi di questo browser sono piu' recenti); se non esiste ancora un backup si
     propone di crearlo. "Salta": si entra lo stesso, backup fermo. Mai bloccato l'accesso per il backup. */
  const riattivaBackup = async (username, token) => {
    try {
      const salvata = await chiaveBackupSalvata(username);
      if (salvata) {
        backupPassphraseRef.current = salvata;
        return;
      }
      let esiste = false;
      try {
        const stato = await apiService.getKeyBackupStatus(token);
        esiste = stato?.exists === true;
      } catch (_) {
        return; // rete: si riprovera' al prossimo accesso
      }
      if (!esiste) {
        const nuova = await askBackupPassphrase('create');
        if (nuova) {
          backupPassphraseRef.current = nuova;
          ricordaChiaveBackup(username, nuova).catch(() => {});
        }
        return;
      }
      let errore = '';
      for (;;) {
        const passphrase = await askBackupPassphrase('unlock', errore);
        if (passphrase === null) {
          console.warn('⚠️ Backup delle chiavi fermo in questa sessione: passphrase non inserita.');
          return;
        }
        try {
          const dati = await apiService.downloadKeyBackup(token);
          if (!dati) {
            errore = 'Backup non trovato sul server.';
            continue;
          }
          await olmService.decryptBackupBundle(dati, passphrase); // solo verifica: niente ripristino
          backupPassphraseRef.current = passphrase;
          ricordaChiaveBackup(username, passphrase, null, dati).catch(() => {});  // [palacan-n6] stesso sale del backup del server
          return;
        } catch (err) {
          errore = err?.message || 'Passphrase di backup errata.';
        }
      }
    } catch (_) {
      /* mai bloccare l'accesso per il backup */
    }
  };

  /* ── v1.10 (NEW): askInviteRedeemPassword — stesso pattern di
     askBackupPassphrase, ma per il redeem di un invito che richiede la
     password stanza. Ritorna la password inserita, oppure `null` se
     l'utente annulla (l'invito resta in pending_invite_token, ritentabile
     più avanti riaprendo lo stesso link). ─────────────────────────────── */
  const askInviteRedeemPassword = useCallback((error = '') => {
    return new Promise((resolve) => {
      inviteRedeemResolverRef.current = resolve;
      setInviteRedeemPrompt({ error });
    });
  }, []);

  const submitInviteRedeemPrompt = useCallback((password) => {
    const resolve = inviteRedeemResolverRef.current;
    inviteRedeemResolverRef.current = null;
    setInviteRedeemPrompt(null);
    resolve?.(password);
  }, []);

  const cancelInviteRedeemPrompt = useCallback(() => {
    const resolve = inviteRedeemResolverRef.current;
    inviteRedeemResolverRef.current = null;
    setInviteRedeemPrompt(null);
    resolve?.(null);
  }, []);

  // Upload immediato (non debounced) del bundle corrente, dati espliciti
  // (non refs) — usabile anche PRIMA che authToken/currentUsername siano
  // stati aggiornati in state (es. subito dopo login/registrazione).
  const uploadBackupNow = useCallback(async (username, token, passphrase) => {
    if (!username || !token || !passphrase) return;
    try {
      // [palacan-n6] unito al backup del server: con piu' dispositivi nessuno cancella le chiavi dell'altro
      const esito = await caricaBackupUnito({ username, token, segreto: passphrase, olm: olmService, api: apiService, esportaDati: esportaDatiPersonali });
      if (esito.esito === 'errore') throw esito.errore;
      // [palacan-l4c2] il backup unito porta la chiave principale creata da un altro dispositivo: si adotta e ci si firma
      if (esito.unito && esito.unito.chiavePrincipale && !improntaPrincipale(username)) {
        ripristinaChiavePrincipaleDaBackup(username, esito.unito.chiavePrincipale);
        const contoL4c2 = olmAccountRef.current;
        if (contoL4c2) {
          assicuraChiavePrincipale({ io: username, token, dispositivo: olmService.getOrCreateDeviceId(), curva: olmService.getCurve25519Key(contoL4c2) }).catch(() => {});
        }
      }
      if (esito.esito === 'fermo') {
        if (backupPassphraseRef.current === passphrase) backupPassphraseRef.current = null;
        console.warn(`⚠️ Backup fermo (${esito.motivo}): il backup del server non si apre con la chiave di questo dispositivo e resta com'era. Al prossimo accesso verra' chiesta la passphrase.`);
        return;
      }
      if (esito.segreto && backupPassphraseRef.current === passphrase) backupPassphraseRef.current = esito.segreto;
      console.log(esito.unito ? '☁️ Backup chiavi aggiornato (unito a quello del server).' : '☁️ Backup chiavi aggiornato.');
    } catch (e) {
      console.error('❌ Backup upload fallito:', e);
    }
  }, []);

  // Debounced: da chiamare ad ogni cambiamento rilevante (nuove sessioni,
  // nuovi messaggi decifrati). Usa i ref correnti (sessione già attiva).
  const scheduleBackupUpload = useCallback(() => {
    const passphrase = backupPassphraseRef.current;
    const username = currentUsernameRef.current;
    const token = authTokenRef.current;

    if (!passphrase || !username || !token) return;

    if (backupUploadTimeoutRef.current) {
      clearTimeout(backupUploadTimeoutRef.current);
    }

    backupUploadTimeoutRef.current = setTimeout(() => {
      uploadBackupNow(username, token, passphrase);
    }, BACKUP_UPLOAD_DEBOUNCE_MS);
  }, [uploadBackupNow]);

  // Trigger dello scheduling: osserva sia peerSessions (sessioni 1:1) sia
  // messages (proxy per "è arrivata una nuova inbound group session e/o un
  // messaggio è stato decifrato con successo"), senza toccare il layer
  // crypto protetto per agganciare l'evento in un punto più preciso.
  useEffect(() => {
    scheduleBackupUpload();
  }, [peerSessions, scheduleBackupUpload]);

  useEffect(() => {
    scheduleBackupUpload();
  }, [messages, scheduleBackupUpload]);

  /* ── v1.10-V: wiring di forceBackupUploadRef — fuori dal layer crypto ───
     Popola il ref (dichiarato sopra insieme agli altri ref di backup) con
     una funzione che: annulla un eventuale timer di debounce pendente
     (altrimenti scatterebbe comunque più tardi, ridondante ma innocuo) e
     forza subito uploadBackupNow con i valori CORRENTI di passphrase/
     username/token letti dai ref (mai da state, per restare coerenti col
     resto del file). Se manca uno dei tre, no-op silenzioso: succede
     normalmente per chi non ha mai impostato una passphrase di backup in
     questa sessione del tab, e non è un errore da segnalare. ─────────── */
  useEffect(() => {
    forceBackupUploadRef.current = () => {
      const passphrase = backupPassphraseRef.current;
      const username = currentUsernameRef.current;
      const token = authTokenRef.current;

      if (!passphrase || !username || !token) return;

      if (backupUploadTimeoutRef.current) {
        clearTimeout(backupUploadTimeoutRef.current);
        backupUploadTimeoutRef.current = null;
      }

      uploadBackupNow(username, token, passphrase);
    };

    return () => {
      forceBackupUploadRef.current = null;
    };
  }, [uploadBackupNow]);

  /* ── v1.10-W: flush best-effort del backup pendente su chiusura/uscita
     dalla pagina — fuori dal layer crypto. 'visibilitychange' (tab
     nascosto/cambiato, più affidabile di 'beforeunload' su mobile/bfcache)
     e 'pagehide' (chiusura o navigazione via) intercettano i casi in cui
     l'utente esce PRIMA che il debounce di 30s in scheduleBackupUpload sia
     scaduto. Interviene SOLO se esiste davvero un timer pendente
     (backupUploadTimeoutRef valorizzato): altrimenti non c'è nulla da
     forzare. Non è una garanzia assoluta — il browser può comunque
     interrompere a metà un'operazione asincrona durante la chiusura — ma
     riduce al minimo pratico la finestra di rischio descritta nel punto V
     del changelog, con lo stesso spirito "best effort, non bloccante" già
     accettato per sendAck/sendSessionReset in questo file. ────────────── */
  useEffect(() => {
    const flushPendingBackupOnExit = () => {
      if (!backupUploadTimeoutRef.current) return;
      try {
        forceBackupUploadRef.current?.();
      } catch (e) {
        console.error('❌ Flush backup su uscita pagina fallito (non bloccante):', e);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingBackupOnExit();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', flushPendingBackupOnExit);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', flushPendingBackupOnExit);
    };
  }, []);

  /* ── v1.11-AA: Presence channel lifecycle — fuori dal layer crypto (vedi
     punto AA nel changelog in cima al file).
     Apre il canale di presenza quando esistono authToken+currentUsername,
     INDIPENDENTEMENTE da currentRoom (resta acceso anche sulla home, senza
     nessuna chat aperta). onMessage arricchisce ogni evento ricevuto con
     _receivedAt, poi lo espone come contactLiveEvent (prop verso Dashboard
     poco più sotto nel render).
     La funzione di cleanup chiama disconnectPresence() automaticamente
     ogni volta che authToken o currentUsername cambiano — incluso il caso
     in cui performLogout li azzera entrambi: per questo NON serve nessuna
     chiamata esplicita a disconnectPresence() dentro performLogout, e
     quindi zero righe dentro CRYPTO LAYER START/END sono state toccate per
     questa feature. Se l'utente cambia account senza refresh di pagina
     (logout + login diverso nella stessa sessione del tab), il cleanup
     chiude la connessione vecchia prima che il nuovo effect (innescato dal
     nuovo authToken) ne apra una nuova. ─────────────────────────────────── */
  useEffect(() => {
    if (!authToken || !currentUsername) return;

    connectPresence(authToken, {
      onOpen: () => {
        presenceConnectedRef.current = true;
        console.log('🟢 Canale di presenza connesso');
      },
      onMessage: (data) => {
        /* ── fix BUG PRINCIPALE chiamate mancate (vedi anche la versione
           di riconnessione poco piu' sopra nel file, stesso fix): i
           segnali di chiamata prima venivano riconosciuti SOLO dal
           canale legato a una stanza gia' aperta - qui, sul canale di
           presenza SEMPRE connesso (anche sulla home, senza nessuna
           chat aperta, vedi commento sopra), venivano scartati passandoli
           solo a setContactLiveEvent. Ora vengono riconosciuti anche qui
           - e' questo il punto che fa davvero funzionare una chiamata in
           arrivo quando non si ha gia' aperta proprio quella chat, il
           caso normale di una chiamata vera. */
        if (data?.type === 'rooms_changed') {  // [palacan-metadati-a1] avviso senza contenuto: le stanze sono cambiate
          window.dispatchEvent(new CustomEvent('palacan:stanze-cambiate'));
          return;
        }
        if (data?.type === 'call_signal') {
          dispatchCallSignalEvent(data);
          return;
        }
        setContactLiveEvent({ ...data, _receivedAt: Date.now() });
      },
    });

    return () => {
      disconnectPresence();
      presenceConnectedRef.current = false;
    };
  }, [authToken, currentUsername]);

  /* ── v1.9-N: registrazione handler globale sessione scaduta ─────────────
     apiService.onAuthExpired() viene richiamato da QUALSIASI risposta 401,
     su qualunque endpoint. Se l'utente è effettivamente loggato in questo
     momento, forziamo un logout pulito con un messaggio esplicito invece
     di lasciare che l'errore 401 venga scambiato per un errore di dominio
     (es. "password errata" in verifyRoomPassword). */
  useEffect(() => {
    apiService.onAuthExpired(() => {
      if (!currentUsernameRef.current && !authTokenRef.current) return;
      console.warn('⏳ Sessione scaduta, logout automatico.');
      performLogout(false, 'Sessione scaduta. Effettua di nuovo il login.');
    });

    return () => apiService.onAuthExpired(null);
  }, [performLogout]);

  /* ── nuovo: registrazione handler globale rinnovo token silenzioso.
     apiService.fetchWithAuth prova a rinnovare da solo un access_token
     scaduto (vedi apiService.js) - quando ci riesce, avvisa qui cosi'
     authTokenRef/authToken vengono aggiornati subito. Senza questo, le
     chiamate SUCCESSIVE userebbero ancora il vecchio ref/stato (mai
     aggiornato), dato che fetchWithAuth riceve il token come parametro
     dal chiamante, non lo legge da solo - il rinnovo silenzioso
     funzionerebbe solo per LA singola richiesta che lo ha scatenato, non
     per quelle dopo. Stesso schema di onAuthExpired qui sopra. */
  useEffect(() => {
    apiService.onTokenRefreshed((newAccessToken, newRefreshToken) => {
      authTokenRef.current = newAccessToken;
      setAuthToken(newAccessToken);
      // refresh_token gia' salvato in localStorage da apiService stesso
      // (refreshAccessToken) - qui aggiorniamo solo lo stato React/ref
      // dell'access token, che App.jsx possiede e passa in giro.
    });

    return () => apiService.onTokenRefreshed(null);
  }, []);

  /* ── v1.11-AC: azzeramento forcePasswordChange al logout — fuori dal
     layer crypto, stesso identico pattern del canale di presenza (v1.11-
     AA): si osserva authToken diventare null (settato da performLogout,
     dentro il layer protetto, incluso il logout automatico per sessione
     scaduta) invece di aggiungere una riga dentro performLogout stessa.
     Così, se un dipendente con force_password_change=true chiude la
     schermata bloccante con "Esci e riprova più tardi" (onLogout), il
     flag non resta "appiccicato" a un eventuale login successivo con un
     account diverso nella stessa sessione del tab. ─────────────────────── */
  useEffect(() => {
    if (!authToken) setForcePasswordChange(false);
  }, [authToken]);

  /* ── v1.12-A: Persistenza stanza corrente — fuori dal layer crypto (vedi
     punto AF nel changelog in cima al file). Osserva `currentRoom` (lo
     state React pubblico, non il ref protetto currentRoomRef) e scrive/
     rimuove `current_room_${username}` in localStorage di conseguenza.
     Usa lastActiveUsernameRef (definito sopra, fuori dal layer) invece di
     currentUsernameRef perché al logout performLogout azzera
     currentUsername E currentRoom nello stesso commit: currentUsernameRef
     sarebbe già null quando questo effect gira, impedendo di sapere quale
     chiave ripulire. lastActiveUsernameRef mantiene invece l'ultimo
     username noto, permettendo la pulizia corretta anche in quel caso.
     Effetto collaterale voluto: handleBackToList e handleLeaveRoom
     impostano currentRoom a { id: null, name: '' } — questo effect pulisce
     automaticamente la persistenza senza bisogno di toccare quelle due
     funzioni. ─────────────────────────────────────────────────────────── */
  const hasSkippedInitialRoomClearRef = useRef(false);
  useEffect(() => {
    const username = lastActiveUsernameRef.current;
    if (!username) return;

        if (!hasSkippedInitialRoomClearRef.current) {
      hasSkippedInitialRoomClearRef.current = true;
      if (currentRoom?.id) {
        try {
          localStorage.setItem(getCurrentRoomKey(username), JSON.stringify(currentRoom));
        } catch (_) {}
      }
      return;
    }
try {
      if (currentRoom?.id) {
        localStorage.setItem(getCurrentRoomKey(username), JSON.stringify(currentRoom));
        window.__roomDiag && window.__roomDiag(`SALVATA stanza "${currentRoom.name || currentRoom.id}" per ${username}`);
      } else {
        localStorage.removeItem(getCurrentRoomKey(username));
        window.__roomDiag && window.__roomDiag(`RIMOSSA (currentRoom vuoto) per ${username}`);
      }
    } catch (_) {}
  }, [currentRoom]);

  /* ── OLM init ────────────────────────────────────────────────────────── */

  useEffect(() => {
    olmService
      .initOlm()
      .then(() => {
        console.log('🔐 OLM Crypto Initialized');
        setIsOlmReady(true);
      })
      .catch((err) => console.error('❌ OLM Init Failed:', err));
  }, []);

  /* ── Post-login redirect ─────────────────────────────────────────────── */

  useEffect(() => {
    if (!authToken || !currentUsername) return;
    if (location.pathname === '/' || location.pathname === '/login') {
      navigate('/dashboard');
    }
  }, [authToken, currentUsername, location.pathname, navigate]);

  /* ── Session restore ─────────────────────────────────────────────────── */

  useEffect(() => {
    if (!isOlmReady || !authToken || !currentUsername) return;

    try {
      const acc = olmService.loadOlmAccount(currentUsername);

      if (!acc) {
        console.warn('⚠️ Nessun account OLM locale trovato. Logout di sicurezza.');
        performLogout();
        return;
      }

      setCurrentOlmAccount(acc);

      const sessions = olmService.loadSessions(currentUsername) || {};
      peerSessionsRef.current = sessions;
      setPeerSessions({ ...sessions });

      const inboundGroupSessions = olmService.loadInboundGroupSessions(currentUsername) || {};
      inboundGroupSessionsRef.current = inboundGroupSessions;

      /* v1.8-L: ricarico la cache testi propri persistita per questo utente,
         così fetchHistory() può ritrovare il testo dei messaggi inviati
         prima dell'ultimo logout invece di mostrare '[messaggio inviato]'. */
      sentMessagesCacheRef.current = loadSentMessagesCache(currentUsername);

      checkKeysHealth(acc);

      apiService
        .getRooms(authToken)
        .then((serverRooms) => {
          const safeRooms = Array.isArray(serverRooms) ? serverRooms : [];
          setRecentRooms(safeRooms);
          persistRooms(currentUsername, safeRooms);

          /* ── v1.12-A (vedi punto AF nel changelog in cima al file) ───────
             Ripristino la stanza aperta prima del refresh, se esiste ancora
             tra quelle disponibili per questo utente. Il guard su
             currentRoomRef.current?.id evita di sovrascrivere una stanza
             eventualmente già impostata nel frattempo (difensivo, non
             dovrebbe succedere in questo punto del mount). Non chiamo
             markRoomAsRead qui: è un ripristino, non una vera "apertura"
             dell'utente, quindi non voglio alterare il conteggio non letti.
             Una volta impostato currentRoom, l'effect "WebSocket lifecycle"
             già esistente (che osserva currentRoom?.id) fa scattare da solo
             connectWs + ensureRoomKeyShared + fetchHistory, esattamente
             come una normale selezione stanza — zero duplicazione di
             logica. Se la stanza persistita non esiste più (rimossa,
             utente espulso, ecc.), la chiave orfana viene ripulita. */
          if (!currentRoomRef.current?.id) {
            try {
              const raw = localStorage.getItem(getCurrentRoomKey(currentUsername));
              window.__roomDiag && window.__roomDiag(`RESTORE: chiave letta = ${raw ? raw.slice(0, 60) : 'VUOTA/assente'}`);
              if (raw) {
                const persisted = JSON.parse(raw);
                const stillValid = safeRooms.find(
                  (r) => persisted?.id != null && String(r.id) === String(persisted.id)
                );

                if (stillValid) {
                  roomKeySharedWithRef.current[stillValid.id] =
                    roomKeySharedWithRef.current[stillValid.id] || {};
                  setCurrentRoom(stillValid);
                  window.__roomDiag && window.__roomDiag(`RESTORE: ripristinata "${stillValid.name || stillValid.id}"`);
                } else {
                  localStorage.removeItem(getCurrentRoomKey(currentUsername));
                }
              }
            } catch (_) {
              // JSON corrotto o storage non disponibile: non blocchiamo il
              // restore della sessione per questo, l'utente vedrà solo la
              // lista conversazioni invece della stanza precedente.
            }
          }
          /* ── fine v1.12-A ─────────────────────────────────────────────── */
        })
        .catch(() => {
          const local = JSON.parse(localStorage.getItem(`rooms_${currentUsername}`) || '[]');
          setRecentRooms(Array.isArray(local) ? local : []);
        });
    } catch (e) {
      console.error('Errore restore sessione:', e);
      performLogout();
    }
  }, [
    isOlmReady,
    authToken,
    currentUsername,
    checkKeysHealth,
    performLogout,
    persistRooms,
    setCurrentOlmAccount,
  ]);

  /* ── WebSocket lifecycle ─────────────────────────────────────────────── */

  /* v1.10-U: rimossa la registrazione di `onToDeviceMessage: handleToDeviceEvent`
     dalla chiamata a connectWs qui sotto (vedi punto U nel changelog in cima
     al file per la spiegazione completa). wsClient.js, in ws.onmessage,
     invoca SEMPRE callbacks.onMessage e, IN AGGIUNTA, se l'evento è un
     to_device, invoca ANCHE callbacks.onToDeviceMessage — con lo STESSO
     `data`. Ma handleWsMessage (dentro il layer crypto, invariata) instrada
     già da sola i to_device verso handleToDeviceEvent. Tenerli entrambi
     registrati causava una doppia esecuzione di handleToDeviceEvent per
     ogni singolo evento m.room_key in arrivo (stesso client_msg_id),
     producendo OTK_MISMATCH al secondo passaggio (OTK già consumato dal
     primo) seguito da BAD_MESSAGE_KEY_ID (sessione già avanzata). Con
     questa rimozione handleToDeviceEvent viene invocata una sola volta,
     tramite l'unico percorso handleWsMessage → handleToDeviceEvent.
     handleToDeviceEvent stessa NON è stata toccata (resta nel layer
     protetto), quindi handleToDeviceEvent non serve più come dipendenza
     diretta di questo effect: rimossa anche dall'array delle dipendenze
     qui sotto, dato che non è più referenziata nel corpo dell'effect. */
  useEffect(() => {
    const roomId = currentRoom?.id;
    const token = authToken;

    if (!roomId || !token || !olmAccountRef.current) return;

    if (wsRoomIdRef.current && String(wsRoomIdRef.current) !== String(roomId)) {
      disconnectWs();
      wsRoomIdRef.current = null;
    }

    gettoneInMemoria(roomId);  // [palacan-metadati-a4.4b] gettone pronto per l'autenticazione del WebSocket
    connectWs(roomId, token, {
      onMessage: handleWsMessage,
        onOpen: async () => {
          console.log(`[DIAG ${performance.now().toFixed(0)}ms] WS onOpen room=${roomId} - PRIMA ensureRoomKeyShared`);
          setWsReconnectCount((c) => c + 1);
          await ensureRoomKeyShared(roomId);
          console.log(`[DIAG ${performance.now().toFixed(0)}ms] WS onOpen room=${roomId} - DOPO ensureRoomKeyShared, PRIMA fetchHistory`);
          await fetchHistory();
          console.log(`[DIAG ${performance.now().toFixed(0)}ms] WS onOpen room=${roomId} - DOPO fetchHistory`);
        },
      });

    wsRoomIdRef.current = roomId;

    return () => {
      disconnectWs();
      wsRoomIdRef.current = null;
    };
  }, [
    currentRoom?.id,
    authToken,
    fetchHistory,
    handleWsMessage,
    ensureRoomKeyShared,
  ]);

  /* ── v1.4-A: messagesLoading — due useEffect fuori dal layer crypto ────
     Primo: quando cambia la stanza aperta → loading true.
     Secondo: quando arrivano messaggi (fetchHistory chiama sempre
     setMessages) → loading false. Zero righe toccate nel blocco crypto. */

  useEffect(() => {
    if (!currentRoom?.id) return;
    setMessagesLoading(true);
  }, [currentRoom?.id]);

  useEffect(() => {
    setMessagesLoading(false);
  }, [messages]);

  /* ── v1.4-C: refresh periodico recentRooms ogni 15s ────────────────────
     Aggiorna badge/anteprima/orario per le stanze non aperte.
     Zero tocchi al layer crypto: aggiorna solo metadati UI. */

  useEffect(() => {
    if (!authToken || !currentUsername) return;

    // [palacan-metadati-a1] niente controllo ogni 15 s: l'elenco si aggiorna quando il server avvisa (rooms_changed),
    // quando si torna sulla scheda e, per sicurezza, ogni 5 minuti SOLO se la scheda e' visibile.
    let attesaStanze = null;
    const aggiornaStanze = async () => {
      try {
        const rooms = await apiService.getRooms(authToken);
        const safeRooms = Array.isArray(rooms) ? rooms : [];
        setRecentRooms(safeRooms);
        persistRooms(currentUsername, safeRooms);
      } catch (_) {}
    };
    const suAvvisoStanze = () => { clearTimeout(attesaStanze); attesaStanze = setTimeout(aggiornaStanze, 700); };
    const suVisibilitaStanze = () => { if (document.visibilityState === 'visible') aggiornaStanze(); };
    const interval = setInterval(() => { if (document.visibilityState === 'visible') aggiornaStanze(); }, 300000);
    window.addEventListener('palacan:stanze-cambiate', suAvvisoStanze);
    document.addEventListener('visibilitychange', suVisibilitaStanze);
    return () => {
      clearInterval(interval);
      clearTimeout(attesaStanze);
      window.removeEventListener('palacan:stanze-cambiate', suAvvisoStanze);
      document.removeEventListener('visibilitychange', suVisibilitaStanze);
    };
  }, [authToken, currentUsername, persistRooms]);

  /* ── Unread tracking (v1.3, client-side) ────────────────────────────── */

  const getLastReadAt = useCallback((roomId) => {
    const username = currentUsernameRef.current;
    if (!username || !roomId) return null;
    return getStoredValue(getLastReadKey(username, roomId));
  }, []);

  const markRoomAsRead = useCallback((roomId) => {
    const username = currentUsernameRef.current;
    if (!username || !roomId) return;
    try {
      localStorage.setItem(getLastReadKey(username, roomId), new Date().toISOString());
    } catch (_) {}
    // [palacan-nonletti] segno di lettura anche sul server + badge azzerato subito
    setRecentRooms((prev) => (Array.isArray(prev)
      ? prev.map((r) => (String(r?.id) === String(roomId) ? { ...r, unread_count: 0, unreadCount: 0 } : r))
      : prev));
    const tokenLettura = authTokenRef.current;
    if (tokenLettura && typeof apiService.markRoomRead === 'function') {
      apiService.markRoomRead(roomId, tokenLettura).catch(() => {});
    }
  }, []);

  const computeUnreadCount = useCallback(
    (room) => {
      if (!room) return 0;

      const roomId = room.id ?? room.room_id ?? room.roomId ?? null;
      if (!roomId) return 0;

      if (currentRoom?.id && String(currentRoom.id) === String(roomId)) return 0;
      // [palacan-nonletti] numero reale calcolato dal server, se presente
      const dalServer = room.unread_count ?? room.unreadCount;
      if (typeof dalServer === 'number' && Number.isFinite(dalServer)) return Math.max(0, dalServer);

      const lastMessageAt = room.last_message_at ?? room.lastMessageAt ?? null;
      if (!lastMessageAt) return 0;

      const lastReadAt = getLastReadAt(roomId);
      if (!lastReadAt) return 1;

      const lastMsgTime = new Date(lastMessageAt).getTime();
      const lastReadTime = new Date(lastReadAt).getTime();

      if (Number.isNaN(lastMsgTime) || Number.isNaN(lastReadTime)) return 0;

      return lastMsgTime > lastReadTime ? 1 : 0;
    },
    [currentRoom?.id, getLastReadAt]
  );

  // [palacan-nonletti] lettura segnata anche quando esci dalla chat...
  useEffect(() => {
    const roomIdLettura = currentRoom?.id;
    if (!roomIdLettura) return undefined;
    return () => markRoomAsRead(roomIdLettura);
  }, [currentRoom?.id, markRoomAsRead]);

  // [palacan-nonletti] ...e mentre ci sei, quando arrivano nuovi messaggi (con un breve ritardo)
  useEffect(() => {
    const roomIdLettura = currentRoom?.id;
    if (!roomIdLettura || !messages?.length) return undefined;
    const attesa = setTimeout(() => markRoomAsRead(roomIdLettura), 1500);
    return () => clearTimeout(attesa);
  }, [currentRoom?.id, messages?.length, markRoomAsRead]);

  /* ── Room handlers ───────────────────────────────────────────────────── */

  /* v1.9-M: FIX "Password errata" mostrato erroneamente su token scaduto.
     apiService.verifyRoomPassword ora propaga l'errore invece di
     inghiottirlo in `false`. Qui distinguiamo err.isAuthExpired (già
     gestito globalmente da apiService.onAuthExpired → performLogout, che
     scatta PRIMA che questo catch venga eseguito) da un vero errore di
     dominio, per cui mostriamo l'alert reale. */
  const handleSelectChat = async (room, password = null) => {
    if (!room?.id) return;

    // [palacan-gruppi-solo-invito] nessuna password all'apertura: chi e' membro del gruppo lo apre

    roomKeySharedWithRef.current[room.id] = roomKeySharedWithRef.current[room.id] || {};
    markRoomAsRead(room.id);
    setCurrentRoom(room);
    setMessages(cacheStanzeRef.current[String(room?.id)] || []);  // [palacan-chat-offline] subito i messaggi gia' visti
    stanzaInAperturaRef.current = String(room?.id || '');  // [palacan-cronologia-locale]
    if (!cacheStanzeRef.current[String(room?.id)] && room?.id && currentUsernameRef.current) {
      // [palacan-cronologia-locale] nessun messaggio in memoria: la cronologia cifrata salvata su questo dispositivo
      const stanzaDaLeggere = String(room.id);
      leggiStanza(currentUsernameRef.current, stanzaDaLeggere).then((salvati) => {
        if (!salvati || !salvati.length || stanzaInAperturaRef.current !== stanzaDaLeggere) return;
        setMessages((prev) => (prev.length ? prev : salvati));
      }).catch(() => {});
    }
    if (room?.id && currentUsernameRef.current) {
      // [palacan-cronologia-reazioni] reazioni salvate sul dispositivo, unite a quelle in memoria (vince la piu' recente)
      const stanzaReazioni = normalizeRoomId(room.id);
      leggiDato(currentUsernameRef.current, `reazioni:${stanzaReazioni}`)
        .then((salvate) => { if (salvate) importaStanza(stanzaReazioni, salvate); })
        .catch(() => {});
    }
    setSidebarOpen(false);  };

  /* ── v1.4-B: handleLeaveRoom — fuori dal layer crypto ───────────────────
     Chiama l'API, poi azzera currentRoom/messages e rimuove la stanza
     da recentRooms. Risolve il bug "la chat resta aperta dopo essere uscito". */

  const handleLeaveRoom = useCallback(
    async (roomId) => {
      const token = authTokenRef.current;
      const username = currentUsernameRef.current;
      if (!roomId || !token) return;

      try {
        await apiService.leaveRoom(roomId, token);
      } catch (e) {
        console.error('leaveRoom API error:', e);
        // procediamo comunque a chiudere la UI
      }

      setCurrentRoom({ id: null, name: '' });
      setMessages([]);

      setRecentRooms((prev) => {
        const updated = prev.filter((r) => String(r.id) !== String(roomId));
        if (username) persistRooms(username, updated);
        return updated;
      });
    },
    [persistRooms]
  );

  /* ── v1.5-E: handleBackToList — fuori dal layer crypto ──────────────────
     Usata dal pulsante "back" della UI single-pane consumer (Dashboard.jsx).
     A differenza di handleLeaveRoom, NON chiama l'API leave: l'utente
     resta membro della stanza, torna solo alla lista conversazioni.
     Azzera anche messagesLoading per evitare flash di stato stale
     quando l'utente riapre una chat subito dopo. */

  const handleBackToList = useCallback(() => {
    setCurrentRoom({ id: null, name: '' });
    setMessages([]);
    setMessagesLoading(false);
  }, []);

  /* ── v1.10 (NEW): "Invita amico" — SOLO flusso consumer. Crea un invito
     pubblico monouso e ritorna il link completo, pronto da copiare. Lo
     stato generatedInviteLink/inviteLinkCreateError alimenta la UI in
     Dashboard (passati come prop). */
  const handleCreateInviteLink = useCallback(async (roomName, password) => {
    setInviteLinkCreateError('');
    try {
      const res = await apiService.createInviteLink(
        '',  // [palacan-metadati-a3.2b1] il nome non va al server
        password || '',
        authTokenRef.current
      );
      const fullUrl = linkConNome(`${window.location.origin}${res.invite_path}`, roomName);  // [palacan-metadati-a3.2b1] nome dopo il #
      const result = { url: fullUrl, hasPassword: !!res.has_password };
      setGeneratedInviteLink(result);
      return result;
    } catch (e) {
      setInviteLinkCreateError(e.message || 'Errore creazione invito');
      throw e;
    }
  }, []);

  const clearGeneratedInviteLink = useCallback(() => {
    setGeneratedInviteLink(null);
    setInviteLinkCreateError('');
  }, []);

  /* ── v1.10 (NEW): redeemPendingInvite — SOLO flusso consumer/free.
     Da chiamare con l'access_token appena ottenuto da un login/
     registrazione consumer riusciti (vedi handleLogin). Legge il token
     pendente salvato da InviteLandingPage con
     apiService.setPendingInviteToken(), tenta il redeem, e se il backend
     risponde 422 { code: 'password_required' } (vedi
     routes/invite_links.py) mostra il prompt password e riprova. Se
     l'invito non è più valido (404/410) o non utilizzabile (400, es.
     "è il tuo stesso invito"), lo scarta silenziosamente da localStorage:
     non è un errore bloccante da mostrare come popup, l'utente arriva
     comunque sulla dashboard normalmente.
     Nessun tocco al layer crypto: ensureRoomKeyShared scatta da solo su
     setCurrentRoom, esattamente come per join/create stanza normali. */
  const redeemPendingInvite = useCallback(
    async (accessToken) => {
      const pendingToken = apiService.getPendingInviteToken();
      if (!pendingToken || !accessToken) return;

      let password = null;
      let errorMsg = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const esitoInvito = await apiService.redeemInviteLink(pendingToken, password, accessToken);  // [palacan-invito-richiesta]
          const room = esitoInvito?.room || null;
          { const nomeInvito = prendiNomeInvitoPendente(); if (nomeInvito && room?.id) imparaNomeStanza(room.id, nomeInvito); }  // [palacan-metadati-a3.2b1]
          apiService.clearPendingInviteToken();
          if (!room) {  // [palacan-invito-richiesta] e' partita una richiesta di contatto: nessuna chat finche' l'invitante non accetta
            try { sessionStorage.setItem('palacan_avviso_invito', esitoInvito?.inviterUsername || ''); } catch (_) { /* niente avviso */ }
            window.dispatchEvent(new CustomEvent('palacan:invito-richiesta'));
            return;
          }

          try {
            const updatedList = await apiService.getRooms(accessToken);
            const safeList = Array.isArray(updatedList) ? updatedList : [];
            setRecentRooms(safeList);
            persistRooms(currentUsernameRef.current, safeList);
          } catch (_) {
            // la lista si aggiornerà comunque al prossimo refresh periodico
          }

          roomKeySharedWithRef.current[room.id] = roomKeySharedWithRef.current[room.id] || {};
          markRoomAsRead(room.id);
          setCurrentRoom(room);
          setMessages([]);
          setSidebarOpen(false);
          return;
        } catch (e) {
          if (e?.status === 422 && e?.data?.detail?.code === 'password_required') {
            const entered = await askInviteRedeemPassword(errorMsg);
            if (entered === null) return; // annullato: resta pendente, ritentabile
            password = entered;
            errorMsg = '';
            continue;
          }

          if (e?.status === 403) {
            errorMsg = 'Password errata';
            const entered = await askInviteRedeemPassword(errorMsg);
            if (entered === null) return;
            password = entered;
            continue;
          }

          if (e?.status === 404 || e?.status === 410 || e?.status === 400) {
            console.warn('⚠️ Invito pendente non più valido, lo rimuovo:', e.message);
            apiService.clearPendingInviteToken();
            return;
          }

          console.error('❌ redeemPendingInvite error:', e);
          return;
        }
      }
    },
    [askInviteRedeemPassword, markRoomAsRead, persistRooms]
  );

  /* ── v1.10 (NEW): handleInviteLandingRedeemNow — usata da
     InviteLandingPage quando l'utente clicca /i/:token essendo GIÀ
     autenticato (consumer). Salva il token come pendente (stesso
     meccanismo di chi non era loggato) e lo riscatta subito con il
     token corrente, poi torna alla dashboard sulla stanza risultante. */
  const handleInviteLandingRedeemNow = useCallback(
    async (inviteToken) => {
      apiService.setPendingInviteToken(inviteToken);
      await redeemPendingInvite(authTokenRef.current);
      navigate('/dashboard');
    },
    [redeemPendingInvite, navigate]
  );

  const handleCreateRoom = async (name, password, asDepartment = false) => {
    // [palacan-metadati-a3.2a] gruppo privato: il nome non va al server (resta sul dispositivo e viaggia nelle chiavi)
    const room = await apiService.createRoom(currentWorkspaceId ? name : '', password || '', authTokenRef.current, asDepartment);
    if (!currentWorkspaceId && room?.id && name) imparaNomeStanza(room.id, name);
    const updatedList = await apiService.getRooms(authTokenRef.current);
    const safeList = Array.isArray(updatedList) ? updatedList : [];
    setRecentRooms(safeList);
    persistRooms(currentUsernameRef.current, safeList);
    return room;
  };

  const handleJoinRoom = async (roomId, password) => {
    const room = await apiService.joinRoom(roomId, password || '', authTokenRef.current);
    const updatedList = await apiService.getRooms(authTokenRef.current);
    const safeList = Array.isArray(updatedList) ? updatedList : [];
    setRecentRooms(safeList);
    persistRooms(currentUsernameRef.current, safeList);
    roomKeySharedWithRef.current[room.id] = roomKeySharedWithRef.current[room.id] || {};
    markRoomAsRead(room.id);
    setCurrentRoom(room);
    setMessages([]);
    setSidebarOpen(false);
    return room;
  };

const handleDeleteMessage = async (msg) => {
    const roomId = currentRoomRef.current?.id;
    const messageId = msg?.id;
    const token = authTokenRef.current;
    if (!roomId || !messageId || !token) return;
    try {
      await apiService.deleteMessage(roomId, messageId, token, leggiSegreto(currentUsernameRef.current, messageId, msg?.client_msg_id));  // [palacan-metadati-3.4c]
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      console.error('Errore eliminazione messaggio:', err);
    }
  };

const handleHideMessageForMe = async (msg) => {
    const roomId = currentRoomRef.current?.id;
    const messageId = msg?.id;
    const token = authTokenRef.current;
    if (!roomId || !messageId || !token) return;
    try {
      await apiService.hideMessageForMe(roomId, messageId, token);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      console.error('Errore nascondi messaggio:', err);
    }
  };

/* ── nuovo (registro chiamate cifrato): riusa ESATTAMENTE lo stesso
     schema di cifratura/invio di handleSendMessage qui sotto (stessa
     sessione Megolm, stesso sendRoomEncrypted) - il "registro" e'
     semplicemente un messaggio di testo formattato (es. "📞 Chiamata
     vocale · 3:24"), cifrato e trasmesso in modo identico a qualsiasi
     altro messaggio. Nessuna modifica al layer crypto: zero righe nuove
     dentro decryptMegolmRoomMessage o handleToDeviceEvent, il testo
     arriva e si decifra con il codice gia' esistente e testato. */
  const formatCallLogText = (isVideo, outcome, durationSeconds) => {
    const icon = isVideo ? '📹' : '📞';
    const label = isVideo ? 'Videochiamata' : 'Chiamata vocale';
    if (outcome === 'answered') {
      const mins = Math.floor(durationSeconds / 60);
      const secs = durationSeconds % 60;
      const durationStr = `${mins}:${String(secs).padStart(2, '0')}`;
      return `${icon} ${label} · ${durationStr}`;
    }
    if (outcome === 'rejected') return `${icon} ${label} rifiutata`;
    return `${icon} ${label} persa`;
  };

  const sendCallLogMessage = useCallback(
    async ({ roomId, targetUserId, isVideo, outcome, durationSeconds }) => {
      if (!roomId) return;
      const username = currentUsernameRef.current;
      const text = formatCallLogText(isVideo, outcome, durationSeconds);
      const tempId = nuovoIdProvvisorio();  // [palacan-m1c] identificativo casuale, senza l'ora

      sentMessagesCacheRef.current[tempId] = { text, replyTo: null };
      saveSentMessagesCache(username, sentMessagesCacheRef.current);

      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          text,
          sender: username,
          type: 'self',
          created_at: new Date().toISOString(),
          room_id: roomId,
        },
      ]);

      try {
        const outboundGroupSession = await sessioneCondivisaPerInviare(roomId);  // [palacan-correzione-sessione-invio]

        const encryptedPayload = olmService.encryptGroupMessage(outboundGroupSession, { text });

        olmService.saveOutboundGroupSession(username, roomId, outboundGroupSession);

        const senderKey = await olmService.withAccountLock(async () =>
          olmService.getCurve25519Key(olmAccountRef.current)
        );

        // [palacan-metadati-3.4d-bis] chat privata (o stanza non aperta): canale anonimo con nuovi tentativi, mai il canale identificato
        const stanzaNota = currentRoomRef.current && String(currentRoomRef.current.id) === String(roomId) ? currentRoomRef.current : null;
        if (stanzaNota ? stanzaPrivata(stanzaNota) : true) {
          try {
            await inviaAnonimoConTentativi({ roomId, token: authTokenRef.current, username, cipherBody: encryptedPayload, clientMsgId: tempId });
          } catch (erroreAnonimo) {
            console.warn('Registro chiamata non inviato: canale anonimo non raggiungibile', erroreAnonimo);
            setMessages((prev) => prev.map((m) => (String(m.id) === String(tempId) ? { ...m, failed: true, failReason: 'offline' } : m)));
            mettiInUscita(username, { clientMsgId: tempId, roomId, cipherBody: encryptedPayload });  // [palacan-metadati-3.4d-ter]
          }
        } else {
          sendRoomEncrypted({
            roomId,
            cipherBody: encryptedPayload,
            sessionId: outboundGroupSession.session_id(),
            algorithm: 'm.megolm.v1.aes-sha2',
            senderKey,
            clientMsgId: tempId,
          });
        }
      } catch (e) {
        console.error('Errore invio registro chiamata:', e);
      }
    },
    [ensureRoomKeyShared]
  );

  useEffect(() => {
    sendCallLogMessageRef.current = sendCallLogMessage;
  }, [sendCallLogMessage]);

  // [palacan-chat-offline] cronologia della sessione (solo in memoria): ultimi messaggi visti per ogni chat, mostrati subito
  // all'apertura e mantenuti se il server non risponde. Si registrano solo liste della stanza aperta.
  const stanzaInAperturaRef = useRef('');  // [palacan-cronologia-locale] chat in apertura (la lettura dal dispositivo e' asincrona)
  // [palacan-metadati-a2.1] busta per lo scambio delle chiavi: pubblicata a ogni sessione (se il browser supporta X25519)
  useEffect(() => {
    if (!authToken || !currentUsername) return;
    pubblicaBustaSeServe(currentUsername, authToken);
  }, [authToken, currentUsername]);

  // [palacan-l4c2] chiave principale (ed25519 + ML-DSA-65): creata o adottata, pubblicata, e questo dispositivo firmato.
  // In sottofondo, non blocca niente. Due tentativi: il dispositivo va prima registrato (chiavi PQ, PQ4).
  useEffect(() => {
    if (!authToken || !currentUsername) return undefined;
    const provaChiavePrincipale = () => {
      const contoL4c2 = olmAccountRef.current;
      if (!contoL4c2) return;
      assicuraChiavePrincipale({
        io: currentUsername,
        token: authToken,
        dispositivo: olmService.getOrCreateDeviceId(),
        curva: olmService.getCurve25519Key(contoL4c2),
      }).catch(() => {});
    };
    const primoTentativo = setTimeout(provaChiavePrincipale, 5000);
    const secondoTentativo = setTimeout(provaChiavePrincipale, 60000);
    return () => {
      clearTimeout(primoTentativo);
      clearTimeout(secondoTentativo);
    };
  }, [authToken, currentUsername]);

  // [palacan-metadati-a3.1] nomi dei gruppi privati conservati sul dispositivo: caricati all'accesso
  useEffect(() => {
    if (!currentUsername) return;
    impostaUtenteNomi(currentUsername);
    impostaUtenteSegreti(currentUsername);  // [palacan-metadati-a4.1b]
    impostaUtenteRecapito(currentUsername);  // [palacan-metadati-a4.4c]
  }, [currentUsername]);
  const cacheStanzeRef = useRef({});
  useEffect(() => {
    const stanza = currentRoomRef.current?.id;
    if (!stanza || !Array.isArray(messages) || messages.length === 0) return;
    if (!messages.every((m) => !m?.room_id || String(m.room_id) === String(stanza))) return;
    cacheStanzeRef.current[String(stanza)] = messages;
    // [palacan-cronologia-locale] anche sul dispositivo, cifrata (solo i messaggi confermati), con un piccolo ritardo
    const utenteCronologia = currentUsernameRef.current;
    const attesaCronologia = setTimeout(() => { salvaStanza(utenteCronologia, stanza, messages); }, 800);
    return () => clearTimeout(attesaCronologia);
  }, [messages]);

  // [palacan-cronologia-reazioni] reazioni della chat aperta salvate sul dispositivo, cifrate (con un piccolo ritardo)
  useEffect(() => {
    let attesa = null;
    const salva = () => {
      clearTimeout(attesa);
      attesa = setTimeout(() => {
        const utente = currentUsernameRef.current;
        const stanza = currentRoomRef.current?.id;
        if (!utente || !stanza) return;
        const chiaveStanza = normalizeRoomId(stanza);
        salvaDato(utente, `reazioni:${chiaveStanza}`, esportaStanza(chiaveStanza));
      }, 800);
    };
    window.addEventListener('palacan:reazioni-cambiate', salva);
    return () => {
      clearTimeout(attesa);
      window.removeEventListener('palacan:reazioni-cambiate', salva);
    };
  }, []);

  // [palacan-metadati-3.4d-blocco] contatti bloccati: nelle chat dirette il blocco lo applica questo dispositivo
  // (il server non sa chi scrive). Elenco caricato all'accesso, ogni minuto e dopo un blocco/sblocco.
  useEffect(() => {
    let annullato = false;
    const carica = () => {
      const token = authTokenRef.current;
      if (!token) return;
      apiService.getBlockPeriods(token)  // [palacan-correzione-blocco-reazioni] periodi di blocco, anche conclusi
        .catch(() => apiService.getBlockedUsers(token))  // backend precedente: solo i blocchi attuali
        .then((elenco) => { if (!annullato) impostaBloccati(elenco); })
        .catch(() => {});
    };
    carica();
    const intervallo = setInterval(() => { if (document.visibilityState === 'visible') carica(); }, 600000);  // [palacan-metadati-a1]
    window.addEventListener('palacan:blocchi-cambiati', carica);
    return () => {
      annullato = true;
      clearInterval(intervallo);
      window.removeEventListener('palacan:blocchi-cambiati', carica);
    };
  }, [authToken]);


  // [palacan-metadati-3.4d-ter] coda di uscita: i messaggi privati non partiti vengono ritentati da soli (all'avvio, ogni 20
  // secondi, al ritorno della rete) e con il pulsante sulla bolla "non inviato".
  const ritentaUscitaRef = useRef(null);
  ritentaUscitaRef.current = async (soloId = null) => {
    const username = currentUsernameRef.current;
    const token = authTokenRef.current;
    if (!username || !token) return;
    for (const voce of leggiUscita(username)) {
      if (soloId && String(voce.clientMsgId) !== String(soloId)) continue;
      try {
        // [palacan-cl2e] ogni voce si ritenta sul SUO canale: anonimo (chat private) o della stanza (aziende)
        const esito = await ritentaVoce(voce, {
          cifra: async (v) => {
            const salvato = sentMessagesCacheRef.current[v.clientMsgId];
            const testo = salvato && typeof salvato === 'object' ? salvato.text : salvato;
            if (!testo) return null;
            const sessione = await sessioneCondivisaPerInviare(v.roomId);  // [palacan-correzione-sessione-invio]
            const cipherBody = olmService.encryptGroupMessage(sessione, salvato && salvato.replyTo ? { text: testo, replyTo: salvato.replyTo } : { text: testo });
            olmService.saveOutboundGroupSession(username, v.roomId, sessione);
            const senderKey = await olmService.withAccountLock(async () => olmService.getCurve25519Key(olmAccountRef.current));
            return { cipherBody, sessionId: sessione.session_id(), senderKey };
          },
          inviaAnonimo: (p) => inviaAnonimoConTentativi({ ...p, token, username }, []),
          inviaStanza: async (p) => {
            if (!isWsConnected()) throw new Error('rete non disponibile');
            if (sendRoomEncrypted({ ...p, algorithm: 'm.megolm.v1.aes-sha2' }) === false) throw new Error('non inviato');
          },
        });
        if (esito === 'senza_testo') {
          togliDaUscita(username, voce.clientMsgId);
          continue;
        }
        togliDaUscita(username, voce.clientMsgId);
        setMessages((prev) => prev.map((m) => (String(m.id) === String(voce.clientMsgId) ? { ...m, failed: false, failReason: undefined } : m)));
        if (currentRoomRef.current && String(currentRoomRef.current.id) === String(voce.roomId)) markRoomAsRead(voce.roomId);
      } catch (erroreUscita) {
        /* resta in coda: si ritenta al prossimo giro */
      }
    }
  };

  useEffect(() => {
    const giro = () => { if (ritentaUscitaRef.current) ritentaUscitaRef.current(); };
    const riprova = (evento) => { if (ritentaUscitaRef.current) ritentaUscitaRef.current(evento?.detail?.id || null); };
    giro();
    const intervallo = setInterval(giro, 20000);
    window.addEventListener('online', giro);
    window.addEventListener('palacan:riprova-messaggio', riprova);
    return () => {
      clearInterval(intervallo);
      window.removeEventListener('online', giro);
      window.removeEventListener('palacan:riprova-messaggio', riprova);
    };
  }, []);
  /* ── fine registro chiamate cifrato ──────────────────────────────────── */

const handleSendMessage = async (text, replyTo = null) => {
    console.log('🖱️ handleSendMessage CHIAMATA');
    if (!text?.trim() || !currentRoomRef.current?.id) return;
    const tempId = nuovoIdProvvisorio();  // [palacan-m1c] identificativo casuale, senza l'ora
    const roomId = currentRoomRef.current.id;
    const username = currentUsernameRef.current;
    const token = authTokenRef.current;

    /* ── v1.7-G: salvo il testo in chiaro in cache, indicizzato per tempId
       (== client_msg_id lato backend), PRIMA di ogni tentativo di invio.
       Così fetchHistory() lo ritrova anche se l'invio va in fallback legacy.
       v1.8-L: write-through su localStorage, così il testo sopravvive anche
       a un logout/relogin, non solo a un fallback nella stessa sessione. */
    sentMessagesCacheRef.current[tempId] = { text, replyTo: replyTo || null };
    saveSentMessagesCache(username, sentMessagesCacheRef.current);

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        text,
        replyTo: replyTo || undefined,
        sender: username,
        type: 'self',
        created_at: new Date().toISOString(),
        room_id: roomId,
      },
    ]);

    try {
      const privata = stanzaPrivata(currentRoomRef.current);  // [palacan-metadati-3.4c]
      if (privata && daAttivare(username, roomId)) {
        // prima volta sul canale anonimo in questa stanza: nuova chiave di stanza, cosi' ogni messaggio
        // anonimo ha un creatore registrato (mittente verificato)
        olmService.clearOutboundGroupSession(username, roomId);
      }
      const outboundGroupSession = await sessioneCondivisaPerInviare(roomId);  // [palacan-correzione-sessione-invio]

      const encryptedPayload = olmService.encryptGroupMessage(outboundGroupSession, replyTo ? { text, replyTo } : { text });

      /* ── v1.6-F: fix bug Megolm "messaggi spariscono con il terzo utente" ──
         encryptGroupMessage() avanza il ratchet della outbound session SOLO
         in memoria (dentro l'oggetto Olm locale a questa call). Senza
         ripersistere subito dopo, il prossimo handleSendMessage ricarica da
         localStorage lo stato PRE-encrypt tramite getOrCreateOutboundGroupSession,
         causando riuso del message_index Megolm → fallimenti silenziosi in
         decrittazione lato ricevente. Opzione B concordata: nessuna modifica
         a olmService.js, nessuna firma toccata, solo questa riga aggiuntiva. */
      olmService.saveOutboundGroupSession(username, roomId, outboundGroupSession);

      const senderKey = await olmService.withAccountLock(async () =>
        olmService.getCurve25519Key(olmAccountRef.current)
      );

      console.log('📤 STO PER INVIARE, roomId:', roomId, 'sessionId:', outboundGroupSession.session_id());

      if (privata) {
        // [palacan-metadati-3.4c] chat privata: canale anonimo (il server non sa chi scrive). Se non risponde, il messaggio
        // parte sul canale di oggi: resta cifrato, ma per questo messaggio il server saprebbe chi scrive.
        try {
          await inviaAnonimoConTentativi({ roomId, token, username, cipherBody: encryptedPayload, clientMsgId: tempId });  // [palacan-metadati-3.4d-bis]
          segnaAttivato(username, roomId);
          markRoomAsRead(roomId);
        } catch (erroreAnonimo) {
          // [palacan-metadati-3.4d-bis] niente canale di riserva identificato: il messaggio resta "non inviato"
          console.warn('Messaggio non inviato: canale anonimo non raggiungibile dopo i tentativi', erroreAnonimo);
          setMessages((prev) => prev.map((m) => (String(m.id) === String(tempId) ? { ...m, failed: true, failReason: 'offline' } : m)));
          mettiInUscita(username, { clientMsgId: tempId, roomId, cipherBody: encryptedPayload });  // [palacan-metadati-3.4d-ter]
        }
      } else {
        sendRoomEncrypted({
          roomId,
          cipherBody: encryptedPayload,
          sessionId: outboundGroupSession.session_id(),
          algorithm: 'm.megolm.v1.aes-sha2',
          senderKey,
          clientMsgId: tempId,
        });
        markRoomAsRead(roomId);  // [palacan-metadati-3.5] il server non salva il mittente: i propri messaggi non vanno contati come non letti
      }

      /* ── ECCEZIONE MIRATA v-next: fix bottone "Elimina" mai disponibile sui
         propri messaggi. Il mittente non riceve mai un eco del proprio
         messaggio sul percorso WS live (handleWsMessage ignora esplicitamente
         i propri eventi, `senderUsername === username` piu' sotto) -- l'unico
         modo per sostituire il tempId ottimistico con l'id reale del server e'
         un fetchHistory() (gia' esistente, invariato, stesso meccanismo v1.10-X/Y
         di dedup per client_msg_id). Qui si programma UNA sola chiamata
         differita dopo l'invio riuscito, cosi' l'id si riconcilia senza
         aspettare un refresh manuale della chat. Non bloccante, avvolta in
         try/catch, nessuna riga esistente di invio/cifratura toccata. */
      setTimeout(() => {
        if (
          currentRoomRef.current?.id &&
          String(currentRoomRef.current.id) === String(roomId)
        ) {
          fetchHistory().catch((histErr) => {
            console.error('fetchHistory dopo invio fallito (non bloccante):', histErr);
          });
        }
      }, 2500);
      /* ── fine ECCEZIONE MIRATA v-next ─────────────────────────────────────── */
    } catch (e) {
      // [palacan-cl2e] niente ripiego legacy in NESSUNA stanza: mandava il testo via Olm senza la busta post-quantum
      // (leggibile un domani da chi registra il traffico) e con il mittente visibile al server. Come nelle chat private
      // ([palacan-metadati-3.4d-bis] chat privata: niente ripiego legacy (manderebbe il mittente al server)), il
      // messaggio resta "non inviato" e va nella coda di uscita, che lo ritenta da sola sul canale della sua stanza.
      console.error('Megolm send error, messaggio nella coda di uscita:', e);
      setMessages((prev) => prev.map((m) => (String(m.id) === String(tempId) ? { ...m, failed: true, failReason: 'offline' } : m)));
      mettiInUscita(username, { clientMsgId: tempId, roomId, cipherBody: null, canale: canaleDi(currentRoomRef.current) });  // [palacan-metadati-3.4d-ter] [palacan-cl2e]
    }
  };

  /* ── Auth handlers ───────────────────────────────────────────────────── */

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');

    try {
      const res = await apiService.loginConsumer(loginUser, loginPass);

      // FIX (cifratura dati di sessione): setSecureItem cifra con
      // AES-GCM prima di salvare - richiede await, ma siamo gia'
      // dentro una funzione async (vedi 'await apiService.loginConsumer'
      // subito sopra).
      await setSecureItem('token', res.access_token);
      await setSecureItem('refresh_token', res.refresh_token || '');
      await setSecureItem('username', res.user.username);
      await setSecureItem('user_role', 'consumer');
      removeSecureItem('workspace_id');
      removeSecureItem('workspace_name');
      await setSecureItem('user_id', res.user.id);

      let acc = olmService.loadOlmAccount(res.user.username);

      if (!acc) {
        /* v1.9-O: prima di generare chiavi nuove da zero, verifichiamo se
           esiste un backup recuperabile per questo utente (es. nuovo
           dispositivo, incognito appena chiuso, dati del browser puliti).
           Se esiste, chiediamo la passphrase di backup con retry in caso
           di errore; se l'utente non la ricorda può scegliere "Salta" e si
           procede come prima (nuove chiavi, cronologia vecchia non
           recuperabile). */
        let backupExists = false;
        try {
          const status = await apiService.getKeyBackupStatus(res.access_token);
          backupExists = status?.exists === true;
        } catch (_) {
          // Se il controllo fallisce (es. rete), procediamo comunque come
          // se non esistesse un backup: non blocchiamo il login per questo.
        }

        if (backupExists) {
          let errorMsg = '';
          let recovered = false;

          while (!recovered) {
            const passphrase = await askBackupPassphrase('recover', errorMsg);

            if (passphrase === null) {
              // Utente ha scelto "Salta": procede con chiavi nuove.
              break;
            }

            try {
              const backupData = await apiService.downloadKeyBackup(res.access_token);
              if (!backupData) {
                errorMsg = 'Backup non trovato sul server.';
                continue;
              }

              const bundle = await olmService.decryptBackupBundle(backupData, passphrase);
              olmService.restoreBackupBundleToLocalStorage(bundle);
              await importaDatiPersonali(bundle.username, bundle.datiPersonali);  // [palacan-metadati-a4.3a] nomi e segreti
              await Promise.all([impostaUtenteNomi(bundle.username), impostaUtenteSegreti(bundle.username), impostaUtenteRecapito(bundle.username)]).catch(() => {});  // [palacan-correzione-ripristino-memoria] la memoria riprende nomi, segreti e caselle appena ripristinati

              backupPassphraseRef.current = passphrase;
              ricordaChiaveBackup(res.user.username, passphrase, null, backupData).catch(() => {});  // [palacan-n4] chiave del backup conservata: il backup continua dopo un ricaricamento  // [palacan-n6]
              acc = olmService.loadOlmAccount(res.user.username);
              recovered = Boolean(acc);

              if (!recovered) {
                errorMsg = 'Backup recuperato ma incompleto. Riprova o salta.';
              } else {
                // v1.9-P: le sessioni Olm 1:1 NON vengono più ripristinate dal
                // backup (vedi olmService.restoreBackupBundleToLocalStorage).
                // Per ogni stanza di cui l'utente è membro, forziamo un invio
                // proattivo di una room key fresca (sempre pre-key, tipo 0):
                // è il messaggio che permette anche al peer di rimpiazzare
                // la propria sessione 1:1 "vecchia" con una nuova funzionante,
                // altrimenti resterebbe rotta fino al prossimo invio naturale.
                try {
                  const rooms = await apiService.getRooms(res.access_token);
                  const safeRooms = Array.isArray(rooms) ? rooms : [];
                  for (const room of safeRooms) {
                    if (room?.id) {
                      await ensureRoomKeyShared(room.id);
                      // v1.10-T: avviso gli altri membri della stanza che ho
                      // azzerato le mie sessioni 1:1 (v1.9-P), così scartano
                      // la loro sessione stale verso di me invece di
                      // riusarla e produrre un messaggio non decryptabile.
                      sendSessionReset({ roomId: room.id });
                    }
                  }
                } catch (e) {
                  console.error('❌ Re-share room key dopo recupero backup fallito:', e);
                }
              }
            } catch (err) {
              errorMsg = err.message || 'Passphrase di backup errata.';
            }
          }
        }

        if (!acc) {
          const keys = await generateKeysForRegistration(res.user.username);
          acc = keys.account;
          // FIX: device_id ora passato anche qui - vedi commento in
          // uploadInitialOTKs sopra per la spiegazione completa del bug.
          await apiService.uploadIdentityKey(keys.identityKey, res.access_token, olmService.getOrCreateDeviceId());
          acc = await uploadInitialOTKs(acc, res.user.username, res.access_token);

          // Se non esisteva nessun backup pregresso, questa è la prima
          // volta che l'utente ottiene chiavi su un dispositivo "vuoto":
          // proponiamo di crearne uno, per non ritrovarsi nello stesso
          // problema al prossimo cambio dispositivo/incognito.
          if (!backupExists) {
            const newPassphrase = await askBackupPassphrase('create');
            if (newPassphrase) {
              backupPassphraseRef.current = newPassphrase;
              ricordaChiaveBackup(res.user.username, newPassphrase).catch(() => {});  // [palacan-n4] chiave del backup conservata: il backup continua dopo un ricaricamento
              await uploadBackupNow(res.user.username, res.access_token, newPassphrase);
            }
          }
        }
      } else {
        olmService.saveOlmAccount(res.user.username, acc);
        acc = olmService.loadOlmAccount(res.user.username) || acc;

        // v1.9-O: se una passphrase di backup è già nota in questa sessione
        // del tab (es. l'utente si è appena registrato pochi istanti fa, e
        // questo login è il primo dopo la registrazione), sincronizziamo
        // subito il backup una volta, invece di aspettare il primo
        // cambiamento di sessioni/messaggi.
        if (!backupPassphraseRef.current) await riattivaBackup(res.user.username, res.access_token);  // [palacan-n4b] chiavi gia' qui, passphrase non nota: si chiede una volta
        if (backupPassphraseRef.current) {
          uploadBackupNow(res.user.username, res.access_token, backupPassphraseRef.current);
        }
      }

      setCurrentOlmAccount(acc);

      const sessions = olmService.loadSessions(res.user.username) || {};
      peerSessionsRef.current = sessions;
      setPeerSessions({ ...sessions });

      const inboundGroupSessions = olmService.loadInboundGroupSessions(res.user.username) || {};
      inboundGroupSessionsRef.current = inboundGroupSessions;

      /* v1.8-L: ricarico la cache testi propri persistita per questo utente. */
      await preparaDatiLocali(res.user.username);  // [palacan-9a2] cache inviati e bozze (cifrate) pronte
      sentMessagesCacheRef.current = loadSentMessagesCache(res.user.username);

      setAuthToken(res.access_token);
      setCurrentUsername(res.user.username);
      setCurrentUserRole('consumer');
      setCurrentWorkspaceId(null);
      /* v1.11-AD: un login consumer non ha mai un workspace — azzeriamo
         esplicitamente anche il nome, in coerenza con l'id qui sopra. */
      setCurrentWorkspaceName(null);
      setCurrentUserId(res.user.id);

      /* ── v1.11-AC (vedi punto AC nel changelog in cima al file) ─────────
         Impostato esplicitamente a Boolean(...) — sia per attivarlo che
         per disattivarlo — così un utente senza questo flag non vede mai
         nulla di diverso da prima. Il render (più sotto) userà questo
         stato per decidere se mostrare la Dashboard o
         ForcedPasswordChangeScreen, PRIMA di qualunque navigate(). ─────── */
      setForcePasswordChange(Boolean(res.user.force_password_change));

      setShowPersonalLogin(false);
      setLoginPass('');

      /* v1.10 (NEW): SOLO flusso consumer — se l'utente è arrivato qui
         cliccando un link di invito (token salvato da InviteLandingPage
         in pending_invite_token), completiamo il redeem ora che abbiamo
         un JWT valido, PRIMA di navigare alla dashboard, così l'utente
         atterra già dentro la stanza invitata invece che sulla lista
         vuota. Il flusso enterprise (handleEnterpriseSubmit) non chiama
         mai questa funzione. */
      await redeemPendingInvite(res.access_token);

      navigate('/dashboard');
    } catch (e) {
      setAuthError(e.message || i18n.t('account.error_invalid_credentials'));  // [palacan-accesso-automatico]
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');

    try {
      const keys = await generateKeysForRegistration(loginUser);

      await apiService.registerConsumer(
        loginUser,
        loginPass,
        keys.identityKey,
        keys.registrationId
      );

      olmService.saveOlmAccount(loginUser, keys.account);

      /* v1.9-O: chiediamo subito la passphrase di backup, così è già
         pronta in backupPassphraseRef quando l'utente farà login (stessa
         istanza di AppContent, il ref sopravvive al cambio di vista). Se
         l'utente salta, può sempre impostarla più avanti (non gestito qui:
         andrebbe aggiunta un'azione dedicata nelle impostazioni). */
      const passphrase = await askBackupPassphrase('create');
      if (passphrase) {
        backupPassphraseRef.current = passphrase;
        ricordaChiaveBackup(loginUser, passphrase).catch(() => {});  // [palacan-n4] chiave del backup conservata: il backup continua dopo un ricaricamento
      }

      // [palacan-accesso-automatico] si entra subito con le stesse credenziali (stesso handleLogin: backup, invito, Dashboard);
      // se l'accesso non riesce, l'utente resta sul modulo di accesso con l'errore.
      setView('login');
      await handleLogin({ preventDefault: () => {} });
      return;
    } catch (e) {
      let msg = e.message || i18n.t('account.error_registration');  // [palacan-accesso-automatico]
      if (msg.includes('400')) msg = i18n.t('account.error_username_taken');  // [palacan-accesso-automatico]
      setAuthError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEnterpriseSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setLoading(true);
    setEnterpriseError('');

    try {
      let res;
      let acc = null;

      if (isActivationMode) {
        const keys = await generateKeysForRegistration(enterpriseUsername);

        res = await apiService.activateWorkspace(
          licenseToken,
          companyName,
          enterpriseUsername,
          enterprisePassword,
          keys.identityKey,
          keys.registrationId
        );

        acc = keys.account;
        acc = await uploadInitialOTKs(acc, res.user.username, res.access_token);

        /* v1.9-O: come per la registrazione consumer, proponiamo subito
           una passphrase di backup dato che qui abbiamo già un token
           valido (attivazione = login immediato). */
        const passphrase = await askBackupPassphrase('create');
        if (passphrase) {
          backupPassphraseRef.current = passphrase;
          ricordaChiaveBackup(res.user.username, passphrase).catch(() => {});  // [palacan-n4] chiave del backup conservata: il backup continua dopo un ricaricamento
          await uploadBackupNow(res.user.username, res.access_token, passphrase);
        }
      } else {
        res = await apiService.loginEnterprise(
          companyName,
          enterpriseUsername,
          enterprisePassword
        );

        acc = olmService.loadOlmAccount(res.user.username);

        if (!acc) {
          /* v1.9-O: stessa logica di recupero backup del login consumer. */
          let backupExists = false;
          try {
            const status = await apiService.getKeyBackupStatus(res.access_token);
            backupExists = status?.exists === true;
          } catch (_) {}

          if (backupExists) {
            let errorMsg = '';
            let recovered = false;

            while (!recovered) {
              const passphrase = await askBackupPassphrase('recover', errorMsg);
              if (passphrase === null) break;

              try {
                const backupData = await apiService.downloadKeyBackup(res.access_token);
                if (!backupData) {
                  errorMsg = 'Backup non trovato sul server.';
                  continue;
                }

                const bundle = await olmService.decryptBackupBundle(backupData, passphrase);
                olmService.restoreBackupBundleToLocalStorage(bundle);
                await importaDatiPersonali(bundle.username, bundle.datiPersonali);  // [palacan-metadati-a4.3a] nomi e segreti
                await Promise.all([impostaUtenteNomi(bundle.username), impostaUtenteSegreti(bundle.username), impostaUtenteRecapito(bundle.username)]).catch(() => {});  // [palacan-correzione-ripristino-memoria] la memoria riprende nomi, segreti e caselle appena ripristinati

                backupPassphraseRef.current = passphrase;
                ricordaChiaveBackup(res.user.username, passphrase, null, backupData).catch(() => {});  // [palacan-n4] chiave del backup conservata: il backup continua dopo un ricaricamento  // [palacan-n6]
                acc = olmService.loadOlmAccount(res.user.username);
                recovered = Boolean(acc);

                if (!recovered) {
                  errorMsg = 'Backup recuperato ma incompleto. Riprova o salta.';
                } else {
                  // v1.9-P: stesso re-share proattivo delle room key del
                  // login consumer — vedi handleLogin per la spiegazione
                  // completa del perché serve.
                  try {
                    const rooms = await apiService.getRooms(res.access_token);
                    const safeRooms = Array.isArray(rooms) ? rooms : [];
                    for (const room of safeRooms) {
                      if (room?.id) {
                        await ensureRoomKeyShared(room.id);
                        sendSessionReset({ roomId: room.id });
                      }
                    }
                  } catch (e) {
                    console.error('❌ Re-share room key dopo recupero backup fallito:', e);
                  }
                }
              } catch (err) {
                errorMsg = err.message || 'Passphrase di backup errata.';
              }
            }
          }

          if (!acc) {
            console.warn('Nuovo login enterprise rilevato, rigenerazione chiavi...');
            const keys = await generateKeysForRegistration(res.user.username);
            acc = keys.account;
            // FIX: device_id ora passato anche qui - vedi commento in
            // uploadInitialOTKs sopra per la spiegazione completa del bug.
            await apiService.uploadIdentityKey(keys.identityKey, res.access_token, olmService.getOrCreateDeviceId());
            acc = await uploadInitialOTKs(acc, res.user.username, res.access_token);

            if (!backupExists) {
              const newPassphrase = await askBackupPassphrase('create');
              if (newPassphrase) {
                backupPassphraseRef.current = newPassphrase;
                ricordaChiaveBackup(res.user.username, newPassphrase).catch(() => {});  // [palacan-n4] chiave del backup conservata: il backup continua dopo un ricaricamento
                await uploadBackupNow(res.user.username, res.access_token, newPassphrase);
              }
            }
          }
        } else {
          olmService.saveOlmAccount(res.user.username, acc);
          acc = olmService.loadOlmAccount(res.user.username) || acc;

          if (!backupPassphraseRef.current) await riattivaBackup(res.user.username, res.access_token);  // [palacan-n4b] chiavi gia' qui, passphrase non nota: si chiede una volta
          if (backupPassphraseRef.current) {
            uploadBackupNow(res.user.username, res.access_token, backupPassphraseRef.current);
          }
        }
      }

      setCurrentOlmAccount(acc);

      const sessions = olmService.loadSessions(res.user.username) || {};
      peerSessionsRef.current = sessions;
      setPeerSessions({ ...sessions });

      const inboundGroupSessions =
        olmService.loadInboundGroupSessions(res.user.username) || {};
      inboundGroupSessionsRef.current = inboundGroupSessions;

      /* v1.8-L: ricarico la cache testi propri persistita per questo utente. */
      await preparaDatiLocali(res.user.username);  // [palacan-9a2] cache inviati e bozze (cifrate) pronte
      sentMessagesCacheRef.current = loadSentMessagesCache(res.user.username);

      const { access_token, refresh_token, user, workspace } = res;

      // FIX (cifratura dati di sessione): stessa tecnica di login
      // consumer sopra - setSecureItem cifra con AES-GCM, richiede
      // await (gia' dentro una funzione async, confermato dagli await
      // usati poco sopra in questa stessa funzione).
      await setSecureItem('token', access_token);
      await setSecureItem('refresh_token', refresh_token || '');
      await setSecureItem('username', user.username);
      await setSecureItem('user_role', user.role);
      await setSecureItem('workspace_id', user.workspace_id || workspace?.id || '');
      /* ── v1.11-AD (Fase 3, vedi punto AD nel changelog in cima al file) ──
         Il buco era qui: `workspace` esiste già nella risposta (destrut-
         turato sopra), ma solo workspace?.id veniva usato. Salviamo ora
         anche il nome, con lo stesso fallback user.workspace_name ||
         workspace?.name già suggerito, e lo esponiamo in state così può
         essere passato a <Dashboard /> più sotto. */
      await setSecureItem('workspace_name', user.workspace_name || workspace?.name || '');
      await setSecureItem('user_id', user.id);

      setAuthToken(access_token);
      setCurrentUsername(user.username);
      setCurrentUserRole(user.role);
      setCurrentWorkspaceId(user.workspace_id || workspace?.id || null);
      setCurrentWorkspaceName(user.workspace_name || workspace?.name || null);
      setCurrentUserId(user.id);

      /* ── v1.11-AC (vedi punto AC nel changelog in cima al file) ─────────
         Stesso identico pattern di handleLogin: impostato esplicitamente
         a Boolean(...), copre sia il caso attivazione (isActivationMode,
         `user` == res.user) sia il login enterprise normale. Un dipendente
         creato da un admin con force_password_change=true vede quindi la
         schermata bloccante indipendentemente da quale dei due rami sopra
         lo ha autenticato. ────────────────────────────────────────────── */
      setForcePasswordChange(Boolean(user.force_password_change));

      setShowEnterpriseModal(false);
      setCompanyName('');
      setEnterpriseUsername('');
      setEnterprisePassword('');
      setLicenseToken('');

      navigate('/dashboard');
    } catch (e) {
      setEnterpriseError(e.message || 'Errore autenticazione');
    } finally {
      setLoading(false);
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════ */

  // FIX (cifratura dati di sessione): mentre isRestoringSession e' true,
  // non sappiamo ancora con certezza se l'utente ha un token salvato
  // (la decifratura e' in corso, vedi l'effetto sopra) - senza questa
  // guardia, ogni ricaricamento di pagina mostrerebbe per un istante la
  // schermata di login anche a un utente gia' autenticato, prima che
  // authToken venisse davvero ripristinato dal suo valore vero cifrato.
  if (isRestoringSession) {
    return null;
  }

  if (!authToken) {
    return (
      <>
        {/* v1.10 (NEW): Routes qui dentro SOLO per intercettare /i/:token
           (landing pubblica invito) prima della LandingPage normale.
           Qualunque altro path (inclusa "/") mostra la LandingPage esistente,
           invariata. v1.12-B: aggiunte in cima le 6 route pubbliche di
           contenuto statico, ENTRAMBE prima di /i/:token, come da piano. */}
        <Routes>
          <Route path="/chi-siamo" element={<AboutPage />} />
          <Route path="/ecosistema" element={<EcosistemaPage />} />
          <Route path="/sicurezza" element={<SecurityPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/termini" element={<TermsPage />} />
          <Route path="/open-source" element={<OpenSourcePage />} />
          <Route path="/tecnologia" element={<TechnologyPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route
            path="/i/:token"            element={
              <InviteLandingPage
                isAuthenticated={false}
                onShowPersonalLogin={() => {
                  setShowPersonalLogin(true);
                  setView('login');
                  setAuthError('');
                }}
                onShowPersonalRegister={() => {
                  setShowPersonalLogin(true);
                  setView('register');
                  setAuthError('');
                }}
              />
            }
          />
          <Route
            path="*"
            element={
              <LandingPage
                isOlmReady={isOlmReady}
                onShowPersonalLogin={() => {
                  setShowPersonalLogin(true);
                  setView('login');
                  setAuthError('');
                }}
                onShowPersonalRegister={() => {
                  setShowPersonalLogin(true);
                  setView('register');
                  setAuthError('');
                }}
                onEnterpriseLogin={() => {
                  setShowEnterpriseModal(true);
                  setIsActivationMode(false);
                  setEnterpriseError('');
                }}
                onEnterpriseActivate={() => {
                  setShowEnterpriseModal(true);
                  setIsActivationMode(true);
                  setEnterpriseError('');
                }}
              />
            }
          />
        </Routes>

        <AnimatePresence>
          {showPersonalLogin && (
            <UnifiedAuthCard
              view={view}
              onViewChange={(v) => { setView(v); setAuthError(''); }}
              loginUser={loginUser}
              setLoginUser={setLoginUser}
              loginPass={loginPass}
              setLoginPass={setLoginPass}
              onLogin={handleLogin}
              onRegister={handleRegister}
              authError={authError}
              loading={loading}
              isOlmReady={isOlmReady}
              onClose={() => {
                setShowPersonalLogin(false);
                setAuthError('');
              }}
              dimmed={!!backupPrompt || !!inviteRedeemPrompt}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showEnterpriseModal && (
            <WorkspaceActivationWizard
              isActivationMode={isActivationMode}
              companyName={companyName}
              setCompanyName={setCompanyName}
              enterpriseUsername={enterpriseUsername}
              setEnterpriseUsername={setEnterpriseUsername}
              enterprisePassword={enterprisePassword}
              setEnterprisePassword={setEnterprisePassword}
              licenseToken={licenseToken}
              setLicenseToken={setLicenseToken}
              onSubmit={handleEnterpriseSubmit}
              onClose={() => {
                setShowEnterpriseModal(false);
                setEnterpriseError('');
              }}
              onSwitchToActivation={() => {
                setIsActivationMode(true);
                setEnterpriseError('');
              }}
              enterpriseError={enterpriseError}
              loading={loading}
              isOlmReady={isOlmReady}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {backupPrompt && (
            <BackupPinPrompt
              mode={backupPrompt.mode}
              error={backupPrompt.error}
              loading={false}
              onSubmit={submitBackupPrompt}
              onSkip={backupPrompt.mode === 'recover' || backupPrompt.mode === 'unlock' ? skipBackupPrompt : undefined}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {inviteRedeemPrompt && (
            <InviteRedeemPrompt
              error={inviteRedeemPrompt.error}
              loading={false}
              onSubmit={submitInviteRedeemPrompt}
              onCancel={cancelInviteRedeemPrompt}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  /* ── v1.11-AC: gate bloccante cambio password obbligatorio ─────────────
     Valutato SOLO se authToken esiste già (utente autenticato) — questo
     blocco sta quindi DOPO il blocco "if (!authToken)" sopra e PRIMA di
     qualunque Route che monti la Dashboard, così l'utente non può in
     nessun modo raggiungerla prima di aver cambiato password (nessuna
     Route montata, nessun navigate() possibile). ForcedPasswordChangeScreen
     chiama apiService.changePassword internamente e segnala il successo
     con onSuccess. onLogout riusa performLogout(false) esattamente come
     il pulsante di logout normale in Dashboard. ─────────────────────────── */
  if (authToken && forcePasswordChange) {
    return (
      <ForcedPasswordChangeScreen
        apiService={apiService}
        token={authToken}
        username={currentUsername}
        onSuccess={() => setForcePasswordChange(false)}
        onLogout={() => performLogout(false)}
      />
    );
  }

  /* ── v1.3: arricchisco recentRooms con unread_count calcolati client-side */
  const recentRoomsWithUnread = recentRooms.map((room) => {
    const unread = computeUnreadCount(room);
    return {
      ...room,
      unread_count: unread,
      unreadCount: unread,
    };
  });

  return (
    <>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <Dashboard
              key={currentUsername}
              authToken={authToken}
              callManager={callManager}
              loadCallHistory={loadCallHistory}
              currentUsername={currentUsername}
              currentUserRole={currentUserRole}
              currentWorkspaceId={currentWorkspaceId}
              currentWorkspaceName={currentWorkspaceName}
              currentUserId={currentUserId}
              recentRooms={recentRoomsWithUnread}
              currentRoom={currentRoom}
              messages={messages}
              messagesLoading={messagesLoading}
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              onLogout={performLogout}
              onSelectChat={handleSelectChat}
              onCreateRoom={handleCreateRoom}
              onJoinRoom={handleJoinRoom}
              onSendMessage={handleSendMessage}
              onDeleteMessage={handleDeleteMessage}
              onHideMessageForMe={handleHideMessageForMe}
              onLeaveRoom={handleLeaveRoom}
              onBack={handleBackToList}
              setRecentRooms={setRecentRooms}
              persistRooms={persistRooms}
              apiService={apiService}
              peerSessions={peerSessions}
              olmAccount={olmAccount}
              onCreateInviteLink={handleCreateInviteLink}
              generatedInviteLink={generatedInviteLink}
              inviteLinkCreateError={inviteLinkCreateError}
              onClearGeneratedInviteLink={clearGeneratedInviteLink}
              contactLiveEvent={contactLiveEvent}
              sendRejectedEvent={sendRejectedEvent}
              onCreateTask={handleCreateTask}
              decryptTaskList={decryptTaskList}
              encryptReaction={inviaReazione} /* [palacan-metadati-3.6] reazione come messaggio cifrato */
              decryptReaction={decryptReaction}
              reactionLiveEvent={reactionLiveEvent}
              wsReconnectCount={wsReconnectCount}
            />
          }
        />
        {/* v1.12-B: le stesse 6 route pubbliche di contenuto statico, qui
           nell'albero <Routes> del ramo AUTENTICATO — stesso path, stesso
           componente del blocco sopra — così un utente/dipendente già
           loggato può comunque raggiungere /privacy, /termini ecc. (es.
           da un link nel footer), senza dover prima fare logout. */}
        <Route path="/chi-siamo" element={<AboutPage />} />
        <Route path="/ecosistema" element={<EcosistemaPage />} />
        <Route path="/sicurezza" element={<SecurityPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/termini" element={<TermsPage />} />
        <Route path="/open-source" element={<OpenSourcePage />} />
        <Route path="/tecnologia" element={<TechnologyPage />} />
        <Route path="/faq" element={<FaqPage />} />
        {/* v1.10 (NEW): stesso link pubblico /i/:token, ma qui l'utente è           GIÀ autenticato (es. lo ha cliccato standosene su un altro tab
           già loggato). isAuthenticated=true fa scattare subito il redeem
           con onRedeemNow, senza passare da nessun login/registrazione. */}
        <Route
          path="/i/:token"
          element={
            <InviteLandingPage isAuthenticated={true} onRedeemNow={handleInviteLandingRedeemNow} />
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to={authToken ? '/dashboard' : '/'} replace />} />
      </Routes>

      <AnimatePresence>
        {backupPrompt && (
          <BackupPinPrompt
            mode={backupPrompt.mode}
            error={backupPrompt.error}
            loading={false}
            onSubmit={submitBackupPrompt}
            onSkip={backupPrompt.mode === 'recover' || backupPrompt.mode === 'unlock' ? skipBackupPrompt : undefined}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {inviteRedeemPrompt && (
          <InviteRedeemPrompt
            error={inviteRedeemPrompt.error}
            loading={false}
            onSubmit={submitInviteRedeemPrompt}
            onCancel={cancelInviteRedeemPrompt}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ROOT EXPORT
══════════════════════════════════════════════════════════════════════════ */

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
      <DebugLogOverlay />
    </ThemeProvider>
  );
}
