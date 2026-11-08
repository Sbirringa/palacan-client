// tests/chiaveDispositivo.test.js  [palacan-9a]
//
// Chiave del dispositivo: crittografia vera (WebCrypto) e Olm vero; archivio in memoria al posto di IndexedDB.
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import Olm from '../src/crypto/olm.js';
import {
  _usaArchivio, preparaChiaveDispositivo, statoChiaveDispositivo, cifraConDispositivo, decifraConDispositivo,
  formatoDispositivo, creaPickler, jsonPerBackup, jsonDaBackup,
} from '../src/utils/chiaveDispositivo';

const VECCHIA = 'chiave-vecchia-solo-per-la-prova';

// Un "browser": l'archivio sopravvive ai ricaricamenti della pagina (stato del modulo azzerato).
function browser() {
  const dati = new Map();
  let guasto = false;
  const fabbrica = () => ({
    leggi: async (k) => { if (guasto) throw new Error('guasto'); return dati.get(k); },
    prendiOCrea: async (k, v) => { if (guasto) throw new Error('guasto'); if (!dati.has(k)) dati.set(k, v); return dati.get(k); },
  });
  return { dati, fabbrica, guasta: (s) => { guasto = s; } };
}

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  window.OLM_OPTIONS = { locateFile: () => '/olm.wasm' };
  await Olm.init();
});

beforeEach(() => localStorage.clear());

describe('chiave del dispositivo', () => {
  it('si crea al primo avvio, non si può esportare e resta uguale ai caricamenti successivi', async () => {
    const b = browser();
    _usaArchivio(b.fabbrica);
    expect(await preparaChiaveDispositivo()).toBe('dispositivo');
    const record = b.dati.get('dispositivo');
    await expect(crypto.subtle.exportKey('raw', record.chiave)).rejects.toBeTruthy();
    const segreto = creaPickler(VECCHIA).locale();
    expect(segreto).not.toBe(VECCHIA);
    expect(segreto.length).toBeGreaterThanOrEqual(43);
    _usaArchivio(b.fabbrica);
    await preparaChiaveDispositivo();
    expect(creaPickler(VECCHIA).locale()).toBe(segreto);
  });

  it('il segreto non è salvato in chiaro', async () => {
    const b = browser();
    _usaArchivio(b.fabbrica);
    await preparaChiaveDispositivo();
    const segreto = creaPickler(VECCHIA).locale();
    const record = b.dati.get('dispositivo');
    expect(new TextDecoder().decode(new Uint8Array(record.dati))).not.toContain(segreto);
  });

  it('due schede al primo avvio: una sola chiave', async () => {
    const b = browser();
    _usaArchivio(b.fabbrica);
    await preparaChiaveDispositivo();
    const primo = creaPickler(VECCHIA).locale();
    _usaArchivio(b.fabbrica);
    await Promise.all([preparaChiaveDispositivo(), preparaChiaveDispositivo()]);
    expect(creaPickler(VECCHIA).locale()).toBe(primo);
  });

  it('browser senza archivio, mai avuta la chiave: si resta come prima (riserva)', async () => {
    const b = browser();
    b.guasta(true);
    _usaArchivio(b.fabbrica);
    expect(await preparaChiaveDispositivo()).toBe('riserva');
    expect(creaPickler(VECCHIA).locale()).toBe(VECCHIA);
  });

  it('chiave già usata ma ora illeggibile: bloccato, niente si legge o si scrive', async () => {
    const b = browser();
    _usaArchivio(b.fabbrica);
    await preparaChiaveDispositivo();
    const cifrato = await cifraConDispositivo('token-segreto', 'accesso:token');
    b.guasta(true);
    _usaArchivio(b.fabbrica);
    expect(await preparaChiaveDispositivo()).toBe('bloccato');
    expect(statoChiaveDispositivo()).toBe('bloccato');
    expect(() => creaPickler(VECCHIA).locale()).toThrow(/ricarica/);
    await expect(decifraConDispositivo(cifrato, 'accesso:token')).rejects.toMatchObject({ codice: 'CHIAVE_BLOCCATA' });
    await expect(cifraConDispositivo('x', 'y')).rejects.toMatchObject({ codice: 'CHIAVE_BLOCCATA' });
    b.guasta(false);
    _usaArchivio(b.fabbrica);
    await preparaChiaveDispositivo();
    expect(await decifraConDispositivo(cifrato, 'accesso:token')).toBe('token-segreto');
  });

  it('chiave sparita davvero (archivio vuoto): se ne crea una nuova', async () => {
    const b = browser();
    _usaArchivio(b.fabbrica);
    await preparaChiaveDispositivo();
    const vecchio = creaPickler(VECCHIA).locale();
    b.dati.clear();
    _usaArchivio(b.fabbrica);
    expect(await preparaChiaveDispositivo()).toBe('dispositivo');
    expect(creaPickler(VECCHIA).locale()).not.toBe(vecchio);
  });
});

describe('cifratura dei dati nel browser', () => {
  beforeEach(() => _usaArchivio(browser().fabbrica));

  it('andata e ritorno; il testo non resta in chiaro; formato riconosciuto', async () => {
    const cifrato = await cifraConDispositivo('il-mio-token', 'accesso:token');
    expect(cifrato).not.toContain('il-mio-token');
    expect(formatoDispositivo(cifrato)).toBe(true);
    expect(formatoDispositivo('eyJhbGciOi...')).toBe(false);
    expect(await decifraConDispositivo(cifrato, 'accesso:token')).toBe('il-mio-token');
  });

  it('un valore non si può spostare sotto un altro nome', async () => {
    const cifrato = await cifraConDispositivo('admin', 'accesso:user_role');
    await expect(decifraConDispositivo(cifrato, 'accesso:username')).rejects.toBeTruthy();
  });

  it('il formato vecchio non si decifra', async () => {
    await expect(decifraConDispositivo('QUJD', 'accesso:token')).rejects.toThrow(/formato vecchio/);
  });
});

describe('pickle Olm con la chiave del dispositivo (Olm vero)', () => {
  let pickler;
  beforeEach(async () => {
    _usaArchivio(browser().fabbrica);
    await preparaChiaveDispositivo();
    pickler = creaPickler(VECCHIA);
  });

  function nuovoAccount() {
    const a = new Olm.Account();
    a.create();
    return a;
  }

  it('dato salvato prima della 9a: si legge una volta e va riscritto', () => {
    const a = nuovoAccount();
    const identita = a.identity_keys();
    const pVecchio = a.pickle(VECCHIA);
    const { oggetto, migrato } = pickler.daPickle(Olm.Account, pVecchio);
    expect(migrato).toBe(true);
    expect(oggetto.identity_keys()).toBe(identita);
    const pNuovo = oggetto.pickle(pickler.locale());
    const riletto = pickler.daPickle(Olm.Account, pNuovo);
    expect(riletto.migrato).toBe(false);
    expect(riletto.oggetto.identity_keys()).toBe(identita);
    [a, oggetto, riletto.oggetto].forEach((x) => x.free());
  });

  it('il pickle nuovo NON si apre con la chiave vecchia (quella pubblica nel codice)', () => {
    const a = nuovoAccount();
    const pNuovo = a.pickle(pickler.locale());
    const b = new Olm.Account();
    expect(() => b.unpickle(VECCHIA, pNuovo)).toThrow();
    a.free();
  });

  it('pickle rovinato: errore, come prima', () => {
    expect(() => pickler.daPickle(Olm.Account, 'rovinato')).toThrow();
  });

  it('backup: formato di sempre (chiave vecchia) e ritorno alla chiave del dispositivo', () => {
    const a = nuovoAccount();
    const identita = a.identity_keys();
    const pLocale = a.pickle(pickler.locale());
    const pBackup = pickler.perBackup(Olm.Account, pLocale);
    const c = new Olm.Account();
    c.unpickle(VECCHIA, pBackup);
    expect(c.identity_keys()).toBe(identita);
    // un altro browser, con un'altra chiave del dispositivo, recupera il backup
    _usaArchivio(browser().fabbrica);
    return preparaChiaveDispositivo().then(() => {
      const altro = creaPickler(VECCHIA);
      const pRipristinato = altro.daBackup(Olm.Account, pBackup);
      const d = new Olm.Account();
      d.unpickle(altro.locale(), pRipristinato);
      expect(d.identity_keys()).toBe(identita);
      expect(() => altro.daBackup(Olm.Account, 'rovinato')).toThrow(/Backup non leggibile/);
      expect(altro.daBackupOppureCosi(Olm.Account, 'rovinato')).toBe('rovinato');
      expect(jsonDaBackup(altro, Olm.InboundGroupSession, 'non json')).toBe('non json');
      expect(JSON.parse(jsonDaBackup(altro, Olm.InboundGroupSession, '{"s1":"rotta"}'))).toEqual({ s1: 'rotta' });
      [a, c, d].forEach((x) => x.free());
    });
  });

  it('archivi JSON (sessioni Megolm e Olm): voce per voce, le voci rotte si saltano', () => {
    const uscita = new Olm.OutboundGroupSession();
    uscita.create();
    const entrata = new Olm.InboundGroupSession();
    entrata.create(uscita.session_key());
    const id = entrata.session_id();
    const locale = JSON.stringify({ [id]: entrata.pickle(pickler.locale()), rotta: 'xxx' });
    const backup = jsonPerBackup(pickler, Olm.InboundGroupSession, locale);
    expect(Object.keys(JSON.parse(backup))).toEqual([id]);
    const ripristinato = jsonDaBackup(pickler, Olm.InboundGroupSession, backup);
    const s = new Olm.InboundGroupSession();
    s.unpickle(pickler.locale(), JSON.parse(ripristinato)[id]);
    const cifrato = uscita.encrypt('ciao');
    expect(s.decrypt(cifrato).plaintext).toBe('ciao');
    const conListe = jsonPerBackup(pickler, Olm.InboundGroupSession, JSON.stringify({ bob: [entrata.pickle(pickler.locale())] }));
    expect(Array.isArray(JSON.parse(conListe).bob)).toBe(true);
    expect(jsonPerBackup(pickler, Olm.InboundGroupSession, 'non json')).toBeNull();
    expect(jsonPerBackup(pickler, Olm.InboundGroupSession, null)).toBeNull();
    [uscita, entrata, s].forEach((x) => x.free());
  });

  it('stato riserva: chiave vecchia per leggere e scrivere, come prima', async () => {
    localStorage.clear(); // questo browser non ha mai avuto la chiave del dispositivo
    const b = browser();
    b.guasta(true);
    _usaArchivio(b.fabbrica);
    await preparaChiaveDispositivo();
    const p = creaPickler(VECCHIA);
    const a = nuovoAccount();
    const { oggetto, migrato } = p.daPickle(Olm.Account, a.pickle(VECCHIA));
    expect(migrato).toBe(false);
    [a, oggetto].forEach((x) => x.free());
  });
});
