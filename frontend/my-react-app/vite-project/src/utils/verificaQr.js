// src/utils/verificaQr.js  [palacan-l4b] [palacan-l4c3]
//
// Verifica dell'identita' con codice QR (come Signal), tutto sul dispositivo: niente server, niente servizi esterni.
// Il codice contiene solo dati PUBBLICI. Chi lo inquadra controlla le due cose che contano:
//   1. quello che ha davanti e' cio' con cui sta davvero parlando (se il server avesse sostituito una chiave, qui non
//      coinciderebbe);
//   2. l'altro vede la SUA chiave vera (se qualcuno fosse in mezzo dall'altra parte, non coinciderebbe).
// Versione 1 (L4b): chiavi dei singoli dispositivi. Versione 2 (L4c3): impronte delle CHIAVI PRINCIPALI (ed25519 +
// ML-DSA-65, firma incrociata): verificata la persona, valgono tutti i suoi dispositivi firmati. Si leggono entrambe.
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';

export const PREFISSO_QR = 'PALACAN-VERIFICA-1 ';
export const PREFISSO_QR_V2 = 'PALACAN-VERIFICA-2 ';
const MAX_LUNGHEZZA_QR = 1500;
const MAX_LUNGHEZZA_CAMPO = 200;
const IMPRONTA = /^[0-9a-f]{64}$/;

export const ESITI_QR = Object.freeze({
  OK: 'ok',
  NON_VALIDO: 'non_valido',
  ALTRO_CONTATTO: 'altro_contatto',
  NON_PER_TE: 'non_per_te',
  TUA_CHIAVE_DIVERSA: 'tua_chiave_diversa',
  CHIAVE_MAI_VISTA: 'chiave_mai_vista',
  SENZA_PRINCIPALE: 'senza_principale',
});

function normalizza(nome) {
  return typeof nome === 'string' ? nome.trim().toLowerCase() : '';
}

// tutto cio' che non e' ASCII scritto come \uXXXX: il codice resta ASCII puro, identico su ogni lettore
function soloAscii(json) {
  let fuori = '';
  for (const c of json) {
    const n = c.charCodeAt(0);
    if (n < 0x80 && c.length === 1) {
      fuori += c;
    } else {
      for (let i = 0; i < c.length; i += 1) fuori += `\\u${c.charCodeAt(i).toString(16).padStart(4, '0')}`;
    }
  }
  return fuori;
}

/** Codice v1: io, la mia chiave di dispositivo, il contatto e la chiave che IO vedo per lui. */
export function creaContenutoQr({ io, chiaveIo, contatto, chiaveContatto }) {
  if (!normalizza(io) || !chiaveIo || !normalizza(contatto) || !chiaveContatto) return null;
  const dati = { v: 1, a: normalizza(io), ka: chiaveIo, b: normalizza(contatto), kb: chiaveContatto };
  return PREFISSO_QR + soloAscii(JSON.stringify(dati));
}

/** Codice v2: io, l'impronta della MIA chiave principale, il contatto e l'impronta che IO ho per la sua. */
export function creaContenutoQrV2({ io, improntaIo, contatto, improntaContatto }) {
  if (!normalizza(io) || !IMPRONTA.test(String(improntaIo || '')) || !normalizza(contatto) || !IMPRONTA.test(String(improntaContatto || ''))) return null;
  const dati = { v: 2, a: normalizza(io), ma: improntaIo, b: normalizza(contatto), mb: improntaContatto };
  return PREFISSO_QR_V2 + soloAscii(JSON.stringify(dati));
}

export function leggiContenutoQr(testo) {
  if (typeof testo !== 'string' || testo.length > MAX_LUNGHEZZA_QR) return null;
  const v2 = testo.startsWith(PREFISSO_QR_V2);
  if (!v2 && !testo.startsWith(PREFISSO_QR)) return null;
  let dati;
  try {
    dati = JSON.parse(testo.slice((v2 ? PREFISSO_QR_V2 : PREFISSO_QR).length));
  } catch (e) {
    return null;
  }
  if (!dati || typeof dati !== 'object' || dati.v !== (v2 ? 2 : 1)) return null;
  const campi = v2 ? ['a', 'ma', 'b', 'mb'] : ['a', 'ka', 'b', 'kb'];
  for (const campo of campi) {
    if (typeof dati[campo] !== 'string' || !dati[campo] || dati[campo].length > MAX_LUNGHEZZA_CAMPO) return null;
  }
  if (v2) {
    if (!IMPRONTA.test(dati.ma) || !IMPRONTA.test(dati.mb)) return null;
    return { v: 2, a: normalizza(dati.a), ma: dati.ma, b: normalizza(dati.b), mb: dati.mb };
  }
  return { a: normalizza(dati.a), ka: dati.ka, b: normalizza(dati.b), kb: dati.kb };
}

/**
 * Testo letto dal QR del contatto -> esito.
 * v1: chiaveIo (la mia chiave di dispositivo) e chiaviNoteContatto (tutte le chiavi gia' viste di quel contatto).
 * v2: improntaMia (la mia chiave principale) e improntaContatto (quella che ho ricordato per lui).
 */
export function confrontaQr(testo, { io, chiaveIo, contatto, chiaviNoteContatto, improntaMia, improntaContatto }) {
  const dati = leggiContenutoQr(testo);
  if (!dati) return { esito: ESITI_QR.NON_VALIDO };
  if (dati.a !== normalizza(contatto)) return { esito: ESITI_QR.ALTRO_CONTATTO };
  if (dati.b !== normalizza(io)) return { esito: ESITI_QR.NON_PER_TE };
  if (dati.v === 2) {
    if (!improntaMia || !improntaContatto) return { esito: ESITI_QR.SENZA_PRINCIPALE };
    // l'altro ha per te una chiave principale che non e' la tua: qualcuno in mezzo dalla sua parte
    if (dati.mb !== improntaMia) return { esito: ESITI_QR.TUA_CHIAVE_DIVERSA };
    // la persona davanti a te ha una chiave principale diversa da quella con cui stai parlando: in mezzo dalla tua
    if (dati.ma !== improntaContatto) return { esito: ESITI_QR.CHIAVE_MAI_VISTA };
    return { esito: ESITI_QR.OK, versione: 2, improntaContatto: dati.ma };
  }
  // l'altro vede per te una chiave che non e' la tua: qualcuno si e' messo in mezzo dalla sua parte
  if (!chiaveIo || dati.kb !== chiaveIo) return { esito: ESITI_QR.TUA_CHIAVE_DIVERSA };
  // il dispositivo che hai davanti non e' nessuno di quelli con cui stai parlando: in mezzo dalla tua parte,
  // oppure un dispositivo con cui non vi siete ancora scritti
  if (!Array.isArray(chiaviNoteContatto) || !chiaviNoteContatto.includes(dati.ka)) {
    return { esito: ESITI_QR.CHIAVE_MAI_VISTA };
  }
  return { esito: ESITI_QR.OK, chiaveContatto: dati.ka };
}

// matrice del codice QR (righe di vero/falso), correzione d'errore media
export function matriceQr(testo) {
  const codice = qrcode(0, 'M');
  codice.addData(testo, 'Byte');
  codice.make();
  const lato = codice.getModuleCount();
  const righe = [];
  for (let r = 0; r < lato; r += 1) {
    const riga = [];
    for (let c = 0; c < lato; c += 1) riga.push(codice.isDark(r, c));
    righe.push(riga);
  }
  return righe;
}

// percorso SVG dei moduli neri (niente HTML iniettato: solo un attributo d)
export function percorsoSvgQr(matrice) {
  let d = '';
  matrice.forEach((riga, r) => {
    riga.forEach((nero, c) => {
      if (nero) d += `M${c} ${r}h1v1h-1z`;
    });
  });
  return d;
}

// pixel RGBA (da una foto o dalla fotocamera) -> testo del codice QR, oppure null
export function decodificaQr(rgba, larghezza, altezza) {
  if (!rgba || !larghezza || !altezza) return null;
  const risultato = jsQR(rgba, larghezza, altezza, { inversionAttempts: 'attemptBoth' });
  return risultato && typeof risultato.data === 'string' && risultato.data ? risultato.data : null;
}
