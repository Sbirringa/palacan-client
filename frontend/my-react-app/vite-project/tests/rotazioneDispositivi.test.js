// tests/rotazioneDispositivi.test.js  [palacan-l3b]
//
// L3b (Chiusura limiti): se un dispositivo che aveva la chiave del gruppo non c'e' piu' (revocato, copia superata,
// utente disattivato), la sessione Megolm di invio si cambia: chi l'aveva non legge i messaggi successivi. Un
// dispositivo in PIU' non cambia niente (riceve la chiave in corso, come oggi). Il server manda l'elenco dei
// dispositivi attivi in /participants ("dispositivi"), letto senza consumare chiavi usa e getta.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as olmService from '../src/olmService.js';

beforeEach(() => {
  localStorage.clear();
});

describe('L3b - rotazione quando un dispositivo della stanza sparisce', () => {
  it('manca un dispositivo: si cambia; uno in piu\' o la prima volta: no', () => {
    expect(typeof olmService.deviceRemovedFromRoom, 'manca il controllo dei dispositivi spariti').toBe('function');
    expect(olmService.deviceRemovedFromRoom(['a', 'b'], ['a'])).toBe(true);
    expect(olmService.deviceRemovedFromRoom(['a', 'b'], ['b', 'a', 'c'])).toBe(false);
    expect(olmService.deviceRemovedFromRoom(null, ['a'])).toBe(false);
    expect(olmService.deviceRemovedFromRoom(['a'], null)).toBe(false);
    expect(olmService.deviceRemovedFromRoom([], [])).toBe(false);
  });

  it('elenco salvato per stanza e per utente', () => {
    expect(typeof olmService.saveRoomDevices, 'manca il salvataggio dei dispositivi della stanza').toBe('function');
    expect(olmService.loadRoomDevices('alice', 'stanza-1')).toBeNull();
    olmService.saveRoomDevices('alice', 'stanza-1', ['x', 'y']);
    olmService.saveRoomDevices('alice', 'stanza-2', ['z']);
    expect(olmService.loadRoomDevices('alice', 'stanza-1')).toEqual(['x', 'y']);
    expect(olmService.loadRoomDevices('alice', 'stanza-2')).toEqual(['z']);
    expect(olmService.loadRoomDevices('bob', 'stanza-1')).toBeNull();
  });

  it('collegamenti: l\'app legge "dispositivi" e cambia la sessione prima di condividere', () => {
    const api = readFileSync('src/apiService.js', 'utf8');
    expect(api, 'getRoomUsers non legge i dispositivi della stanza').toContain('users.dispositivi =');
    const app = readFileSync('src/App.jsx', 'utf8');
    const inizio = app.indexOf('const ensureRoomKeyShared = useCallback(');
    const fine = app.indexOf('const peers = (Array.isArray(users) ? users : []).filter(', inizio);
    const tratto = app.slice(inizio, fine);
    expect(tratto, 'ensureRoomKeyShared non controlla i dispositivi spariti').toContain('olmService.deviceRemovedFromRoom(');
    expect(tratto).toContain('olmService.clearOutboundGroupSession(username, normalizedRoom);');
    expect(tratto).toContain('olmService.saveRoomDevices(');
  });
});
