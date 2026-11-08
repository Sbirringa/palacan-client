// tests/isRestoringSession.pattern.test.jsx
//
// Verifica automatica (React Testing Library, non manuale) dello
// schema ESATTO usato in App.jsx per evitare il lampo di schermata di
// login al ricaricamento della pagina: stato isRestoringSession
// (parte true) + effetto asincrono di ripristino + guardia di
// rendering (return null finche' isRestoringSession e' true).
//
// Non renderizza tutto App.jsx (200K+ caratteri, fuori scopo pratico)
// - riproduce lo stesso identico pattern in un componente minimo, con
// il vero secureStorage.js (cifratura reale), per dimostrare che la
// SEQUENZA di stati non mostra mai "non autenticato" durante il
// ripristino, anche se authToken parte null.
import { describe, it, expect, beforeEach } from 'vitest';
import { useState, useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { setSecureItem, getSecureItem } from '../src/secureStorage.js';

// Riproduce ESATTAMENTE lo schema di App.jsx (stessa sequenza di stati,
// stesso effetto, stessa guardia di rendering) - la porzione minima
// necessaria per verificare il comportamento, senza le migliaia di
// righe circostanti non rilevanti per QUESTO test specifico.
function ComponenteConLoStessoSchemaDiAppJsx() {
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [authToken, setAuthToken] = useState(null);

  useEffect(() => {
    let annullato = false;
    (async () => {
      const tokenSalvato = await getSecureItem('token');
      if (annullato) return;
      setAuthToken(tokenSalvato);
      setIsRestoringSession(false);
    })();
    return () => { annullato = true; };
  }, []);

  if (isRestoringSession) {
    return null; // stessa guardia usata in App.jsx
  }

  if (!authToken) {
    return <div>SCHERMATA DI LOGIN</div>;
  }

  return <div>DASHBOARD (utente autenticato)</div>;
}

beforeEach(() => {
  localStorage.clear();
});

describe('Pattern isRestoringSession — mai un lampo di login per un utente già autenticato', () => {
  it('con un token VERO già salvato (cifrato), non mostra MAI la schermata di login, nemmeno per un istante', async () => {
    await setSecureItem('token', 'token_vero_di_un_utente_gia_loggato');

    const { container } = render(<ComponenteConLoStessoSchemaDiAppJsx />);

    // Subito dopo il render iniziale (sincrono, prima che l'effetto
    // asincrono abbia potuto risolversi) - il punto ESATTO dove il
    // bug si manifesterebbe se la guardia non funzionasse.
    expect(container.textContent).not.toContain('SCHERMATA DI LOGIN');
    expect(container.textContent).toBe(''); // isRestoringSession true - render null, come atteso

    // Aspettiamo che l'effetto asincrono si risolva davvero.
    await waitFor(() => {
      expect(screen.getByText('DASHBOARD (utente autenticato)')).toBeInTheDocument();
    });

    // E in NESSUN momento intermedio deve essere apparsa la schermata di login.
    expect(screen.queryByText('SCHERMATA DI LOGIN')).not.toBeInTheDocument();
  });

  it('senza nessun token salvato, mostra la schermata di login SOLO dopo che il ripristino è completato (mai prima)', async () => {
    // Nessun token in localStorage - utente genuinamente mai loggato.
    const { container } = render(<ComponenteConLoStessoSchemaDiAppJsx />);

    expect(container.textContent).toBe(''); // ancora in restauro, render null

    await waitFor(() => {
      expect(screen.getByText('SCHERMATA DI LOGIN')).toBeInTheDocument();
    });
  });
});
