// tests/gruppiPrivati.test.js
//
// METADATI A3.2a: creare un gruppo privato senza mandare il nome al server.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../src/utils/nomiStanze', () => ({ imparaNomeStanza: vi.fn() }));
vi.mock('../src/apiService', () => ({ createRoom: vi.fn() }));
import { imparaNomeStanza } from '../src/utils/nomiStanze';
import { creaStanzaSenzaNome } from '../src/utils/gruppiPrivati';

describe('gruppi privati senza nome sul server (metadati A3.2a)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gruppo privato: al server il nome vuoto, sul dispositivo il nome vero', async () => {
    const crea = vi.fn(async () => ({ id: 'g1', is_corporate: false, name: '' }));
    await creaStanzaSenzaNome('Amici', 'segreta123', 't', false, crea);
    expect(crea).toHaveBeenCalledTimes(1);
    expect(crea.mock.calls[0][0]).toBe('');
    expect(imparaNomeStanza).toHaveBeenCalledWith('g1', 'Amici');
  });

  it('stanza aziendale: il server chiede il nome e si riprova con il nome', async () => {
    const crea = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Nome stanza obbligatorio'), { status: 400 }))
      .mockResolvedValueOnce({ id: 'c1', is_corporate: true, name: 'Vendite' });
    const stanza = await creaStanzaSenzaNome('Vendite', '', 't', false, crea);
    expect(crea.mock.calls.map((c) => c[0])).toEqual(['', 'Vendite']);
    expect(stanza.name).toBe('Vendite');
    expect(imparaNomeStanza).not.toHaveBeenCalled();
  });

  it('un altro errore (es. password corta) non fa mai partire il nome verso il server', async () => {
    const crea = vi.fn().mockRejectedValue(new Error('Password minimo 8 caratteri'));
    await expect(creaStanzaSenzaNome('Amici', 'corta', 't', false, crea)).rejects.toThrow('Password');
    expect(crea).toHaveBeenCalledTimes(1);
    expect(crea.mock.calls[0][0]).toBe('');
  });

  it('App, ContactsList e Dashboard usano i percorsi senza nome', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).toContain("apiService.createRoom(currentWorkspaceId ? name : ''");
    expect(readFileSync('src/components/ContactsList.jsx', 'utf8')).toContain('creaStanzaSenzaNome(newRoomName');
    const dash = readFileSync('src/pages/Dashboard.jsx', 'utf8');
    expect(dash).toContain("apiService.renameRoom(room.id, privato ? ' ' : value.trim(), authToken)");
  });
});
