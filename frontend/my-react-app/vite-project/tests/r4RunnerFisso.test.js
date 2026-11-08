// tests/r4RunnerFisso.test.js  [palacan-r4]
//
// R4: la CI gira su una versione FISSA di Ubuntu (oggi 24.04), mai su "ubuntu-latest": un cambio di sistema deciso da
// GitHub non deve cambiare l'impronta della build verificabile ne' rompere le prove a sorpresa.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const W = join(process.cwd(), '..', '..', '..', '.github', 'workflows');

describe('R4 - versione di Ubuntu fissa nella CI', () => {
  it('ogni job di ogni workflow gira su ubuntu-NN.NN, mai su ubuntu-latest', () => {
    expect(existsSync(W), 'manca .github/workflows').toBe(true);
    const file = readdirSync(W).filter((f) => f.endsWith('.yml'));
    expect(file.length).toBeGreaterThan(0);
    for (const f of file) {
      const testo = readFileSync(join(W, f), 'utf8');
      const sistemi = [...testo.matchAll(/^\s*runs-on:\s*(\S+)/gm)].map((m) => m[1]);
      expect(sistemi.length, `${f}: nessun runs-on`).toBeGreaterThan(0);
      for (const s of sistemi) expect(s, `${f}: runs-on ${s}`).toMatch(/^ubuntu-\d\d\.\d\d$/);
    }
  });

  it('la build verificabile usa la stessa versione di Node del Dockerfile del sito (22)', () => {
    const testo = readFileSync(join(W, 'build-verificabile.yml'), 'utf8');
    expect(testo).toMatch(/node-version:\s*"22"/);
  });
});
