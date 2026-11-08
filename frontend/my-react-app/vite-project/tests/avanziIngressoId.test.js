// tests/avanziIngressoId.test.js
//
// I gruppi sono solo su invito (decisione del 4 ottobre 2026): nell'interfaccia non deve restare niente che faccia
// credere che basti un identificativo o un "codice d'invito" per far entrare qualcuno in una conversazione.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync('src/pages/Dashboard.jsx', 'utf8').replace(/\r\n/g, '\n');

describe('nessun avanzo dell\'ingresso con identificativo', () => {
  it('il menu della conversazione non ha "Copia ID conversazione"', () => {
    expect(dashboard).not.toContain("t('dashboard.actions_menu.copy_id')");
    expect(dashboard).not.toMatch(/\bhandleCopyRoomId\b/);
  });

  it('il pannello delle informazioni non mostra ne\' copia un "codice d\'invito"', () => {
    expect(dashboard).not.toContain("t('dashboard.info_panel.invite_code_label')");
    expect(dashboard).not.toContain("t('dashboard.info_panel.copy_invite_button')");
    expect(dashboard).not.toMatch(/\bhandleCopyInvite\b/);  // handleCopyInviteLink (link a Palacan) resta
  });

  it('il menu "Nuova conversazione" non ha "Entra con ID"', () => {
    const inizio = dashboard.indexOf("t('dashboard.new_conversation.dropdown_new_title')");
    const fine = dashboard.indexOf('</AnimatePresence>', inizio);
    expect(inizio).toBeGreaterThan(0);
    expect(dashboard.slice(inizio, fine)).not.toContain('dropdown_join_title');
  });
});
