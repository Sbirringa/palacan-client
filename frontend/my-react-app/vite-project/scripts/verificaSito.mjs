// scripts/verificaSito.mjs  [palacan-l1b]
//
// Il sito pubblicato e' davvero il codice pubblico? Solo lettura, come un visitatore qualsiasi:
//   1. scarica /palacan-impronte.json dal sito e ogni file che elenca, e ne calcola l'impronta SHA-256:
//      ogni file deve corrispondere all'elenco (un file cambiato sul server si vede subito);
//   2. controlla che la pagina carichi solo file dell'elenco;
//   3. con --confronta <elenco>, confronta l'elenco del sito con quello di una build fatta da te o dalla CI
//      (artefatto "impronte-<commit>" della build verificabile su GitHub): se coincidono, il sito e' quel commit.
//   4. [palacan-l1c] la FIRMA dell'elenco (/rilascio/palacan-impronte.sig) con la chiave pubblica FISSATA nel
//      repository (sicurezza/chiave-rilascio-pubblica.json): chi controlla il server puo' cambiare i file, ma non
//      firmare un elenco nuovo. Con --ultimo-numero N rifiuta anche una versione piu' vecchia di quella gia' vista.
// Stampa l'impronta SHA-256 del file palacan-impronte.json: la stessa che mostra la build su GitHub. [palacan-l1b-bis]
// Uscita: 0 = tutto coincide; 1 = differenze (elencate).
//
// Uso:  node scripts/verificaSito.mjs [--sito https://...] [--confronta dist/palacan-impronte.json] [--ultimo-numero N]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILE_IMPRONTE, confrontaImpronte, sha256 } from '../sicurezza/impronte.mjs';
import { verificaRilascio } from '../sicurezza/rilascio.mjs';  // [palacan-l1c]

const FE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHIAVE_PUBBLICA = path.join(FE, 'sicurezza', 'chiave-rilascio-pubblica.json');

const argomento = (nome, riserva) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : riserva;
};
const SITO = argomento('--sito', 'https://my-chat-frontend-app-vittorio.fly.dev').replace(/\/+$/, '');
const CONFRONTA = argomento('--confronta', null);
const ULTIMO_NUMERO = Number(argomento('--ultimo-numero', '0')) || 0;

async function motore() {
  const pkg = await import('../src/crypto/pkg/palacan_crypto.js');
  pkg.initSync({ module: fs.readFileSync(path.join(FE, 'src', 'crypto', 'pkg', 'palacan_crypto_bg.wasm')) });
  return pkg;
}

async function scarica(percorso) {
  const r = await fetch(`${SITO}/${percorso}`, { cache: 'no-store', headers: { 'User-Agent': 'palacan-verifica-sito' } });
  if (!r.ok) throw new Error(`${percorso}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const problemi = [];
  const grezzo = await scarica(FILE_IMPRONTE);
  const improntaElenco = sha256(grezzo);  // [palacan-l1b-bis] la stessa della build su GitHub
  const pubblicate = JSON.parse(grezzo.toString('utf8'));
  const elenco = Object.entries(pubblicate.file || {});
  if (!elenco.length) throw new Error(`${FILE_IMPRONTE} del sito e' vuoto`);
  console.log(`Sito: ${SITO} - ${elenco.length} file nell'elenco pubblicato`);

  let i = 0;
  const lavora = async () => {
    while (i < elenco.length) {
      const [rel, attesa] = elenco[i++];
      try {
        const trovata = sha256(await scarica(rel));
        if (trovata !== attesa) problemi.push(`DIVERSO dall'elenco del sito: ${rel}`);
      } catch (e) {
        problemi.push(`NON SCARICATO: ${rel} (${e.message})`);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, lavora));

  const pagina = (await scarica('')).toString('utf8');
  for (const m of pagina.matchAll(/(?:src|href)="\/([^"#?]+)"/g)) {
    if (!(m[1] in (pubblicate.file || {}))) problemi.push(`la pagina carica un file fuori elenco: /${m[1]}`);
  }
  if (sha256(Buffer.from(pagina)) !== (pubblicate.file || {})['index.html']) problemi.push('la pagina (/) non e\' index.html dell\'elenco');

  if (CONFRONTA) {
    const attese = JSON.parse(fs.readFileSync(CONFRONTA, 'utf8'));
    const esito = confrontaImpronte(attese, pubblicate);
    for (const k of esito.diversi) problemi.push(`DIVERSO dalla build di confronto: ${k}`);
    for (const k of esito.mancanti) problemi.push(`MANCA sul sito (c'e' nella build di confronto): ${k}`);
    for (const k of esito.inPiu) problemi.push(`IN PIU' sul sito (non c'e' nella build di confronto): ${k}`);
  }

  // [palacan-l1c] firma dell'elenco
  let firmaLetta = null;
  if (fs.existsSync(CHIAVE_PUBBLICA)) {
    const pubblica = JSON.parse(fs.readFileSync(CHIAVE_PUBBLICA, 'utf8'));
    try {
      firmaLetta = JSON.parse((await scarica('rilascio/palacan-impronte.sig')).toString('utf8'));
    } catch (e) {
      problemi.push(`ELENCO NON FIRMATO: /rilascio/palacan-impronte.sig non disponibile (${e.message})`);
    }
    if (firmaLetta) {
      const esito = verificaRilascio(await motore(), pubblica, firmaLetta, { improntaElenco, ultimoNumero: ULTIMO_NUMERO });
      if (!esito.valida) problemi.push(`FIRMA NON VALIDA: ${esito.motivo}`);
    }
  } else {
    console.log('(nessuna chiave pubblica di rilascio nel repository: firma non controllata)');
  }

  if (problemi.length) {
    console.log(`DIFFERENZE (${problemi.length}):`);
    for (const p of problemi) console.log(`  ${p}`);
    process.exit(1);
  }
  console.log(`OK: ogni file del sito corrisponde all'elenco pubblicato${CONFRONTA ? ` e alla build di confronto (${CONFRONTA})` : ''}`);
  if (firmaLetta) console.log(`OK: elenco firmato con la chiave di rilascio (commit ${String(firmaLetta.commit).slice(0, 7)}, numero ${firmaLetta.numero}, ${firmaLetta.quando})`);
  console.log(`Impronta di palacan-impronte.json (la stessa della build su GitHub): ${improntaElenco}`);
}

main().catch((e) => {
  console.error(`ERRORE: ${e.message}`);
  process.exit(1);
});
