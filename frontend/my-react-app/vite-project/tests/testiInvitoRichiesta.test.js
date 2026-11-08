// tests/testiInvitoRichiesta.test.js
//
// Dopo il link d'invito come richiesta di contatto, i testi dicono la verita' in tutte e cinque le lingue:
// chi apre il link manda una richiesta, non entra in una conversazione.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TESTI_INVITO } from '../src/components/testiInvito';

const VECCHI = ['join the conversation', 'join the chat', 'Taking you to the conversation'];

describe('testi del link d\'invito', () => {
  for (const lingua of ['en', 'it', 'fr', 'es', 'de']) {
    it(`${lingua}: il pannello del link parla di richiesta, una volta sola, 7 giorni`, () => {
      const dati = JSON.parse(readFileSync(`src/locales/${lingua}.json`, 'utf8'));
      const avviso = dati.dashboard.invite_panel.disclaimer;
      expect(avviso).toMatch(/7/);
      for (const vecchio of VECCHI) expect(avviso).not.toContain(vecchio);
    });
  }

  it('la pagina d\'invito non promette piu\' di entrare subito nella chat', () => {
    for (const [lingua, testi] of Object.entries(TESTI_INVITO)) {
      for (const vecchio of VECCHI) {
        expect(testi.spiegazione, lingua).not.toContain(vecchio);
        expect(testi.ingresso, lingua).not.toContain(vecchio);
      }
    }
    expect(TESTI_INVITO.en.spiegazione).toContain('contact request');
    expect(TESTI_INVITO.en.ingresso).toBe('Sending your contact request…');
  });
});
