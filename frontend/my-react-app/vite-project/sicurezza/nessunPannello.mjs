// sicurezza/nessunPannello.mjs  [palacan-v1b] [palacan-v2a]
//
// Guardia della build: il sito pubblico non deve contenere niente di cio' che e' riservato al proprietario. A ogni
// build cerca nella cartella pubblicata le parole elencate in sicurezza/segni-privati.json (file PRIVATO: non va nel
// repository pubblico, cosi' le parole stesse non si rivelano); se ne trova una, la build si ferma.
// Senza quel file (per esempio nel repository pubblico) la guardia non ha niente da cercare e non cambia la build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILE_SEGNI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'segni-privati.json');
const TESTO = /\.(m?js|html|css|json|txt|map|webmanifest|svg)$/i;

/** Le parole da cercare (vuoto se il file privato non c'e'). */
export function segniVietati(file = FILE_SEGNI) {
  if (!fs.existsSync(file)) return [];
  const dati = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (Array.isArray(dati.segni) ? dati.segni : []).filter((s) => typeof s === 'string' && s.length >= 4);
}

/** Restituisce [{ file, segno }] per ogni parola vietata trovata nella cartella. */
export function cercaSegni(cartella, segni = segniVietati()) {
  const trovati = [];
  const visita = (dir) => {
    for (const nome of fs.readdirSync(dir)) {
      const p = path.join(dir, nome);
      if (fs.statSync(p).isDirectory()) visita(p);
      else if (TESTO.test(nome)) {
        const testo = fs.readFileSync(p, 'utf8');
        for (const segno of segni) {
          if (testo.includes(segno)) trovati.push({ file: path.relative(cartella, p).split(path.sep).join('/'), segno });
        }
      }
    }
  };
  if (fs.existsSync(cartella)) visita(cartella);
  return trovati;
}

/** Plugin di Vite: a fine build ferma tutto se nel sito c'e' qualcosa di riservato. */
export function nessunPannello() {
  let cartella = 'dist';
  return {
    name: 'palacan-nessun-pannello',
    apply: 'build',
    configResolved(config) {
      cartella = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const trovati = cercaSegni(cartella);
      if (trovati.length) {
        throw new Error(`[palacan-v2a] nel sito pubblico c'e' qualcosa di riservato: ${trovati.map((t) => t.file).join(', ')}`);
      }
    },
  };
}
