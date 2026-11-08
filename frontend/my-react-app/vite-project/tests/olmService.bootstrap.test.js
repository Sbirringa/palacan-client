import { beforeEach as primaDiOgniPq7 } from 'vitest';  // [palacan-pq7]
// tests/olmService.bootstrap.test.js
//
// Test su ensureEnoughOTKs e bootstrapOlmAccount - le ultime due
// funzioni che mutano davvero l'account condiviso. Il changelog di
// olmService.js documenta un fix per un deadlock reale (v1.13-A):
// bootstrapOlmAccount acquisisce withAccountLock, e se al suo interno
// chiamasse ensureEnoughOTKs con un await diretto (che acquisisce lo
// STESSO lock), si bloccherebbe per sempre - risolto uscendo dal lock
// prima di richiamare ensureEnoughOTKs. Il test sul bootstrap completo
// verifica proprio questo: se il deadlock fosse tornato, il test non
// fallirebbe con un errore - si bloccherebbe per sempre fino al
// timeout di Vitest, rivelando comunque il problema.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initOlm,
  createOlmAccount,
  ensureEnoughOTKs,
  bootstrapOlmAccount,
  getOrCreateOlmAccount,
  getIdentityKeys,
} from '../src/olmService.js';
import * as apiService from '../src/apiService.js';

vi.mock('../src/apiService.js', () => ({
  getOtkCount: vi.fn(),
  uploadOneTimeKeys: vi.fn(),
  uploadIdentityKey: vi.fn(),
}));

beforeEach(async () => {
  localStorage.clear();
  vi.clearAllMocks();
  await initOlm();
});

describe('ensureEnoughOTKs', () => {
  primaDiOgniPq7(() => {  // [palacan-pq7] qui si prova il riempimento normale: la sostituzione una tantum
    // delle OTK (account di prima di PQ7a) per questi utenti e' gia' fatta
    for (const io of ['alice', 'alice_ensure1', 'alice_ensure2', 'alice_ensure3']) localStorage.setItem(`palacan_otk_sostituite_v1_${io}`, '1');
  });
  it('se le OTK sul server sono già sopra la soglia, non genera né carica nulla di nuovo', async () => {
    const account = createOlmAccount('alice_ensure1');
    apiService.getOtkCount.mockResolvedValue(20); // sopra la soglia di default (10)

    const risultato = await ensureEnoughOTKs(account, 'alice_ensure1', 'token_finto');

    expect(risultato.uploaded).toBe(false);
    expect(risultato.generatedCount).toBe(0);
    expect(apiService.uploadOneTimeKeys).not.toHaveBeenCalled();
  });

  it('se le OTK sono sotto soglia, genera e carica esattamente la quantità mancante per arrivare al target', async () => {
    const account = createOlmAccount('alice_ensure2');
    apiService.getOtkCount.mockResolvedValue(5); // sotto la soglia di default (10)
    apiService.uploadOneTimeKeys.mockResolvedValue({ ok: true });

    const risultato = await ensureEnoughOTKs(account, 'alice_ensure2', 'token_finto', 10, 50);

    expect(risultato.uploaded).toBe(true);
    expect(risultato.generatedCount).toBe(45); // 50 (target) - 5 (gia' presenti) = 45
    expect(apiService.uploadOneTimeKeys).toHaveBeenCalledTimes(1);
  });

  it('restituisce null (non lancia mai un\'eccezione non gestita) se manca un parametro richiesto', async () => {
    expect(await ensureEnoughOTKs(null, 'alice', 'token')).toBeNull();
    expect(await ensureEnoughOTKs({}, null, 'token')).toBeNull();
    expect(await ensureEnoughOTKs({}, 'alice', null)).toBeNull();
  });

  it('se la chiamata di rete fallisce, restituisce null con garbo invece di propagare l\'errore', async () => {
    const account = createOlmAccount('alice_ensure3');
    apiService.getOtkCount.mockRejectedValue(new Error('Rete finta non disponibile'));

    const risultato = await ensureEnoughOTKs(account, 'alice_ensure3', 'token_finto');
    expect(risultato).toBeNull();
  });
});

describe('bootstrapOlmAccount — verifica che il fix anti-deadlock regga davvero', () => {
  it('completa con successo senza mai bloccarsi (il test stesso ha un timeout - se il deadlock fosse tornato, fallirebbe per timeout, non per un errore)', async () => {
    apiService.uploadIdentityKey.mockResolvedValue({ ok: true });
    apiService.getOtkCount.mockResolvedValue(3); // sotto soglia, forza ensureEnoughOTKs a fare un refill vero
    apiService.uploadOneTimeKeys.mockResolvedValue({ ok: true });

    const account = await bootstrapOlmAccount({
      username: 'alice_bootstrap',
      token: 'token_finto',
      initialOtkTarget: 20,
    });

    expect(account).toBeTruthy();
    expect(apiService.uploadIdentityKey).toHaveBeenCalledTimes(1);
    expect(apiService.uploadOneTimeKeys).toHaveBeenCalledTimes(1);

    // Conferma che l'account risultante sia davvero utilizzabile dopo
    // il bootstrap (chiavi valide, non un oggetto rotto/parziale).
    const chiavi = getIdentityKeys(account);
    expect(chiavi.curve25519).toBeTruthy();
  }, 5000); // timeout esplicito di 5s - se si blocca, fallisce qui, non appende per sempre

  it('due bootstrap consecutivi non si bloccano a vicenda (lock rilasciato correttamente ogni volta)', async () => {
    apiService.uploadIdentityKey.mockResolvedValue({ ok: true });
    apiService.getOtkCount.mockResolvedValue(3);
    apiService.uploadOneTimeKeys.mockResolvedValue({ ok: true });

    await bootstrapOlmAccount({ username: 'alice_bootstrap2', token: 'token_finto' });
    // Se il lock non si liberasse correttamente dal primo giro, questo
    // secondo bootstrap si bloccherebbe per sempre.
    const secondoRisultato = await bootstrapOlmAccount({ username: 'bob_bootstrap2', token: 'token_finto' });

    expect(secondoRisultato).toBeTruthy();
  }, 5000);
});