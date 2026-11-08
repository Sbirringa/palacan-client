// tests/linkInvito.test.js
//
// METADATI A3.2b-1: nome del gruppo nel link di invito (dopo il #) e rinomina agli altri membri.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { linkConNome, nomeDalLink, prendiNomeInvitoPendente } from '../src/utils/linkInvito';

describe('nome nel link di invito (metadati A3.2b-1)', () => {
  beforeEach(() => window.localStorage.clear());

  it('il nome va dopo il #, codificato', () => {
    expect(linkConNome('https://x/i/abc', 'Festa di Anna & co')).toBe('https://x/i/abc#n=Festa%20di%20Anna%20%26%20co');
    expect(linkConNome('https://x/i/abc', '')).toBe('https://x/i/abc');
  });

  it('la pagina legge il nome dal link e lo conserva per il riscatto (una volta sola)', () => {
    expect(nomeDalLink('#n=Festa%20di%20Anna%20%26%20co')).toBe('Festa di Anna & co');
    expect(prendiNomeInvitoPendente()).toBe('Festa di Anna & co');
    expect(prendiNomeInvitoPendente()).toBeNull();
  });

  it('link senza nome o malformato: nessun nome', () => {
    expect(nomeDalLink('')).toBeNull();
    expect(nomeDalLink('#altro=1')).toBeNull();
    expect(nomeDalLink('#n=%E0%A4%A')).toBeNull();
    expect(prendiNomeInvitoPendente()).toBeNull();
  });

  it('nome troppo lungo accorciato a 100 caratteri', () => {
    expect(nomeDalLink('#n=' + 'x'.repeat(300))).toHaveLength(100);
  });

  it('il nome non va al server: createInviteLink riceve un nome vuoto', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    const i = app.indexOf('const handleCreateInviteLink = useCallback(');
    const blocco = app.slice(i, i + 900);
    expect(blocco).toContain("'',  // [palacan-metadati-a3.2b1]");
    expect(blocco).not.toContain("roomName || '',");
    expect(blocco).toContain('linkConNome(');
  });

  it('rinomina: inviata cifrata sul canale delle reazioni e riconosciuta alla ricezione', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).toContain("{ tipo: 'nome_stanza', nome: pulito }");
    expect(app).toContain("parsed.tipo === 'nome_stanza'");
    expect(app).toContain("window.addEventListener('palacan:rinomina-gruppo'");
    expect(readFileSync('src/pages/Dashboard.jsx', 'utf8')).toContain("new CustomEvent('palacan:rinomina-gruppo'");
    expect(readFileSync('src/components/InviteLandingPage.jsx', 'utf8')).toContain('nomeDalLink()');
  });
});
