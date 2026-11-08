// tests/correzioniProve.test.js
//
// Correzioni dalle prove a mano: segreto di stanza al secondo membro, nome del gruppo sempre aggiornato.
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const archivio = new Map();
vi.mock('../src/utils/cronologiaLocale', () => ({
  salvaDato: vi.fn(async (u, n, v) => { archivio.set(`${u}:${n}`, JSON.parse(JSON.stringify(v))); return true; }),
  leggiDato: vi.fn(async (u, n) => archivio.get(`${u}:${n}`) ?? null),
}));
import {
  confermaSegreto, nuovoSegretoStanza, verificatoreDa, registraStanzaSegreto, imparaSegretoStanza, segretoDaRinnovare,
  impostaUtenteSegreti, dimenticaSegreti,
} from '../src/utils/segretiStanze';

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});
const aspetta = () => new Promise((r) => setTimeout(r, 350));

describe('correzioni dalle prove a mano', () => {
  beforeEach(() => { archivio.clear(); dimenticaSegreti(); });

  it('segreto generato e confermato da noi: la chiave di stanza si rinnova una volta sola', () => {
    confermaSegreto('s1', nuovoSegretoStanza(), 'v'.repeat(64));
    expect(segretoDaRinnovare('s1')).toBe(true);
    expect(segretoDaRinnovare('s1')).toBe(false);
    expect(segretoDaRinnovare('sconosciuta')).toBe(false);
  });

  it('segreto ricevuto da un altro membro: nessun rinnovo (ce l\'hanno gia\' tutti)', async () => {
    const segreto = nuovoSegretoStanza();
    registraStanzaSegreto('s2', { verificatore_accesso: await verificatoreDa(segreto) });
    await imparaSegretoStanza('s2', segreto);
    expect(segretoDaRinnovare('s2')).toBe(false);
  });

  it('il rinnovo in sospeso sopravvive a un riavvio dell\'app', async () => {
    await impostaUtenteSegreti('alice');
    confermaSegreto('s3', nuovoSegretoStanza(), 'v'.repeat(64));
    await aspetta();
    dimenticaSegreti();
    await impostaUtenteSegreti('alice');
    expect(segretoDaRinnovare('s3')).toBe(true);
  });

  it('App rinnova la chiave di stanza anche per il segreto, lasciando com\'e\' il rinnovo del recapito', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).toContain('if (segretoDaRinnovare(normalizedRoom)) { olmService.clearOutboundGroupSession(username, normalizedRoom);');
    expect(app).toContain('if (recapitoDaRinnovare(normalizedRoom, peers)) {');
  });

  it('Dashboard ascolta i nomi e mostra il nome piu\' recente del gruppo', () => {
    const dash = readFileSync('src/pages/Dashboard.jsx', 'utf8');
    expect(dash).toContain("window.addEventListener('palacan:stanze-cambiate', aggiornaNomi);");
    expect(dash).toContain(": (nomeMostratoStanza(currentRoom) || t('dashboard.chat_layout.default_room_name_header')))");
    // il pannello delle impostazioni e' facoltativo: se usa ancora il nome del server, e' solo perche' lo script l'ha saltato
    expect(dash.includes('roomName={currentRoom.name}') && dash.includes('roomName={nomeMostratoStanza(currentRoom)}')).toBe(false);
  });
});
