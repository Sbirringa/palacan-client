// tests/DeviceManagementPanel.test.jsx
//
// Test sul pannello self-service "I miei dispositivi" - la revoca di
// un dispositivo e' un'operazione di sicurezza reale (un dispositivo
// compromesso deve poter essere disconnesso con certezza).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../src/apiService', () => ({
  getMyDevices: vi.fn(),
  revokeDevice: vi.fn(),
}));

// FIX (scoperto con un test che si bloccava sul caricamento, mai
// assunto): la libreria vera mantiene un riferimento STABILE alla
// funzione t() tra un render e l'altro. Se il mock ne restituisse una
// nuova ogni volta, loadDevices() (che dipende da t nel suo useCallback)
// verrebbe ricreata ad ogni render, l'effetto scatterebbe di nuovo
// all'infinito - un ciclo che non esiste nell'app vera, solo un
// artefatto del mock. t definita FUORI dal factory, sempre la stessa.
const tStabile = (key, fallback) => fallback || key;
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tStabile }),
}));

import DeviceManagementPanel from '../src/components/DeviceManagementPanel.jsx';
import * as apiService from '../src/apiService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DeviceManagementPanel — caricamento', () => {
  it('mostra la lista dei dispositivi dopo il caricamento', async () => {
    apiService.getMyDevices.mockResolvedValue([
      { id: 'dev1', display_name: 'iPhone di Mario', last_seen_at: '2026-01-01T10:00:00Z', revoked_at: null },
    ]);

    render(<DeviceManagementPanel token="token_test" />);

    await waitFor(() => {
      expect(screen.getByText('iPhone di Mario')).toBeInTheDocument();
    });
  });

  it('mostra un errore se il caricamento fallisce, senza mai far crashare il componente', async () => {
    apiService.getMyDevices.mockRejectedValue(new Error('Rete finta non disponibile'));

    render(<DeviceManagementPanel token="token_test" />);

    await waitFor(() => {
      expect(screen.getByText('Errore nel caricamento dei dispositivi.')).toBeInTheDocument();
    });
  });

  it('senza token, non chiama mai l\'API', () => {
    render(<DeviceManagementPanel token={null} />);
    expect(apiService.getMyDevices).not.toHaveBeenCalled();
  });
});

describe('DeviceManagementPanel — revoca (operazione di sicurezza)', () => {
  it('un dispositivo GIA\' revocato non mostra MAI il pulsante di revoca, solo il badge', async () => {
    apiService.getMyDevices.mockResolvedValue([
      { id: 'dev1', display_name: 'Dispositivo Vecchio', last_seen_at: '2026-01-01T10:00:00Z', revoked_at: '2026-01-02T10:00:00Z' },
    ]);

    render(<DeviceManagementPanel token="token_test" />);

    await waitFor(() => {
      expect(screen.getByText('Dispositivo Vecchio')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /revoca/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Revocato/)).toBeInTheDocument();
  });

  it('cliccare "Revoca" chiama revokeDevice con l\'id giusto, poi ricarica la lista aggiornata', async () => {
    apiService.getMyDevices
      .mockResolvedValueOnce([
        { id: 'dev1', display_name: 'iPhone di Mario', last_seen_at: '2026-01-01T10:00:00Z', revoked_at: null },
      ])
      .mockResolvedValueOnce([
        { id: 'dev1', display_name: 'iPhone di Mario', last_seen_at: '2026-01-01T10:00:00Z', revoked_at: '2026-01-03T10:00:00Z' },
      ]);
    apiService.revokeDevice.mockResolvedValue({ ok: true });

    render(<DeviceManagementPanel token="token_test" />);

    await waitFor(() => screen.getByText('iPhone di Mario'));

    fireEvent.click(screen.getByRole('button', { name: /revoca/i }));

    expect(apiService.revokeDevice).toHaveBeenCalledWith('dev1', 'token_test');

    await waitFor(() => {
      expect(screen.getByText(/Revocato/)).toBeInTheDocument();
    });

    // La lista e' stata ricaricata DAVVERO dal server (seconda chiamata),
    // non solo aggiornata otticamente in locale - fondamentale per
    // un'operazione di sicurezza: lo stato mostrato deve riflettere
    // quello vero sul server, non un'illusione ottimistica.
    expect(apiService.getMyDevices).toHaveBeenCalledTimes(2);
  });

  it('un secondo click sullo STESSO dispositivo mentre la revoca è già in corso NON manda una seconda richiesta', async () => {
    apiService.getMyDevices.mockResolvedValue([
      { id: 'dev1', display_name: 'iPhone di Mario', last_seen_at: '2026-01-01T10:00:00Z', revoked_at: null },
    ]);
    // La revoca resta "in sospeso" finche' non la risolviamo noi a mano,
    // per avere il tempo di cliccare una seconda volta nel frattempo.
    let risolviRevoca;
    apiService.revokeDevice.mockReturnValue(new Promise((r) => { risolviRevoca = r; }));

    render(<DeviceManagementPanel token="token_test" />);
    await waitFor(() => screen.getByText('iPhone di Mario'));

    const bottone = screen.getByRole('button', { name: /revoca/i });
    fireEvent.click(bottone);
    fireEvent.click(bottone); // secondo click, mentre la prima revoca e' ancora in sospeso
    fireEvent.click(bottone); // terzo, per sicurezza

    expect(apiService.revokeDevice).toHaveBeenCalledTimes(1);

    // Risolviamo la promise sospesa per non lasciare il test appeso.
    risolviRevoca({ ok: true });
  });

  it('se la revoca fallisce, mostra un errore e il dispositivo resta NON revocato (mai un falso "revocato" ottimistico)', async () => {
    apiService.getMyDevices.mockResolvedValue([
      { id: 'dev1', display_name: 'iPhone di Mario', last_seen_at: '2026-01-01T10:00:00Z', revoked_at: null },
    ]);
    apiService.revokeDevice.mockRejectedValue(new Error('Il server ha rifiutato la revoca'));

    render(<DeviceManagementPanel token="token_test" />);
    await waitFor(() => screen.getByText('iPhone di Mario'));

    fireEvent.click(screen.getByRole('button', { name: /revoca/i }));

    await waitFor(() => {
      expect(screen.getByText('Errore nella revoca del dispositivo.')).toBeInTheDocument();
    });

    // Il dispositivo NON deve apparire come revocato se il server ha rifiutato.
    expect(screen.queryByText(/Revocato/)).not.toBeInTheDocument();
  });
});
