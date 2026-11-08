// src/utils/bustaFirmata.js  [palacan-cl2g]
//
// CL2g: la busta di ogni persona (chiave X25519 + chiave ML-KEM-768, A2.1 e CL2f) e' FIRMATA dalla sua chiave
// principale (ed25519 + ML-DSA-65, L4c). Prima il server la consegnava senza nessuna prova: poteva sostituirla con una
// sua e leggere chi manda una chiave di stanza a chi e i nomi dei gruppi negli inviti.
//   - chi pubblica: se questo dispositivo possiede la chiave principale, firma "palacan-busta-v1|utente|x25519|ml-kem"
//     (contesto "busta"); un dispositivo approvato senza la chiave principale pubblica come prima, senza firma;
//   - chi scrive: se conosce gia' la chiave principale del destinatario (ricordata da L4c3) o il server la consegna
//     valida, la busta vale SOLO con una firma ibrida che regge (ed25519 E ML-DSA-65). Altrimenti niente busta: la
//     chiave di stanza parte nel modo di sempre (Olm verso i soli dispositivi firmati) e l'invito senza nome.
//   - una chiave principale gia' ricordata vale anche se il server smette di consegnarla (niente declassamento) e una
//     chiave principale DIVERSA da quella ricordata non basta: il cambio lo gestisce L4c3, con il suo avviso.
//   - destinatario senza chiave principale (mai vista): come prima (fiducia al primo uso, come L4c3).
import Olm from '../crypto/olm.js';
import { chiavePrincipalePerBackup, firmaConPrincipale, verificaChiavePrincipale } from './chiavePrincipale';
import { principaleDelContatto } from './fiduciaContatti';

export const CONTESTO_BUSTA = 'busta';
const t = (v) => (v == null ? '' : String(v).trim());

/** Testo firmato dalla chiave principale per la busta di "utente". */
export function testoFirmaBusta(utente, chiave, pq) {
  return `palacan-busta-v1|${t(utente).toLowerCase()}|${t(chiave)}|${t(pq)}`;
}

/** { impronta, firma_ed, firma_pq } se questo dispositivo ha la chiave principale di "io", altrimenti null. */
export function firmaBusta(io, chiave, pq) {
  try {
    const materiale = chiavePrincipalePerBackup(io);
    if (!materiale) return null;
    const { fe, fq } = firmaConPrincipale(materiale, CONTESTO_BUSTA, testoFirmaBusta(io, chiave, pq));
    return { impronta: materiale.impronta, firma_ed: fe, firma_pq: fq };
  } catch (_) {
    return null;
  }
}

function firmaRegge(principale, utente, chiave, pq, firma) {
  if (!principale || !firma || t(firma.impronta) !== t(principale.impronta)) return false;
  try {
    return Olm.pqfirma_verifica_ibrida(CONTESTO_BUSTA, t(principale.ed), t(principale.pq),
      testoFirmaBusta(utente, chiave, pq), t(firma.firma_ed), t(firma.firma_pq)) === true;
  } catch (_) {
    return false;
  }
}

/**
 * La busta di "utente" arrivata dal server si puo' usare? 'firmata' (firma valida della sua chiave principale),
 * 'senza_principale' (nessuna chiave principale ne' ricordata ne' consegnata: regole di prima) o 'rifiutata'.
 */
export async function valutaBusta({ io, utente, chiave, pq = null, firma = null, principale = null }) {
  const ricordata = io ? principaleDelContatto(io, utente) : null;
  let consegnata = null;
  if (principale) {
    try {
      consegnata = (await verificaChiavePrincipale(utente, principale)) ? principale : null;
    } catch (_) {
      consegnata = null;
    }
  }
  if (ricordata) {
    if (consegnata && t(consegnata.impronta) !== t(ricordata.impronta)) return 'rifiutata';
    return firmaRegge(ricordata, utente, chiave, pq, firma) ? 'firmata' : 'rifiutata';
  }
  if (consegnata) return firmaRegge(consegnata, utente, chiave, pq, firma) ? 'firmata' : 'rifiutata';
  if (principale) return 'rifiutata';  // consegnata ma con autofirma rotta
  return 'senza_principale';
}
