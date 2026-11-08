// src/utils/linkInvito.js
//
// Palacan - METADATI A3.2b-1: il nome del gruppo nei link di invito, senza passare dal server.
//
// Il nome sta nella parte del link dopo il # ("frammento"), che il browser NON manda mai al server: la pagina
// di atterraggio lo legge dall'indirizzo, lo mostra e lo conserva finche' l'invito non viene riscattato
// (anche dopo accesso o registrazione); poi il nome si impara sul dispositivo (nomiStanze.js) e si cancella.

const CHIAVE = 'palacan_nome_invito_pendente';
const LUNGHEZZA_MASSIMA = 100;

export function linkConNome(indirizzo, nome) {
  const pulito = String(nome || '').trim().slice(0, LUNGHEZZA_MASSIMA);
  return pulito ? `${indirizzo}#n=${encodeURIComponent(pulito)}` : indirizzo;
}

// Legge il nome dal frammento dell'indirizzo attuale (e lo conserva per il riscatto). null se non c'e'.
export function nomeDalLink(frammento = (typeof window !== 'undefined' ? window.location.hash : '')) {
  const corrispondenza = /[#&]n=([^&]*)/.exec(String(frammento || ''));
  if (!corrispondenza) return null;
  let nome = '';
  try {
    nome = decodeURIComponent(corrispondenza[1]).trim().slice(0, LUNGHEZZA_MASSIMA);
  } catch (_) {
    return null;
  }
  if (!nome) return null;
  try {
    window.localStorage.setItem(CHIAVE, nome);
  } catch (_) {
    /* senza localStorage il nome si vede comunque sulla pagina */
  }
  return nome;
}

// Al riscatto: il nome dell'invito pendente (una volta sola). null se non c'e'.
export function prendiNomeInvitoPendente() {
  try {
    const nome = window.localStorage.getItem(CHIAVE);
    window.localStorage.removeItem(CHIAVE);
    return nome || null;
  } catch (_) {
    return null;
  }
}
