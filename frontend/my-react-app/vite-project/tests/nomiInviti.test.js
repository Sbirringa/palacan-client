// tests/nomiInviti.test.js
//
// METADATI A3.2b-2: nome del gruppo negli inviti, sigillato per l'invitato (crittografia vera).
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

vi.mock('../src/wsClient', () => ({ sendToDevice: vi.fn(), sendMessage: vi.fn() }));
vi.mock('../src/utils/cronologiaLocale', () => ({ salvaDato: vi.fn(async () => true), leggiDato: vi.fn(async () => null) }));
vi.mock('../src/apiService', () => ({ getBustaKey: vi.fn(), inviteUserToRoom: vi.fn(async () => ({ ok: true })), queryMatrixKeys: vi.fn(), publishBustaKey: vi.fn() }));
import * as apiService from '../src/apiService';
import { bustaPubblica, _usaArchivio } from '../src/utils/busta';
import { sigilla } from '../src/utils/busteSigillate';
import { imparaNomeStanza, nomeLocale, dimenticaNomi } from '../src/utils/nomiStanze';
import { invitaConNome, apriNomiInviti } from '../src/utils/nomiInviti';

function archivioInMemoria() {
  const dati = new Map();
  return (u) => ({ leggi: async (k) => dati.get(`${u}:${k}`), scrivi: async (k, v) => { dati.set(`${u}:${k}`, v); } });
}

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

describe('nome del gruppo negli inviti (metadati A3.2b-2)', () => {
  beforeEach(() => { _usaArchivio(archivioInMemoria()); dimenticaNomi(); vi.clearAllMocks(); });

  it('il nome va nella busta dell\u0027invitato e solo lui lo apre', async () => {
    imparaNomeStanza('g1', 'Amici del calcetto');
    apiService.getBustaKey.mockResolvedValue(await bustaPubblica('bob'));
    await invitaConNome('g1', 'bob', 't');
    const argomenti = apiService.inviteUserToRoom.mock.calls[0];
    expect(argomenti.slice(0, 3)).toEqual(['g1', 'bob', 't']);
    expect(argomenti[3]).not.toContain('calcetto');
    const invito = { id: 'i1', room_id: 'g1', room_name: '', busta_nome: argomenti[3] };
    dimenticaNomi();
    const [aperto] = await apriNomiInviti([invito], 'bob');
    expect(aperto.room_name).toBe('Amici del calcetto');
    expect(nomeLocale('g1')).toBe('Amici del calcetto');
    const [perAltri] = await apriNomiInviti([invito], 'carol');
    expect(perAltri.room_name).toBe('');
  });

  it('senza nome conosciuto: la chiamata di sempre, con 3 argomenti', async () => {
    await invitaConNome('g2', 'bob', 't');
    expect(apiService.inviteUserToRoom.mock.calls[0]).toEqual(['g2', 'bob', 't']);
  });

  it('invitato senza busta, o errore nel cercarla: la chiamata di sempre', async () => {
    imparaNomeStanza('g3', 'X');
    apiService.getBustaKey.mockResolvedValueOnce(null);
    await invitaConNome('g3', 'bob', 't');
    apiService.getBustaKey.mockRejectedValueOnce(new Error('rete'));
    await invitaConNome('g3', 'bob', 't');
    expect(apiService.inviteUserToRoom.mock.calls).toEqual([['g3', 'bob', 't'], ['g3', 'bob', 't']]);
  });

  it('inviti senza busta o con busta rotta: invariati', async () => {
    const inviti = [{ id: 'a', room_name: 'Stanza' }, { id: 'b', room_name: '', busta_nome: 'AAAA' }];
    expect(await apriNomiInviti(inviti, 'bob')).toEqual(inviti);
  });

  it('una busta di altro tipo (es. una chiave) non diventa un nome', async () => {
    const altra = await sigilla(await bustaPubblica('bob'), { event_type: 'm.room_key', nome: 'Finto' });
    const [invito] = await apriNomiInviti([{ id: 'c', room_id: 'g9', room_name: '', busta_nome: altra }], 'bob');
    expect(invito.room_name).toBe('');
  });

  it('senza utente conosciuto: inviti invariati', async () => {
    const inviti = [{ id: 'd', busta_nome: 'x' }];
    expect(await apriNomiInviti(inviti, null)).toEqual(inviti);
  });

  it('Dashboard, ContactsList e PendingInvites usano i percorsi nuovi; niente piu\u0300 controllo ogni 15 secondi', () => {
    const dash = readFileSync('src/pages/Dashboard.jsx', 'utf8');
    expect(dash).toContain('return invitaConNome(roomId, username, authToken);');
    expect(dash).toContain('setPendingInvites(await apriNomiInviti(');
    expect(readFileSync('src/components/ContactsList.jsx', 'utf8')).toContain('await invitaConNome(newRoom.id, selectedContact.username, token);');
    const pend = readFileSync('src/components/PendingInvites.jsx', 'utf8');
    expect(pend).toContain('setInvites(await apriNomiInviti(');
    expect(pend).not.toContain('setInterval(fetchInvites, 15000)');
    expect(readFileSync('src/apiService.js', 'utf8')).toContain('...(bustaNome ? { busta_nome: bustaNome } : {}),');
  });
});
