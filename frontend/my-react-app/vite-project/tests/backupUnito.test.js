// tests/backupUnito.test.js  [palacan-n6] [palacan-n6b]
//
// Backup con piu' dispositivi: prima di caricare si unisce al backup del server (nessuna chiave dei gruppi si perde),
// stesso sale per tutti, e mai sovrascrivere un backup che non si riesce ad aprire con la chiave conservata.
// Crittografia vera (Argon2id + AES-GCM di olmService), archivio del dispositivo in memoria.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { _usaArchivio } from '../src/utils/cronologiaLocale';
import { chiaveBackupSalvata, conservaChiaveBackup, ricordaChiaveBackup, saleDelBackup } from '../src/utils/chiaveBackup';
import { unisciBundle, caricaBackupUnito, _dimenticaUltimoCaricato, MAX_TENTATIVI } from '../src/utils/backupUnito';
import * as apiVero from '../src/apiService';
import * as olmVero from '../src/olmService';

vi.setConfig({ testTimeout: 120000 }); // Argon2id e' lento apposta

const PASS = 'frase del backup lunga abbastanza';

function archivioPerUtente() {
  const utenti = new Map();
  return (u) => {
    if (!utenti.has(u)) utenti.set(u, { stanze: new Map(), chiavi: new Map() });
    const d = utenti.get(u);
    return {
      leggi: async (s, k) => d[s].get(k),
      scrivi: async (s, k, v) => { d[s].set(k, v); },
      cancella: async () => { utenti.delete(u); return true; },
    };
  };
}

// Server finto: un solo backup per utente, come key_backups, con la data di ultima modifica e il 409 di N6b
function server() {
  const s = { dati: null, versione: 0, caricamenti: 0, scaricamenti: 0, conflitti: 0 };
  const data = () => `v${s.versione}`;
  s.api = {
    downloadKeyBackup: vi.fn(async () => {
      s.scaricamenti += 1;
      return s.dati ? { ...s.dati, updated_at: data() } : null;
    }),
    uploadKeyBackup: vi.fn(async (payload, token, attese) => {
      if (attese && ((attese.nuovo && s.dati) || (attese.updated_at && (!s.dati || attese.updated_at !== data())))) {
        s.conflitti += 1;
        const e = new Error('409');
        e.status = 409;
        throw e;
      }
      s.dati = { encrypted_blob: payload.encrypted_blob, salt: payload.salt, kdf_iterations: payload.kdf_iterations };
      s.versione += 1;
      s.caricamenti += 1;
      return { ...s.dati, updated_at: data() };
    }),
  };
  // un altro dispositivo carica (senza passare da questa pagina)
  s.altroDispositivo = (payload) => {
    s.dati = { encrypted_blob: payload.encrypted_blob, salt: payload.salt, kdf_iterations: payload.kdf_iterations };
    s.versione += 1;
  };
  return s;
}

const bundleDi = (sessioni, extra = {}) => ({
  version: 1,
  username: 'alice',
  account: 'account-di-questo-dispositivo',
  sessions: null,
  inboundGroupSessions: JSON.stringify(sessioni),
  peerIdentityKeys: JSON.stringify({}),
  creatoriChiavi: JSON.stringify({}),
  ...extra,
});

const olmCon = (bundle) => ({ ...olmVero, buildBackupBundlePayload: () => JSON.parse(JSON.stringify(bundle)) });
const nessunDato = async () => ({ v: 1 });

beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

beforeEach(() => {
  _usaArchivio(archivioPerUtente());
  _dimenticaUltimoCaricato();
});

describe('unione di due backup', () => {
  it('chiavi dei gruppi sommate, nessuna persa; a parita\' vince il dispositivo', () => {
    const r = bundleDi({ s1: 'server-1', s2: 'server-2' });
    const l = bundleDi({ s2: 'locale-2', s3: 'locale-3' });
    const u = unisciBundle(r, l);
    expect(JSON.parse(u.inboundGroupSessions)).toEqual({ s1: 'server-1', s2: 'locale-2', s3: 'locale-3' });
    expect(typeof u.inboundGroupSessions).toBe('string');
    expect(u.account).toBe('account-di-questo-dispositivo');
  });

  it('registro dei creatori: vince la voce piu\' vecchia (chi ha creato davvero la chiave)', () => {
    const r = bundleDi({}, { creatoriChiavi: JSON.stringify({ k: { utente: 'bob', registrato: 100 }, solo: { utente: 'x', registrato: 5 } }) });
    const l = bundleDi({}, { creatoriChiavi: JSON.stringify({ k: { utente: 'mallory', registrato: 200 } }) });
    expect(JSON.parse(unisciBundle(r, l).creatoriChiavi)).toEqual({ k: { utente: 'bob', registrato: 100 }, solo: { utente: 'x', registrato: 5 } });
  });

  it('chiavi d\'identita\' dei contatti e dati personali uniti voce per voce', () => {
    const r = bundleDi({}, { peerIdentityKeys: JSON.stringify({ bob: 'vecchia', carol: 'c' }), datiPersonali: { v: 1, nomi_stanze: { a: 'Calcio', b: 'Tennis' }, specchio_liste: { x: 1 } } });
    const l = bundleDi({}, { peerIdentityKeys: JSON.stringify({ bob: 'nuova' }), datiPersonali: { v: 1, nomi_stanze: { a: 'Pallone' } } });
    const u = unisciBundle(r, l);
    expect(JSON.parse(u.peerIdentityKeys)).toEqual({ bob: 'nuova', carol: 'c' });
    expect(u.datiPersonali).toEqual({ v: 1, nomi_stanze: { a: 'Pallone', b: 'Tennis' }, specchio_liste: { x: 1 } });
  });

  it('valori illeggibili o assenti: non si perde niente', () => {
    expect(unisciBundle(null, bundleDi({ a: 1 }))).toEqual(bundleDi({ a: 1 }));
    const u = unisciBundle(bundleDi({ s: 'server' }), bundleDi({}, { inboundGroupSessions: null }));
    expect(JSON.parse(u.inboundGroupSessions)).toEqual({ s: 'server' });
    const rotto = unisciBundle(bundleDi({ s: 'server' }), bundleDi({}, { inboundGroupSessions: '{{rotto' }));
    expect(rotto.inboundGroupSessions).toBe('{{rotto');
  });
});

describe('olmService: chiave pronta con il sale del server', () => {
  it('stesso sale -> apre il backup cifrato con la passphrase; altro sale -> SALE_DIVERSO', async () => {
    const payload = await olmVero.encryptBackupBundle({ a: 1 }, PASS);
    const stessa = await olmVero.preparaChiaveBackup(PASS, payload.salt);
    expect(stessa.salt).toBe(payload.salt);
    expect(await olmVero.decryptBackupBundle(payload, stessa)).toEqual({ a: 1 });
    const altra = await olmVero.preparaChiaveBackup(PASS);
    await expect(olmVero.decryptBackupBundle(payload, altra)).rejects.toMatchObject({ codice: 'SALE_DIVERSO' });
    expect(await olmVero.decryptBackupBundle(payload, PASS)).toEqual({ a: 1 }); // con la passphrase, come sempre
  });

  it('saleDelBackup: Argon2id -> il suo sale; formato vecchio (PBKDF2) o assente -> null', () => {
    expect(saleDelBackup({ salt: 'S', kdf_iterations: 3 })).toBe('S');
    expect(saleDelBackup({ salt: 'S', kdf_iterations: 300000 })).toBeNull();
    expect(saleDelBackup(null)).toBeNull();
  });
});

describe('caricamento unito con due dispositivi', () => {
  it('portatile e telefono: le chiavi di entrambi restano nel backup, nell\'ordine che capita', async () => {
    const srv = server();
    // portatile, primo backup (passphrase appena scelta)
    const a1 = await caricaBackupUnito({ username: 'alice', token: 't', segreto: PASS, olm: olmCon(bundleDi({ portatile: 'p1' })), api: srv.api, esportaDati: nessunDato });
    expect(a1).toMatchObject({ esito: 'caricato', unito: false });
    expect(a1.segreto.salt).toBe(srv.dati.salt);
    expect((await chiaveBackupSalvata('alice')).salt).toBe(srv.dati.salt);

    // telefono: recupera con la passphrase, ha una chiave sua (altro dispositivo: altra memoria)
    _dimenticaUltimoCaricato();
    const b1 = await caricaBackupUnito({ username: 'alice', token: 't', segreto: PASS, olm: olmCon(bundleDi({ telefono: 't1' })), api: srv.api, esportaDati: nessunDato });
    expect(b1).toMatchObject({ esito: 'caricato', unito: true });
    expect(b1.segreto.salt).toBe(srv.dati.salt);

    // il portatile ricarica con la sua chiave pronta, senza la chiave del telefono: non la cancella
    _dimenticaUltimoCaricato();
    const a2 = await caricaBackupUnito({ username: 'alice', token: 't', segreto: a1.segreto, olm: olmCon(bundleDi({ portatile: 'p1', portatile2: 'p2' })), api: srv.api, esportaDati: nessunDato });
    expect(a2).toMatchObject({ esito: 'caricato', unito: true });

    const finale = await olmVero.decryptBackupBundle(srv.dati, PASS);
    expect(JSON.parse(finale.inboundGroupSessions)).toEqual({ portatile: 'p1', telefono: 't1', portatile2: 'p2' });
    expect(srv.caricamenti).toBe(3);
  });

  it('chiave conservata con un altro sale: NON si sovrascrive, la chiave si dimentica', async () => {
    const srv = server();
    srv.dati = await olmVero.encryptBackupBundle(bundleDi({ preziosa: 'x' }), PASS);
    const prima = { ...srv.dati };
    const vecchia = await olmVero.preparaChiaveBackup(PASS); // sale diverso da quello del server
    await conservaChiaveBackup('alice', vecchia);
    const r = await caricaBackupUnito({ username: 'alice', token: 't', segreto: vecchia, olm: olmCon(bundleDi({ altro: 'y' })), api: srv.api, esportaDati: nessunDato });
    expect(r).toEqual({ esito: 'fermo', motivo: 'sale' });
    expect(srv.api.uploadKeyBackup).not.toHaveBeenCalled();
    expect(srv.dati).toEqual(prima);
    expect(await chiaveBackupSalvata('alice')).toBeNull();
  });

  it('passphrase nuova che non apre il backup vecchio: il nuovo lo sostituisce (come prima)', async () => {
    const srv = server();
    srv.dati = await olmVero.encryptBackupBundle(bundleDi({ vecchia: 'v' }), 'una passphrase dimenticata da tempo');
    const r = await caricaBackupUnito({ username: 'alice', token: 't', segreto: PASS, olm: olmCon(bundleDi({ nuova: 'n' })), api: srv.api, esportaDati: nessunDato });
    expect(r).toMatchObject({ esito: 'caricato', unito: false });
    expect(JSON.parse((await olmVero.decryptBackupBundle(srv.dati, PASS)).inboundGroupSessions)).toEqual({ nuova: 'n' });
  });

  it('backup del server di un altro utente: fermo', async () => {
    const srv = server();
    srv.dati = await olmVero.encryptBackupBundle(bundleDi({}, { username: 'bob' }), PASS);
    const r = await caricaBackupUnito({ username: 'alice', token: 't', segreto: PASS, olm: olmCon(bundleDi({})), api: srv.api, esportaDati: nessunDato });
    expect(r).toEqual({ esito: 'fermo', motivo: 'utente' });
    expect(srv.api.uploadKeyBackup).not.toHaveBeenCalled();
  });

  it('rete giu\': errore, niente caricato', async () => {
    const srv = server();
    srv.api.downloadKeyBackup.mockRejectedValueOnce(new Error('rete'));
    const r = await caricaBackupUnito({ username: 'alice', token: 't', segreto: PASS, olm: olmCon(bundleDi({})), api: srv.api, esportaDati: nessunDato });
    expect(r.esito).toBe('errore');
    expect(srv.api.uploadKeyBackup).not.toHaveBeenCalled();
  });

  it('ricordaChiaveBackup con il backup del server: stesso sale', async () => {
    const payload = await olmVero.encryptBackupBundle({ a: 1 }, PASS);
    expect(await ricordaChiaveBackup('alice', PASS, olmVero.preparaChiaveBackup, payload)).toBe(true);
    expect((await chiaveBackupSalvata('alice')).salt).toBe(payload.salt);
  });
});

describe('[n6b] caricamenti contemporanei e meno scaricamenti', () => {
  const carica = (srv, sessioni, segreto = PASS) => caricaBackupUnito({ username: 'alice', token: 't', segreto, olm: olmCon(bundleDi(sessioni)), api: srv.api, esportaDati: nessunDato });

  it('stesso dispositivo, caricamenti di seguito: si scarica una volta sola', async () => {
    const srv = server();
    const a1 = await carica(srv, { p1: '1' });
    await carica(srv, { p1: '1', p2: '2' }, a1.segreto);
    await carica(srv, { p1: '1', p2: '2', p3: '3' }, a1.segreto);
    expect(srv.scaricamenti).toBe(1);
    expect(srv.caricamenti).toBe(3);
    expect(srv.api.uploadKeyBackup.mock.calls[0][2]).toEqual({ nuovo: true });
    expect(srv.api.uploadKeyBackup.mock.calls[2][2]).toEqual({ updated_at: 'v2' });
    expect(JSON.parse((await olmVero.decryptBackupBundle(srv.dati, PASS)).inboundGroupSessions)).toEqual({ p1: '1', p2: '2', p3: '3' });
  });

  it('un altro dispositivo carica nel frattempo: 409, si riunisce e si riprova, nessuna chiave persa', async () => {
    const srv = server();
    const a1 = await carica(srv, { portatile: 'p' });
    // il telefono (altra pagina) carica un backup con una chiave sua, cifrato con la stessa chiave
    const delTelefono = await olmVero.encryptBackupBundle(bundleDi({ portatile: 'p', telefono: 't' }), a1.segreto);
    srv.altroDispositivo(delTelefono);
    // il portatile carica ancora partendo da quello che ricordava: conflitto, poi unione e successo
    const a2 = await carica(srv, { portatile: 'p', portatile2: 'p2' }, a1.segreto);
    expect(a2).toMatchObject({ esito: 'caricato', unito: true });
    expect(srv.conflitti).toBe(1);
    expect(JSON.parse((await olmVero.decryptBackupBundle(srv.dati, PASS)).inboundGroupSessions)).toEqual({ portatile: 'p', telefono: 't', portatile2: 'p2' });
  });

  it('primo backup da due dispositivi insieme: il secondo trova quello del primo e lo unisce', async () => {
    const srv = server();
    const primo = await olmVero.encryptBackupBundle(bundleDi({ primo: '1' }), PASS);
    // tra lo scaricamento (vuoto) e il caricamento, l'altro dispositivo crea il backup
    srv.api.downloadKeyBackup.mockImplementationOnce(async () => {
      srv.scaricamenti += 1;
      srv.altroDispositivo(primo);
      return null;
    });
    const r = await carica(srv, { secondo: '2' });
    expect(r).toMatchObject({ esito: 'caricato', unito: true });
    expect(srv.conflitti).toBe(1);
    expect(JSON.parse((await olmVero.decryptBackupBundle(srv.dati, PASS)).inboundGroupSessions)).toEqual({ primo: '1', secondo: '2' });
  });

  it('conflitto continuo: al massimo MAX_TENTATIVI tentativi, poi errore e niente caricato', async () => {
    const srv = server();
    srv.api.uploadKeyBackup.mockImplementation(async () => {
      const e = new Error('409');
      e.status = 409;
      throw e;
    });
    const r = await carica(srv, { a: '1' });
    expect(r.esito).toBe('errore');
    expect(r.errore.status).toBe(409);
    expect(srv.api.uploadKeyBackup).toHaveBeenCalledTimes(MAX_TENTATIVI);
  });

  it('server senza la data (vecchio): si riscarica ogni volta, come in N6', async () => {
    const srv = server();
    const vero = srv.api.uploadKeyBackup.getMockImplementation();
    srv.api.uploadKeyBackup.mockImplementation(async (...a) => { await vero(...a); return {}; });
    const a1 = await carica(srv, { a: '1' });
    await carica(srv, { a: '1', b: '2' }, a1.segreto);
    expect(srv.scaricamenti).toBe(2);
  });
});

describe('[n6b] apiService.uploadKeyBackup', () => {
  it('dice al server da quale backup parte; il 409 arriva con il suo status', async () => {
    const corpi = [];
    const risposta = (stato, dati) => new Response(JSON.stringify(dati), { status: stato, headers: { 'Content-Type': 'application/json' } });
    const spia = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opzioni) => {
      corpi.push(JSON.parse(opzioni.body));
      return risposta(200, { encrypted_blob: 'b', salt: 's', kdf_iterations: 3, updated_at: 'v2' });
    });
    const p = { encrypted_blob: 'b', salt: 's', kdf_iterations: 3 };
    try {
      expect((await apiVero.uploadKeyBackup(p, 'tok', { updated_at: 'v1' })).updated_at).toBe('v2');
      await apiVero.uploadKeyBackup(p, 'tok', { nuovo: true });
      await apiVero.uploadKeyBackup(p, 'tok');
      expect(corpi[0]).toEqual({ ...p, expected_updated_at: 'v1' });
      expect(corpi[1]).toEqual({ ...p, expected_absent: true });
      expect(corpi[2]).toEqual(p);
      spia.mockImplementation(async () => risposta(409, { detail: 'conflitto' }));
      await expect(apiVero.uploadKeyBackup(p, 'tok', { updated_at: 'v1' })).rejects.toMatchObject({ status: 409 });
    } finally {
      spia.mockRestore();
    }
  });
});

describe('App.jsx', () => {
  const app = readFileSync('src/App.jsx', 'utf8').replace(/\r\n/g, '\n');
  it('i due caricamenti del backup (normale e all\'uscita) passano per l\'unione', () => {
    expect(app.split('caricaBackupUnito({').length - 1).toBe(2);
    expect(app).not.toMatch(/olmService\.encryptBackupBundle\(bundle,/);
  });
  it('dopo il recupero o la riattivazione la chiave si ricava con il sale del backup del server', () => {
    expect(app).toContain('ricordaChiaveBackup(username, passphrase, null, dati)');
    expect(app.split('ricordaChiaveBackup(res.user.username, passphrase, null, backupData)').length - 1).toBe(2);
  });
});
