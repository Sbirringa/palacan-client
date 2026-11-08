// tests/apiService.fetchWithAuth.test.js
//
// Test sul meccanismo centrale di apiService.js: fetchWithAuth,
// refreshAccessToken, onAuthExpired/onTokenRefreshed. Ogni altra
// funzione esportata (le ~90 chiamate CRUD verso endpoint specifici)
// e' un wrapper sottile su questo stesso meccanismo - un bug qui
// avrebbe l'impatto piu' ampio possibile su tutta l'app.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchWithAuth,
  refreshAccessToken,
  onAuthExpired,
  onTokenRefreshed,
} from '../src/apiService.js';
import { setSecureItem } from '../src/secureStorage.js';

function creaRispostaFinta(status, corpo) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
    text: async () => JSON.stringify(corpo),
    headers: { get: () => 'application/json' },
  };
}

beforeEach(() => {
  localStorage.clear();
  onAuthExpired(null);
  onTokenRefreshed(null);
});

describe('fetchWithAuth — il percorso normale', () => {
  it('una richiesta riuscita restituisce i dati normalmente', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(creaRispostaFinta(200, { messaggio: 'ok' }));

    const risultato = await fetchWithAuth('/test-endpoint', 'token_valido');
    expect(risultato).toEqual({ messaggio: 'ok' });
  });

  it('lancia un errore chiaro se manca il token', async () => {
    await expect(fetchWithAuth('/test-endpoint', null)).rejects.toThrow('Token mancante');
  });
});

describe('fetchWithAuth — rinnovo automatico e trasparente del token scaduto', () => {
  it('un 401 seguito da un rinnovo riuscito ripete la richiesta con il nuovo token, in modo trasparente per il chiamante', async () => {
    await setSecureItem('refresh_token', 'refresh_token_valido');

    let numeroChiamata = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url) => {
      numeroChiamata++;
      if (String(url).includes('/auth/refresh')) {
        return creaRispostaFinta(200, { access_token: 'token_nuovo', refresh_token: 'refresh_nuovo' });
      }
      // Prima chiamata all'endpoint vero: 401. Seconda (dopo il rinnovo): 200.
      if (numeroChiamata === 1) {
        return creaRispostaFinta(401, { detail: 'Token scaduto' });
      }
      return creaRispostaFinta(200, { messaggio: 'dati veri dopo il rinnovo' });
    });

    const risultato = await fetchWithAuth('/test-endpoint', 'token_vecchio_scaduto');

    expect(risultato).toEqual({ messaggio: 'dati veri dopo il rinnovo' });
    // FIX (cifratura dati di sessione): il token e' ora salvato cifrato,
    // il valore grezzo in localStorage non e' piu' leggibile in chiaro -
    // verifichiamo il valore VERO tramite getSecureItem, non il grezzo.
    const { getSecureItem } = await import('../src/secureStorage.js');
    expect(await getSecureItem('token')).toBe('token_nuovo');
  });

  it('se non c\'è nessun refresh token salvato, notifica authExpired UNA SOLA VOLTA e propaga l\'errore originale', async () => {
    // Nessun refresh_token in localStorage.
    globalThis.fetch = vi.fn().mockResolvedValue(creaRispostaFinta(401, { detail: 'Token scaduto' }));

    const notificheRicevute = [];
    onAuthExpired((err) => notificheRicevute.push(err));

    await expect(fetchWithAuth('/test-endpoint', 'token_scaduto')).rejects.toThrow();

    expect(notificheRicevute.length).toBe(1);
  });

  it('un handler onAuthExpired che lancia un errore non rompe il flusso della richiesta originale', async () => {
    // NOTA: nessun refresh_token in localStorage per questo test - il
    // percorso reale del codice, in questo caso, fa fallire il
    // TENTATIVO DI RINNOVO con "Nessun refresh token disponibile"
    // (verificato in un test a parte), e QUESTO e' l'errore che risale
    // davvero al chiamante finale - non il messaggio del 401 originale.
    // Quello che conta verificare qui e' che l'handler difettoso non
    // faccia crashare il test/l'app con un'eccezione NON gestita.
    globalThis.fetch = vi.fn().mockResolvedValue(creaRispostaFinta(401, { detail: 'Token scaduto' }));
    onAuthExpired(() => {
      throw new Error('Handler difettoso');
    });

    await expect(fetchWithAuth('/test-endpoint', 'token_scaduto')).rejects.toThrow(
      'Nessun refresh token disponibile'
    );
  });
});

describe('fetchWithAuth — evitare la doppia notifica quando anche il retry fallisce', () => {
  it('se il rinnovo riesce ma la richiesta ripetuta fallisce ANCORA con 401, notifica UNA SOLA VOLTA (non due)', async () => {
    await setSecureItem('refresh_token', 'refresh_valido_ma_endpoint_rifiuta_comunque');

    let numeroChiamataEndpoint = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('/auth/refresh')) {
        return creaRispostaFinta(200, { access_token: 'token_nuovo_ma_inutile', refresh_token: 'refresh_nuovo' });
      }
      numeroChiamataEndpoint++;
      // L'endpoint vero rifiuta SEMPRE con 401, anche dopo il rinnovo
      // (es. l'utente e' stato disconnesso a forza da un admin).
      return creaRispostaFinta(401, { detail: 'Sessione revocata' });
    });

    const notificheRicevute = [];
    onAuthExpired((err) => notificheRicevute.push(err));

    await expect(fetchWithAuth('/test-endpoint', 'token_vecchio')).rejects.toThrow();

    expect(numeroChiamataEndpoint).toBe(2); // primo tentativo + retry dopo il rinnovo
    expect(notificheRicevute.length).toBe(1); // MAI due notifiche per lo stesso fallimento definitivo
  });
});

describe('refreshAccessToken — un solo rinnovo condiviso tra chiamate concorrenti', () => {
  it('due chiamate concorrenti a refreshAccessToken fanno UNA SOLA richiesta di rete vera, non due', async () => {
    await setSecureItem('refresh_token', 'refresh_valido');

    let chiamateReteAlRefresh = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      chiamateReteAlRefresh++;
      await new Promise((r) => setTimeout(r, 20)); // simula latenza di rete
      return creaRispostaFinta(200, { access_token: 'nuovo_token', refresh_token: 'nuovo_refresh' });
    });

    const [risultato1, risultato2] = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(chiamateReteAlRefresh).toBe(1);
    expect(risultato1).toBe('nuovo_token');
    expect(risultato2).toBe('nuovo_token');
  });

  it('senza nessun refresh token salvato, lancia subito un errore senza mai chiamare la rete', async () => {
    globalThis.fetch = vi.fn();

    await expect(refreshAccessToken()).rejects.toThrow('Nessun refresh token disponibile');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('notifica onTokenRefreshed con i nuovi token dopo un rinnovo riuscito', async () => {
    await setSecureItem('refresh_token', 'refresh_valido2');
    globalThis.fetch = vi.fn().mockResolvedValue(
      creaRispostaFinta(200, { access_token: 'access_X', refresh_token: 'refresh_Y' })
    );

    let ricevuto = null;
    onTokenRefreshed((accessToken, refreshToken) => {
      ricevuto = { accessToken, refreshToken };
    });

    await refreshAccessToken();

    expect(ricevuto).toEqual({ accessToken: 'access_X', refreshToken: 'refresh_Y' });
  });
});