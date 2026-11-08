// tests/ForcedPasswordChangeScreen.test.jsx
//
// Schermata BLOCCANTE mostrata dopo un login con password temporanea -
// l'utente non puo' raggiungere la Dashboard finche' non sceglie una
// password propria. Riusa PasswordRequirementsChecklist/isPasswordValid
// (gia' verificati coincidere col backend).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import ForcedPasswordChangeScreen from '../src/components/ForcedPasswordChangeScreen.jsx';

function creaApiServiceFinta() {
  return { changePassword: vi.fn() };
}

const PASSWORD_VALIDA = 'PasswordValida1!'; // soddisfa tutte le regole verificate

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ForcedPasswordChangeScreen — il pulsante resta disabilitato finche\' non tutto è a posto', () => {
  it('è disabilitato se manca la password temporanea attuale', () => {
    render(<ForcedPasswordChangeScreen apiService={creaApiServiceFinta()} token="t" username="mario" />);
    expect(screen.getByRole('button', { name: 'Conferma nuova password' })).toBeDisabled();
  });

  it('è disabilitato se la nuova password non soddisfa le regole', () => {
    render(<ForcedPasswordChangeScreen apiService={creaApiServiceFinta()} token="t" username="mario" />);
    fireEvent.change(screen.getByLabelText(/Password temporanea/i), { target: { value: 'TempPass1!' } });
    fireEvent.change(screen.getByLabelText('Nuova password'), { target: { value: 'debole' } });
    fireEvent.change(screen.getByLabelText(/Conferma nuova password/i), { target: { value: 'debole' } });
    expect(screen.getByRole('button', { name: 'Conferma nuova password' })).toBeDisabled();
  });

  it('è disabilitato se le due nuove password non coincidono', () => {
    render(<ForcedPasswordChangeScreen apiService={creaApiServiceFinta()} token="t" username="mario" />);
    fireEvent.change(screen.getByLabelText(/Password temporanea/i), { target: { value: 'TempPass1!' } });
    fireEvent.change(screen.getByLabelText('Nuova password'), { target: { value: PASSWORD_VALIDA } });
    fireEvent.change(screen.getByLabelText(/Conferma nuova password/i), { target: { value: 'AltraPassword2!' } });
    expect(screen.getByRole('button', { name: 'Conferma nuova password' })).toBeDisabled();
  });

  it('è disabilitato se la nuova password è IDENTICA a quella temporanea attuale, con messaggio esplicito', () => {
    render(<ForcedPasswordChangeScreen apiService={creaApiServiceFinta()} token="t" username="mario" />);
    fireEvent.change(screen.getByLabelText(/Password temporanea/i), { target: { value: PASSWORD_VALIDA } });
    fireEvent.change(screen.getByLabelText('Nuova password'), { target: { value: PASSWORD_VALIDA } });
    fireEvent.change(screen.getByLabelText(/Conferma nuova password/i), { target: { value: PASSWORD_VALIDA } });

    expect(screen.getByRole('button', { name: 'Conferma nuova password' })).toBeDisabled();
    expect(screen.getByText('La nuova password deve essere diversa da quella attuale.')).toBeInTheDocument();
  });

  it('si abilita SOLO quando tutte le condizioni sono soddisfatte insieme', () => {
    render(<ForcedPasswordChangeScreen apiService={creaApiServiceFinta()} token="t" username="mario" />);
    fireEvent.change(screen.getByLabelText(/Password temporanea/i), { target: { value: 'TempPass1!' } });
    fireEvent.change(screen.getByLabelText('Nuova password'), { target: { value: PASSWORD_VALIDA } });
    fireEvent.change(screen.getByLabelText(/Conferma nuova password/i), { target: { value: PASSWORD_VALIDA } });

    expect(screen.getByRole('button', { name: 'Conferma nuova password' })).not.toBeDisabled();
  });
});

describe('ForcedPasswordChangeScreen — sottomissione', () => {
  it('chiama apiService.changePassword con i parametri giusti, poi onSuccess', async () => {
    const apiService = creaApiServiceFinta();
    apiService.changePassword.mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();

    render(<ForcedPasswordChangeScreen apiService={apiService} token="token_vero" username="mario" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/Password temporanea/i), { target: { value: 'TempPass1!' } });
    fireEvent.change(screen.getByLabelText('Nuova password'), { target: { value: PASSWORD_VALIDA } });
    fireEvent.change(screen.getByLabelText(/Conferma nuova password/i), { target: { value: PASSWORD_VALIDA } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferma nuova password' }));

    await waitFor(() => {
      expect(apiService.changePassword).toHaveBeenCalledWith('TempPass1!', PASSWORD_VALIDA, 'token_vero');
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('se il server rifiuta, mostra l\'errore e NON chiama onSuccess', async () => {
    const apiService = creaApiServiceFinta();
    apiService.changePassword.mockRejectedValue(new Error('Password temporanea errata'));
    const onSuccess = vi.fn();

    render(<ForcedPasswordChangeScreen apiService={apiService} token="token_vero" username="mario" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/Password temporanea/i), { target: { value: 'TempPass1!' } });
    fireEvent.change(screen.getByLabelText('Nuova password'), { target: { value: PASSWORD_VALIDA } });
    fireEvent.change(screen.getByLabelText(/Conferma nuova password/i), { target: { value: PASSWORD_VALIDA } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferma nuova password' }));

    await waitFor(() => {
      expect(screen.getByText('Password temporanea errata')).toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('il pulsante "Esci" chiama onLogout, e non appare affatto se onLogout non è passato', () => {
    const onLogout = vi.fn();
    const { rerender } = render(
      <ForcedPasswordChangeScreen apiService={creaApiServiceFinta()} token="t" username="mario" onLogout={onLogout} />
    );
    fireEvent.click(screen.getByText(/Esci e riprova/i));
    expect(onLogout).toHaveBeenCalled();

    rerender(<ForcedPasswordChangeScreen apiService={creaApiServiceFinta()} token="t" username="mario" />);
    expect(screen.queryByText(/Esci e riprova/i)).not.toBeInTheDocument();
  });
});
