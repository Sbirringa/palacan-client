// tests/rientroBackup.test.js  [palacan-n4b]
//
// Rientro sullo stesso browser (chiavi gia' presenti, niente recupero) senza passphrase nota: prima il backup
// restava fermo per tutta la sessione senza dirlo. Ora si chiede la passphrase una volta (finestra "Riattiva il
// backup"), la si verifica aprendo il backup del server SENZA ripristinare niente, e il backup riparte.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
const { default: BackupPinPrompt } = await import('../src/components/BackupPinPrompt.jsx');

const CHIAVI_NUOVE = ['backup_unlock_title', 'backup_unlock_description', 'backup_unlock_button', 'backup_unlock_skip_button'];

describe('finestra della passphrase: modo "riattiva"', () => {
  it('testi propri, pulsante Salta, stessa regola dei 12 caratteri', () => {
    const invia = vi.fn();
    const salta = vi.fn();
    render(React.createElement(BackupPinPrompt, { mode: 'unlock', onSubmit: invia, onSkip: salta }));
    expect(screen.getByText('account.backup_unlock_title')).toBeTruthy();
    expect(screen.getByText('account.backup_unlock_description')).toBeTruthy();
    expect(screen.queryByText('account.backup_recover_title')).toBeNull();
    fireEvent.click(screen.getByText('account.backup_unlock_skip_button'));
    expect(salta).toHaveBeenCalledTimes(1);
    const campi = document.querySelectorAll('input[type="password"]');
    expect(campi).toHaveLength(1);
    fireEvent.change(campi[0], { target: { value: 'corta' } });
    fireEvent.click(screen.getByText('account.backup_unlock_button'));
    expect(invia).not.toHaveBeenCalled();
    fireEvent.change(campi[0], { target: { value: 'una frase lunga e giusta' } });
    fireEvent.click(screen.getByText('account.backup_unlock_button'));
    expect(invia).toHaveBeenCalledWith('una frase lunga e giusta');
  });

  it('il modo "recupera" resta com\'era', () => {
    render(React.createElement(BackupPinPrompt, { mode: 'recover', onSubmit: vi.fn(), onSkip: vi.fn() }));
    expect(screen.getAllByText('account.backup_recover_title').length).toBeGreaterThan(0);
    expect(screen.getAllByText('account.backup_skip_button').length).toBeGreaterThan(0);
  });
});

describe('traduzioni', () => {
  it('italiano e inglese hanno i testi nuovi; ogni file di lingua resta JSON valido', () => {
    const cartella = 'src/locales';
    for (const nome of readdirSync(cartella).filter((f) => f.endsWith('.json'))) {
      const dati = JSON.parse(readFileSync(`${cartella}/${nome}`, 'utf8'));
      if (nome === 'it.json' || nome === 'en.json') {
        for (const chiave of CHIAVI_NUOVE) expect(typeof dati.account?.[chiave], `${nome}: account.${chiave}`).toBe('string');
      }
    }
  });
});

describe('App', () => {
  const app = readFileSync('src/App.jsx', 'utf8').replace(/\r\n/g, '\n');

  it('al rientro con chiavi gia\' presenti e passphrase non nota si riattiva il backup (accesso normale e aziendale)', () => {
    expect(app.split('if (!backupPassphraseRef.current) await riattivaBackup(res.user.username, res.access_token);').length - 1).toBe(2);
  });

  it('la verifica apre il backup ma non ripristina niente', () => {
    const inizio = app.indexOf('const riattivaBackup = async (username, token) => {');
    expect(inizio).toBeGreaterThan(-1);
    const corpo = app.slice(inizio, app.indexOf('\n  };', inizio));
    expect(corpo).toContain('olmService.decryptBackupBundle(dati, passphrase)');
    expect(corpo).not.toContain('restoreBackupBundleToLocalStorage');
    expect(corpo).not.toContain('importaDatiPersonali');
    expect(corpo).toContain("askBackupPassphrase('unlock', errore)");
  });

  it('nella finestra "riattiva" c\'e\' il pulsante Salta (entrambi i punti in cui compare)', () => {
    expect(app.split("onSkip={backupPrompt.mode === 'recover' || backupPrompt.mode === 'unlock' ? skipBackupPrompt : undefined}").length - 1).toBe(2);
  });
});
