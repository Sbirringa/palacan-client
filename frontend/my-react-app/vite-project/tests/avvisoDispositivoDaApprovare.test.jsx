// tests/avvisoDispositivoDaApprovare.test.jsx  [palacan-l4c5]
//
// L4c5: un dispositivo che aspetta l'approvazione (firma incrociata, L4c4) lo dice SUBITO, nella chat, con il codice
// di confronto calcolato dalla sua chiave vera e un pulsante per aprire "I miei dispositivi". Niente avviso quando il
// dispositivo e' firmato o approvato; sparisce da solo quando viene approvato; "Piu' tardi" lo nasconde.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('react-i18next', () => {
  const t = (key, opts) => (typeof opts === 'object' && opts?.defaultValue) || (typeof opts === 'string' ? opts : key);
  const valore = { t };
  return { useTranslation: () => valore };
});

let statoFinto = null;
vi.mock('../src/utils/chiavePrincipale', () => ({
  statoQuestoDispositivo: () => (statoFinto ? { ...statoFinto } : null),
  EVENTO_STATO_DISPOSITIVO: 'palacan:stato-dispositivo',
  dispositivoFirmato: () => false,
}));

import { codiceApprovazione } from '../src/utils/approvazioneDispositivi';

const MODULO = '../src/components/AvvisoDispositivoDaApprovare.jsx';
let Avviso = null;

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  const m = await import(/* @vite-ignore */ MODULO).catch(() => null);
  Avviso = m ? m.default : null;
});

function carica() {
  expect(Avviso, 'manca l\'avviso del dispositivo da approvare').not.toBeNull();
  return Avviso;
}

const daApprovare = { io: 'bob', dispositivo: 'D-tel', curva: 'CURVA_TEL', stato: 'da_approvare' };

beforeEach(() => {
  statoFinto = null;
  try { sessionStorage.clear(); } catch (_) { /* niente */ }
});

describe('L4c5 - avviso "dispositivo da approvare" visibile subito', () => {
  it('da approvare: avviso con il codice della chiave vera e il pulsante che apre i dispositivi', async () => {
    const A = carica();
    statoFinto = daApprovare;
    const apri = vi.fn();
    render(<A onApri={apri} />);
    const codice = await codiceApprovazione('bob', 'D-tel', 'CURVA_TEL');
    expect(await screen.findByText(codice)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Apri/ }));
    expect(apri).toHaveBeenCalled();
  });

  it('firmato, approvato o sconosciuto: nessun avviso', async () => {
    const A = carica();
    for (const s of [null, { ...daApprovare, stato: 'firmato' }, { ...daApprovare, stato: 'approvato' }]) {
      statoFinto = s;
      const { container, unmount } = render(<A onApri={() => {}} />);
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });

  it('appare quando lo stato diventa "da approvare" e sparisce da solo quando viene approvato', async () => {
    const A = carica();
    render(<A onApri={() => {}} />);
    expect(screen.queryByTestId('avviso-dispositivo-da-approvare')).toBeNull();
    statoFinto = daApprovare;
    act(() => { window.dispatchEvent(new CustomEvent('palacan:stato-dispositivo')); });
    expect(await screen.findByTestId('avviso-dispositivo-da-approvare')).toBeInTheDocument();
    statoFinto = { ...daApprovare, stato: 'approvato' };
    act(() => { window.dispatchEvent(new CustomEvent('palacan:stato-dispositivo')); });
    expect(screen.queryByTestId('avviso-dispositivo-da-approvare')).toBeNull();
  });

  it('"Piu\' tardi" lo nasconde fino al prossimo accesso', async () => {
    const A = carica();
    statoFinto = daApprovare;
    const { unmount } = render(<A onApri={() => {}} />);
    await screen.findByTestId('avviso-dispositivo-da-approvare');
    fireEvent.click(screen.getAllByRole('button', { name: /Più tardi/ })[0]);
    expect(screen.queryByTestId('avviso-dispositivo-da-approvare')).toBeNull();
    unmount();
    render(<A onApri={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByTestId('avviso-dispositivo-da-approvare')).toBeNull();
  });

  it('collegamento: la chat mostra l\'avviso e il pulsante apre "I miei dispositivi"', () => {
    carica();
    const dash = readFileSync('src/pages/Dashboard.jsx', 'utf8');
    expect(dash).toContain("import AvvisoDispositivoDaApprovare from '../components/AvvisoDispositivoDaApprovare';");
    expect(dash).toContain('<AvvisoDispositivoDaApprovare onApri={() => setShowDeviceManagementPanel(true)} />');
  });
});
