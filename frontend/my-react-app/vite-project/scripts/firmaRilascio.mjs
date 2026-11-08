// scripts/firmaRilascio.mjs  [palacan-l1c]
//
// Chiave di rilascio e firma dell'elenco delle impronte (sicurezza/rilascio.mjs), con il motore dell'app.
// Si lancia dalla cartella del frontend:
//
//   node scripts/firmaRilascio.mjs crea-chiave [--cartella C:\Users\<te>\PalacanFirma]
//       crea la chiave (una volta): la parte privata, cifrata con la passphrase, va nella cartella indicata (MAI nel
//       progetto); la parte pubblica va in sicurezza/chiave-rilascio-pubblica.json (da mettere nel commit).
//   node scripts/firmaRilascio.mjs firma --elenco dist/palacan-impronte.json --commit <sha> --uscita <file.sig>
//       firma l'elenco (lo usa strumenti/pubblica_frontend.py a ogni pubblicazione).
//   node scripts/firmaRilascio.mjs verifica --elenco <palacan-impronte.json> --firma <file.sig>
//       verifica con la chiave pubblica del repository.
//
// La passphrase si scrive nascosta nel terminale, oppure arriva da PALACAN_PASSPHRASE_RILASCIO (solo per questo processo:
// la usa pubblica_frontend.py dopo averla chiesta con getpass). Non si scrive mai su disco ne' nei log.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { nuovaChiaveRilascio, firmaRilascio, verificaRilascio, cifraPrivata, decifraPrivata } from '../sicurezza/rilascio.mjs';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const FE = path.resolve(QUI, '..');
const PUBBLICA = path.join(FE, 'sicurezza', 'chiave-rilascio-pubblica.json');
const NOME_PRIVATA = 'chiave-rilascio.json';
const CARTELLA_PREDEFINITA = path.join(os.homedir(), 'PalacanFirma');

const argomento = (nome, riserva = null) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : riserva;
};
const percorsoPubblica = () => path.resolve(argomento('--pubblica', PUBBLICA));  // --pubblica: solo per le prove

async function motore() {
  const pkg = await import('../src/crypto/pkg/palacan_crypto.js');
  pkg.initSync({ module: fs.readFileSync(path.join(FE, 'src', 'crypto', 'pkg', 'palacan_crypto_bg.wasm')) });
  return pkg;
}

function chiediNascosta(domanda) {
  if (process.env.PALACAN_PASSPHRASE_RILASCIO) return Promise.resolve(process.env.PALACAN_PASSPHRASE_RILASCIO);
  return new Promise((ok, ko) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      ko(new Error('serve un terminale per scrivere la passphrase'));
      return;
    }
    process.stdout.write(domanda);
    let testo = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const su = (pezzo) => {
      for (const c of pezzo) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', su);
          process.stdout.write('\n');
          ok(testo);
          return;
        }
        if (c === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (c === '\u007f' || c === '\b') testo = testo.slice(0, -1);
        else testo += c;
      }
    };
    stdin.on('data', su);
  });
}

function leggiJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function creaChiave() {
  const cartella = path.resolve(argomento('--cartella', CARTELLA_PREDEFINITA));
  const privataPath = path.join(cartella, NOME_PRIVATA);
  if (fs.existsSync(privataPath)) throw new Error(`esiste gia' ${privataPath}: non la sovrascrivo`);
  if (cartella.startsWith(path.resolve(FE, '..', '..', '..'))) throw new Error('la chiave privata non puo\' stare dentro il progetto');
  const uno = await chiediNascosta('Passphrase della chiave di rilascio (non si vede mentre scrivi): ');
  const due = await chiediNascosta('Ripetila: ');
  if (uno !== due) throw new Error('le due passphrase non coincidono');
  const m = await motore();
  const { privata, pubblica } = nuovaChiaveRilascio(m);
  const file = cifraPrivata(privata, uno);
  if (JSON.stringify(decifraPrivata(file, uno)) !== JSON.stringify(privata)) throw new Error('controllo della cifratura non riuscito');
  fs.mkdirSync(cartella, { recursive: true });
  fs.writeFileSync(privataPath, `${JSON.stringify(file, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(percorsoPubblica(), `${JSON.stringify({ _leggimi: '[palacan-l1c] Chiave PUBBLICA di rilascio di Palacan: con questa si verifica la firma di /rilascio/palacan-impronte.sig. La parte privata non e\' mai nel repository.', ...pubblica }, null, 2)}\n`);
  console.log(`OK: chiave privata cifrata in ${privataPath}`);
  console.log(`OK: chiave pubblica in ${percorsoPubblica()} (impronta ML-DSA-65 ${pubblica.impronta_pq.slice(0, 16)}..., ed25519 ${pubblica.ed.slice(0, 12)}...)`);
  console.log('Fai una copia della cartella su una chiavetta, e metti nel commit la chiave PUBBLICA.');
}

async function firma() {
  const elenco = argomento('--elenco');
  const commit = argomento('--commit');
  const uscita = argomento('--uscita');
  const cartella = path.resolve(argomento('--cartella', CARTELLA_PREDEFINITA));
  if (!elenco || !commit || !uscita) throw new Error('servono --elenco, --commit e --uscita');
  const pubblica = leggiJson(percorsoPubblica());
  const file = leggiJson(path.join(cartella, NOME_PRIVATA));
  const passphrase = await chiediNascosta('Passphrase della chiave di rilascio: ');
  const privata = decifraPrivata(file, passphrase);
  if (privata.ed !== pubblica.ed || privata.pq !== pubblica.pq) throw new Error('la chiave privata non corrisponde a quella pubblica del repository');
  const m = await motore();
  const impronta = crypto.createHash('sha256').update(fs.readFileSync(elenco)).digest('hex');
  const ora = new Date();
  const f = firmaRilascio(m, privata, { impronta, commit, numero: Math.floor(ora.getTime() / 1000), quando: ora.toISOString() });
  const esito = verificaRilascio(m, pubblica, f, { improntaElenco: impronta });
  if (!esito.valida) throw new Error(`la firma appena fatta non si verifica (${esito.motivo})`);
  fs.mkdirSync(path.dirname(path.resolve(uscita)), { recursive: true });
  fs.writeFileSync(uscita, `${JSON.stringify(f, null, 2)}\n`);
  console.log(`OK: elenco ${impronta.slice(0, 16)}... firmato per il commit ${commit.slice(0, 7)} (numero ${f.numero})`);
}

async function verifica() {
  const elenco = argomento('--elenco');
  const firmaPath = argomento('--firma');
  if (!elenco || !firmaPath) throw new Error('servono --elenco e --firma');
  const m = await motore();
  const impronta = crypto.createHash('sha256').update(fs.readFileSync(elenco)).digest('hex');
  const esito = verificaRilascio(m, leggiJson(percorsoPubblica()), leggiJson(firmaPath), { improntaElenco: impronta });
  if (!esito.valida) {
    console.log(`FIRMA NON VALIDA: ${esito.motivo}`);
    process.exit(1);
  }
  console.log(`OK: firma valida (elenco ${impronta.slice(0, 16)}...)`);
}

const comandi = { 'crea-chiave': creaChiave, firma, verifica };
const scelto = comandi[process.argv[2]];
if (!scelto) {
  console.log('Uso: node scripts/firmaRilascio.mjs crea-chiave | firma | verifica  (vedi l\'inizio del file)');
  process.exit(2);
}
scelto().catch((e) => {
  console.error(`ERRORE: ${e.message}`);
  process.exit(1);
});
