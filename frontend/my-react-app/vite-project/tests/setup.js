// tests/setup.js
//
// [palacan-vodozemac] Motore crittografico dei test: palacan-crypto (vodozemac) compilato in WASM, lo STESSO file
// che va online (src/crypto/pkg/palacan_crypto_bg.wasm), caricato dai byte VERI una volta prima di ogni test:
// Olm.init() trova il motore gia' pronto. Nessuna libreria finta.
// (Fino alla migrazione qui si serviva olm.wasm di libolm intercettando fetch(); libolm non c'e' piu'.)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initSync as avviaPalacanCrypto } from '../src/crypto/pkg/palacan_crypto.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

avviaPalacanCrypto({ module: readFileSync(resolve(__dirname, '../src/crypto/pkg/palacan_crypto_bg.wasm')) });

// fetch(): ogni richiesta passa al fetch originale, e window.fetch punta alla STESSA funzione di globalThis.fetch
// (jsdom non sempre eredita le modifiche): i test che sostituiscono fetch funzionano come prima.
const fetchOriginale = globalThis.fetch;

globalThis.fetch = async (risorsa, opzioni) => {
  if (fetchOriginale) {
    return fetchOriginale(risorsa, opzioni);
  }
  const url = typeof risorsa === 'string' ? risorsa : risorsa?.href || risorsa?.url || '';
  throw new Error(`fetch non disponibile nei test: ${url}`);
};

if (typeof window !== 'undefined') {
  window.fetch = globalThis.fetch;
}
