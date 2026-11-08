// tests/IdentityChangeWarningBanner.test.jsx
//
// Test sul componente banner TOFU - piccolo ma importante: e' l'unica
// interfaccia utente che avvisa di un cambio di identita' sospetto.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../src/olmService', () => ({
  getPeerIdentityChangeWarning: vi.fn(),
  acknowledgePeerIdentityChange: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => (typeof opts === 'object' && opts?.defaultValue) || (typeof opts === 'string' ? opts : key),
  }),
}));

import IdentityChangeWarningBanner from '../src/components/IdentityChangeWarningBanner.jsx';
import { getPeerIdentityChangeWarning, acknowledgePeerIdentityChange } from '../src/olmService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('IdentityChangeWarningBanner', () => {
  it('non mostra nulla se non c\'è nessun avviso attivo', () => {
    getPeerIdentityChangeWarning.mockReturnValue(null);

    const { container } = render(
      <IdentityChangeWarningBanner username="alice" peerUsername="bob" />
    );

    expect(container.firstChild).toBeNull();
  });

  it('mostra il banner se c\'è un avviso attivo per il contatto', () => {
    getPeerIdentityChangeWarning.mockReturnValue({
      previousKey: 'chiave_vecchia',
      newKey: 'chiave_nuova',
      changedAt: Date.now(),
    });

    render(<IdentityChangeWarningBanner username="alice" peerUsername="bob" />);

    expect(screen.getByText(/bob/i)).toBeInTheDocument();
  });

  it('cliccando "Ho capito" chiama acknowledgePeerIdentityChange e il banner sparisce', () => {
    getPeerIdentityChangeWarning.mockReturnValue({
      previousKey: 'chiave_vecchia',
      newKey: 'chiave_nuova',
      changedAt: Date.now(),
    });

    render(<IdentityChangeWarningBanner username="alice" peerUsername="bob" />);

    const bottone = screen.getByRole('button');
    fireEvent.click(bottone);

    expect(acknowledgePeerIdentityChange).toHaveBeenCalledWith('alice', 'bob');
  });

  it('non mostra nulla se manca username o peerUsername', () => {
    const { container } = render(
      <IdentityChangeWarningBanner username={null} peerUsername="bob" />
    );
    expect(container.firstChild).toBeNull();
    expect(getPeerIdentityChangeWarning).not.toHaveBeenCalled();
  });
});
