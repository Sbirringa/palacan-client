// tests/modelliFormali.test.js  [palacan-l6]
//
// I modelli ProVerif li fa girare la CI (workflow "Modelli formali"); questa prova controlla subito, anche sul PC, che
// siano registrati bene: ogni modello in formale/proverif/ ha i suoi risultati attesi in verifica.py, i modelli del
// ratchet (L6) ci sono e hanno esattamente tante domande quanti risultati attesi, il registro li descrive.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RADICE = join(process.cwd(), '..', '..', '..');
const PV = join(RADICE, 'formale', 'proverif');
const leggi = (p) => (existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : '');
const NUOVI = ['4_megolm_ratchet.pv', '5_olm_double_ratchet.pv'];

function attesi() {
  const testo = leggi(join(PV, 'verifica.py'));
  const fuori = {};
  for (const m of testo.matchAll(/"([^"]+\.pv)":\s*\[([\s\S]*?)\n\s*\],/g)) {
    fuori[m[1]] = [...m[2].matchAll(/,\s*"(vero|falso)"\)/g)].map((x) => x[1]);
  }
  return fuori;
}

describe('modelli formali ProVerif', () => {
  it('L6: ci sono i modelli del ratchet di Megolm e di Olm', () => {
    for (const f of NUOVI) expect(existsSync(join(PV, f)), `L6: manca formale/proverif/${f} (ratchet non modellato)`).toBe(true);
  });

  it('ogni modello ha i suoi risultati attesi in verifica.py, con tante domande quanti risultati', () => {
    const a = attesi();
    for (const f of readdirSync(PV).filter((x) => x.endsWith('.pv'))) {
      expect(a[f], `L6: ${f} non e' in verifica.py`).toBeDefined();
    }
    for (const f of NUOVI) {
      const domande = (leggi(join(PV, f)).match(/^query\b/gm) || []).length;
      expect(domande, `${f}: domande e risultati attesi`).toBe((a[f] || []).length);
      expect(a[f]).toContain('vero');
      expect(a[f]).toContain('falso');
    }
  });

  it('il registro descrive il ratchet', () => {
    const readme = leggi(join(RADICE, 'formale', 'README.md'));
    for (const f of NUOVI) expect(readme, `L6: il registro non cita ${f}`).toContain(f);
    expect(readme).not.toContain('Il ratchet di Olm e Megolm non è\n  modellato qui');
  });
});
