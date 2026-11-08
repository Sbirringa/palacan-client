// sicurezza/impronte.mjs  [palacan-l1b]
//
// L1b (Chiusura limiti): build verificabile. A ogni build si scrive dist/palacan-impronte.json, l'impronta SHA-256 di
// OGNI file che il sito serve (in ordine, senza date: due build dello stesso codice danno lo stesso elenco).
// Il sito pubblica l'elenco (/palacan-impronte.json); la CI su GitHub rifa' la build dal codice pubblico e salva il
// suo; scripts/verificaSito.mjs scarica i file dal sito vero e li confronta. Se coincidono, il sito e' esattamente
// il codice pubblicato; se il server cambia anche un solo file, si vede.
// Esclusi solo i due file per nginx (non vengono serviti: il Dockerfile li sposta in /etc/nginx) e l'elenco stesso.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const FILE_IMPRONTE = 'palacan-impronte.json';
const ESCLUSI = new Set([FILE_IMPRONTE, 'palacan-intestazioni.conf', 'palacan-csp.conf']);

export const sha256 = (dati) => crypto.createHash('sha256').update(dati).digest('hex');

export function calcolaImpronte(cartella) {
  const trovati = {};
  const visita = (dir) => {
    for (const nome of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, nome);
      const rel = path.relative(cartella, p).split(path.sep).join('/');
      if (fs.statSync(p).isDirectory()) visita(p);
      else if (!ESCLUSI.has(rel)) trovati[rel] = sha256(fs.readFileSync(p));
    }
  };
  visita(cartella);
  const file = Object.fromEntries(Object.keys(trovati).sort().map((k) => [k, trovati[k]]));
  return { v: 1, algoritmo: 'sha256', file };
}

export const testoImpronte = (impronte) => `${JSON.stringify(impronte, null, 2)}\n`;

/** Confronta due elenchi: { uguali, diversi, mancanti (attesi ma non trovati), inPiu (trovati ma non attesi) }. */
export function confrontaImpronte(attese, trovate) {
  const a = (attese && attese.file) || {};
  const t = (trovate && trovate.file) || {};
  const diversi = Object.keys(a).filter((k) => k in t && t[k] !== a[k]).sort();
  const mancanti = Object.keys(a).filter((k) => !(k in t)).sort();
  const inPiu = Object.keys(t).filter((k) => !(k in a)).sort();
  return { uguali: !diversi.length && !mancanti.length && !inPiu.length, diversi, mancanti, inPiu };
}

/** Plugin di Vite: a fine build scrive dist/palacan-impronte.json. */
export function impronteBuild() {
  let cartella = 'dist';
  return {
    name: 'palacan-impronte',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      cartella = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      fs.writeFileSync(path.join(cartella, FILE_IMPRONTE), testoImpronte(calcolaImpronte(cartella)));
    },
  };
}
