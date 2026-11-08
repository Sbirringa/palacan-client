// src/utils/nomiInviti.js
//
// Palacan - METADATI A3.2b-2: il nome del gruppo negli inviti, sigillato per l'invitato.
//
// Chi invita in un gruppo privato chiude il nome nella busta dell'invitato (A2.1): il server conserva solo la
// busta chiusa. L'invitato la apre e vede il nome prima di entrare (e lo impara sul dispositivo).
// Se il gruppo non ha un nome conosciuto, o l'invitato non ha una busta, o qualcosa va storto: l'invito parte
// esattamente come prima (stessa chiamata, stessi argomenti) e mostra un nome generico.

import * as apiService from '../apiService';
import { nomeLocale, imparaNomeStanza, utenteCorrenteNomi } from './nomiStanze';
import { sigilla, apriSigillo, chiaviBustaDi } from './busteSigillate';  // [palacan-cl2f] chiaviBustaDi
import { bustaInAttesaDiFirma } from './busteSigillate';  // [palacan-cl2g2]

// [palacan-cl2g] chi invita (per riconoscere la chiave principale gia' ricordata dell'invitato)
function chiInvita() {
  try {
    const io = typeof utenteCorrenteNomi === 'function' ? utenteCorrenteNomi() : null;
    return typeof io === 'string' && io ? io : null;
  } catch (_) {
    return null;
  }
}

// [palacan-cl2g2] Busta dell'invitato rifiutata (senza firma valida): di solito e' un dispositivo appena entrato (account
// ripristinato) che la firma pochi secondi dopo, quando ha la chiave principale. Si aspetta un poco e si riprova; se la
// firma non arriva, l'invito parte senza nome, come prima. Nessuna attesa se l'invitato non ha proprio una busta.
let ATTESE_FIRMA_MS = [2000, 4000];
export function _attesePerTest(lista) {
  ATTESE_FIRMA_MS = Array.isArray(lista) ? lista : [2000, 4000];
}
const aspetta = (ms) => new Promise((ok) => setTimeout(ok, ms));

export async function bustaNomePer(roomId, invitato, token) {
  try {
    const nome = nomeLocale(roomId);
    if (!nome || !invitato || !token) return null;
    let chiavi = await chiaviBustaDi(invitato, token, chiInvita());  // [palacan-cl2f] X25519 + ML-KEM se c'e' [palacan-cl2g] firmata
    for (const ms of ATTESE_FIRMA_MS) {  // [palacan-cl2g2]
      if (chiavi || !bustaInAttesaDiFirma(invitato)) break;
      await aspetta(ms);
      chiavi = await chiaviBustaDi(invitato, token, chiInvita());
    }
    if (!chiavi) return null;
    return await sigilla(chiavi.chiave, { v: 1, tipo: 'nome_invito', nome }, chiavi.pq);
  } catch (_) {
    return null;
  }
}

// Al posto di apiService.inviteUserToRoom: con la busta se possibile, altrimenti la chiamata di sempre.
export async function invitaConNome(roomId, invitato, token) {
  const busta = await bustaNomePer(roomId, invitato, token);
  return busta
    ? apiService.inviteUserToRoom(roomId, invitato, token, busta)
    : apiService.inviteUserToRoom(roomId, invitato, token);
}

// Inviti ricevuti: apre le buste e mette il nome al posto di quello (vuoto) del server.
export async function apriNomiInviti(inviti, username = utenteCorrenteNomi()) {
  if (!Array.isArray(inviti)) return [];
  return Promise.all(inviti.map(async (invito) => {
    if (!invito || !invito.busta_nome || !username) return invito;
    try {
      const dentro = await apriSigillo(username, invito.busta_nome);
      const nome = dentro && dentro.tipo === 'nome_invito' ? String(dentro.nome || '').trim().slice(0, 100) : '';
      if (!nome) return invito;
      const stanza = invito.room_id || invito.roomId;
      if (stanza) imparaNomeStanza(stanza, nome);
      return { ...invito, room_name: nome, roomName: nome };
    } catch (_) {
      return invito;
    }
  }));
}
