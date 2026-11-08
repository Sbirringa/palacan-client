// src/utils/contoOlm.js  [palacan-pq7]
//
// Due protezioni per l'account Olm (vodozemac in WASM), nate dalla prova dal vivo dopo PQ5:
//
// 1) Account bloccato. Se una chiamata al WASM fallisce a meta' (per esempio perche' le si passa un oggetto gia'
//    liberato: "null pointer passed to rust"), l'account puo' restare "in prestito" per sempre: da li' ogni uso da'
//    "recursive use of an object detected" e nessun messaggio parte piu'. contoUsabile() lo riconosce, cosi' chi lo
//    tiene in memoria lo rilegge dal salvataggio invece di riusarlo.
//
// 2) Chiavi usa e getta (OTK) dopo il recupero dal backup. Un account ripristinato in un browser nuovo e' una COPIA:
//    le OTK che il server ha per quell'utente le ha generate e pubblicate un'altra copia (l'altro browser) dopo il
//    backup, e questa non le conosce ("unknown one-time key"). In piu' le OTK nuove di questa copia hanno gli stessi
//    numeri (key_id) di quelle dell'altra e il server le scartava come doppioni. Dopo il ripristino si segna quindi
//    che le OTK vanno SOSTITUITE: al primo controllo delle OTK il client ne genera di nuove e chiede al server di
//    togliere quelle non ancora usate dello stesso account ("sostituisci"). Una volta sola per browser lo si fa anche
//    per gli account gia' ripristinati prima di questa correzione (segno "v1" mancante).

const DA_SOSTITUIRE = 'palacan_otk_da_sostituire_';
const SOSTITUITE = 'palacan_otk_sostituite_v1_';

/** L'account risponde ancora? false se e' bloccato dal WASM ("recursive use of an object") o gia' liberato. */
export function contoUsabile(account) {
  if (!account) return false;
  try {
    account.identity_keys();
    return true;
  } catch (_) {
    return false;
  }
}

/** Dopo il ripristino dell'account dal backup: le OTK sul server vanno sostituite con quelle di questa copia. */
export function segnaOtkDaSostituire(io) {
  if (!io) return;
  try {
    localStorage.setItem(DA_SOSTITUIRE + io, '1');
  } catch (_) { /* senza localStorage si resta come prima */ }
}

/** Vanno sostituite? Si' dopo un ripristino, e una volta sola per gli account di prima di questa correzione. */
export function otkDaSostituire(io) {
  if (!io) return false;
  try {
    return localStorage.getItem(DA_SOSTITUIRE + io) === '1' || localStorage.getItem(SOSTITUITE + io) !== '1';
  } catch (_) {
    return false;  // senza localStorage non si ripete all'infinito
  }
}

/** Sostituzione riuscita: non si ripete. */
export function otkSostituite(io) {
  if (!io) return;
  try {
    localStorage.removeItem(DA_SOSTITUIRE + io);
    localStorage.setItem(SOSTITUITE + io, '1');
  } catch (_) { /* niente */ }
}
