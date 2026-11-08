// tests/linguaPagina.test.js
//
// <html lang> segue la lingua scelta nell'app.
import { describe, it, expect } from 'vitest';
import i18n from '../src/i18n';

const attendi = () => new Promise((fatto) => setTimeout(fatto, 0));

describe('lingua della pagina', () => {
  it('all\'avvio <html lang> e\' la lingua dell\'app', async () => {
    await attendi();
    expect(document.documentElement.lang).toBe(String(i18n.resolvedLanguage || i18n.language).split('-')[0]);
  });

  it('cambiando lingua cambia anche <html lang>', async () => {
    await i18n.changeLanguage('de');
    expect(document.documentElement.lang).toBe('de');
    await i18n.changeLanguage('it');
    expect(document.documentElement.lang).toBe('it');
    await i18n.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
