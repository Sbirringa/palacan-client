// tests/chiavePrincipale.test.js  [palacan-l4c2]
//
// L4c2 (Chiusura limiti): la chiave principale (ed25519 + ML-DSA-65) sul proprio dispositivo, con crittografia VERA
// (WASM: ed25519 dell'account Olm dedicato, ML-DSA-65). Server finto con le regole di L4c1.
//   - il primo dispositivo la crea, la pubblica con l'autofirma ibrida e si firma; la parte privata resta cifrata;
//   - un secondo dispositivo trova la chiave sul server: senza backup aspetta l'approvazione, col backup la adotta e
//     si firma da solo; un backup con una chiave VECCHIA non si adotta;
//   - due dispositivi che la creano insieme: vince il primo, l'altro non sostituisce niente;
//   - attacchi: impronta o autofirma rifatte dal server, firma spostata su un altro dispositivo o fatta da un'altra
//     chiave principale: rifiutate (servono ed25519 E ML-DSA-65);
//   - il backup unito di un altro dispositivo porta la chiave principale (cosi' i dispositivi gia' collegati la
//     ricevono senza approvazione).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import Olm from '../src/crypto/olm.js';
import { _usaArchivio } from '../src/utils/chiaveDispositivo';
import { unisciBundle } from '../src/utils/backupUnito';
import { improntaDi } from '../src/utils/firmaPq';

const MODULO = '../src/utils/chiavePrincipale.js';
let cp = null;

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
  cp = await import(/* @vite-ignore */ MODULO).catch(() => null);
});

function carica() {
  expect(cp, 'manca la chiave principale sul dispositivo').not.toBeNull();
  return cp;
}

function archivioInMemoria() {
  const m = new Map();
  return () => ({ leggi: async (v) => m.get(v), prendiOCrea: async (v, n) => { if (!m.has(v)) m.set(v, n); return m.get(v); } });
}

// server finto con le regole di L4c1
function server() {
  const s = { principale: null, firme: new Map(), pubblicazioni: 0, firmature: 0, rompi: null };
  const errore = (status, msg) => Object.assign(new Error(msg), { status });
  s.api = {
    getChiavePrincipale: async () => {
      if (!s.principale) throw errore(404, 'Chiave principale non trovata');
      return { ...s.principale, ...(s.rompi || {}) };
    },
    putChiavePrincipale: async (dati) => {
      const impronta = await improntaDi(dati.pq);
      if (s.principale && s.principale.impronta !== impronta) throw errore(409, 'gia\' presente');
      s.pubblicazioni += 1;
      s.principale = { ...dati, impronta, versione: 1 };
      return s.principale;
    },
    putFirmaDispositivo: async (deviceId, dati) => {
      if (!s.principale) throw errore(409, 'nessuna chiave principale');
      if (dati.impronta_principale !== s.principale.impronta) throw errore(409, 'non attuale');
      s.firmature += 1;
      s.firme.set(deviceId, { impronta: dati.impronta_principale, firma_ed: dati.firma_ed, firma_pq: dati.firma_pq });
      return { device_id: deviceId };
    },
  };
  s.bundle = (deviceId, curva) => ({ device_id: deviceId, identity_key: curva, firma_principale: s.firme.get(deviceId) || null });
  return s;
}

function nuovoDispositivo() {
  localStorage.clear();
  _usaArchivio(archivioInMemoria());
  cp._azzeraChiavePrincipale();
}

const prepara = (s, deviceId, curva, extra = {}) => cp.assicuraChiavePrincipale({ io: 'bob', token: 't', dispositivo: deviceId, curva, api: s.api, ...extra });

describe('L4c2 - chiave principale sul proprio dispositivo', () => {
  let s;
  beforeEach(() => {
    if (!cp) return;
    nuovoDispositivo();
    s = server();
  });

  it('il primo dispositivo la crea, la pubblica con l\'autofirma e si firma; la parte privata resta cifrata', async () => {
    carica();
    const esito = await prepara(s, 'D-pc', 'CURVA_PC');
    expect(esito.stato).toBe('firmato');
    expect(s.principale.impronta).toBe(esito.impronta);
    expect(await cp.verificaChiavePrincipale('bob', s.principale), 'autofirma non valida').toBe(true);
    expect(cp.dispositivoFirmato('bob', s.principale, s.bundle('D-pc', 'CURVA_PC')), 'dispositivo non firmato').toBe(true);
    expect((await prepara(s, 'D-pc', 'CURVA_PC')).stato).toBe('firmato');
    expect(s.pubblicazioni).toBe(1);
    expect(s.firmature).toBe(1);
    const salvato = localStorage.getItem(cp.CHIAVE_ARCHIVIO_PRINCIPALE('bob'));
    expect(salvato).toMatch(/^(d1|r1)\./);
    expect(salvato).not.toContain(cp.chiavePrincipalePerBackup('bob').seme);
    expect(cp.improntaPrincipale('bob')).toBe(esito.impronta);
  });

  it('secondo dispositivo: senza backup aspetta l\'approvazione, col backup la adotta e si firma da solo', async () => {
    carica();
    const primo = await prepara(s, 'D-pc', 'CURVA_PC');
    const voce = cp.chiavePrincipalePerBackup('bob');
    nuovoDispositivo();
    const secondo = await prepara(s, 'D-tel', 'CURVA_TEL');
    expect(secondo.stato, 'il secondo dispositivo ha creato un\'altra chiave principale').toBe('da_approvare');
    expect(s.pubblicazioni).toBe(1);
    expect(cp.chiavePrincipalePerBackup('bob')).toBeNull();
    cp.ripristinaChiavePrincipaleDaBackup('bob', voce);
    const dopo = await prepara(s, 'D-tel', 'CURVA_TEL');
    expect(dopo).toEqual({ stato: 'firmato', impronta: primo.impronta });
    expect(cp.dispositivoFirmato('bob', s.principale, s.bundle('D-tel', 'CURVA_TEL'))).toBe(true);
  });

  it('un backup con una chiave principale vecchia non si adotta', async () => {
    carica();
    await prepara(s, 'D-pc', 'CURVA_PC');
    const vecchia = cp.chiavePrincipalePerBackup('bob');
    // l'account viene ripristinato altrove e pubblica una chiave nuova (sostituzione lato server)
    const nuova = await cp.nuovaChiavePrincipale();
    const auto = cp.firmaConPrincipale(nuova, cp.CONTESTO_PRINCIPALE, cp.testoAutofirma('bob', nuova.ed, nuova.impronta));
    s.principale = { ed: nuova.ed, pq: nuova.pq, impronta: nuova.impronta, firma_ed: auto.fe, firma_pq: auto.fq, versione: 2 };
    s.firme.clear();
    expect((await prepara(s, 'D-pc', 'CURVA_PC')).stato, 'tiene una chiave principale che non e\' piu\' quella dell\'account').toBe('da_approvare');
    expect(cp.chiavePrincipalePerBackup('bob')).toBeNull();
    nuovoDispositivo();
    cp.ripristinaChiavePrincipaleDaBackup('bob', vecchia);
    expect((await prepara(s, 'D-tel', 'CURVA_TEL')).stato).toBe('da_approvare');
  });

  it('due dispositivi che la creano insieme: vince il primo, l\'altro non sostituisce niente', async () => {
    carica();
    const altro = await cp.nuovaChiavePrincipale();
    const auto = cp.firmaConPrincipale(altro, cp.CONTESTO_PRINCIPALE, cp.testoAutofirma('bob', altro.ed, altro.impronta));
    const getVero = s.api.getChiavePrincipale;
    let prima = true;
    s.api.getChiavePrincipale = async (...a) => {
      if (prima) { // il server e' vuoto quando lo legge, ma l'altro dispositivo pubblica subito dopo
        prima = false;
        s.principale = { ed: altro.ed, pq: altro.pq, impronta: altro.impronta, firma_ed: auto.fe, firma_pq: auto.fq, versione: 1 };
        throw Object.assign(new Error('Chiave principale non trovata'), { status: 404 });
      }
      return getVero(...a);
    };
    expect((await prepara(s, 'D-tel', 'CURVA_TEL')).stato).toBe('da_approvare');
    expect(s.principale.impronta).toBe(altro.impronta);
    expect(localStorage.getItem(cp.CHIAVE_ARCHIVIO_PRINCIPALE('bob'))).toBeNull();
  });

  it('attacchi del server: impronta, autofirma, firma spostata o di un\'altra chiave principale: rifiutate', async () => {
    carica();
    await prepara(s, 'D-pc', 'CURVA_PC');
    const vera = { ...s.principale };
    const altra = await cp.nuovaChiavePrincipale();
    const autoAltra = cp.firmaConPrincipale(altra, cp.CONTESTO_PRINCIPALE, cp.testoAutofirma('bob', altra.ed, altra.impronta));
    // chiave ML-DSA sostituita, impronta lasciata: non torna
    expect(await cp.verificaChiavePrincipale('bob', { ...vera, pq: altra.pq })).toBe(false);
    // chiave di un altro con la sua autofirma, presentata come quella di bob: l'autofirma lega anche il nome
    expect(await cp.verificaChiavePrincipale('alice', vera), 'autofirma valida anche per un altro nome').toBe(false);
    // solo la parte ed25519 sostituita (chiave e firma di un altro): non regge
    expect(await cp.verificaChiavePrincipale('bob', { ...vera, ed: altra.ed, firma_ed: autoAltra.fe })).toBe(false);
    // solo la parte ML-DSA della firma rotta
    expect(await cp.verificaChiavePrincipale('bob', { ...vera, firma_pq: autoAltra.fq })).toBe(false);
    // la firma del pc spostata su un altro dispositivo, o sulla stessa con un'altra curva
    const firmaPc = s.firme.get('D-pc');
    expect(cp.dispositivoFirmato('bob', vera, { device_id: 'D-intruso', identity_key: 'CURVA_PC', firma_principale: firmaPc })).toBe(false);
    expect(cp.dispositivoFirmato('bob', vera, { device_id: 'D-pc', identity_key: 'CURVA_INTRUSO', firma_principale: firmaPc })).toBe(false);
    // dispositivo firmato da un'altra chiave principale (con la sua impronta, o fingendo quella vera)
    const f = cp.firmaConPrincipale(altra, cp.CONTESTO_DISPOSITIVO, cp.testoFirmaDispositivo('bob', 'D-intruso', 'CURVA_X'));
    const intruso = { device_id: 'D-intruso', identity_key: 'CURVA_X', firma_principale: { impronta: vera.impronta, firma_ed: f.fe, firma_pq: f.fq } };
    expect(cp.dispositivoFirmato('bob', vera, intruso), 'dispositivo firmato da un\'altra chiave accettato').toBe(false);
    expect(cp.dispositivoFirmato('bob', vera, { device_id: 'D-pc', identity_key: 'CURVA_PC', firma_principale: null })).toBe(false);
    // sul server una chiave principale con l'autofirma rotta: il dispositivo non la adotta e non firma niente
    nuovoDispositivo();
    s.rompi = { firma_pq: autoAltra.fq };
    expect((await prepara(s, 'D-tel', 'CURVA_TEL')).stato).toBe('errore');
  });

  it('un dispositivo con la chiave principale ne approva un altro', async () => {
    carica();
    await prepara(s, 'D-pc', 'CURVA_PC');
    expect(await cp.firmaAltroDispositivo({ io: 'bob', token: 't', deviceId: 'D-nuovo', curva: 'CURVA_NUOVO', api: s.api })).toBe(true);
    expect(cp.dispositivoFirmato('bob', s.principale, s.bundle('D-nuovo', 'CURVA_NUOVO'))).toBe(true);
    nuovoDispositivo();
    expect(await cp.firmaAltroDispositivo({ io: 'bob', token: 't', deviceId: 'D-x', curva: 'C', api: s.api }), 'approva senza avere la chiave principale').toBe(false);
  });

  it('il backup unito di un altro dispositivo porta la chiave principale (e non la toglie chi non ce l\'ha)', async () => {
    carica();
    await prepara(s, 'D-pc', 'CURVA_PC');
    const voce = cp.chiavePrincipalePerBackup('bob');
    const unito = unisciBundle({ account: 'A', chiavePrincipale: voce }, { account: 'B' });
    expect(unito.chiavePrincipale).toEqual(voce);
  });

  it('collegamenti in olmService, App e apiService', () => {
    carica();
    const svc = readFileSync('src/olmService.js', 'utf8');
    for (const pezzo of [
      "import { chiavePrincipalePerBackup, ripristinaChiavePrincipaleDaBackup } from './utils/chiavePrincipale';",
      'chiavePrincipale: chiavePrincipalePerBackup(normalizedUsername)',
      'ripristinaChiavePrincipaleDaBackup(normalizedUsername, bundle.chiavePrincipale);',
    ]) expect(svc, `olmService: manca ${pezzo}`).toContain(pezzo);
    const app = readFileSync('src/App.jsx', 'utf8');
    for (const pezzo of ['assicuraChiavePrincipale({', 'ripristinaChiavePrincipaleDaBackup(username, esito.unito.chiavePrincipale);']) {
      expect(app, `App: manca ${pezzo}`).toContain(pezzo);
    }
    const api = readFileSync('src/apiService.js', 'utf8');
    for (const f of ['export const getChiavePrincipale', 'export const putChiavePrincipale', 'export const putFirmaDispositivo']) expect(api).toContain(f);
  });
});
