// src/utils/specchioDati.js
//
// Palacan - METADATI A4.3b: copia cifrata sul dispositivo di rubrica, blocchi e liste personalizzate.
//
// Oggi rubrica, blocchi e liste vivono sul server (tabelle contacts, user_blocks, custom_lists): il server sa chi
// e' in contatto con chi, chi ha bloccato chi, come ciascuno organizza le sue chat. Con l'A4.5 il server smettera'
// di conservarli; da ora l'app ne tiene una copia CIFRATA nella cronologia del dispositivo (cronologiaLocale) e
// nel backup cifrato delle chiavi (datiPersonali, A4.3a), cosi' anche un dispositivo nuovo li ritrovera'.
// In questo passo l'app continua a leggerli dal server: la copia si aggiorna a ogni risposta, senza aspettare e
// senza poter far fallire la richiesta.

import { salvaDato } from './cronologiaLocale';
import { utenteCorrenteNomi } from './nomiStanze';

export const VOCI_SPECCHIO = ['contatti', 'bloccati', 'periodi_blocco', 'liste'];

export function specchia(nome, dati) {
  try {
    const utente = utenteCorrenteNomi();
    if (!utente || !VOCI_SPECCHIO.includes(nome) || dati === undefined || dati === null) return false;
    salvaDato(utente, `specchio_${nome}`, { aggiornato: new Date().toISOString(), dati }).catch(() => {});
    return true;
  } catch (_) {
    return false;
  }
}
