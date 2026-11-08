// src/utils/reazioni.js
//
// Palacan - reazioni come piccoli messaggi cifrati (metadati fase 3.6) + salvataggio sul dispositivo
// (cronologia cifrata, passo 2).
//
// Una reazione e' un evento cifrato { tipo: 'reazione', bersaglio, emoji } che viaggia come un messaggio:
// il server non sa chi l'ha messa ne' a quale messaggio. L'app ricava l'autore dal creatore della chiave
// (fase 3.1) e raccoglie qui le reazioni: per ogni messaggio vale l'ULTIMA reazione di ciascuna persona;
// emoji vuota = reazione tolta. Quando cambia qualcosa si avvisa l'interfaccia ('palacan:reazioni-cambiate').
// esportaStanza / importaStanza: le reazioni di una chat come dato semplice, per salvarle cifrate sul
// dispositivo e rimetterle in memoria (unendole: vince sempre la piu' recente di ciascuna persona).

const stanze = new Map(); // stanza -> Map(bersaglio -> Map(autore -> { emoji, ordine }))

function avvisa() {
  try {
    window.dispatchEvent(new CustomEvent('palacan:reazioni-cambiate'));
  } catch (_) {
    /* ambiente senza window (test): nessun avviso */
  }
}

// Registra senza avvisare; true se ha cambiato qualcosa.
function imposta(stanza, bersaglio, autore, emoji, ordine) {
  if (!stanze.has(stanza)) stanze.set(stanza, new Map());
  const perBersaglio = stanze.get(stanza);
  if (!perBersaglio.has(bersaglio)) perBersaglio.set(bersaglio, new Map());
  const perAutore = perBersaglio.get(bersaglio);
  const precedente = perAutore.get(autore);
  if (precedente && precedente.ordine > ordine) return false;
  if (precedente && precedente.ordine === ordine && precedente.emoji === (emoji || null)) return false;
  perAutore.set(autore, { emoji: emoji || null, ordine });
  return true;
}

export function applicaReazione({ roomId, bersaglio, autore, emoji = null, ordine = Date.now() } = {}) {
  if (!roomId || !bersaglio || !autore) return false;
  const cambiata = imposta(String(roomId), String(bersaglio), String(autore), emoji, ordine);
  if (cambiata) avvisa();
  return cambiata;
}

// Reazioni visibili di un messaggio (si passano tutti i suoi identificativi: id del server e provvisorio).
export function reazioniDel(roomId, identificativi = []) {
  const perBersaglio = stanze.get(String(roomId));
  if (!perBersaglio) return [];
  const unite = new Map();
  for (const id of identificativi) {
    if (!id) continue;
    const perAutore = perBersaglio.get(String(id));
    if (!perAutore) continue;
    for (const [autore, valore] of perAutore) {
      const gia = unite.get(autore);
      if (!gia || valore.ordine >= gia.ordine) unite.set(autore, valore);
    }
  }
  return [...unite]
    .filter(([, valore]) => valore.emoji)
    .map(([autore, valore]) => ({ id: `reazione-${autore}`, username: autore, emoji: valore.emoji }));
}

// Le reazioni di una chat come dato semplice: { bersaglio: { autore: { emoji, ordine } } }.
export function esportaStanza(roomId) {
  const perBersaglio = stanze.get(String(roomId));
  const dati = {};
  if (!perBersaglio) return dati;
  for (const [bersaglio, perAutore] of perBersaglio) {
    dati[bersaglio] = {};
    for (const [autore, valore] of perAutore) dati[bersaglio][autore] = { emoji: valore.emoji, ordine: valore.ordine };
  }
  return dati;
}

// Rimette in memoria le reazioni salvate, unendole a quelle presenti (vince la piu' recente). Un solo avviso.
export function importaStanza(roomId, dati) {
  if (!roomId || !dati || typeof dati !== 'object') return 0;
  let cambiate = 0;
  for (const [bersaglio, perAutore] of Object.entries(dati)) {
    if (!perAutore || typeof perAutore !== 'object') continue;
    for (const [autore, valore] of Object.entries(perAutore)) {
      if (!valore || typeof valore.ordine !== 'number') continue;
      if (imposta(String(roomId), String(bersaglio), String(autore), valore.emoji, valore.ordine)) cambiate += 1;
    }
  }
  if (cambiate) avvisa();
  return cambiate;
}

export function dimenticaReazioni() {
  stanze.clear();
}
