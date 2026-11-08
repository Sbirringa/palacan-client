// tests/nomiStanze.test.js
//
// METADATI A3.1: nomi dei gruppi privati conservati sul dispositivo e trasportati dentro la chiave di stanza.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const archivio = new Map();
vi.mock('../src/utils/cronologiaLocale', () => ({
  salvaDato: vi.fn(async (u, nome, valore) => { archivio.set(`${u}:${nome}`, JSON.parse(JSON.stringify(valore))); return true; }),
  leggiDato: vi.fn(async (u, nome) => archivio.get(`${u}:${nome}`) ?? null),
}));
import { salvaDato } from '../src/utils/cronologiaLocale';
import { eGruppoPrivato, impostaUtenteNomi, imparaNomeStanza, nomeLocale, nomeDaCondividere, dimenticaNomi } from '../src/utils/nomiStanze';

describe('nomi dei gruppi privati (metadati A3.1)', () => {
  beforeEach(() => { dimenticaNomi(); archivio.clear(); vi.clearAllMocks(); });

  it('solo i gruppi privati: niente chat dirette ne\u0027 stanze aziendali', () => {
    expect(eGruppoPrivato({ room_kind: 'group' })).toBe(true);
    expect(eGruppoPrivato({})).toBe(true);
    expect(eGruppoPrivato({ room_kind: 'direct' })).toBe(false);
    expect(eGruppoPrivato({ is_corporate: true })).toBe(false);
    expect(eGruppoPrivato(null)).toBe(false);
  });

  it('impara e restituisce il nome; ignora i nomi vuoti', () => {
    expect(imparaNomeStanza('s1', '  Amici  ')).toBe(true);
    expect(nomeLocale('s1')).toBe('Amici');
    expect(nomeDaCondividere('s1')).toBe('Amici');
    expect(imparaNomeStanza('s1', '')).toBe(false);
    expect(imparaNomeStanza('', 'x')).toBe(false);
    expect(nomeLocale('sconosciuta')).toBeNull();
  });

  it('un nome piu\u0300 vecchio non sostituisce uno piu\u0300 recente', () => {
    imparaNomeStanza('s1', 'Nuovo', 2000);
    expect(imparaNomeStanza('s1', 'Vecchio', 1000)).toBe(false);
    expect(nomeLocale('s1')).toBe('Nuovo');
  });

  it('nome troppo lungo accorciato a 100 caratteri', () => {
    imparaNomeStanza('s1', 'x'.repeat(300));
    expect(nomeLocale('s1')).toHaveLength(100);
  });

  it('conservato cifrato sul dispositivo e ricaricato al prossimo accesso', async () => {
    vi.useFakeTimers();
    await impostaUtenteNomi('alice');
    imparaNomeStanza('s1', 'Amici');
    vi.advanceTimersByTime(600);
    vi.useRealTimers();
    await Promise.resolve();
    expect(salvaDato).toHaveBeenCalled();
    dimenticaNomi();
    expect(nomeLocale('s1')).toBeNull();
    await impostaUtenteNomi('alice');
    expect(nomeLocale('s1')).toBe('Amici');
  });

  it('cambio di utente: i nomi del precedente spariscono', async () => {
    await impostaUtenteNomi('alice');
    imparaNomeStanza('s1', 'Di alice');
    await impostaUtenteNomi('bob');
    expect(nomeLocale('s1')).toBeNull();
  });

  it('un nome nuovo chiede di ricaricare l\u0027elenco delle stanze', () => {
    const ricevuti = [];
    const ascolta = () => ricevuti.push(1);
    window.addEventListener('palacan:stanze-cambiate', ascolta);
    imparaNomeStanza('s1', 'Amici');
    imparaNomeStanza('s1', 'Amici');
    window.removeEventListener('palacan:stanze-cambiate', ascolta);
    expect(ricevuti).toHaveLength(1);
  });

  it('olmService porta room_name nel testo cifrato; App e apiService lo usano', () => {
    const olm = readFileSync('src/olmService.js', 'utf8');
    expect(olm.split('...(normalizedRoomKey.room_name ? { room_name: normalizedRoomKey.room_name } : {}),').length - 1).toBe(2);
    expect(olm).toContain('room_name: roomKeyContent.room_name ?? roomKeyContent.roomName ?? null');
    const app = readFileSync('src/App.jsx', 'utf8');
    for (const pezzo of ['nomeDaCondividere(normalizedRoom)', 'imparaNomeStanza(roomKeyContent.room_id', 'impostaUtenteNomi(currentUsername)', 'dimenticaNomi();']) expect(app).toContain(pezzo);
    expect(readFileSync('src/apiService.js', 'utf8')).toContain('nomeLocale(id)');
  });
});
