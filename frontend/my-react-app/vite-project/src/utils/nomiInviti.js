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
import { sigilla, apriSigillo } from './busteSigillate';

export async function bustaNomePer(roomId, invitato, token) {
  try {
    const nome = nomeLocale(roomId);
    if (!nome || !invitato || !token) return null;
    const chiave = await apiService.getBustaKey(invitato, token);
    if (!chiave) return null;
    return await sigilla(chiave, { v: 1, tipo: 'nome_invito', nome });
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
