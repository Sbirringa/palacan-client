// tests/invitoRichiesta.test.js
//
// Link d'invito come richiesta di contatto (frontend): l'esito del server, l'avviso a chi usa il link,
// "ha usato un tuo link d'invito" sulle richieste ricevute, i testi nelle cinque lingue.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as apiService from '../src/apiService';

const rispostaServer = (corpo) => vi.fn(async () => new Response(JSON.stringify(corpo), {
  status: 200, headers: { 'Content-Type': 'application/json' },
}));

afterEach(() => { vi.unstubAllGlobals(); });

describe('redeemInviteLink legge l\'esito del server', () => {
  it('richiesta inviata: nessuna stanza, e il nome di chi ha invitato', async () => {
    vi.stubGlobal('fetch', rispostaServer({ esito: 'richiesta_inviata', inviter_username: 'pippo', room: null }));
    const esito = await apiService.redeemInviteLink('TOKEN123', null, 'jwt');
    expect(esito).toEqual({ esito: 'richiesta_inviata', inviterUsername: 'pippo', room: null });
  });

  it('gia\' contatti (o si erano gia\' cercati): c\'e\' la stanza da aprire', async () => {
    vi.stubGlobal('fetch', rispostaServer({ esito: 'gia_contatti', inviter_username: 'pippo', room: { id: 'stanza-1', name: '' } }));
    const esito = await apiService.redeemInviteLink('TOKEN123', null, 'jwt');
    expect(esito.esito).toBe('gia_contatti');
    expect(esito.room && esito.room.id).toBe('stanza-1');
  });
});

describe('App: dopo l\'uso del link', () => {
  const app = readFileSync('src/App.jsx', 'utf8');
  it('con una richiesta non apre nessuna chat e prepara l\'avviso', () => {
    expect(app).toContain('const room = esitoInvito?.room || null;');
    expect(app).toMatch(/if \(!room\) \{[^\n]*palacan-invito-richiesta/);
    expect(app).toContain("sessionStorage.setItem('palacan_avviso_invito'");
    expect(app).toContain("new CustomEvent('palacan:invito-richiesta')");
  });
});

describe('Dashboard', () => {
  const dashboard = readFileSync('src/pages/Dashboard.jsx', 'utf8');
  it('mostra l\'avviso a chi ha usato il link (anche se la Dashboard si apre dopo)', () => {
    expect(dashboard).toContain("window.sessionStorage.getItem('palacan_avviso_invito')");
    expect(dashboard).toContain("window.addEventListener('palacan:invito-richiesta', mostraAvvisoInvito)");
    expect(dashboard).toContain("i18n.t('dashboard.contact_requests.invite_request_sent', { name: nome })");
  });
  it('sulle richieste ricevute dice se arrivano da un link d\'invito', () => {
    expect(dashboard).toContain("{request.via_invito && <p className={`text-xs ${T.textFaint}`}>{t('dashboard.contact_requests.via_invite')}</p>}");
  });
});

describe('testi nelle cinque lingue', () => {
  for (const lingua of ['en', 'it', 'fr', 'es', 'de']) {
    it(`${lingua}: i due testi nuovi ci sono e il file e' valido`, () => {
      const dati = JSON.parse(readFileSync(`src/locales/${lingua}.json`, 'utf8'));
      const sezione = dati.dashboard.contact_requests;
      expect(sezione.invite_request_sent).toContain('{{name}}');
      expect(sezione.via_invite.trim().length).toBeGreaterThan(0);
    });
  }
});
