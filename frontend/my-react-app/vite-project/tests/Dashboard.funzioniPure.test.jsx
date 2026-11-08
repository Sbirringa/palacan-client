// tests/Dashboard.funzioniPure.test.jsx
//
// Funzioni pure top-level di Dashboard.jsx (fuori dai componenti,
// 5076 righe - troppo grande per un test end-to-end completo, stesso
// limite pratico di App.jsx). Export nominati aggiunti apposta
// (default invariato). Verificato il codice esatto riga per riga
// prima di scrivere ogni test.
//
// SCOPERTA (documentata, non "corretta" senza chiedere): normalizeRoomId
// qui restituisce '' per un valore vuoto, mentre la VERSIONE OMONIMA in
// App.jsx restituisce null per lo stesso caso - due implementazioni
// diverse con lo stesso nome in due file diversi. Non risulta un bug
// concreto nell'uso attuale (isCurrentRoom confronta comunque
// coerentemente '' con '' per due stanze senza id), ma e' una
// incoerenza reale, segnalata qui esplicitamente.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/i18n', () => ({
  default: { t: (key) => key },
}));

import {
  normalizeRoomId,
  getRoomPasswordFlag,
  getAdminPanelOpenKey,
  getDraftsStorageKey,
  loadDraftsFromStorage,
  saveDraftsToStorage,
  resolveRoomMuted,
  resolveRoomFavorite,
  formatTime,
  formatRelativeRoomTime,
  getMessagePreview,
  isRealMessageId,
  isCurrentRoom,
  groupRoomsByTime,
  avatarSeedHash,
  getDirectRoomOthers,
  splitRoomsByKind,
} from '../src/pages/Dashboard.jsx';

beforeEach(() => {
  localStorage.clear();
});

describe('normalizeRoomId (Dashboard.jsx) — restituisce STRINGA VUOTA per vuoto (diverso da App.jsx!)', () => {
  it('null/undefined/stringa vuota diventano stringa vuota, non null', () => {
    expect(normalizeRoomId(null)).toBe('');
    expect(normalizeRoomId(undefined)).toBe('');
    expect(normalizeRoomId('')).toBe('');
  });
  it('un numero diventa la sua rappresentazione stringa', () => {
    expect(normalizeRoomId(456)).toBe('456');
  });
});

describe('getRoomPasswordFlag', () => {
  it('riconosce has_password (snake_case)', () => {
    expect(getRoomPasswordFlag({ has_password: true })).toBe(true);
  });
  it('riconosce hasPassword (camelCase) come alternativa', () => {
    expect(getRoomPasswordFlag({ hasPassword: true })).toBe(true);
  });
  it('senza nessuno dei due campi, restituisce false', () => {
    expect(getRoomPasswordFlag({})).toBe(false);
    expect(getRoomPasswordFlag(null)).toBe(false);
  });
});

describe('getAdminPanelOpenKey / getDraftsStorageKey', () => {
  it('costruiscono la chiave localStorage nel formato atteso', () => {
    expect(getAdminPanelOpenKey('mario')).toBe('admin_panel_open_mario');
    expect(getDraftsStorageKey('mario')).toBe('chat_drafts_mario');
  });
});

describe('loadDraftsFromStorage / saveDraftsToStorage', () => {
  it('senza nulla salvato, restituisce un oggetto vuoto', () => {
    expect(loadDraftsFromStorage('mario_mai_usato')).toEqual({});
  });
  it('un JSON corrotto restituisce un oggetto vuoto, mai un crash', () => {
    localStorage.setItem('chat_drafts_mario', '{{{corrotto');
    expect(() => loadDraftsFromStorage('mario')).not.toThrow();
    expect(loadDraftsFromStorage('mario')).toEqual({});
  });
  it('salva e ricarica correttamente (andata e ritorno)', () => {
    const bozze = { stanza1: 'testo bozza 1', stanza2: 'testo bozza 2' };
    saveDraftsToStorage('mario', bozze);
    expect(loadDraftsFromStorage('mario')).toEqual(bozze);
  });
});

describe('resolveRoomMuted / resolveRoomFavorite — override locale ha priorita sul valore server', () => {
  it('senza override, usa il valore del server (notifications_muted/is_favorite)', () => {
    expect(resolveRoomMuted({ id: 's1', notifications_muted: true }, {})).toBe(true);
    expect(resolveRoomFavorite({ id: 's1', is_favorite: true }, {})).toBe(true);
  });
  it('con un override esplicito per quella stanza, vince l\'override', () => {
    expect(resolveRoomMuted({ id: 's1', notifications_muted: true }, { s1: false })).toBe(false);
    expect(resolveRoomFavorite({ id: 's1', is_favorite: false }, { s1: true })).toBe(true);
  });
  it('un override per un\'ALTRA stanza non influenza questa', () => {
    expect(resolveRoomMuted({ id: 's1', notifications_muted: true }, { s2: false })).toBe(true);
  });
});

describe('formatTime — orario di un messaggio', () => {
  it('senza messaggio, restituisce stringa vuota', () => {
    expect(formatTime(null)).toBe('');
  });
  it('senza nessun campo timestamp riconosciuto, restituisce stringa vuota', () => {
    expect(formatTime({})).toBe('');
  });
  it('con un timestamp valido, restituisce una stringa non vuota (formato locale ora:minuti)', () => {
    const risultato = formatTime({ timestamp: '2026-06-15T14:30:00.000Z' });
    expect(risultato).not.toBe('');
    expect(typeof risultato).toBe('string');
  });
});

describe('formatRelativeRoomTime — soglie diverse da Sidebar.formatRelativeTime (formato abbreviato)', () => {
  const ORA_FISSA = new Date('2026-06-15T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(ORA_FISSA);
  });

  it('senza nessun campo timestamp, restituisce stringa vuota', () => {
    expect(formatRelativeRoomTime({})).toBe('');
  });

  it('sotto 1 minuto: "Ora"', () => {
    const ts = new Date(ORA_FISSA - 30000).toISOString();
    expect(formatRelativeRoomTime({ last_message_at: ts })).toBe('Ora');
  });

  it('minuti: formato abbreviato "Xm"', () => {
    const ts = new Date(ORA_FISSA - 5 * 60000).toISOString();
    expect(formatRelativeRoomTime({ last_message_at: ts })).toBe('5m');
  });

  it('ore: formato abbreviato "Xh"', () => {
    const ts = new Date(ORA_FISSA - 3 * 60 * 60000).toISOString();
    expect(formatRelativeRoomTime({ last_message_at: ts })).toBe('3h');
  });

  it('giorni sotto una settimana: formato abbreviato "Xg"', () => {
    const ts = new Date(ORA_FISSA - 4 * 24 * 60 * 60000).toISOString();
    expect(formatRelativeRoomTime({ last_message_at: ts })).toBe('4g');
  });

  it('oltre una settimana: passa a una data assoluta, non piu il formato abbreviato', () => {
    const ts = new Date(ORA_FISSA - 10 * 24 * 60 * 60000).toISOString();
    const risultato = formatRelativeRoomTime({ last_message_at: ts });
    expect(risultato).not.toMatch(/^\d+[mhg]$/);
    expect(risultato).not.toBe('');
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('getMessagePreview', () => {
  it('usa il primo campo disponibile nell\'ordine di priorita documentato', () => {
    expect(getMessagePreview({ last_message_preview: 'preview1', last_message: 'preview2' })).toBe('preview1');
  });
  it('per una stanza aziendale senza nessun messaggio, mostra il testo i18n dedicato', () => {
    expect(getMessagePreview({ is_corporate: true })).toBe('dashboard.common.workspace_conversation_preview');
  });
  it('per una stanza NON aziendale senza nessun messaggio, restituisce null (non il testo aziendale)', () => {
    expect(getMessagePreview({ is_corporate: false })).toBeNull();
  });
});

describe('isRealMessageId — distingue un vero UUID del server da un id temporaneo', () => {
  it('un vero UUID (8-4-4-4-12) viene riconosciuto', () => {
    expect(isRealMessageId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
  it('un id ottimistico temporaneo NON viene mai confuso con un UUID reale', () => {
    expect(isRealMessageId(`${Date.now()}-0.123`)).toBe(false);
  });
  it('un valore assente non fa mai crashare la funzione', () => {
    expect(() => isRealMessageId(null)).not.toThrow();
    expect(isRealMessageId(null)).toBe(false);
  });
});

describe('isCurrentRoom', () => {
  it('due stanze con lo stesso id sono la stessa stanza corrente', () => {
    expect(isCurrentRoom({ id: 's1' }, { id: 's1' })).toBe(true);
  });
  it('due stanze con id diversi non sono la stessa', () => {
    expect(isCurrentRoom({ id: 's1' }, { id: 's2' })).toBe(false);
  });
});

describe('groupRoomsByTime — raggruppa per oggi/ieri/settimana/precedenti', () => {
  const ORA_FISSA = new Date('2026-06-15T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(ORA_FISSA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('una stanza con messaggio di oggi finisce nel gruppo "oggi"', () => {
    const stanze = [{ id: 's1', last_message_at: new Date(ORA_FISSA).toISOString() }];
    const gruppi = groupRoomsByTime(stanze);
    expect(gruppi.find((g) => g.label === 'dashboard.timeline.today')?.rooms).toHaveLength(1);
  });

  it('una stanza con messaggio di 10 giorni fa finisce nel gruppo "precedenti"', () => {
    const dieciGiorniFa = new Date(ORA_FISSA - 10 * 24 * 60 * 60000).toISOString();
    const stanze = [{ id: 's1', last_message_at: dieciGiorniFa }];
    const gruppi = groupRoomsByTime(stanze);
    expect(gruppi.find((g) => g.label === 'dashboard.timeline.earlier')?.rooms).toHaveLength(1);
  });

  it('una stanza senza nessun timestamp valido finisce comunque in "precedenti", mai persa', () => {
    const stanze = [{ id: 's1' }];
    const gruppi = groupRoomsByTime(stanze);
    const totaleStanzeRaggruppate = gruppi.reduce((somma, g) => somma + g.rooms.length, 0);
    expect(totaleStanzeRaggruppate).toBe(1);
  });

  it('i gruppi vuoti vengono filtrati via, mai mostrati come sezioni vuote', () => {
    const stanze = [{ id: 's1', last_message_at: new Date(ORA_FISSA).toISOString() }];
    const gruppi = groupRoomsByTime(stanze);
    expect(gruppi.every((g) => g.rooms.length > 0)).toBe(true);
  });
});

describe('avatarSeedHash — hash deterministico per il colore avatar', () => {
  it('la stessa stringa produce sempre lo stesso hash', () => {
    expect(avatarSeedHash('mario')).toBe(avatarSeedHash('mario'));
  });
  it('stringhe diverse producono (quasi sempre) hash diversi', () => {
    expect(avatarSeedHash('mario')).not.toBe(avatarSeedHash('luigi'));
  });
  it('il risultato e sempre un numero non negativo', () => {
    expect(avatarSeedHash('qualunque_stringa')).toBeGreaterThanOrEqual(0);
    expect(avatarSeedHash('')).toBeGreaterThanOrEqual(0);
  });
});

describe('getDirectRoomOthers', () => {
  it('estrae la lista da participant_usernames (snake_case)', () => {
    expect(getDirectRoomOthers({ participant_usernames: ['mario', 'luigi'] })).toEqual(['mario', 'luigi']);
  });
  it('estrae la lista da participantUsernames (camelCase) come alternativa', () => {
    expect(getDirectRoomOthers({ participantUsernames: ['mario'] })).toEqual(['mario']);
  });
  it('senza nessuno dei due campi, restituisce un array vuoto', () => {
    expect(getDirectRoomOthers({})).toEqual([]);
  });
});

describe('splitRoomsByKind', () => {
  it('separa correttamente le chat dirette dai reparti/altre stanze', () => {
    const stanze = [
      { id: '1', room_kind: 'direct' },
      { id: '2', room_kind: 'department' },
      { id: '3', room_kind: 'consumer' },
    ];
    const { departments, directs } = splitRoomsByKind(stanze);
    expect(directs).toHaveLength(1);
    expect(departments).toHaveLength(2);
  });
});
