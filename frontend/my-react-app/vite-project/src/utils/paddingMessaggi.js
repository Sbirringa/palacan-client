// src/utils/paddingMessaggi.js
//
// Palacan - padding dei messaggi (metadati fase 2e).
//
// Il contenuto dei messaggi e' cifrato end-to-end, ma la LUNGHEZZA del testo cifrato segue
// quella del messaggio: un "ok" e un paragrafo si distinguerebbero nel database. Prima della
// cifratura ogni messaggio viene allungato fino al primo di pochi scaglioni fissi (misurati in
// byte UTF-8): 256, 512, 1024 ... 16384, poi multipli di 16384. Messaggi diversi entro lo
// stesso scaglione hanno la stessa dimensione cifrata.
//
// Il riempimento e' un campo "_p" dentro l'oggetto JSON cifrato: dopo la decifratura viene
// tolto (rimuoviPadding). Un'app non ancora aggiornata lo ignora; i messaggi vecchi, senza
// riempimento, si leggono come prima.

export const CAMPO_PADDING = '_p';
const MINIMO = 256;
const MASSIMO_POTENZA = 16384;

const codificatore = new TextEncoder();
const byteUtf8 = (testo) => codificatore.encode(testo).length;

// Primo scaglione >= n byte.
export function scaglione(n) {
  if (n <= MINIMO) return MINIMO;
  if (n <= MASSIMO_POTENZA) {
    let s = MINIMO;
    while (s < n) s *= 2;
    return s;
  }
  return Math.ceil(n / MASSIMO_POTENZA) * MASSIMO_POTENZA;
}

function oggettoSemplice(valore) {
  return valore !== null && typeof valore === 'object' && !Array.isArray(valore);
}

// Testo JSON di un oggetto -> stesso oggetto con il campo di riempimento, lungo esattamente
// uno scaglione. Testi che non sono un oggetto JSON restano invariati.
export function aggiungiPadding(testo) {
  if (typeof testo !== 'string' || !testo.trimStart().startsWith('{')) return testo;
  let oggetto;
  try {
    oggetto = JSON.parse(testo);
  } catch (_) {
    return testo;
  }
  if (!oggettoSemplice(oggetto)) return testo;
  const base = { ...oggetto, [CAMPO_PADDING]: '' };
  const lunghezza = byteUtf8(JSON.stringify(base));
  const mancano = scaglione(lunghezza) - lunghezza;
  // Il riempimento e' ASCII ("0"): ogni carattere vale un byte e non richiede escape JSON,
  // quindi la lunghezza finale e' esattamente lo scaglione.
  return JSON.stringify({ ...oggetto, [CAMPO_PADDING]: '0'.repeat(mancano) });
}

// Oggetto decifrato -> stesso oggetto senza il campo di riempimento (gli altri valori invariati).
export function rimuoviPadding(valore) {
  if (!oggettoSemplice(valore) || !(CAMPO_PADDING in valore)) return valore;
  const { [CAMPO_PADDING]: _riempimento, ...resto } = valore;
  return resto;
}
