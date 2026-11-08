// tests/caricamentoPq.test.js  [palacan-pq5d-bis]
//
// Bug trovato dalle prove end-to-end di PQ5d: apiService.uploadPqKeys non mandava al server "sostituisci". Il server
// teneva le chiavi ML-KEM vecchie (senza firma ibrida) e le consegnava per prime; chi aveva visto l'annuncio "pqh" le
// rifiutava (giustamente) e la chiave di stanza non partiva. Qui si controlla il corpo VERO della richiesta.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as api from '../src/apiService';

function fetchFinto(chiamate) {
  return vi.fn(async (url, opzioni) => {
    chiamate.push({ url: String(url), opzioni: opzioni || {} });
    return new Response(JSON.stringify({ una: 0, riserva: false, aggiunte: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

async function corpoDelCaricamento(argomenti) {
  const chiamate = [];
  vi.stubGlobal('fetch', fetchFinto(chiamate));
  try {
    await api.uploadPqKeys(argomenti, 'gettone-di-prova');
  } catch (_) { /* conta solo la richiesta partita */ }
  const caricamento = chiamate.find((c) => c.url.includes('/keys/pq/upload'));
  expect(caricamento, 'nessuna richiesta a /keys/pq/upload').toBeTruthy();
  return JSON.parse(caricamento.opzioni.body);
}

describe('PQ5d (correzione) - caricamento delle chiavi post-quantum', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uploadPqKeys manda al server anche "sostituisci" (chiavi ripubblicate con la firma ibrida)', async () => {
    const corpo = await corpoDelCaricamento({ deviceId: 'D1', una: [{ key_id: 'k' }], riserva: null, sostituisci: true });
    expect(corpo).toMatchObject({ device_id: 'D1', una: [{ key_id: 'k' }], riserva: null, sostituisci: true });
  });

  it('senza "sostituisci" il server non toglie niente (come prima)', async () => {
    const corpo = await corpoDelCaricamento({ deviceId: 'D1', una: [], riserva: null });
    expect(corpo.sostituisci).toBe(false);
  });
});
