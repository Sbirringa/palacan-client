// src/crypto/olm.js  [palacan-vodozemac]
//
// Motore crittografico di Palacan: vodozemac (implementazione Rust ufficiale di Olm/Megolm, con audit pubblico),
// compilato in WASM da crypto/palacan-crypto, con la STESSA interfaccia di @matrix-org/olm (libolm 3.2.x):
// Olm.init(), new Olm.Account() / Session / OutboundGroupSession / InboundGroupSession / Utility, stessi metodi,
// stessi formati JSON, errori "OLM.<CODICE>". I messaggi sul filo sono identici a libolm; i dati salvati da libolm
// vengono letti e convertiti al primo uso (unpickle), e da li' in poi si salvano nel formato di vodozemac ("vz1:").
// Il file WASM (pkg/palacan_crypto_bg.wasm) lo trova da solo, accanto a questo modulo: Vite lo include nel build.
import inizializzaWasm, {
  Account,
  Session,
  OutboundGroupSession,
  InboundGroupSession,
  Utility,
  versione,
  pq_nuovo_seme,  // [palacan-pq3] post-quantum: ML-KEM-768 e busta (crypto/palacan-crypto/src/pq.rs)
  pq_chiave_pubblica,
  pq_sigilla,
  pq_apri,
  pqfirma_nuovo_seme,  // [palacan-pq5b] firme post-quantum: ML-DSA-65 e firma ibrida (crypto/palacan-crypto/src/firma_pq.rs)
  pqfirma_chiave_pubblica,
  pqfirma_testo_ibrido,
  pqfirma_firma,
  pqfirma_verifica_ibrida,
} from './pkg/palacan_crypto.js';

let avvio = null;

/** Avvia il motore una volta sola (le chiamate successive aspettano la stessa). Le opzioni di libolm sono ignorate. */
async function init() {
  if (!avvio) {
    avvio = inizializzaWasm().catch((errore) => {
      avvio = null;
      throw errore;
    });
  }
  await avvio;
}

const Olm = { init, Account, Session, OutboundGroupSession, InboundGroupSession, Utility, versione, pq_nuovo_seme, pq_chiave_pubblica, pq_sigilla, pq_apri, pqfirma_nuovo_seme, pqfirma_chiave_pubblica, pqfirma_testo_ibrido, pqfirma_firma, pqfirma_verifica_ibrida };  // [palacan-pq3] [palacan-pq5b]

export default Olm;
export { init, Account, Session, OutboundGroupSession, InboundGroupSession, Utility, versione, pq_nuovo_seme, pq_chiave_pubblica, pq_sigilla, pq_apri, pqfirma_nuovo_seme, pqfirma_chiave_pubblica, pqfirma_testo_ibrido, pqfirma_firma, pqfirma_verifica_ibrida };  // [palacan-pq3] [palacan-pq5b]
