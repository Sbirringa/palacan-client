// src/utils/datiPersonali.js
//
// Palacan - METADATI A4.3a: dati personali del dispositivo dentro il backup cifrato delle chiavi.
//
// Nomi dei gruppi privati (A3) e segreti di stanza (A4.1) vivono cifrati nella cronologia del dispositivo, non
// nel localStorage da cui si prepara il backup delle chiavi. Qui si aggiungono al backup (cifrato con la
// passphrase, Argon2id) e si ripristinano su un dispositivo nuovo: nomi e accesso alle chat private tornano
// subito, senza aspettare che qualcuno scriva. Al ripristino, se il dispositivo ha gia' dati suoi, vincono
// quelli locali (sono piu' recenti o uguali). Dall'A4.3b qui entreranno anche rubrica, blocchi e liste.

import { salvaDato, leggiDato } from './cronologiaLocale';

export const VOCI_DATI_PERSONALI = ['nomi_stanze', 'segreti_stanze', 'specchio_contatti', 'specchio_bloccati', 'specchio_periodi_blocco', 'specchio_liste', 'recapito_mia', 'recapito_contatti'];  // [palacan-metadati-a4.3b] anche rubrica, blocchi e liste  // [palacan-metadati-a4.4c]

export async function esportaDatiPersonali(username) {
  const uscita = { v: 1 };
  if (!username) return uscita;
  for (const voce of VOCI_DATI_PERSONALI) {
    try {
      const dati = await leggiDato(username, voce);
      if (dati && typeof dati === 'object') uscita[voce] = dati;
    } catch (_) {
      /* una voce illeggibile non blocca il backup delle chiavi */
    }
  }
  return uscita;
}

// Restituisce quante voci sono state ripristinate. Mai un'eccezione: il ripristino delle chiavi e' piu' importante.
export async function importaDatiPersonali(username, dati) {
  if (!username || !dati || typeof dati !== 'object') return 0;
  let ripristinate = 0;
  for (const voce of VOCI_DATI_PERSONALI) {
    const dalBackup = dati[voce];
    if (!dalBackup || typeof dalBackup !== 'object' || Array.isArray(dalBackup)) continue;
    try {
      const locali = await leggiDato(username, voce);
      const uniti = { ...dalBackup, ...(locali && typeof locali === 'object' ? locali : {}) };
      await salvaDato(username, voce, uniti);
      ripristinate += 1;
    } catch (_) {
      /* si prosegue con le altre voci */
    }
  }
  return ripristinate;
}
