// tests/invitoLingue.test.jsx
//
// Pagina d'invito nelle cinque lingue: si cambia lingua dal vivo, e ogni lingua ha tutti i testi.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import i18n from '../src/i18n';
import { TESTI_INVITO, testiInvito } from '../src/components/testiInvito';

vi.mock('../src/apiService', () => ({
  getInviteLinkInfo: vi.fn(async () => ({ inviter_username: 'mario' })),
  setPendingInviteToken: vi.fn(),
}));
vi.mock('react-router-dom', () => ({ useParams: () => ({ token: 'TOKEN123' }) }));

import InviteLandingPage from '../src/components/InviteLandingPage.jsx';

describe('pagina d\'invito nelle cinque lingue', () => {
  it('ogni lingua ha tutti i testi, non vuoti, e nessuno nomina CipherTalk', () => {
    const chiavi = Object.keys(TESTI_INVITO.en);
    for (const [lingua, testi] of Object.entries(TESTI_INVITO)) {
      expect(Object.keys(testi).sort(), lingua).toEqual([...chiavi].sort());
      for (const chiave of chiavi) {
        const valore = typeof testi[chiave] === 'function' ? testi[chiave]('mario') : testi[chiave];
        expect(typeof valore, `${lingua}.${chiave}`).toBe('string');
        expect(valore.trim().length, `${lingua}.${chiave}`).toBeGreaterThan(0);
        expect(valore, `${lingua}.${chiave}`).not.toMatch(/ciphertalk/i);
      }
      expect(testi.invitatoDa('mario'), lingua).toContain('Palacan');
      expect(testi.invitatoDa('mario'), lingua).toContain('mario');
    }
  });

  it('una lingua sconosciuta usa l\'inglese', () => {
    expect(testiInvito('xx')).toBe(TESTI_INVITO.en);
    expect(testiInvito(undefined)).toBe(TESTI_INVITO.en);
    expect(testiInvito('it-IT')).toBe(TESTI_INVITO.it);
  });

  it('cambiando lingua dal selettore la pagina cambia testi dal vivo', async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
    render(<InviteLandingPage isAuthenticated={false} />);
    await waitFor(() => { expect(screen.getByText('mario invited you to Palacan')).toBeInTheDocument(); });

    await act(async () => { await i18n.changeLanguage('it'); });
    expect(screen.getByText('mario ti ha invitato su Palacan')).toBeInTheDocument();
    expect(screen.getByText('Crea un account')).toBeInTheDocument();

    await act(async () => { await i18n.changeLanguage('de'); });
    expect(screen.getByText('mario hat dich zu Palacan eingeladen')).toBeInTheDocument();
    expect(screen.getByText('Konto erstellen')).toBeInTheDocument();

    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByText('mario invited you to Palacan')).toBeInTheDocument();
  });
});
