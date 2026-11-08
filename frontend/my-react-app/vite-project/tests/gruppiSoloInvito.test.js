// tests/gruppiSoloInvito.test.js
//
// Gruppi solo su invito: niente piu' "Entra con ID", niente password nella creazione dei gruppi,
// niente password chiesta all'apertura di un gruppo, niente lucchetto nell'elenco.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync('src/pages/Dashboard.jsx', 'utf8');
const app = readFileSync('src/App.jsx', 'utf8');

describe('gruppi solo su invito (frontend)', () => {
  it('"Entra con ID" non compare piu\' nel menu delle nuove conversazioni', () => {
    expect(dashboard).not.toContain('onJoin={openJoinPanel}');
    expect(dashboard).not.toContain('onJoin && onJoin();');
  });

  it('creando un gruppo non si chiede piu\' una password', () => {
    expect(dashboard).not.toContain('value={createRoomPwdInput}');
  });

  it('aprendo un gruppo non si chiede piu\' la password (ne\' nella Dashboard ne\' in App)', () => {
    expect(dashboard).not.toContain('if (hasPassword && normalizeRoomId(currentRoom?.id) !== normalizeRoomId(room?.id)) {');
    expect(app).not.toContain('room.has_password && !password');
    expect(app).not.toContain('room.has_password && password');
  });

  it('niente lucchetto accanto ai gruppi nell\'elenco', () => {
    expect(dashboard).not.toMatch(/getRoomPasswordFlag\(room\) && <Lock/);
  });
});
