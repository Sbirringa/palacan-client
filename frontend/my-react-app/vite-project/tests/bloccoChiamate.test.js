// tests/bloccoChiamate.test.js  [palacan-l4d]
//
// L4d: contatto VERIFICATO che compare con una chiave mai vista (L4a): oltre ai messaggi, si bloccano anche le
// chiamate e le videochiamate verso di lui finche' non si conferma nel banner rosso. Prima partivano lo stesso.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('L4d - chiamate bloccate per un contatto verificato con una chiave mai vista', () => {
  it('chiamata e videochiamata controllano il blocco prima di partire', () => {
    const dash = readFileSync('src/pages/Dashboard.jsx', 'utf8');
    const avvii = [...dash.matchAll(/callManager\?\.startCall\(currentRoom\.id, callTargetUser\.id(, true)?\);/g)];
    expect(avvii.length).toBe(2);
    for (const m of avvii) {
      const prima = dash.slice(Math.max(0, m.index - 600), m.index);
      expect(prima, 'manca il blocco delle chiamate per i contatti verificati con una chiave mai vista')
        .toContain('olmService.invioBloccatoPerIdentita(currentUsername, callTargetUser.username)');
    }
  });

  it('il testo dell\'avviso esiste nelle 5 lingue', () => {
    for (const lingua of ['it', 'en', 'de', 'es', 'fr']) {
      const dati = JSON.parse(readFileSync(`src/locales/${lingua}.json`, 'utf8').replace(/^\uFEFF/, ''));
      expect(typeof dati.dashboard?.chat_layout?.identity_changed_blocked_call, `${lingua}.json: manca il blocco delle chiamate`).toBe('string');
    }
  });
});
