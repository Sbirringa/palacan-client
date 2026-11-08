// src/utils/backupUnito.js  [palacan-n6] [palacan-n6b]
//
// Backup delle chiavi con piu' dispositivi. Prima ogni caricamento SOSTITUIVA il backup sul server: se il telefono
// caricava dopo il portatile, le chiavi dei gruppi che aveva solo il portatile sparivano dal backup (e con loro i
// messaggi, se poi il portatile perdeva i dati). Ora, prima di caricare:
//   1. si scarica il backup del server e lo si apre con la stessa chiave (stesso sale per tutti i dispositivi:
//      la chiave si ricava dalla passphrase con il sale del backup gia' presente);
//   2. lo si UNISCE a quello del dispositivo: chiavi dei gruppi sommate (nessuna si perde), registro dei creatori con
//      la voce piu' vecchia (chi ha creato davvero la chiave), chiavi d'identita' dei contatti e dati personali uniti
//      (a parita' vince il dispositivo), account del dispositivo;
//   3. si carica il risultato.
// Mai distruggere: se il backup del server esiste ma questa chiave non lo apre (chiave conservata con un altro sale),
// NON si sovrascrive; la chiave conservata si dimentica e al prossimo accesso si chiede la passphrase una volta
// ("Riattiva il backup"). Con la passphrase in chiaro che non apre il backup (l'utente ne ha impostata una nuova e
// la vecchia non la ricorda) si fa come prima: il backup nuovo sostituisce il vecchio, che nessuno sa piu' aprire.
// [n6b] Caricamenti contemporanei da due dispositivi: il client dice al server da quale backup e' partito (la sua
// data di ultima modifica, o "non ce n'era nessuno"); se nel frattempo un altro dispositivo ha caricato, il server
// risponde 409 e qui si riscarica, si riunisce e si riprova (al massimo MAX_TENTATIVI volte).
// [n6b] Meno richieste: dopo un caricamento riuscito ci si ricorda cosa c'e' sul server (in memoria, per questa
// pagina); al caricamento dopo si parte da li' senza riscaricarlo. Si riscarica solo se un altro dispositivo ha
// caricato nel frattempo (409). Lo scaricamento del backup ha un limite di 10 ogni 5 minuti: senza questo, con
// molti messaggi, il backup si sarebbe fermato per qualche minuto.

import { chiaveBackupSalvata, conservaChiaveBackup, dimenticaChiaveBackup, saleDelBackup } from './chiaveBackup';

const comeOggetto = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return Array.isArray(v) ? null : v;
  try {
    const o = JSON.parse(v);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch (_) {
    return null;
  }
};

// Unisce due mappe salvate come testo JSON (o oggetto). Restituisce lo stesso formato del valore locale.
function unisciMappe(remoto, locale, scegli = (r, l) => (l !== undefined ? l : r)) {
  const r = comeOggetto(remoto);
  const l = comeOggetto(locale);
  if (!r) return locale ?? remoto ?? null;
  if (!l) return locale ? locale : remoto; // locale illeggibile: non lo si tocca; locale assente: quello del server
  const unito = {};
  for (const k of new Set([...Object.keys(r), ...Object.keys(l)])) unito[k] = scegli(r[k], l[k]);
  return typeof locale === 'string' ? JSON.stringify(unito) : unito;
}

const piuVecchia = (r, l) => {
  if (r === undefined) return l;
  if (l === undefined) return r;
  // [palacan-n5e] la voce confermata dalla firma del creatore vince su quella non firmata (mai su una chiave propria)
  const fr = Boolean(r && r.firmato);
  const fl = Boolean(l && l.firmato);
  if (fr !== fl && !(r && r.verifica === 'propria') && !(l && l.verifica === 'propria')) return fr ? r : l;
  const tr = Number(r && r.registrato) || Infinity;
  const tl = Number(l && l.registrato) || Infinity;
  return tr < tl ? r : l;
};

/** Unione del backup del server (remoto) con quello del dispositivo (locale). Nessuna chiave dei gruppi si perde. */
export function unisciBundle(remoto, locale) {
  if (!remoto || typeof remoto !== 'object') return locale;
  const unito = { ...remoto, ...locale };
  unito.account = locale.account || remoto.account || null;
  unito.inboundGroupSessions = unisciMappe(remoto.inboundGroupSessions, locale.inboundGroupSessions);
  unito.peerIdentityKeys = unisciMappe(remoto.peerIdentityKeys, locale.peerIdentityKeys);
  unito.creatoriChiavi = unisciMappe(remoto.creatoriChiavi, locale.creatoriChiavi, piuVecchia);
  if (remoto.chiaviFirma || locale.chiaviFirma) {  // [palacan-n5e] chiavi di firma imparate via Olm: per utente, tutte le coppie
    unito.chiaviFirma = unisciMappe(remoto.chiaviFirma, locale.chiaviFirma, (r, l) => (
      r && l && typeof r === 'object' && typeof l === 'object' ? { ...r, ...l } : (l !== undefined ? l : r)));
  }
  const dr = remoto.datiPersonali && typeof remoto.datiPersonali === 'object' ? remoto.datiPersonali : null;
  const dl = locale.datiPersonali && typeof locale.datiPersonali === 'object' ? locale.datiPersonali : null;
  if (dr || dl) {
    const dati = { ...(dr || {}), ...(dl || {}) };
    for (const voce of Object.keys(dati)) {
      const a = dr && dr[voce];
      const b = dl && dl[voce];
      if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) dati[voce] = { ...a, ...b };
    }
    unito.datiPersonali = dati;
  }
  return unito;
}

const LIMITE_VECCHIO_FORMATO = 1000; // kdf_iterations >= 1000: backup vecchio (PBKDF2), si apre solo con la passphrase
const normale = (u) => String(u || '').trim().toLowerCase();

export const MAX_TENTATIVI = 3;
const ultimoCaricato = new Map(); // utente -> { updated_at, bundle, salt, kdf } dell'ultimo backup caricato da qui

// Solo per i test (e per simulare due dispositivi nella stessa pagina).
export function _dimenticaUltimoCaricato() {
  ultimoCaricato.clear();
}

/**
 * Carica il backup unito a quello del server.
 * Restituisce { esito: 'caricato', segreto, unito } | { esito: 'fermo', motivo } | { esito: 'errore', errore }.
 * "segreto" e' la chiave pronta (stesso sale del server) da usare d'ora in poi al posto della passphrase.
 */
export async function caricaBackupUnito(argomenti) {
  const { username, token, segreto } = argomenti || {};
  if (!username || !token || !segreto) return { esito: 'errore', errore: new Error('dati mancanti') };
  let ultimoErrore = null;
  for (let tentativo = 0; tentativo < MAX_TENTATIVI; tentativo += 1) {
    const esito = await unTentativo(argomenti);
    if (!esito.conflitto) return esito;
    ultimoErrore = esito.errore;
    ultimoCaricato.delete(normale(username)); // un altro dispositivo ha caricato: si riparte dal server
    console.log(`🔁 Backup cambiato da un altro dispositivo nel frattempo: lo riunisco e riprovo (${tentativo + 1}/${MAX_TENTATIVI})`);
  }
  return { esito: 'errore', errore: ultimoErrore || new Error('conflitto') };
}

async function unTentativo({ username, token, segreto, olm, api, esportaDati }) {
  try {
    const locale = olm.buildBackupBundlePayload(username);
    locale.datiPersonali = esportaDati ? await esportaDati(username) : locale.datiPersonali;
    const inChiaro = typeof segreto === 'string';
    const chiaveUtente = normale(username);
    let noto = ultimoCaricato.get(chiaveUtente) || null;
    if (noto && !inChiaro && segreto.salt !== noto.salt) noto = null; // chiave cambiata: si riparte dal server

    let chiave = segreto;
    let remoto = null;
    let attese = null;

    if (noto) {
      // sul server c'e' ancora il backup caricato da qui (lo verifica il server con la data): niente da riscaricare
      remoto = noto.bundle;
      attese = { updated_at: noto.updated_at };
      if (inChiaro) {
        const salvata = await chiaveBackupSalvata(username);
        chiave = salvata && salvata.salt === noto.salt ? salvata : await olm.preparaChiaveBackup(segreto, saleDelBackup({ salt: noto.salt, kdf_iterations: noto.kdf }));
      }
    } else {
      const scaricato = await api.downloadKeyBackup(token); // null se sul server non c'e' ancora un backup
      const vecchioFormato = Boolean(scaricato) && Number(scaricato.kdf_iterations) >= LIMITE_VECCHIO_FORMATO;
      attese = scaricato ? (scaricato.updated_at ? { updated_at: scaricato.updated_at } : null) : { nuovo: true };

      if (inChiaro) {
        const sale = scaricato && !vecchioFormato ? scaricato.salt : null;
        const salvata = await chiaveBackupSalvata(username);
        chiave = salvata && (sale ? salvata.salt === sale : !scaricato) ? salvata : await olm.preparaChiaveBackup(segreto, saleDelBackup(scaricato));
      }

      if (scaricato) {
        try {
          remoto = await olm.decryptBackupBundle(scaricato, inChiaro ? segreto : chiave); // con la passphrase: qualunque formato
        } catch (e) {
          if (!inChiaro) {
            await dimenticaChiaveBackup(username);
            return { esito: 'fermo', motivo: e && e.codice === 'SALE_DIVERSO' ? 'sale' : 'apertura' };
          }
          console.warn('⚠️ Il backup sul server non si apre con questa passphrase: viene sostituito da quello nuovo.');
          remoto = null;
        }
        if (remoto && remoto.username && normale(remoto.username) !== normale(locale.username)) {
          return { esito: 'fermo', motivo: 'utente' };
        }
      }
    }

    const finale = remoto ? unisciBundle(remoto, locale) : locale;
    const payload = await olm.encryptBackupBundle(finale, chiave);
    let risposta;
    try {
      risposta = await api.uploadKeyBackup(payload, token, attese);
    } catch (e) {
      if (e && e.status === 409) return { conflitto: true, errore: e };
      throw e;
    }
    if (inChiaro) await conservaChiaveBackup(username, chiave);
    if (risposta && risposta.updated_at) {
      ultimoCaricato.set(chiaveUtente, { updated_at: risposta.updated_at, bundle: finale, salt: payload.salt, kdf: Number(payload.kdf_iterations) });
    } else {
      ultimoCaricato.delete(chiaveUtente); // server senza data: la prossima volta si riscarica
    }
    return { esito: 'caricato', segreto: chiave, unito: Boolean(remoto) };
  } catch (errore) {
    return { esito: 'errore', errore };
  }
}
