// tests/pannelliChiusura.test.js
//
// Le schermate si chiudono da sole dopo l'azione che conclude il compito.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync('src/pages/Dashboard.jsx', 'utf8').replace(/\r\n/g, '\n');  // fini riga Windows o Unix
const tra = (inizio, fine) => {
  const a = dashboard.indexOf(inizio);
  const b = dashboard.indexOf(fine, a + 1);
  return a >= 0 && b > a ? dashboard.slice(a, b) : '';
};

describe('schermate che si chiudono da sole', () => {
  it('invito in un gruppo: si chiude dopo l\'invito', () => {
    const pannello = tra('const AddFriendPanel = (', 'const RosterPanel = (');
    expect(pannello).toMatch(/invite_sent_prefix[^\n]*\n[^\n]*onClose\(\);[^\n]*palacan-pannelli-chiusura/);
  });

  it('richieste di contatto: accettare chiude il pannello, inviare una richiesta pure, rifiutare l\'ultima pure', () => {
    const pannello = tra('const IncomingContactRequestsPanel = (', 'const ManageListPanel = (');
    expect(pannello).toMatch(/now_in_contacts_suffix[^\n]*\n[^\n]*onClose\(\);/);
    expect(pannello).toMatch(/request_sent_prefix[^\n]*\n[^\n]*onClose\(\);/);
    expect(pannello).toMatch(/await onReject\(request\);\n[^\n]*length === 0[^\n]*onClose\(\);/);
  });

  it('accettando una richiesta di contatto si apre la chat con quella persona', () => {
    expect(dashboard).toMatch(/room_kind === 'direct'[^\n]*includes\(request\.sender_username\)/);
    expect(dashboard).toContain('await onSelectChat(diretta);');
  });

  it('inviti ai gruppi: accettare chiude il pannello, rifiutare l\'ultimo pure', () => {
    const pannello = tra('const IncomingInvitesPanel = (', 'const IncomingContactRequestsPanel = (');
    expect(pannello).toMatch(/await onAccept\([a-zA-Z]+\);\n[^\n]*onClose\(\);/);
    expect(pannello).toMatch(/await onReject\([a-zA-Z]+\);\n[^\n]*length === 0[^\n]*onClose\(\);/);
  });

  it('copiando il link d\'invito il pannello si chiude', () => {
    expect(dashboard).toMatch(/showToast\(t\('dashboard\.chat_layout\.invite_link_copied'\)\);\n[^\n]*closeInvitePanel\(\);/);
  });
});
