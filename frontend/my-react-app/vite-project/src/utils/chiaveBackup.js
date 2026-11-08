// src/utils/chiaveBackup.js  [palacan-n4]
//
// Il backup delle chiavi si cifra con una chiave ricavata dalla passphrase (Argon2id). La passphrase resta solo in
// memoria e non si salva mai: prima, dopo un ricaricamento della pagina, l'app non l'aveva piu' e smetteva di fare
// il backup senza dirlo (le chiavi nuove restavano solo su quel browser e si perdevano chiudendolo).
// Ora, quando la passphrase e' nota (creazione o recupero del backup), se ne ricava una volta la chiave del backup,
// NON esportabile, e la si conserva nell'archivio del dispositivo dell'utente (cronologiaLocale, voce "chiavi"):
// dopo un ricaricamento l'app la rimette al posto della passphrase e il backup continua. Si cancella con la
// cronologia all'uscita dall'account. Chi ha accesso a questo browser con l'utente collegato ha gia' tutte le chiavi
// in chiaro: questa chiave non gli da' niente di piu'.

import { salvaChiaveUtente, leggiChiaveUtente } from './cronologiaLocale';

const NOME = 'backup';

/** Ricava e conserva la chiave del backup. Non fallisce mai (false se non e' stato possibile). */
export async function ricordaChiaveBackup(username, passphrase, prepara = null, backupEsistente = null) {  // [palacan-n6]
  if (!username || !passphrase || typeof passphrase !== 'string') return false;
  try {
    const ricava = prepara || (await import('../olmService')).preparaChiaveBackup;
    const pronta = await ricava(passphrase, saleDelBackup(backupEsistente));  // [palacan-n6] stesso sale del backup del server
    return await salvaChiaveUtente(username, NOME, pronta);
  } catch (_) {
    return false;
  }
}

/** La chiave del backup conservata per l'utente, o null. */
export async function chiaveBackupSalvata(username) {
  if (!username) return null;
  const valore = await leggiChiaveUtente(username, NOME);
  return valore && valore.tipo === 'chiave-backup' && valore.chiave && valore.salt ? valore : null;
}

// [palacan-n6] Tutti i dispositivi usano il sale del backup gia' presente sul server: cosi' la chiave conservata da
// uno apre anche il backup caricato dall'altro (serve per unirli, utils/backupUnito.js). Backup vecchi (PBKDF2,
// kdf_iterations >= 1000): sale nuovo, si passa ad Argon2id al prossimo caricamento.
export function saleDelBackup(backupEsistente) {
  if (!backupEsistente || !backupEsistente.salt) return null;
  return Number(backupEsistente.kdf_iterations) < 1000 ? backupEsistente.salt : null;
}

/** [palacan-n6] Conserva una chiave del backup gia' pronta. Non fallisce mai. */
export async function conservaChiaveBackup(username, pronta) {
  if (!username || !pronta || pronta.tipo !== 'chiave-backup' || !pronta.chiave || !pronta.salt) return false;
  try {
    return await salvaChiaveUtente(username, NOME, pronta);
  } catch (_) {
    return false;
  }
}

/** [palacan-n6] Dimentica la chiave conservata (al prossimo accesso si chiede la passphrase). Non fallisce mai. */
export async function dimenticaChiaveBackup(username) {
  if (!username) return false;
  try {
    return await salvaChiaveUtente(username, NOME, null);
  } catch (_) {
    return false;
  }
}
