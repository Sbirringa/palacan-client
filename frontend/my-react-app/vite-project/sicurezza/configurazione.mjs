// sicurezza/configurazione.mjs  [palacan-l1b]
//
// Configurazione PUBBLICA della build. Vite scrive questi valori dentro il JavaScript che il sito manda a chiunque:
// non sono segreti e non possono esserlo (il browser deve averli). Stanno nel repository perche' chiunque, CI compresa,
// possa rifare la stessa identica build e confrontarla con il sito (L1b). Per la build valgono solo questi, non i
// file .env (cosi' la build sul PC, in Docker e su GitHub e' la stessa).
//   - VITE_API_URL: indirizzo del backend;
//   - VITE_VAPID_PUBLIC_KEY: chiave PUBBLICA delle notifiche push;
//   - VITE_PICKLE_KEY: chiave vecchia dei pickle, gia' pubblica, che dalla 9a serve solo per compatibilita' (dati di
//     prima, formato del backup dentro la cifratura con la passphrase, browser senza IndexedDB): NON va mai cambiata.
// I veri segreti (backend, Fly, database) non devono MAI finire qui: tests/buildVerificabile.test.js lo controlla.

import fs from 'node:fs';
import path from 'node:path';

export const CHIAVI_PUBBLICHE = ['VITE_API_URL', 'VITE_VAPID_PUBLIC_KEY', 'VITE_PICKLE_KEY'];
export const FILE_CONFIGURAZIONE = path.join('sicurezza', 'configurazione-pubblica.json'); // rispetto alla cartella del frontend

export function leggiConfigurazione(file = path.resolve(process.cwd(), FILE_CONFIGURAZIONE)) {
  const dati = JSON.parse(fs.readFileSync(file, 'utf8'));
  const valori = dati && typeof dati === 'object' ? dati.valori : null;
  if (!valori || typeof valori !== 'object') throw new Error('configurazione pubblica senza "valori"');
  const chiavi = Object.keys(valori).sort();
  if (JSON.stringify(chiavi) !== JSON.stringify([...CHIAVI_PUBBLICHE].sort())) {
    throw new Error(`configurazione pubblica: servono esattamente ${CHIAVI_PUBBLICHE.join(', ')} (trovate: ${chiavi.join(', ')})`);
  }
  for (const k of CHIAVI_PUBBLICHE) {
    if (typeof valori[k] !== 'string' || /[\s"'`]/.test(valori[k])) throw new Error(`configurazione pubblica: ${k} non valido`);
  }
  return valori;
}

/** Plugin di Vite: per la build (non per lo sviluppo ne' per le prove) valgono i valori pubblici, non i file .env. */
export function configurazionePubblica() {
  return {
    name: 'palacan-configurazione-pubblica',
    apply: 'build',
    config(cfg) {
      // Vite non sovrascrive le variabili gia' presenti nell'ambiente: cosi' vincono su .env, .env.production, .env.local
      const valori = leggiConfigurazione(path.resolve(cfg && cfg.root ? cfg.root : process.cwd(), FILE_CONFIGURAZIONE));
      for (const k of CHIAVI_PUBBLICHE) process.env[k] = valori[k];
    },
  };
}
