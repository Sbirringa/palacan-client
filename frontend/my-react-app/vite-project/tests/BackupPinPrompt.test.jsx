// tests/BackupPinPrompt.test.jsx
//
// Test sul modulo di inserimento passphrase di backup.
//
// SCOPERTA (verificata confrontando col vero encryptBackupBundle,
// gia' testato in olmService.backup.test.js): questo componente
// controlla localmente "almeno 8 caratteri", ma la funzione REALE che
// cifra il backup richiede "almeno 12 caratteri" - una passphrase di
// 8-11 caratteri passa QUI ma fallirebbe piu' avanti nella cifratura
// vera, con un'esperienza utente confusa (il modulo sembra accettarla,
// poi fallisce altrove). Segnalato all'utente come incoerenza da
// correggere, non ancora corretto qui.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}));

import BackupPinPrompt from '../src/components/BackupPinPrompt.jsx';

describe('BackupPinPrompt — validazione base', () => {
  it('rifiuta una passphrase sotto le 8 lettere (il minimo che QUESTO componente conosce)', () => {
    const onSubmit = vi.fn();
    render(<BackupPinPrompt mode="recover" onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText('account.backup_passphrase_placeholder');
    fireEvent.change(input, { target: { value: 'corta12' } }); // 7 caratteri
    fireEvent.click(screen.getByText('account.backup_recover_button'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('account.backup_min_chars_error')).toBeInTheDocument();
  });

  it('FIX CONFERMATO: una passphrase di 10 caratteri viene ora rifiutata QUI (era il gap - il componente accettava fino a 11, encryptBackupBundle richiede 12)', () => {
    const onSubmit = vi.fn();
    render(<BackupPinPrompt mode="recover" onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText('account.backup_passphrase_placeholder');
    const passphraseDi10Caratteri = 'corta12345';
    expect(passphraseDi10Caratteri.length).toBe(10);

    fireEvent.change(input, { target: { value: passphraseDi10Caratteri } });
    fireEvent.click(screen.getByText('account.backup_recover_button'));

    // Dopo il fix, questo NON deve piu' passare - deve fallire QUI,
    // con lo stesso limite (12) della cifratura vera.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accetta una passphrase di 12 caratteri esatti, non banale (limite esatto allineato a encryptBackupBundle)', () => {
    const onSubmit = vi.fn();
    render(<BackupPinPrompt mode="recover" onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText('account.backup_passphrase_placeholder');
    const passphraseDi12Caratteri = 'corta1234567';
    expect(passphraseDi12Caratteri.length).toBe(12);

    fireEvent.change(input, { target: { value: passphraseDi12Caratteri } });
    fireEvent.click(screen.getByText('account.backup_recover_button'));

    expect(onSubmit).toHaveBeenCalledWith(passphraseDi12Caratteri);
  });

  it('rifiuta una passphrase di soli numeri, anche se lunga abbastanza', () => {
    const onSubmit = vi.fn();
    render(<BackupPinPrompt mode="recover" onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText('account.backup_passphrase_placeholder');
    fireEvent.change(input, { target: { value: '123456789012' } });
    fireEvent.click(screen.getByText('account.backup_recover_button'));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rifiuta una passphrase di un solo carattere ripetuto, anche se lunga abbastanza', () => {
    const onSubmit = vi.fn();
    render(<BackupPinPrompt mode="recover" onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText('account.backup_passphrase_placeholder');
    fireEvent.change(input, { target: { value: 'aaaaaaaaaaaa' } });
    fireEvent.click(screen.getByText('account.backup_recover_button'));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('in modalità "create", rifiuta se le due passphrase non coincidono', () => {
    const onSubmit = vi.fn();
    render(<BackupPinPrompt mode="create" onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText('account.backup_passphrase_placeholder');
    const inputConferma = screen.getByPlaceholderText('account.backup_confirm_passphrase_placeholder');

    fireEvent.change(input, { target: { value: 'passphrase_lunga_abbastanza' } });
    fireEvent.change(inputConferma, { target: { value: 'passphrase_diversa_abbastanza' } });
    fireEvent.click(screen.getByText('account.backup_save_button'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('account.backup_mismatch_error')).toBeInTheDocument();
  });

  it('in modalità "create", accetta se le due passphrase coincidono e sono abbastanza lunghe', () => {
    const onSubmit = vi.fn();
    render(<BackupPinPrompt mode="create" onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText('account.backup_passphrase_placeholder');
    const inputConferma = screen.getByPlaceholderText('account.backup_confirm_passphrase_placeholder');

    fireEvent.change(input, { target: { value: 'passphrase_lunga_uguale' } });
    fireEvent.change(inputConferma, { target: { value: 'passphrase_lunga_uguale' } });
    fireEvent.click(screen.getByText('account.backup_save_button'));

    expect(onSubmit).toHaveBeenCalledWith('passphrase_lunga_uguale');
  });

  it('il pulsante "Salta" è visibile solo in modalità "recover" e chiama onSkip', () => {
    const onSkip = vi.fn();
    render(<BackupPinPrompt mode="recover" onSubmit={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByText('account.backup_skip_button'));
    expect(onSkip).toHaveBeenCalled();
  });

  it('in modalità "create", non esiste nessun pulsante "Salta"', () => {
    render(<BackupPinPrompt mode="create" onSubmit={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.queryByText('account.backup_skip_button')).not.toBeInTheDocument();
  });
});
