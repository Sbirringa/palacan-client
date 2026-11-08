// tests/ContactSearch.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../src/apiService', () => ({
  searchUsers: vi.fn(),
  sendContactRequest: vi.fn(),
}));

import ContactSearch from '../src/components/ContactSearch.jsx';
import * as apiService from '../src/apiService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ContactSearch — validazione ricerca', () => {
  it('rifiuta una ricerca sotto i 3 caratteri, senza mai chiamare l\'API', () => {
    render(<ContactSearch token="t" />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.submit(input.closest('form'));

    expect(apiService.searchUsers).not.toHaveBeenCalled();
    expect(screen.getByText('Inserisci almeno 3 caratteri per cercare.')).toBeInTheDocument();
  });

  it('con 3+ caratteri, chiama searchUsers e mostra i risultati', async () => {
    apiService.searchUsers.mockResolvedValue([{ id: 'u1', username: 'mario_rossi' }]);

    render(<ContactSearch token="token_vero" />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'mario' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => {
      expect(apiService.searchUsers).toHaveBeenCalledWith('mario', 'token_vero');
      expect(screen.getByText((_, el) => el?.textContent === '@mario_rossi')).toBeInTheDocument();
    });
  });

  it('mostra un messaggio se nessun utente viene trovato', async () => {
    apiService.searchUsers.mockResolvedValue([]);

    render(<ContactSearch token="t" />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'utenteinesistente' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => {
      expect(screen.getByText('Nessun utente trovato.')).toBeInTheDocument();
    });
  });
});

describe('ContactSearch — invio richiesta di contatto', () => {
  it('chiama sendContactRequest e rimuove l\'utente dai risultati dopo il successo', async () => {
    apiService.searchUsers.mockResolvedValue([{ id: 'u1', username: 'mario_rossi' }]);
    apiService.sendContactRequest.mockResolvedValue({ ok: true });
    const onContactAdded = vi.fn();

    render(<ContactSearch token="token_vero" onContactAdded={onContactAdded} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'mario' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => screen.getByText((_, el) => el?.textContent === '@mario_rossi'));

    fireEvent.click(screen.getByRole('button', { name: /connetti|aggiungi|invia/i }));

    await waitFor(() => {
      expect(apiService.sendContactRequest).toHaveBeenCalledWith('mario_rossi', 'token_vero');
      expect(onContactAdded).toHaveBeenCalledWith('mario_rossi');
    });

    // Rimosso dai risultati dopo l'invio riuscito.
    expect(screen.queryByText((_, el) => el?.textContent === '@mario_rossi')).not.toBeInTheDocument();
  });

  it('se la richiesta fallisce (es. già amici), l\'utente resta nei risultati e nessun onContactAdded viene chiamato', async () => {
    apiService.searchUsers.mockResolvedValue([{ id: 'u1', username: 'mario_rossi' }]);
    apiService.sendContactRequest.mockRejectedValue(new Error('Siete già amici'));
    const onContactAdded = vi.fn();

    render(<ContactSearch token="token_vero" onContactAdded={onContactAdded} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'mario' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => screen.getByText((_, el) => el?.textContent === '@mario_rossi'));
    fireEvent.click(screen.getByRole('button', { name: /connetti|aggiungi|invia/i }));

    await waitFor(() => {
      expect(apiService.sendContactRequest).toHaveBeenCalled();
    });

    expect(onContactAdded).not.toHaveBeenCalled();
    // L'utente resta visibile - il fallimento non lo rimuove otticamente.
    expect(screen.getByText((_, el) => el?.textContent === '@mario_rossi')).toBeInTheDocument();
  });
});
