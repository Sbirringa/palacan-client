// tests/ContactsList.test.jsx
//
// Verificato PRIMA di scrivere questi test (non assunto): la regola
// locale "password stanza min 8 caratteri" (riga con
// newRoomPassword.length < 8) e' PIU' severa del vero minimo backend
// (routes/rooms.py: len(room_password) < 4 -> rifiutato, quindi il
// backend accetta gia' da 4 caratteri) - non un bug, il frontend non
// lascia mai passare qualcosa che il backend rifiuterebbe. Confermato
// anche che questa e' l'UNICA regola di questo tipo in tutto il
// frontend, nessuna incoerenza tra componenti diversi.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../src/apiService', () => ({
  getWorkspaceColleagues: vi.fn(),
  getContacts: vi.fn(),
  createRoom: vi.fn(),
  inviteUserToRoom: vi.fn(),
}));

import ContactsList from '../src/components/ContactsList.jsx';
import * as apiService from '../src/apiService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ContactsList — caricamento differenziato consumer/workspace', () => {
  it('senza workspaceId, chiama getContacts (utente consumer)', async () => {
    apiService.getContacts.mockResolvedValue([{ id: '1', username: 'mario', is_active: true }]);

    render(<ContactsList token="t" />);

    await waitFor(() => {
      expect(apiService.getContacts).toHaveBeenCalledWith('t');
      expect(apiService.getWorkspaceColleagues).not.toHaveBeenCalled();
    });
  });

  it('con workspaceId, chiama getWorkspaceColleagues invece di getContacts (dipendente aziendale)', async () => {
    apiService.getWorkspaceColleagues.mockResolvedValue([{ id: '1', username: 'collega', is_active: false }]);

    render(<ContactsList token="t" workspaceId="ws1" />);

    await waitFor(() => {
      expect(apiService.getWorkspaceColleagues).toHaveBeenCalledWith('t');
      expect(apiService.getContacts).not.toHaveBeenCalled();
    });
  });

  it('un errore di caricamento non fa mai crashare il componente - mostra la lista vuota con garbo', async () => {
    apiService.getContacts.mockRejectedValue(new Error('Rete finta non disponibile'));

    render(<ContactsList token="t" />);

    await waitFor(() => {
      expect(screen.getByText('Nessun contatto')).toBeInTheDocument();
    });
  });

  it('ricarica quando refreshTrigger cambia', async () => {
    apiService.getContacts.mockResolvedValue([]);
    const { rerender } = render(<ContactsList token="t" refreshTrigger={1} />);

    await waitFor(() => expect(apiService.getContacts).toHaveBeenCalledTimes(1));

    rerender(<ContactsList token="t" refreshTrigger={2} />);

    await waitFor(() => expect(apiService.getContacts).toHaveBeenCalledTimes(2));
  });
});

describe('ContactsList — creazione chat privata con un contatto', () => {
  it('cliccare un contatto apre il modale con il nome stanza precompilato', async () => {
    apiService.getContacts.mockResolvedValue([{ id: '1', username: 'mario', is_active: true }]);

    render(<ContactsList token="t" />);
    await waitFor(() => screen.getByText('mario'));

    fireEvent.click(screen.getByText('mario'));

    expect(screen.getByDisplayValue('Chat privata con mario')).toBeInTheDocument();
  });

  it('il pulsante "Crea Chat" resta disabilitato sotto gli 8 caratteri di password (scelta UX piu\' severa del backend)', async () => {
    apiService.getContacts.mockResolvedValue([{ id: '1', username: 'mario', is_active: true }]);

    render(<ContactsList token="t" />);
    await waitFor(() => screen.getByText('mario'));
    fireEvent.click(screen.getByText('mario'));

    const inputPassword = screen.getByPlaceholderText(/Password molto forte/i);
    fireEvent.change(inputPassword, { target: { value: 'corta12' } }); // 7 caratteri

    expect(screen.getByRole('button', { name: /crea chat/i })).toBeDisabled();
  });

  it('crea la stanza E invita automaticamente il contatto, in questo ordine', async () => {
    apiService.getContacts.mockResolvedValue([{ id: '1', username: 'mario', is_active: true }]);
    apiService.createRoom.mockResolvedValue({ id: 'room123', name: 'Chat privata con mario' });
    apiService.inviteUserToRoom.mockResolvedValue({ ok: true });
    const onCreateRoom = vi.fn();

    render(<ContactsList token="token_vero" onCreateRoom={onCreateRoom} />);
    await waitFor(() => screen.getByText('mario'));
    fireEvent.click(screen.getByText('mario'));

    fireEvent.change(screen.getByPlaceholderText(/Password molto forte/i), { target: { value: 'PasswordSicura1!' } });
    fireEvent.click(screen.getByRole('button', { name: /crea chat/i }));

    await waitFor(() => {
      expect(apiService.createRoom).toHaveBeenCalledWith('', 'PasswordSicura1!', 'token_vero');  // [palacan-metadati-a3.2a] il nome non va piu' al server
      expect(apiService.inviteUserToRoom).toHaveBeenCalledWith('room123', 'mario', 'token_vero');
      expect(onCreateRoom).toHaveBeenCalledWith({ id: 'room123', name: 'Chat privata con mario' });
    });
  });

  it('se l\'invito automatico fallisce, la stanza resta comunque creata (fallimento non bloccante)', async () => {
    apiService.getContacts.mockResolvedValue([{ id: '1', username: 'mario', is_active: true }]);
    apiService.createRoom.mockResolvedValue({ id: 'room123', name: 'Chat privata con mario' });
    apiService.inviteUserToRoom.mockRejectedValue(new Error('Invito fallito'));
    const onCreateRoom = vi.fn();

    render(<ContactsList token="t" onCreateRoom={onCreateRoom} />);
    await waitFor(() => screen.getByText('mario'));
    fireEvent.click(screen.getByText('mario'));

    fireEvent.change(screen.getByPlaceholderText(/Password molto forte/i), { target: { value: 'PasswordSicura1!' } });
    fireEvent.click(screen.getByRole('button', { name: /crea chat/i }));

    await waitFor(() => {
      // La stanza e' stata comunque creata e la callback chiamata,
      // nonostante l'invito automatico sia fallito.
      expect(onCreateRoom).toHaveBeenCalled();
    });
  });
});

