// scripts/preparaEstensione.mjs  [palacan-l1d]
//
// Prepara la cartella dell'estensione "Palacan Verifica", pronta da caricare in Chrome/Edge/Brave:
//   - copia i file di estensione/;
//   - copia il motore dell'app (src/crypto/pkg/palacan_crypto.js e palacan_crypto_bg.wasm): la firma si verifica con
//     lo stesso codice che usa Palacan;
//   - scrive configurazione.js con l'indirizzo del sito e la chiave PUBBLICA di rilascio presa dal repository
//     (sicurezza/chiave-rilascio-pubblica.json): e' la chiave fissata nell'estensione, il server non la puo' cambiare.
//
// Uso (dalla cartella del frontend):
//   node scripts/preparaEstensione.mjs [--uscita estensione-pronta] [--sito https://...] [--chiave <pubblica.json>]
// (--sito e --chiave servono solo alle prove: scripts/verificaEstensione.mjs)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITO_PREDEFINITO = 'https://my-chat-frontend-app-vittorio.fly.dev';
export const FILE_ESTENSIONE = ['manifest.json', 'sfondo.js', 'pagina.js', 'controllo.js', 'popup.html', 'popup.js', 'LEGGIMI.txt'];
const FILE_MOTORE = ['palacan_crypto.js', 'palacan_crypto_bg.wasm'];
const SEGNO = '.palacan-estensione';

export function preparaEstensione({ uscita = path.join(FE, 'estensione-pronta'), sito = SITO_PREDEFINITO, chiave = path.join(FE, 'sicurezza', 'chiave-rilascio-pubblica.json') } = {}) {
  const origine = new URL(sito).origin;
  if (!/^https:\/\//.test(origine) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origine)) {
    throw new Error(`sito non valido: ${sito} (serve https://, oppure http://127.0.0.1 per le prove)`);
  }
  const pubblica = JSON.parse(fs.readFileSync(chiave, 'utf8'));
  for (const campo of ['ed', 'pq', 'impronta_pq']) {
    if (typeof pubblica[campo] !== 'string' || !pubblica[campo]) throw new Error(`chiave pubblica senza ${campo}: ${chiave}`);
  }
  if (fs.existsSync(uscita)) {
    if (!fs.existsSync(path.join(uscita, SEGNO))) throw new Error(`${uscita} esiste e non e' una cartella dell'estensione: non la tocco`);
    fs.rmSync(uscita, { recursive: true, force: true });
  }
  fs.mkdirSync(uscita, { recursive: true });
  for (const nome of FILE_ESTENSIONE) fs.copyFileSync(path.join(FE, 'estensione', nome), path.join(uscita, nome));
  for (const nome of FILE_MOTORE) fs.copyFileSync(path.join(FE, 'src', 'crypto', 'pkg', nome), path.join(uscita, nome));

  const manifesto = JSON.parse(fs.readFileSync(path.join(uscita, 'manifest.json'), 'utf8'));
  manifesto.host_permissions = [`${origine}/*`];
  manifesto.content_scripts[0].matches = [`${origine}/*`];
  fs.writeFileSync(path.join(uscita, 'manifest.json'), `${JSON.stringify(manifesto, null, 2)}\n`);

  const fissata = { v: pubblica.v, ed: pubblica.ed, pq: pubblica.pq, impronta_pq: pubblica.impronta_pq };
  fs.writeFileSync(path.join(uscita, 'configurazione.js'),
    '// [palacan-l1d] scritto da scripts/preparaEstensione.mjs: sito e chiave PUBBLICA di rilascio fissata\n'
    + `export const SITO = ${JSON.stringify(origine)};\n`
    + `export const CHIAVE_RILASCIO = Object.freeze(${JSON.stringify(fissata, null, 2)});\n`);
  fs.writeFileSync(path.join(uscita, SEGNO), 'cartella generata da scripts/preparaEstensione.mjs\n');
  return { uscita, sito: origine, chiave: fissata };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const argomento = (nome, riserva) => {
    const i = process.argv.indexOf(nome);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : riserva;
  };
  try {
    const r = preparaEstensione({
      uscita: path.resolve(argomento('--uscita', path.join(FE, 'estensione-pronta'))),
      sito: argomento('--sito', SITO_PREDEFINITO),
      chiave: path.resolve(argomento('--chiave', path.join(FE, 'sicurezza', 'chiave-rilascio-pubblica.json'))),
    });
    console.log(`OK: estensione pronta in ${r.uscita}`);
    console.log(`    sito ${r.sito}; chiave di rilascio ML-DSA-65 ${r.chiave.impronta_pq.slice(0, 16)}..., ed25519 ${r.chiave.ed.slice(0, 12)}...`);
    console.log('    Chrome/Edge: pagina delle estensioni -> Modalita\' sviluppatore -> Carica estensione non pacchettizzata.');
  } catch (e) {
    console.error(`ERRORE: ${e.message}`);
    process.exit(1);
  }
}
