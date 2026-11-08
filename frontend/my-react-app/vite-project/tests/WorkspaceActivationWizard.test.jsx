// tests/WorkspaceActivationWizard.test.jsx
//
// Componente puramente presentazionale/controllato: tutto lo stato
// (companyName, enterpriseUsername, ecc.) e la logica (onSubmit)
// arrivano da prop del genitore. Verificato il file vero riga per
// riga prima di scrivere questi test.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

import WorkspaceActivationWizard from '../src/components/WorkspaceActivationWizard.jsx';

function propsBase(overrides = {}) {
  return {
    isActivationMode: false,
    onSwitchToActivation: vi.fn(),
    companyName: '',
    setCompanyName: vi.fn(),
    enterpriseUsername: '',
    setEnterpriseUsername: vi.fn(),
    enterprisePassword: '',
    setEnterprisePassword: vi.fn(),
    licenseToken: '',
    setLicenseToken: vi.fn(),
    onSubmit: vi.fn((e) => e.preventDefault()),
    onClose: vi.fn(),
    enterpriseError: '',
    loading: false,
    isOlmReady: true,
    ...overrides,
  };
}

describe('WorkspaceActivationWizard — modalità login vs attivazione', () => {
  it('in modalità login (isActivationMode=false), il campo licenza NON è presente', () => {
    render(<WorkspaceActivationWizard {...propsBase({ isActivationMode: false })} />);
    expect(screen.queryByLabelText(/workspace.license_label/)).not.toBeInTheDocument();
  });

  it('in modalità attivazione (isActivationMode=true), il campo licenza È presente', () => {
    render(<WorkspaceActivationWizard {...propsBase({ isActivationMode: true })} />);
    expect(screen.getByLabelText(/workspace.license_label/)).toBeInTheDocument();
  });

  it('senza onSwitchToActivation passata, nessun pulsante di switch aggiuntivo appare', () => {
    render(<WorkspaceActivationWizard {...propsBase({ isActivationMode: false, onSwitchToActivation: null })} />);
    // Con onSwitchToActivation null, deve esserci un SOLO pulsante che
    // contiene testo riferito a "activate" - nessuno, dato che siamo in
    // modalita' login e il pulsante submit dice "title_login".
    expect(screen.queryByText('workspace.title_activate')).not.toBeInTheDocument();
  });

  it('in modalità attivazione, non appare mai un secondo pulsante di switch (solo submit + annulla)', () => {
    render(<WorkspaceActivationWizard {...propsBase({ isActivationMode: true, onSwitchToActivation: vi.fn() })} />);
    // In modalita' attivazione il pulsante di switch non deve MAI
    // apparire, indipendentemente da onSwitchToActivation - ci devono
    // essere esattamente 2 pulsanti oltre alla X di chiusura (submit + annulla).
    const pulsanti = screen.getAllByRole('button');
    expect(pulsanti).toHaveLength(3); // chiudi (X) + submit + annulla
  });
});

describe('WorkspaceActivationWizard — input controllati', () => {
  it('scrivere nel campo azienda chiama setCompanyName con il valore digitato', () => {
    const setCompanyName = vi.fn();
    render(<WorkspaceActivationWizard {...propsBase({ setCompanyName })} />);
    fireEvent.change(screen.getByLabelText(/workspace.company_label/), { target: { value: 'Acme Srl' } });
    expect(setCompanyName).toHaveBeenCalledWith('Acme Srl');
  });

  it('scrivere nel campo username chiama setEnterpriseUsername', () => {
    const setEnterpriseUsername = vi.fn();
    render(<WorkspaceActivationWizard {...propsBase({ setEnterpriseUsername })} />);
    fireEvent.change(screen.getByLabelText(/workspace.username_label/), { target: { value: 'mario' } });
    expect(setEnterpriseUsername).toHaveBeenCalledWith('mario');
  });

  it('scrivere nel campo password chiama setEnterprisePassword', () => {
    const setEnterprisePassword = vi.fn();
    render(<WorkspaceActivationWizard {...propsBase({ setEnterprisePassword })} />);
    fireEvent.change(screen.getByLabelText(/workspace.password_label/), { target: { value: 'segreta' } });
    expect(setEnterprisePassword).toHaveBeenCalledWith('segreta');
  });

  it('scrivere nel campo licenza (solo in modalita\' attivazione) chiama setLicenseToken', () => {
    const setLicenseToken = vi.fn();
    render(<WorkspaceActivationWizard {...propsBase({ isActivationMode: true, setLicenseToken })} />);
    fireEvent.change(screen.getByLabelText(/workspace.license_label/), { target: { value: 'LIC-123' } });
    expect(setLicenseToken).toHaveBeenCalledWith('LIC-123');
  });
});

describe('WorkspaceActivationWizard — stato loading e isOlmReady', () => {
  it('il pulsante submit è disabilitato quando loading è true', () => {
    render(<WorkspaceActivationWizard {...propsBase({ loading: true })} />);
    expect(screen.getByRole('button', { name: /workspace.submit_logging_in/ })).toBeDisabled();
  });

  it('il pulsante submit è disabilitato quando isOlmReady è false, anche se loading è false', () => {
    render(<WorkspaceActivationWizard {...propsBase({ loading: false, isOlmReady: false })} />);
    expect(screen.getByRole('button', { name: /workspace.title_login/ })).toBeDisabled();
  });

  it('quando isOlmReady è false, mostra l\'indicatore "in preparazione"', () => {
    render(<WorkspaceActivationWizard {...propsBase({ isOlmReady: false })} />);
    expect(screen.getByText(/workspace.preparing/)).toBeInTheDocument();
  });

  it('tutti gli input e i pulsanti "Annulla"/chiudi sono disabilitati durante il caricamento', () => {
    render(<WorkspaceActivationWizard {...propsBase({ loading: true })} />);
    expect(screen.getByLabelText(/workspace.company_label/)).toBeDisabled();
    expect(screen.getByLabelText(/workspace.username_label/)).toBeDisabled();
    expect(screen.getByLabelText(/workspace.password_label/)).toBeDisabled();
    expect(screen.getByText('workspace.cancel')).toBeDisabled();
  });
});

describe('WorkspaceActivationWizard — chiusura', () => {
  it('il pulsante "Annulla" chiama onClose', () => {
    const onClose = vi.fn();
    render(<WorkspaceActivationWizard {...propsBase({ onClose })} />);
    fireEvent.click(screen.getByText('workspace.cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it("il pulsante Annulla NON chiama onClose se loading e attivo (disabilitato)", () => {
    const onClose = vi.fn();
    render(<WorkspaceActivationWizard {...propsBase({ onClose, loading: true })} />);
    fireEvent.click(screen.getByText('workspace.cancel'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('WorkspaceActivationWizard — errori e sottomissione', () => {
  it('mostra il messaggio di errore quando enterpriseError è presente', () => {
    render(<WorkspaceActivationWizard {...propsBase({ enterpriseError: 'Credenziali non valide' })} />);
    expect(screen.getByText('Credenziali non valide')).toBeInTheDocument();
  });

  it('sottomettere il modulo chiama onSubmit', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(<WorkspaceActivationWizard {...propsBase({ onSubmit })} />);
    fireEvent.click(screen.getByRole('button', { name: /workspace.title_login/ }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('cliccare "passa ad attivazione" chiama onSwitchToActivation', () => {
    const onSwitchToActivation = vi.fn();
    render(<WorkspaceActivationWizard {...propsBase({ isActivationMode: false, onSwitchToActivation })} />);
    fireEvent.click(screen.getByRole('button', { name: 'workspace.title_activate' }));
    expect(onSwitchToActivation).toHaveBeenCalled();
  });
});
