// tests/olmService.formatoDati.test.js
//
// Test sulle funzioni pure di formato dati e pulizia sessioni - nessuna
// crittografia coinvolta direttamente, ma comportamento comunque
// verificato con esecuzione reale, non per supposizione.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  initOlm,
  createOlmAccount,
  getOrCreateOutboundSession,
  safeParseOlmPayload,
  buildMegolmEncryptedPayload,
  parseMegolmPayload,
  dropStaleSessionForPeer,
  freeOlmAccount,
} from '../src/olmService.js';
import * as apiService from '../src/apiService.js';
import { vi } from 'vitest';

vi.mock('../src/apiService.js', () => ({
  getKeyBundle: vi.fn(),
}));

beforeEach(async () => {
  localStorage.clear();
  vi.clearAllMocks();
  await initOlm();
});

describe('safeParseOlmPayload', () => {
  it('interpreta una stringa JSON valida come oggetto', () => {
    const risultato = safeParseOlmPayload('{"testo": "ciao", "numero": 42}');
    expect(risultato).toEqual({ testo: 'ciao', numero: 42 });
  });

  it('restituisce la stringa originale INVARIATA se non è JSON valido (mai null, mai un crash)', () => {
    const testoNonJson = 'questo non è JSON, è solo testo semplice';
    const risultato = safeParseOlmPayload(testoNonJson);
    expect(risultato).toBe(testoNonJson);
  });

  it('restituisce l\'input invariato se non è nemmeno una stringa', () => {
    const oggetto = { gia: 'un oggetto' };
    expect(safeParseOlmPayload(oggetto)).toBe(oggetto);
    expect(safeParseOlmPayload(null)).toBeNull();
    expect(safeParseOlmPayload(42)).toBe(42);
  });
});

describe('buildMegolmEncryptedPayload / parseMegolmPayload — andata e ritorno', () => {
  it('costruire e poi interpretare un payload restituisce gli stessi dati', () => {
    const payload = buildMegolmEncryptedPayload({
      roomId: 'stanza_test',
      sessionId: 'sessione_123',
      cipherText: 'testo_cifrato_finto',
    });

    expect(payload.algorithm).toBe('m.megolm.v1.aes-sha2');

    const interpretato = parseMegolmPayload(payload);
    expect(interpretato.roomId).toBe('stanza_test');
    expect(interpretato.sessionId).toBe('sessione_123');
    expect(interpretato.ciphertext).toBe('testo_cifrato_finto');
  });

  it('parseMegolmPayload accetta ENTRAMBE le convenzioni di nome (snake_case e camelCase)', () => {
    const messaggioSnakeCase = {
      algorithm: 'm.megolm.v1.aes-sha2',
      room_id: 'stanza_snake',
      session_id: 'sess_snake',
      ciphertext: 'testo_snake',
    };
    const interpretatoSnake = parseMegolmPayload(messaggioSnakeCase);
    expect(interpretatoSnake.roomId).toBe('stanza_snake');

    const messaggioCamelCase = {
      algorithm: 'm.megolm.v1.aes-sha2',
      roomId: 'stanza_camel',
      sessionId: 'sess_camel',
      cipher_body: 'testo_camel',
    };
    const interpretatoCamel = parseMegolmPayload(messaggioCamelCase);
    expect(interpretatoCamel.room_id).toBe('stanza_camel');
    expect(interpretatoCamel.ciphertext).toBe('testo_camel');
  });

  it('parseMegolmPayload restituisce null per input non valido', () => {
    expect(parseMegolmPayload(null)).toBeNull();
    expect(parseMegolmPayload('non un oggetto')).toBeNull();
    expect(parseMegolmPayload(undefined)).toBeNull();
  });
});

describe('dropStaleSessionForPeer', () => {
  it('rimuove davvero le sessioni di un peer dalla mappa, e le salva senza di esse', async () => {
    const alice = createOlmAccount('alice_drop');
    const bob = createOlmAccount('bob_drop');

    apiService.getKeyBundle.mockResolvedValue({
      identity_key: JSON.parse(bob.identity_keys()).curve25519,
      one_time_key: 'otk_finta',
      one_time_key_id: 'id_1',
    });

    const sessions = {};
    // Usiamo direttamente l'oggetto Olm.Session per popolare la mappa,
    // senza passare dalla rete simulata (piu' semplice per questo test
    // mirato solo alla RIMOZIONE, non allo stabilimento della sessione).
    const Olm = (await import('../src/crypto/olm.js')).default;
    const sessioneFinta = new Olm.Session();
    sessioneFinta.create_outbound(alice, JSON.parse(bob.identity_keys()).curve25519, JSON.parse(bob.identity_keys()).curve25519.slice(0, 43));

    sessions['bob_drop'] = [sessioneFinta];

    const risultato = dropStaleSessionForPeer('alice_drop', 'bob_drop', sessions);

    expect(risultato).toBe(true);
    expect(sessions['bob_drop']).toBeUndefined();
  });

  it('restituisce false se non c\'è nulla da rimuovere per quel peer (non è un errore)', () => {
    const risultato = dropStaleSessionForPeer('alice_drop2', 'peer_senza_sessioni', {});
    expect(risultato).toBe(false);
  });

  it('restituisce false se mancano i parametri richiesti', () => {
    expect(dropStaleSessionForPeer(null, 'bob', {})).toBe(false);
    expect(dropStaleSessionForPeer('alice', null, {})).toBe(false);
    expect(dropStaleSessionForPeer('alice', 'bob', null)).toBe(false);
  });
});

describe('freeOlmAccount', () => {
  it('non lancia mai un errore, anche con un account null o già liberato', () => {
    expect(() => freeOlmAccount(null)).not.toThrow();
    expect(() => freeOlmAccount(undefined)).not.toThrow();

    const account = createOlmAccount('alice_free');
    expect(() => freeOlmAccount(account)).not.toThrow();
    // Chiamarla una seconda volta sullo stesso account gia' liberato
    // non deve mai far crashare l'app.
    expect(() => freeOlmAccount(account)).not.toThrow();
  });
});