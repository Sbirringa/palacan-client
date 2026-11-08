// tests/rotazioneMegolm.test.js  [palacan-l3a]
//
// L3 (Chiusura limiti): rotazione delle sessioni Megolm di invio. C'erano gia' la rotazione per cambio di membri
// (membership_version) e per eta' (7 giorni). Due buchi chiusi qui, con Olm VERA:
//   - nessun limite di messaggi: in un gruppo molto attivo la stessa chiave poteva cifrare migliaia di messaggi.
//     Ora la sessione si cambia dopo 100 messaggi (come Matrix);
//   - una sessione senza data di creazione (creata prima che la si salvasse) non ruotava MAI per eta'. Ora si cambia.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import Olm from '../src/crypto/olm.js';
import {
  initOlm,
  getOrCreateOutboundGroupSession,
  saveOutboundGroupSession,
  loadOutboundGroupSession,
  clearOutboundGroupSession,
  encryptGroupMessage,
  shouldRotateOutboundSessionByAge,
} from '../src/olmService.js';
import * as olmService from '../src/olmService.js';

const SETTE_GIORNI = 7 * 24 * 60 * 60 * 1000;

beforeEach(async () => {
  localStorage.clear();
  await initOlm();
});

describe('L3a - rotazione delle sessioni Megolm di invio', () => {
  it('dopo 100 messaggi la sessione va cambiata, prima no', () => {
    const stanza = 'stanza_rotazione_messaggi';
    expect(typeof olmService.shouldRotateOutboundSessionByMessages, 'manca la rotazione per numero di messaggi').toBe('function');
    let sessione = getOrCreateOutboundGroupSession('alice_l3', stanza);
    for (let i = 0; i < 99; i += 1) {
      encryptGroupMessage(sessione, `messaggio ${i}`);
      saveOutboundGroupSession('alice_l3', stanza, sessione);
    }
    expect(olmService.shouldRotateOutboundSessionByMessages('alice_l3', stanza, 100), 'ruotata troppo presto').toBe(false);
    encryptGroupMessage(sessione, 'messaggio 100');
    saveOutboundGroupSession('alice_l3', stanza, sessione);
    expect(olmService.shouldRotateOutboundSessionByMessages('alice_l3', stanza, 100), 'dopo 100 messaggi non ruota').toBe(true);
    const vecchia = sessione.session_id();
    clearOutboundGroupSession('alice_l3', stanza);
    sessione = getOrCreateOutboundGroupSession('alice_l3', stanza);
    expect(sessione.session_id()).not.toBe(vecchia);
    expect(olmService.shouldRotateOutboundSessionByMessages('alice_l3', stanza, 100)).toBe(false);
  });

  it('nessuna sessione: niente da ruotare', () => {
    expect(olmService.shouldRotateOutboundSessionByMessages('alice_l3', 'stanza_vuota', 100)).toBe(false);
    expect(shouldRotateOutboundSessionByAge('alice_l3', 'stanza_vuota', SETTE_GIORNI)).toBe(false);
  });

  it('sessione nuova: non va cambiata per eta\'', () => {
    getOrCreateOutboundGroupSession('alice_l3', 'stanza_nuova');
    expect(shouldRotateOutboundSessionByAge('alice_l3', 'stanza_nuova', SETTE_GIORNI)).toBe(false);
  });

  it('sessione senza data di creazione (creata prima che la si salvasse): va cambiata', () => {
    const stanza = 'stanza_senza_data';
    const vecchia = new Olm.OutboundGroupSession();
    vecchia.create();
    saveOutboundGroupSession('alice_l3', stanza, vecchia); // nessuna data di creazione salvata
    expect(loadOutboundGroupSession('alice_l3', stanza).session_id()).toBe(vecchia.session_id());
    expect(shouldRotateOutboundSessionByAge('alice_l3', stanza, SETTE_GIORNI), 'sessione senza data di creazione non ruotata').toBe(true);
    clearOutboundGroupSession('alice_l3', stanza);
    const nuova = getOrCreateOutboundGroupSession('alice_l3', stanza);
    expect(nuova.session_id()).not.toBe(vecchia.session_id());
    expect(shouldRotateOutboundSessionByAge('alice_l3', stanza, SETTE_GIORNI), 'la sessione nuova ruoterebbe di nuovo').toBe(false);
  });

  it('collegamenti: prima di condividere, l\'app controlla anche il numero di messaggi (100)', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    const inizio = app.indexOf('const ensureRoomKeyShared = useCallback(');
    const fine = app.indexOf('const peers = (Array.isArray(users) ? users : []).filter(', inizio);
    expect(inizio).toBeGreaterThan(-1);
    expect(fine).toBeGreaterThan(inizio);
    const tratto = app.slice(inizio, fine);
    expect(tratto, 'ensureRoomKeyShared non ruota per numero di messaggi').toContain('olmService.shouldRotateOutboundSessionByMessages(');
    expect(tratto).toContain('ROOM_KEY_MAX_MESSAGES = 100');
  });
});
