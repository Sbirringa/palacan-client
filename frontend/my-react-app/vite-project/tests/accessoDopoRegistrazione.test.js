// tests/accessoDopoRegistrazione.test.js
//
// Dopo la registrazione si entra subito (stesso handleLogin, stesse credenziali), e i messaggi del flusso di
// accesso passano dalle traduzioni invece di essere scritti in italiano nel codice.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.jsx', 'utf8').replace(/\r\n/g, '\n');
const tra = (inizio, fine) => {
  const a = app.indexOf(inizio);
  const b = app.indexOf(fine, a + 1);
  return a >= 0 && b > a ? app.slice(a, b) : '';
};

describe('accesso automatico dopo la registrazione', () => {
  it('handleRegister chiama handleLogin invece di chiedere di rifare l\'accesso', () => {
    const registrazione = tra('const handleRegister = async', 'const handleEnterpriseSubmit');
    expect(registrazione).toContain('await handleLogin({ preventDefault: () => {} });');
    expect(registrazione).not.toContain('Ora effettua il login');
  });

  it('i messaggi del flusso di accesso non sono piu\' scritti in italiano nel codice', () => {
    expect(app).toMatch(/^import i18n from '\.\/i18n';/m);
    expect(app).not.toContain("'Credenziali non valide.'");
    expect(app).not.toContain("'Errore registrazione'");
    expect(app).toContain("i18n.t('account.error_invalid_credentials')");
    expect(app).toContain("i18n.t('account.error_registration')");
    expect(app).toContain("i18n.t('account.error_username_taken')");
  });
});

describe('testi nelle cinque lingue', () => {
  for (const lingua of ['en', 'it', 'fr', 'es', 'de']) {
    it(`${lingua}: i tre messaggi ci sono`, () => {
      const account = JSON.parse(readFileSync(`src/locales/${lingua}.json`, 'utf8')).account;
      for (const chiave of ['error_invalid_credentials', 'error_registration', 'error_username_taken']) {
        expect(String(account[chiave] || '').trim().length, `${lingua}.${chiave}`).toBeGreaterThan(0);
      }
    });
  }
});
