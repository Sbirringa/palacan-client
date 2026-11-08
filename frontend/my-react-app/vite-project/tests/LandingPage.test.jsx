// tests/LandingPage.test.jsx
//
// Test della home reale (LandingPage.jsx) dopo il redesign "Da ogni punto di vista".
// Stesso scopo del test precedente (la pagina si monta senza crash e mostra il
// contenuto chiave reale), in piu' verifica che:
//   - i pulsanti chiamino davvero le funzioni passate da App.jsx
//   - lo username scelto nella home arrivi alla registrazione (sessionStorage)
//   - la frase principale esista in tutte e 5 le lingue
// L'ambiente di test (jsdom) non ha canvas, matchMedia ne' IntersectionObserver:
// la home deve comunque montarsi, mostrandosi ferma e composta.
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import Landing from '../src/components/LandingPage.jsx';

function renderLanding(props = {}, lingua) {
  const funzioni = {
    onShowPersonalLogin: vi.fn(),
    onShowPersonalRegister: vi.fn(),
    onEnterpriseLogin: vi.fn(),
    onEnterpriseActivate: vi.fn(),
  };
  let albero = (
    <MemoryRouter>
      <Landing isOlmReady={true} {...funzioni} {...props} />
    </MemoryRouter>
  );
  if (lingua) {
    const i18n = i18next.createInstance();
    i18n.use(initReactI18next).init({ lng: lingua, resources: { [lingua]: { translation: {} } } });
    albero = <I18nextProvider i18n={i18n}>{albero}</I18nextProvider>;
  }
  return { ...render(albero), funzioni };
}

beforeAll(() => {
  // jsdom non ha il canvas: invece di lasciargli stampare "Not implemented" a ogni tentativo,
  // dichiariamo esplicitamente che non c'e' (la home deve mostrarsi ferma e composta).
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
});

beforeEach(() => {
  sessionStorage.clear();
});

describe('LandingPage — contenuto chiave reale', () => {
  it('si renderizza senza crash (anche senza canvas, matchMedia e IntersectionObserver)', () => {
    expect(() => renderLanding()).not.toThrow();
  });

  it("mostra il marchio e la frase principale dell'ingresso", () => {
    renderLanding();
    expect(screen.getAllByText(/PALACAN/).length).toBeGreaterThan(0);
    expect(screen.getByText('Private. From every point of view.')).toBeInTheDocument();
  });

  it('mostra il differenziatore: niente numero, niente email, solo un nome scelto', () => {
    renderLanding();
    expect(screen.getByText('No number. No email.')).toBeInTheDocument();
    expect(screen.getByText('Just a name you choose.')).toBeInTheDocument();
    expect(screen.getByLabelText('Type the name you want')).toBeInTheDocument();
  });

  it('mostra i due telefoni: un messaggio non e\' mai leggibile in transito', () => {
    renderLanding();
    expect(screen.getByText('A message is never readable in transit.')).toBeInTheDocument();
  });

  it('mostra la sezione open source con il codice vero', () => {
    renderLanding();
    expect(screen.getByText('Real code, not promises.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Messages' })).toBeInTheDocument();
  });

  it('mostra la sezione del database cifrato', () => {
    renderLanding();
    expect(screen.getByText('Write something. See what reaches our database.')).toBeInTheDocument();
  });

  it('mostra la demo del numero di sicurezza (verifica identita\')', () => {
    renderLanding();
    expect(screen.getByText("Know exactly who you're talking to.")).toBeInTheDocument();
    expect(screen.getByText('48291')).toBeInTheDocument();
    expect(screen.getByText('76230')).toBeInTheDocument();
  });

  it('mostra sia il piano personale gratuito sia quello aziendale', () => {
    renderLanding();
    expect(screen.getByText('Free for everyone. Powerful for teams.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activate your company' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Business login' })).toBeInTheDocument();
  });
});

describe('LandingPage — i pulsanti chiamano le funzioni di App.jsx', () => {
  it('"Get started free" apre la registrazione', () => {
    const { funzioni } = renderLanding();
    fireEvent.click(screen.getByRole('button', { name: 'Get started free' }));
    expect(funzioni.onShowPersonalRegister).toHaveBeenCalledTimes(1);
  });

  it('"Log in" (intestazione) apre l\'accesso', () => {
    const { funzioni } = renderLanding();
    const intestazione = screen.getByRole('banner');
    fireEvent.click(within(intestazione).getByRole('button', { name: 'Log in' }));
    expect(funzioni.onShowPersonalLogin).toHaveBeenCalledTimes(1);
  });

  it('i pulsanti aziendali chiamano attivazione e accesso aziendale', () => {
    const { funzioni } = renderLanding();
    fireEvent.click(screen.getByRole('button', { name: 'Activate your company' }));
    fireEvent.click(screen.getByRole('button', { name: 'Business login' }));
    expect(funzioni.onEnterpriseActivate).toHaveBeenCalledTimes(1);
    expect(funzioni.onEnterpriseLogin).toHaveBeenCalledTimes(1);
  });

  it('con Olm non pronto i pulsanti di registrazione sono disabilitati', () => {
    renderLanding({ isOlmReady: false });
    expect(screen.getByRole('button', { name: 'Get started free' })).toBeDisabled();
  });
});

describe('LandingPage — lo username scelto arriva alla registrazione', () => {
  it('il nome viene ripulito e salvato per la registrazione, poi si apre la registrazione', () => {
    const { funzioni } = renderLanding();
    fireEvent.change(screen.getByLabelText('Type the name you want'), { target: { value: 'Boss.Palacan!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Claim this name' }));
    expect(sessionStorage.getItem('palacan:nome-scelto')).toBe('boss.palacan');
    expect(funzioni.onShowPersonalRegister).toHaveBeenCalledTimes(1);
  });

  it('senza nome scritto non salva nulla (la registrazione parte vuota)', () => {
    const { funzioni } = renderLanding();
    fireEvent.click(screen.getByRole('button', { name: 'Claim this name' }));
    expect(sessionStorage.getItem('palacan:nome-scelto')).toBeNull();
    expect(funzioni.onShowPersonalRegister).toHaveBeenCalledTimes(1);
  });
});

describe('LandingPage — 5 lingue', () => {
  const frasi = {
    en: 'Private. From every point of view.',
    it: 'Privato. Da ogni punto di vista.',
    fr: 'Privé. Sous tous les angles.',
    es: 'Privado. Desde cualquier punto de vista.',
    de: 'Privat. Aus jedem Blickwinkel.',
  };
  for (const [lingua, frase] of Object.entries(frasi)) {
    it(`frase principale in ${lingua}`, () => {
      renderLanding({}, lingua);
      expect(screen.getByText(frase)).toBeInTheDocument();
    });
  }
});
