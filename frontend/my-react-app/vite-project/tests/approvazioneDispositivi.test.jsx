// tests/approvazioneDispositivi.test.jsx  [palacan-l4c4]
//
// L4c4 (Chiusura limiti): un dispositivo nuovo senza la frase del backup viene approvato da uno vecchio che ha la
// chiave principale, confrontando un codice di 8 cifre. Crittografia VERA (ed25519 + ML-DSA-65), server finto.
//   - codice: stesso dai due lati se la chiave e' la stessa, diverso se il server la cambia;
//   - il dispositivo nuovo e' "da approvare", poi "approvato" quando trova la firma sulla SUA chiave vera (una firma
//     fatta su un'altra chiave non conta);
//   - il pannello "I miei dispositivi": sul dispositivo vecchio "Da approvare" con il codice e il pulsante, che firma;
//     sul dispositivo nuovo, in alto, il suo codice.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// t sempre la stessa funzione (come la vera i18next): il pannello la usa tra le dipendenze del caricamento
vi.mock('react-i18next', () => {
  const t = (key, opts) => (typeof opts === 'object' && opts?.defaultValue) || (typeof opts === 'string' ? opts : key);
  const valore = { t };
  return { useTranslation: () => valore };
});

vi.mock('../src/apiService.js', () => ({
  getMyDevices: vi.fn(),
  revokeDevice: vi.fn(),
  getChiavePrincipale: vi.fn(),
  putChiavePrincipale: vi.fn(),
  putFirmaDispositivo: vi.fn(),
}));

import * as apiService from '../src/apiService.js';
import * as olmService from '../src/olmService.js';
import Olm from '../src/crypto/olm.js';
import { _usaArchivio } from '../src/utils/chiaveDispositivo';
import * as cp from '../src/utils/chiavePrincipale';
import { improntaDi } from '../src/utils/firmaPq';

const MODULO = '../src/utils/approvazioneDispositivi.js';
let ap = null;

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
  await olmService.initOlm();
  ap = await import(/* @vite-ignore */ MODULO).catch(() => null);
});

function carica() {
  expect(ap, 'manca l\'approvazione dei dispositivi').not.toBeNull();
  return ap;
}

function archivioInMemoria() {
  const m = new Map();
  return () => ({ leggi: async (v) => m.get(v), prendiOCrea: async (v, n) => { if (!m.has(v)) m.set(v, n); return m.get(v); } });
}

// server finto con le regole di L4c1 (chiave principale, firme) e di L4c4 (elenco dei propri dispositivi)
function server() {
  const s = { principale: null, firme: new Map(), dispositivi: new Map() };
  const errore = (status, msg) => Object.assign(new Error(msg), { status });
  apiService.getChiavePrincipale.mockImplementation(async () => {
    if (!s.principale) throw errore(404, 'Chiave principale non trovata');
    return { ...s.principale };
  });
  apiService.putChiavePrincipale.mockImplementation(async (dati) => {
    const impronta = await improntaDi(dati.pq);
    if (s.principale && s.principale.impronta !== impronta) throw errore(409, 'gia\' presente');
    s.principale = { ...dati, impronta, versione: 1 };
    return s.principale;
  });
  apiService.putFirmaDispositivo.mockImplementation(async (deviceId, dati) => {
    if (!s.principale || dati.impronta_principale !== s.principale.impronta) throw errore(409, 'non attuale');
    s.firme.set(deviceId, { impronta: dati.impronta_principale, firma_ed: dati.firma_ed, firma_pq: dati.firma_pq });
    return { device_id: deviceId };
  });
  apiService.getMyDevices.mockImplementation(async () => [...s.dispositivi.entries()].map(([deviceId, curva], i) => ({
    id: `riga-${i}`, device_id: deviceId, identity_key: curva, display_name: deviceId, last_seen_at: null, revoked_at: null,
    firma_principale: s.firme.get(deviceId) || null,
  })));
  return s;
}

function nuovoDispositivo() {
  localStorage.clear();
  _usaArchivio(archivioInMemoria());
  cp._azzeraChiavePrincipale();
}

const prepara = (deviceId, curva) => cp.assicuraChiavePrincipale({ io: 'bob', token: 't', dispositivo: deviceId, curva, api: apiService });

beforeEach(() => {
  vi.clearAllMocks();
  nuovoDispositivo();
});

describe('L4c4 - approvazione di un dispositivo nuovo', () => {
  it('codice di confronto: 8 cifre, uguale per la stessa chiave, diverso se il server la cambia', async () => {
    const a = carica();
    const c = await a.codiceApprovazione('Bob', 'D-tel', 'CURVA_TEL');
    expect(c).toMatch(/^\d{4} \d{4}$/);
    expect(await a.codiceApprovazione('bob', 'D-tel', 'CURVA_TEL')).toBe(c);
    expect(await a.codiceApprovazione('bob', 'D-tel', 'CURVA_FALSA')).not.toBe(c);
    expect(await a.codiceApprovazione('bob', 'D-altro', 'CURVA_TEL')).not.toBe(c);
  });

  it('dispositivo nuovo: da approvare, poi approvato dalla firma sulla SUA chiave vera (non su un\'altra)', async () => {
    carica();
    const s = server();
    s.dispositivi.set('D-pc', 'CURVA_PC');
    s.dispositivi.set('D-tel', 'CURVA_TEL');
    expect((await prepara('D-pc', 'CURVA_PC')).stato).toBe('firmato');
    expect(cp.statoQuestoDispositivo('bob').stato).toBe('firmato');
    const chiave = cp.chiavePrincipalePerBackup('bob');
    nuovoDispositivo();
    expect((await prepara('D-tel', 'CURVA_TEL')).stato).toBe('da_approvare');
    expect(cp.statoQuestoDispositivo('bob')).toEqual({ io: 'bob', dispositivo: 'D-tel', curva: 'CURVA_TEL', stato: 'da_approvare' });
    // il server mette una firma VERA ma fatta su un'altra chiave (la sua, finta) per questo dispositivo: non conta
    const finta = cp.firmaConPrincipale(chiave, cp.CONTESTO_DISPOSITIVO, cp.testoFirmaDispositivo('bob', 'D-tel', 'CURVA_FALSA'));
    s.firme.set('D-tel', { impronta: chiave.impronta, firma_ed: finta.fe, firma_pq: finta.fq });
    expect((await prepara('D-tel', 'CURVA_TEL')).stato, 'approvato da una firma su un\'altra chiave').toBe('da_approvare');
    // il dispositivo vecchio lo approva davvero
    const vera = cp.firmaConPrincipale(chiave, cp.CONTESTO_DISPOSITIVO, cp.testoFirmaDispositivo('bob', 'D-tel', 'CURVA_TEL'));
    s.firme.set('D-tel', { impronta: chiave.impronta, firma_ed: vera.fe, firma_pq: vera.fq });
    expect((await prepara('D-tel', 'CURVA_TEL')).stato).toBe('approvato');
  });

  it('pannello sul dispositivo vecchio: "Da approvare" con il codice; approvare firma il dispositivo', async () => {
    const a = carica();
    const s = server();
    const mio = olmService.getOrCreateDeviceId();
    s.dispositivi.set(mio, 'CURVA_PC');
    s.dispositivi.set('D-tel', 'CURVA_TEL');
    expect((await prepara(mio, 'CURVA_PC')).stato).toBe('firmato');
    const { default: Pannello } = await import('../src/components/DeviceManagementPanel.jsx');
    render(<Pannello token="t" />);
    const codice = await a.codiceApprovazione('bob', 'D-tel', 'CURVA_TEL');
    await waitFor(() => expect(screen.getByTestId('codice-D-tel')).toHaveTextContent(codice));
    expect(screen.getByText(/Firmato dalla tua chiave principale/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /approva/ }));
    await waitFor(() => expect(apiService.putFirmaDispositivo).toHaveBeenCalledWith('D-tel', expect.any(Object), 't'));
    await waitFor(() => expect(screen.getAllByText(/Firmato dalla tua chiave principale/)).toHaveLength(2));
    expect(screen.queryByTestId('codice-D-tel')).toBeNull();
  });

  it('pannello sul dispositivo nuovo: in alto il suo codice, calcolato dalla sua chiave vera', async () => {
    const a = carica();
    const s = server();
    s.dispositivi.set('D-pc', 'CURVA_PC');
    await prepara('D-pc', 'CURVA_PC');
    nuovoDispositivo();
    const mio = olmService.getOrCreateDeviceId();
    s.dispositivi.set(mio, 'CURVA_DAL_SERVER');  // anche se il server dicesse un'altra chiave, il codice e' della vera
    await prepara(mio, 'CURVA_VERA');
    const { default: Pannello } = await import('../src/components/DeviceManagementPanel.jsx');
    render(<Pannello token="t" />);
    const atteso = await a.codiceApprovazione('bob', mio, 'CURVA_VERA');
    await waitFor(() => expect(screen.getByTestId('codice-questo-dispositivo')).toHaveTextContent(atteso));
    expect(screen.queryByRole('button', { name: /approva/ }), 'un dispositivo senza chiave principale non puo\' approvare').toBeNull();
  });
});
