// src/utils/approvazioneDispositivi.js  [palacan-l4c4]
//
// Firma incrociata ibrida (L4c), ultimo pezzo: un dispositivo NUOVO senza la frase del backup viene approvato da uno
// vecchio che ha la chiave principale. Il codice di confronto (8 cifre) si calcola dalla chiave del dispositivo:
//   - il dispositivo nuovo lo calcola dalla SUA chiave vera;
//   - quello vecchio dalla chiave che consegna il server.
// Se il server avesse infilato un dispositivo finto (o cambiato la chiave), i due codici non coincidono: si approva
// solo se coincidono. Approvare = firmare il dispositivo con la chiave principale (vedi chiavePrincipale.js).
import { dispositivoFirmato } from './chiavePrincipale';

const t = (v) => (v == null ? '' : String(v).trim());

/** Codice di confronto "1234 5678" del dispositivo (utente, device_id, chiave curve25519). */
export async function codiceApprovazione(utente, deviceId, curva) {
  const testo = `palacan-approva-v1|${t(utente).toLowerCase()}|${t(deviceId)}|${t(curva)}`;
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(testo)));
  let v = 0;
  for (let j = 0; j < 5; j += 1) v = v * 256 + h[j];
  const n = String(v % 100000000).padStart(8, '0');
  return `${n.slice(0, 4)} ${n.slice(4)}`;
}

/** Il dispositivo dell'elenco "I miei dispositivi" (device_id, identity_key, firma_principale) e' firmato? */
export function firmatoDaPrincipale(utente, principale, dispositivo) {
  if (!principale || !dispositivo) return false;
  return dispositivoFirmato(utente, principale, {
    device_id: dispositivo.device_id,
    identity_key: dispositivo.identity_key,
    firma_principale: dispositivo.firma_principale,
  });
}
