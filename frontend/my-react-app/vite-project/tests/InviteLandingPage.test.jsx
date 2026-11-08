// tests/InviteLandingPage.test.jsx
//
// Pagina d'invito di Palacan. Stessa logica di sempre (verificata sul file vero): il token viene da useParams()
// (react-router), non da una prop; 4 stati: loading/valid/invalid/redeeming, ogni fallimento diventa "invalid".
// Testi nelle cinque lingue (testiInvito.js): qui si verificano quelli inglesi, la lingua predefinita.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../src/apiService', () => ({
  getInviteLinkInfo: vi.fn(),
  setPendingInviteToken: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ token: 'TOKEN123' }),
}));

import InviteLandingPage from '../src/components/InviteLandingPage.jsx';
import * as apiService from '../src/apiService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InviteLandingPage — caricamento iniziale (utente NON autenticato)', () => {
  it('chiama getInviteLinkInfo con il token da useParams', async () => {
    apiService.getInviteLinkInfo.mockResolvedValue({ inviter_username: 'mario' });
    render(<InviteLandingPage isAuthenticated={false} />);
    await waitFor(() => {
      expect(apiService.getInviteLinkInfo).toHaveBeenCalledWith('TOKEN123');
    });
  });

  it('mostra il caricamento mentre legge l\'invito', () => {
    apiService.getInviteLinkInfo.mockReturnValue(new Promise(() => {})); // mai risolta
    render(<InviteLandingPage isAuthenticated={false} />);
    expect(screen.getByText('Opening your invite…')).toBeInTheDocument();
  });

  it('un invito valido salva il token come "pending" e mostra il nome di chi invita', async () => {
    apiService.getInviteLinkInfo.mockResolvedValue({ inviter_username: 'mario' });
    render(<InviteLandingPage isAuthenticated={false} />);

    await waitFor(() => {
      expect(screen.getByText('mario invited you to Palacan')).toBeInTheDocument();
    });
    expect(apiService.setPendingInviteToken).toHaveBeenCalledWith('TOKEN123');
  });

  it('senza inviter_username usa la frase senza nome', async () => {
    apiService.getInviteLinkInfo.mockResolvedValue({});
    render(<InviteLandingPage isAuthenticated={false} />);

    await waitFor(() => {
      expect(screen.getByText("You've been invited to Palacan")).toBeInTheDocument();
    });
  });

  it('dice che serve un account per entrare nella chat', async () => {
    apiService.getInviteLinkInfo.mockResolvedValue({ inviter_username: 'mario' });
    render(<InviteLandingPage isAuthenticated={false} />);
    await waitFor(() => {
      expect(screen.getByText(/your contact request will reach them/)).toBeInTheDocument();
    });
  });

  it('mostra il nome della conversazione SOLO se e\' nel link (dopo il #), mai quello del server', async () => {  // [palacan-metadati-a3.2b1]
    window.location.hash = '#n=Progetto%20X';
    apiService.getInviteLinkInfo.mockResolvedValue({ inviter_username: 'mario', room_name: 'Dal server' });
    render(<InviteLandingPage isAuthenticated={false} />);

    await waitFor(() => {
      expect(screen.getByText('Conversation: Progetto X')).toBeInTheDocument();
    });
    expect(screen.queryByText('Conversation: Dal server')).toBeNull();
    window.location.hash = '';
    window.localStorage.clear();
  });

  it('senza nome nel link non mostra nessuna conversazione', async () => {
    apiService.getInviteLinkInfo.mockResolvedValue({ inviter_username: 'mario', room_name: 'Dal server' });
    render(<InviteLandingPage isAuthenticated={false} />);
    await waitFor(() => { expect(screen.getByText('mario invited you to Palacan')).toBeInTheDocument(); });
    expect(screen.queryByText(/Conversation:/)).toBeNull();
  });

  it('mostra l\'avviso password SOLO se requires_password e\' true', async () => {
    apiService.getInviteLinkInfo.mockResolvedValue({ inviter_username: 'mario', requires_password: true });
    render(<InviteLandingPage isAuthenticated={false} />);

    await waitFor(() => {
      expect(screen.getByText(/You'll also need a password/)).toBeInTheDocument();
    });
  });

  it('senza requires_password l\'avviso password non c\'e\'', async () => {
    apiService.getInviteLinkInfo.mockResolvedValue({ inviter_username: 'mario' });
    render(<InviteLandingPage isAuthenticated={false} />);
    await waitFor(() => { expect(screen.getByText('mario invited you to Palacan')).toBeInTheDocument(); });
    expect(screen.queryByText(/You'll also need a password/)).toBeNull();
  });

  it('un errore mostra "invito non disponibile" con la spiegazione nella lingua dell\'utente', async () => {
    apiService.getInviteLinkInfo.mockRejectedValue(new Error('Link scaduto da tempo'));
    render(<InviteLandingPage isAuthenticated={false} />);

    await waitFor(() => {
      expect(screen.getByText('This invite is no longer available')).toBeInTheDocument();
      expect(screen.getByText(/The link may have expired or already been used/)).toBeInTheDocument();
    });
  });

  it('un errore senza messaggio mostra comunque la stessa spiegazione', async () => {
    apiService.getInviteLinkInfo.mockRejectedValue(new Error());
    render(<InviteLandingPage isAuthenticated={false} />);

    await waitFor(() => {
      expect(screen.getByText('This invite is no longer available')).toBeInTheDocument();
    });
  });

  it('il marchio e\' Palacan: PALACAN nella pagina, mai CipherTalk', async () => {
    apiService.getInviteLinkInfo.mockResolvedValue({ inviter_username: 'mario' });
    const { container } = render(<InviteLandingPage isAuthenticated={false} />);
    await waitFor(() => { expect(screen.getByText('mario invited you to Palacan')).toBeInTheDocument(); });
    expect(container.textContent).toContain('PALACAN');
    expect(container.textContent).not.toMatch(/ciphertalk/i);
  });
});

describe('InviteLandingPage — pulsanti account (non autenticato)', () => {
  it('"Create an account" chiama onShowPersonalRegister, "I already have an account" chiama onShowPersonalLogin', async () => {
    apiService.getInviteLinkInfo.mockResolvedValue({ inviter_username: 'mario' });
    const onShowPersonalLogin = vi.fn();
    const onShowPersonalRegister = vi.fn();

    render(
      <InviteLandingPage
        isAuthenticated={false}
        onShowPersonalLogin={onShowPersonalLogin}
        onShowPersonalRegister={onShowPersonalRegister}
      />
    );
    await waitFor(() => screen.getByText('Create an account'));

    fireEvent.click(screen.getByText('Create an account'));
    expect(onShowPersonalRegister).toHaveBeenCalled();
    expect(onShowPersonalLogin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('I already have an account'));
    expect(onShowPersonalLogin).toHaveBeenCalled();
  });
});

describe('InviteLandingPage — utente GIA\' autenticato: ingresso automatico', () => {
  it('chiama onRedeemNow automaticamente, senza mostrare i pulsanti account', async () => {
    apiService.getInviteLinkInfo.mockResolvedValue({ inviter_username: 'mario' });
    const onRedeemNow = vi.fn().mockReturnValue(new Promise(() => {})); // mai risolta

    render(<InviteLandingPage isAuthenticated={true} onRedeemNow={onRedeemNow} />);

    await waitFor(() => {
      expect(onRedeemNow).toHaveBeenCalledWith('TOKEN123');
      expect(screen.getByText('Sending your contact request…')).toBeInTheDocument();
    });
    expect(screen.queryByText('Create an account')).not.toBeInTheDocument();
    expect(screen.queryByText('I already have an account')).not.toBeInTheDocument();
  });

  it('se onRedeemNow fallisce, mostra l\'errore invece di restare bloccato sul caricamento', async () => {
    apiService.getInviteLinkInfo.mockResolvedValue({ inviter_username: 'mario' });
    const onRedeemNow = vi.fn().mockRejectedValue(new Error('Stanza piena'));

    render(<InviteLandingPage isAuthenticated={true} onRedeemNow={onRedeemNow} />);

    await waitFor(() => {
      expect(screen.getByText('This invite is no longer available')).toBeInTheDocument();
    });
    expect(screen.queryByText('Sending your contact request…')).toBeNull();
  });
});
