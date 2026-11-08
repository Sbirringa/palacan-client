// tests/App.funzioniPure.test.js
//
// Funzioni pure top-level di App.jsx (fuori dal componente principale,
// 4685 righe - troppo grande per un test end-to-end completo, stesso
// limite pratico di Dashboard.jsx). Export nominati aggiunti apposta
// (default invariato). Verificato il codice esatto riga per riga
// prima di scrivere ogni test.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getStoredValue,
  normalizeRoomId,
  normalizeMessageText,
  getLastReadKey,
  getCurrentRoomKey,
  isOptimisticPendingId,
  isOptimisticPendingMessage,
  isRoomKeyResendTrigger,
  getSentCacheKey,
  loadSentMessagesCache,
  saveSentMessagesCache,
} from '../src/App.jsx';

beforeEach(() => {
  localStorage.clear();
});

describe('getStoredValue', () => {
  it('restituisce il valore vero se presente', () => {
    localStorage.setItem('chiave', 'valore_vero');
    expect(getStoredValue('chiave')).toBe('valore_vero');
  });
  it('tratta le stringhe letterali "null"/"undefined"/"" come assenza di valore', () => {
    localStorage.setItem('a', 'null');
    localStorage.setItem('b', 'undefined');
    localStorage.setItem('c', '');
    expect(getStoredValue('a')).toBeNull();
    expect(getStoredValue('b')).toBeNull();
    expect(getStoredValue('c')).toBeNull();
  });
  it('una chiave mai impostata restituisce null', () => {
    expect(getStoredValue('mai_impostata')).toBeNull();
  });
});

describe('normalizeRoomId (App.jsx) — restituisce null per vuoto', () => {
  it('null/undefined/stringa vuota diventano null', () => {
    expect(normalizeRoomId(null)).toBeNull();
    expect(normalizeRoomId(undefined)).toBeNull();
    expect(normalizeRoomId('')).toBeNull();
  });
  it('un numero diventa la sua rappresentazione stringa', () => {
    expect(normalizeRoomId(123)).toBe('123');
  });
  it('una stringa gia valida passa invariata', () => {
    expect(normalizeRoomId('stanza-abc')).toBe('stanza-abc');
  });
});

describe('normalizeMessageText', () => {
  it('una stringa passa invariata', () => {
    expect(normalizeMessageText('ciao')).toBe('ciao');
  });
  it('un oggetto con .text viene estratto', () => {
    expect(normalizeMessageText({ text: 'dal campo text' })).toBe('dal campo text');
  });
  it('un oggetto con .body (senza .text) viene estratto', () => {
    expect(normalizeMessageText({ body: 'dal campo body' })).toBe('dal campo body');
  });
  it('un oggetto con .message (senza .text/.body) viene estratto', () => {
    expect(normalizeMessageText({ message: 'dal campo message' })).toBe('dal campo message');
  });
  it('.text ha priorita su .body se entrambi presenti', () => {
    expect(normalizeMessageText({ text: 'testo', body: 'corpo' })).toBe('testo');
  });
  it('un input non riconosciuto (numero, null, oggetto senza campi noti) restituisce stringa vuota', () => {
    expect(normalizeMessageText(42)).toBe('');
    expect(normalizeMessageText(null)).toBe('');
    expect(normalizeMessageText({ altro: 'campo' })).toBe('');
  });
});

describe('getLastReadKey / getCurrentRoomKey', () => {
  it('costruiscono la chiave localStorage nel formato atteso', () => {
    expect(getLastReadKey('mario', 'stanza1')).toBe('last_read_mario_stanza1');
    expect(getCurrentRoomKey('mario')).toBe('current_room_mario');
  });
});

describe('isOptimisticPendingId — riconosce il formato ID temporaneo (mai un UUID reale)', () => {
  it('un id nel formato Date.now()-Math.random() viene riconosciuto', () => {
    expect(isOptimisticPendingId('1734567890123-0.456789')).toBe(true);
  });
  it('un id con notazione esponenziale per numeri molto piccoli viene riconosciuto', () => {
    expect(isOptimisticPendingId('1734567890123-1.2e-7')).toBe(true);
  });
  it('un vero UUID del server (8-4-4-4-12) NON viene mai confuso con un id ottimistico', () => {
    expect(isOptimisticPendingId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });
  it('un valore assente o vuoto non viene mai riconosciuto', () => {
    expect(isOptimisticPendingId(null)).toBe(false);
    expect(isOptimisticPendingId(undefined)).toBe(false);
    expect(isOptimisticPendingId('')).toBe(false);
  });
});

describe('isOptimisticPendingMessage', () => {
  it('un messaggio "self" con id ottimistico recente (< 20s) viene riconosciuto come in sospeso', () => {
    const msg = {
      type: 'self',
      id: `${Date.now()}-0.123`,
      created_at: new Date().toISOString(),
    };
    expect(isOptimisticPendingMessage(msg)).toBe(true);
  });
  it('un messaggio che non è di tipo "self" non è mai in sospeso', () => {
    const msg = { type: 'other', id: `${Date.now()}-0.123`, created_at: new Date().toISOString() };
    expect(isOptimisticPendingMessage(msg)).toBe(false);
  });
  it('un messaggio con un vero id UUID (non ottimistico) non è mai in sospeso', () => {
    const msg = { type: 'self', id: '550e8400-e29b-41d4-a716-446655440000', created_at: new Date().toISOString() };
    expect(isOptimisticPendingMessage(msg)).toBe(false);
  });
  it('un messaggio ottimistico troppo vecchio (oltre 20s) non è più considerato in sospeso', () => {
    const vecchio = new Date(Date.now() - 30000).toISOString();
    const msg = { type: 'self', id: `${Date.now() - 30000}-0.123`, created_at: vecchio };
    expect(isOptimisticPendingMessage(msg)).toBe(false);
  });
  it('un messaggio assente non fa mai crashare la funzione', () => {
    expect(() => isOptimisticPendingMessage(null)).not.toThrow();
    expect(isOptimisticPendingMessage(null)).toBe(false);
  });
});

describe('isRoomKeyResendTrigger — riconosce i fallimenti che richiedono un re-invio della room key', () => {
  it('un errore con code OTK_MISMATCH viene riconosciuto', () => {
    expect(isRoomKeyResendTrigger({ code: 'OTK_MISMATCH' })).toBe(true);
  });
  it('un errore col testo BAD_MESSAGE_KEY_ID (senza .code) viene riconosciuto', () => {
    expect(isRoomKeyResendTrigger({ message: 'Errore: BAD_MESSAGE_KEY_ID' })).toBe(true);
  });
  it('un errore col testo "non è pre-key" viene riconosciuto (sessione 1:1 stale)', () => {
    expect(isRoomKeyResendTrigger({ message: 'il messaggio non è pre-key' })).toBe(true);
  });
  it('un errore col testo PEER_LOCK_TIMEOUT viene riconosciuto', () => {
    expect(isRoomKeyResendTrigger({ message: 'PEER_LOCK_TIMEOUT scattato' })).toBe(true);
  });
  it('un errore non collegato a nessuno di questi trigger NON viene riconosciuto', () => {
    expect(isRoomKeyResendTrigger({ code: 'ALTRO_ERRORE', message: 'qualcos\'altro' })).toBe(false);
  });
  it('un valore che non è un vero oggetto Error non fa mai crashare la funzione', () => {
    expect(() => isRoomKeyResendTrigger(null)).not.toThrow();
    expect(() => isRoomKeyResendTrigger('stringa semplice')).not.toThrow();
  });
});

describe('getSentCacheKey / loadSentMessagesCache / saveSentMessagesCache', () => {
  it('getSentCacheKey costruisce la chiave nel formato atteso', () => {
    expect(getSentCacheKey('mario')).toBe('sent_msg_cache_mario');
  });

  it('loadSentMessagesCache senza username restituisce un oggetto vuoto, senza toccare localStorage', () => {
    expect(loadSentMessagesCache(null)).toEqual({});
    expect(loadSentMessagesCache('')).toEqual({});
  });

  it('loadSentMessagesCache senza nulla salvato restituisce un oggetto vuoto', () => {
    expect(loadSentMessagesCache('mario_mai_usato')).toEqual({});
  });

  it('un JSON corrotto in localStorage restituisce un oggetto vuoto, mai un crash', () => {
    localStorage.setItem('sent_msg_cache_mario', 'non-e-json-valido{{{');
    expect(() => loadSentMessagesCache('mario')).not.toThrow();
    expect(loadSentMessagesCache('mario')).toEqual({});
  });

  it('salva e ricarica correttamente una cache valida (andata e ritorno)', () => {
    const cache = { msg1: 'ciao', msg2: 'come va' };
    saveSentMessagesCache('mario', cache);
    expect(loadSentMessagesCache('mario')).toEqual(cache);
  });

  it('senza username o senza cache, il salvataggio non fa nulla (nessun crash)', () => {
    expect(() => saveSentMessagesCache(null, { a: 1 })).not.toThrow();
    expect(() => saveSentMessagesCache('mario', null)).not.toThrow();
  });

  it('oltre 500 voci, la cache viene tagliata mantenendo solo le PIU RECENTI (le prime vengono scartate)', () => {
    const cacheGrande = {};
    for (let i = 0; i < 550; i++) {
      cacheGrande[`msg${i}`] = `testo${i}`;
    }
    saveSentMessagesCache('mario', cacheGrande);
    const ricaricata = loadSentMessagesCache('mario');
    expect(Object.keys(ricaricata).length).toBe(500);
    // Le prime 50 (le piu' vecchie, msg0..msg49) devono essere state scartate.
    expect(ricaricata).not.toHaveProperty('msg0');
    expect(ricaricata).not.toHaveProperty('msg49');
    // Le ultime devono essere rimaste.
    expect(ricaricata).toHaveProperty('msg549');
    expect(ricaricata).toHaveProperty('msg50');
  });
});