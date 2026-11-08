// tests/UnifiedAuthCard.test.jsx
//
// Test sul flusso "recupera password" (handleRecoverSubmit) - la
// parte piu' logica del componente, e quella che ha portato alla
// scoperta del bug reale nel backend (validazione password debole
// via recovery code, gia' corretto).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../src/apiService', () => ({
  resetPasswordWithRecoveryCode: vi.fn(),
}));

const tStabile = (key) => key;
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tStabile }),
}));

import UnifiedAuthCard from '../src/components/UnifiedAuthCard.jsx';
import * as apiService from '../src/apiService';

function propsBase(overrides = {}) {
  return {
    view: 'recover',
    onViewChange: vi.fn(),
    loginUser: '',
    setLoginUser: vi.fn(),
    loginPass: '',
    setLoginPass: vi.fn(),
    onLogin: vi.fn(),
    onRegister: vi.fn(),
    authError: '',
    loading: false,
    isOlmReady: true,
    onClose: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UnifiedAuthCard — recupero password: validazione locale', () => {
  it('non chiama mai l\'API se un campo obbligatorio manca', () => {
    render(<UnifiedAuthCard {...propsBase()} />);

    fireEvent.click(screen.getByText('account.recover_submit'));

    expect(apiService.resetPasswordWithRecoveryCode).not.toHaveBeenCalled();
    expect(screen.getByText('account.error_fill_all_fields')).toBeInTheDocument();
  });

  it('rifiuta localmente una nuova password sotto gli 8 caratteri, senza chiamare l\'API', () => {
    render(<UnifiedAuthCard {...propsBase()} />);

    fireEvent.change(screen.getByPlaceholderText('account.username_placeholder_login'), { target: { value: 'utente_test' } });
    fireEvent.change(screen.getByPlaceholderText('XXXX-XXXX-XXXX-XXXX'), { target: { value: 'AAAA-BBBB-CCCC-DDDD' } });
    fireEvent.change(screen.getByPlaceholderText('account.password_min_chars_placeholder'), { target: { value: 'corta12' } }); // 7 caratteri

    fireEvent.click(screen.getByText('account.recover_submit'));

    expect(apiService.resetPasswordWithRecoveryCode).not.toHaveBeenCalled();
    expect(screen.getByText('account.error_password_min_length')).toBeInTheDocument();
  });
});

describe('UnifiedAuthCard — recupero password: sottomissione', () => {
  it('con tutti i campi validi, chiama l\'API con username e codice ripuliti (trim)', async () => {
    apiService.resetPasswordWithRecoveryCode.mockResolvedValue({ detail: 'ok', sessions_terminated: 1 });

    render(<UnifiedAuthCard {...propsBase()} />);

    fireEvent.change(screen.getByPlaceholderText('account.username_placeholder_login'), { target: { value: '  utente_test  ' } });
    fireEvent.change(screen.getByPlaceholderText('XXXX-XXXX-XXXX-XXXX'), { target: { value: '  AAAA-BBBB-CCCC-DDDD  ' } });
    fireEvent.change(screen.getByPlaceholderText('account.password_min_chars_placeholder'), { target: { value: 'PasswordValida1!' } });

    fireEvent.click(screen.getByText('account.recover_submit'));

    await waitFor(() => {
      expect(apiService.resetPasswordWithRecoveryCode).toHaveBeenCalledWith(
        'utente_test',
        'AAAA-BBBB-CCCC-DDDD',
        'PasswordValida1!'
      );
    });
  });

  it('in caso di successo, mostra il messaggio di successo invece del modulo', async () => {
    apiService.resetPasswordWithRecoveryCode.mockResolvedValue({ detail: 'ok', sessions_terminated: 1 });

    render(<UnifiedAuthCard {...propsBase()} />);

    fireEvent.change(screen.getByPlaceholderText('account.username_placeholder_login'), { target: { value: 'utente_test' } });
    fireEvent.change(screen.getByPlaceholderText('XXXX-XXXX-XXXX-XXXX'), { target: { value: 'AAAA-BBBB-CCCC-DDDD' } });
    fireEvent.change(screen.getByPlaceholderText('account.password_min_chars_placeholder'), { target: { value: 'PasswordValida1!' } });

    fireEvent.click(screen.getByText('account.recover_submit'));

    await waitFor(() => {
      expect(screen.getByText('account.recover_success_message')).toBeInTheDocument();
    });
  });

  it('se il server rifiuta (es. codice non valido, o ORA anche password debole rifiutata dal backend), mostra l\'errore e resta sul modulo', async () => {
    apiService.resetPasswordWithRecoveryCode.mockRejectedValue(new Error('Codice di recupero non valido o username errato'));

    render(<UnifiedAuthCard {...propsBase()} />);

    fireEvent.change(screen.getByPlaceholderText('account.username_placeholder_login'), { target: { value: 'utente_test' } });
    fireEvent.change(screen.getByPlaceholderText('XXXX-XXXX-XXXX-XXXX'), { target: { value: 'AAAA-BBBB-CCCC-DDDD' } });
    fireEvent.change(screen.getByPlaceholderText('account.password_min_chars_placeholder'), { target: { value: 'PasswordValida1!' } });

    fireEvent.click(screen.getByText('account.recover_submit'));

    await waitFor(() => {
      expect(screen.getByText('Codice di recupero non valido o username errato')).toBeInTheDocument();
    });

    // Il modulo resta visibile - nessun falso messaggio di successo.
    expect(screen.queryByText('account.recover_success_message')).not.toBeInTheDocument();
  });

  it('"Torna al login" dopo un successo azzera tutti i campi e chiama onViewChange("login")', async () => {
    apiService.resetPasswordWithRecoveryCode.mockResolvedValue({ detail: 'ok', sessions_terminated: 1 });
    const onViewChange = vi.fn();

    render(<UnifiedAuthCard {...propsBase({ onViewChange })} />);

    fireEvent.change(screen.getByPlaceholderText('account.username_placeholder_login'), { target: { value: 'utente_test' } });
    fireEvent.change(screen.getByPlaceholderText('XXXX-XXXX-XXXX-XXXX'), { target: { value: 'AAAA-BBBB-CCCC-DDDD' } });
    fireEvent.change(screen.getByPlaceholderText('account.password_min_chars_placeholder'), { target: { value: 'PasswordValida1!' } });
    fireEvent.click(screen.getByText('account.recover_submit'));

    await waitFor(() => screen.getByText('account.go_to_login'));
    fireEvent.click(screen.getByText('account.go_to_login'));

    expect(onViewChange).toHaveBeenCalledWith('login');
  });
});
