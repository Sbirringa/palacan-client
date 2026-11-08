// tests/richiesteChiavi.test.js  [palacan-n5] [palacan-n5d]
//
// Recupero delle chiavi di stanza dagli altri membri: regole su chi riceve cosa, e giri completi con Olm vera
// (sessione Olm 1:1 come nella condivisione normale, export/import della chiave Megolm, messaggio decifrato).
// Il percorso vero di olmService (encryptForwardedRoomKeys) e' provato in olmService.chiaviInoltrate.test.js.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import Olm from '../src/crypto/olm.js';
import { registraCreatore, leggiCreatore } from '../src/utils/creatoriChiavi';
import {
  aData, destinatariRichiesta, programmaRichiestaMembri, segnaRichiesta, richiestaAperta, chiaviDaInoltrare,
  gestisciEventoChiaveMembro, _azzeraRichieste, PAUSA_RICHIESTE_MS,
} from '../src/utils/richiesteChiavi';

const ORA = Date.parse('2026-10-26T12:00:00Z');
const ISO = (ms) => new Date(ms).toISOString().replace('Z', ''); // come il server prima di N5: senza fuso

beforeAll(async () => {
  await Olm.init({ locateFile: () => '/olm.wasm' });
});

beforeEach(() => {
  localStorage.clear();
  _azzeraRichieste();
});

afterEach(() => {
  vi.useRealTimers();
  _azzeraRichieste();
});

function chiavePropria(io, sid, stanza, quando) {
  vi.setSystemTime(quando);
  registraCreatore(io, sid, { utente: io, verifica: 'propria', stanza });
}

describe('regole di inoltro', () => {
  it('date del server senza fuso sono UTC', () => {
    expect(aData('2026-10-26T12:00:00')).toBe(ORA);
    expect(aData('2026-10-26T12:00:00.000Z')).toBe(ORA);
    expect(aData('2026-10-26T14:00:00+02:00')).toBe(ORA);
    expect(aData(null)).toBeNull();
    expect(aData('boh')).toBeNull();
  });

  it('si chiede agli altri membri, senza se stessi e senza doppioni', () => {
    expect(destinatariRichiesta([{ username: 'a' }, { username: 'b' }, { username: 'a' }, { username: 'io' }, {}], 'io')).toEqual(['a', 'b']);
  });

  it('chiavi proprie: della stanza, nate dopo l\'ingresso di chi chiede, e che si hanno davvero', () => {
    vi.useFakeTimers();
    chiavePropria('alice', 'prima', 'S', ORA - 60000); // nata prima che bob entrasse
    chiavePropria('alice', 'dopo1', 'S', ORA + 1000);
    chiavePropria('alice', 'dopo2', 'S', ORA + 2000);
    chiavePropria('alice', 'altra', 'ALTRA', ORA + 3000); // altra stanza
    chiavePropria('alice', 'persa', 'S', ORA + 4000); // non piu' tra le sessioni
    registraCreatore('alice', 'dicarol', { utente: 'carol', verifica: 'coerente', stanza: 'S', chiave: 'k' }); // di un terzo
    registraCreatore('alice', 'restituitaAdAlice', { utente: 'alice', verifica: 'restituita', stanza: 'S' }); // mai come propria
    const sessioni = { prima: {}, dopo1: {}, dopo2: {}, altra: {}, dicarol: {}, restituitaAdAlice: {} };
    const partecipanti = [{ username: 'alice' }, { username: 'bob', joined_at: ISO(ORA) }];
    const scelte = chiaviDaInoltrare({ io: 'alice', richiedente: 'bob', stanza: 'S', partecipanti, sessioniEntranti: sessioni });
    expect(scelte.sort()).toEqual(['dopo1', 'dopo2']);
  });

  it('chiavi di chi chiede: restituite solo se il suo autore era verificato (anche se entrato dopo)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(ORA);
    registraCreatore('alice', 'diBob', { utente: 'bob', verifica: 'coerente', stanza: 'S' });
    registraCreatore('alice', 'diBobPrima', { utente: 'bob', verifica: 'prima_volta', stanza: 'S' });
    registraCreatore('alice', 'diBobDalServer', { utente: 'bob', verifica: 'server', stanza: 'S' });
    registraCreatore('alice', 'diBobDiversa', { utente: 'bob', verifica: 'diversa', stanza: 'S' });
    registraCreatore('alice', 'diBobAltrove', { utente: 'bob', verifica: 'coerente', stanza: 'ALTRA' });
    const sessioni = { diBob: {}, diBobPrima: {}, diBobDalServer: {}, diBobDiversa: {}, diBobAltrove: {} };
    const scelte = chiaviDaInoltrare({ io: 'alice', richiedente: 'bob', stanza: 'S', partecipanti: [{ username: 'bob' }], sessioniEntranti: sessioni });
    expect(scelte.sort()).toEqual(['diBob', 'diBobPrima']);
  });

  it('niente chiavi a chi non e\' membro, proprie a chi non ha data di ingresso, niente a se stessi', () => {
    vi.useFakeTimers();
    chiavePropria('alice', 'k1', 'S', ORA + 1000);
    const sessioni = { k1: {} };
    const base = { io: 'alice', stanza: 'S', sessioniEntranti: sessioni };
    expect(chiaviDaInoltrare({ ...base, richiedente: 'eve', partecipanti: [{ username: 'bob', joined_at: ISO(ORA) }] })).toEqual([]);
    expect(chiaviDaInoltrare({ ...base, richiedente: 'bob', partecipanti: [{ username: 'bob' }] })).toEqual([]);
    expect(chiaviDaInoltrare({ ...base, richiedente: 'alice', partecipanti: [{ username: 'alice', joined_at: ISO(ORA) }] })).toEqual([]);
    expect(chiaviDaInoltrare({ ...base, richiedente: 'bob', partecipanti: [{ username: 'bob', joined_at: ISO(ORA) }] })).toEqual(['k1']);
  });
});

describe('quando si chiede', () => {
  it('dopo qualche secondo, una volta sola, e non piu\' di una volta al minuto per stanza', async () => {
    vi.useFakeTimers();
    const esegui = vi.fn(async () => true);
    expect(programmaRichiestaMembri('S', esegui)).toBe(true);
    expect(programmaRichiestaMembri('S', esegui)).toBe(false); // gia' programmata
    expect(esegui).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(6000);
    expect(esegui).toHaveBeenCalledTimes(1);
    expect(programmaRichiestaMembri('S', esegui)).toBe(false); // pausa
    await vi.advanceTimersByTimeAsync(PAUSA_RICHIESTE_MS);
    expect(programmaRichiestaMembri('S', esegui)).toBe(true);
    expect(programmaRichiestaMembri('ALTRA', esegui)).toBe(true);
  });

  it('se non e\' partita (es. la chiave e\' arrivata nel frattempo) si puo\' riprovare subito', async () => {
    vi.useFakeTimers();
    const esegui = vi.fn(async () => false);
    programmaRichiestaMembri('S', esegui);
    await vi.advanceTimersByTimeAsync(6000);
    expect(programmaRichiestaMembri('S', esegui)).toBe(true);
  });

  it('una richiesta resta aperta per qualche minuto', () => {
    vi.useFakeTimers();
    vi.setSystemTime(ORA);
    expect(richiestaAperta('S')).toBe(false);
    segnaRichiesta('S');
    expect(richiestaAperta('S')).toBe(true);
    vi.setSystemTime(ORA + 11 * 60 * 1000);
    expect(richiestaAperta('S')).toBe(false);
  });
});

// ---------- giri completi con Olm vera ----------

const rubrica = new Map(); // nome -> persona (per trovare chiave d'identita' e OTK di un destinatario)

function persona(nome) {
  const account = new Olm.Account();
  account.create();
  account.generate_one_time_keys(5);
  const otk = Object.values(JSON.parse(account.one_time_keys()).curve25519)[0];
  account.mark_keys_as_published();
  const ik = JSON.parse(account.identity_keys()).curve25519;
  const p = { nome, account, ik, otk, sessioni: {}, entranti: {}, inviati: [] };
  rubrica.set(nome, p);
  return p;
}

// Sessione Olm 1:1 per nome del contatto, riusata, come nella condivisione normale (solo per il test).
function sessioneVerso(p, nome) {
  if (!p.sessioni[nome]) {
    const lui = rubrica.get(nome);
    const s = new Olm.Session();
    s.create_outbound(p.account, lui.ik, lui.otk);
    p.sessioni[nome] = s;
  }
  return p.sessioni[nome];
}

function olmDi(p, opzioni = {}) {
  return {
    getCurve25519Key: () => p.ik,
    exportRoomKeyForForwarding: (mappa, sid) => (mappa[sid] ? mappa[sid].export_session(mappa[sid].first_known_index()) : null),
    encryptForwardedRoomKeys: vi.fn(async ({ targetUsername, roomId, chiavi }) => {
      const contenuto = { type: 'm.forwarded_room_keys', content: { algorithm: 'm.megolm.v1.aes-sha2', room_id: roomId, chiavi: opzioni.altera ? opzioni.altera(chiavi) : chiavi } };
      const c = sessioneVerso(p, targetUsername).encrypt(JSON.stringify(contenuto));
      return [{ type: c.type, body: c.body, peerIdentityKey: rubrica.get(targetUsername).ik, deviceId: null }];
    }),
    decryptOlmEvent: async ({ senderUsername, messageType, messageBody }) => {
      let s = p.sessioni[senderUsername];
      if (!s) {
        s = new Olm.Session();
        s.create_inbound_from(p.account, rubrica.get(senderUsername).ik, messageBody);
        p.account.remove_one_time_keys(s);
        p.sessioni[senderUsername] = s;
      }
      return { plaintext: s.decrypt(messageType, messageBody) };
    },
    safeParseOlmPayload: (t) => { try { return JSON.parse(t); } catch (_) { return t; } },
    receiveForwardedRoomKey: ({ roomKeyContent, inboundGroupSessions }) => {
      const s = new Olm.InboundGroupSession();
      s.import_session(roomKeyContent.session_key);
      inboundGroupSessions[roomKeyContent.session_id] = s;
      return s;
    },
    saveInboundGroupSessions: vi.fn(),
    loadPeerIdentityKey: () => null,
  };
}

function ambiente(p, rete, extra = {}, opzioniOlm = {}) {
  return {
    io: p.nome, token: 't', account: p.account, olm: olmDi(p, opzioniOlm), api: rete,
    sessioniEntranti: () => p.entranti, aggiornaSessioniEntranti: (m) => { p.entranti = m; },
    sessioniPeer: p.sessioni, sincronizzaSessioni: () => {}, aggiornaAccount: () => {},
    inviaToDevice: (ev) => p.inviati.push(ev), inAttesa: {}, ritenta: vi.fn(async () => {}),
    stanzaAperta: () => null, ricaricaCronologia: vi.fn(), salvaBackup: vi.fn(),
    ...extra,
  };
}

const richiesta = () => ({ eventType: 'm.room_key_request', mittente: 'bob', content: { room_id: 'S', requesting_device_id: 'DEV-bob' } });
const inoltro = (alice) => ({ eventType: 'm.forwarded_room_key', mittente: 'alice', data: { sender_key: alice.ik }, content: alice.inviati[alice.inviati.length - 1].content });

describe('giri completi (Olm vera)', () => {
  // alice crea una chiave della stanza (propria); se "diBob", alice ha anche una chiave creata da bob.
  function scena({ bobEntrato = ORA - 3600000, chiaveDiBob = false, registroDiBob = true } = {}) {
    rubrica.clear();
    const alice = persona('alice');
    const bob = persona('bob');
    vi.setSystemTime(ORA);
    const nuova = () => {
      const u = new Olm.OutboundGroupSession();
      u.create();
      const copia = new Olm.InboundGroupSession();
      copia.create(u.session_key());
      return { u, copia, sid: u.session_id() };
    };
    const diAlice = nuova();
    alice.entranti[diAlice.sid] = diAlice.copia;
    registraCreatore('alice', diAlice.sid, { utente: 'alice', verifica: 'propria', stanza: 'S' });
    const out = { alice, bob, sid: diAlice.sid, cifrato: diAlice.u.encrypt('ciao dal passato') };
    if (chiaveDiBob) {
      const diBob = nuova();
      alice.entranti[diBob.sid] = diBob.copia; // alice l'aveva ricevuta da bob
      registraCreatore('alice', diBob.sid, { utente: 'bob', verifica: 'coerente', stanza: 'S', chiave: bob.ik });
      if (registroDiBob) registraCreatore('bob', diBob.sid, { utente: 'bob', verifica: 'propria', stanza: 'S' }); // bob ha perso la chiave, non il registro
      out.sidBob = diBob.sid;
      out.cifratoBob = diBob.u.encrypt('mio messaggio perso');
    }
    out.rete = {
      getRoomUsers: vi.fn(async () => [{ username: 'alice', joined_at: ISO(ORA - 7200000) }, { username: 'bob', joined_at: ISO(bobEntrato) }]),
    };
    return out;
  }

  it('bob chiede, alice inoltra in un messaggio cifrato, bob importa e legge il messaggio in attesa', async () => {
    vi.useFakeTimers();
    const { alice, bob, sid, cifrato, rete } = scena();
    const ambA = ambiente(alice, rete);
    expect(await gestisciEventoChiaveMembro(richiesta(), ambA)).toBe(1);
    const ev = alice.inviati[0];
    expect(ev.eventType).toBe('m.forwarded_room_key');
    expect(ev.targetUsername).toBe('bob');
    expect(Object.keys(ev.content.ciphertext)).toEqual([bob.ik]);
    expect(JSON.stringify(ev)).not.toContain(alice.entranti[sid].export_session(0)); // la chiave non viaggia in chiaro
    expect(JSON.stringify(ev)).not.toContain('creatore'); // l'autore e' solo dentro la parte cifrata
    expect(ambA.olm.encryptForwardedRoomKeys.mock.calls[0][0]).toMatchObject({ targetUsername: 'bob', roomId: 'S', chiavi: [{ session_id: sid, creatore: 'alice' }] });

    segnaRichiesta('S');
    const attesa = { 'stanza:S': [{ messageId: 'm1', roomId: 'S', cipherBody: cifrato }] };
    const ritenta = vi.fn(async (item) => bob.entranti[sid].decrypt(item.cipherBody).plaintext);
    const ambB = ambiente(bob, rete, { inAttesa: attesa, ritenta, stanzaAperta: () => 'S' });
    expect(await gestisciEventoChiaveMembro(inoltro(alice), ambB)).toEqual({ sue: 1, proprie: 0 });
    expect(await ritenta.mock.results[0].value).toBe('ciao dal passato');
    expect(attesa['stanza:S']).toBeUndefined();
    expect(leggiCreatore('bob', sid)).toMatchObject({ utente: 'alice', stanza: 'S', chiave: alice.ik });
    await vi.advanceTimersByTimeAsync(600);
    expect(ambB.ricaricaCronologia).toHaveBeenCalledTimes(1);
    expect(ambB.salvaBackup).toHaveBeenCalledTimes(1);
  });

  it('la sessione Olm usata per l\'inoltro e\' quella normale tra i due (nessuna sessione in piu\')', async () => {
    vi.useFakeTimers();
    const { alice, bob, rete } = scena();
    const prima = sessioneVerso(alice, 'bob'); // condivisione normale gia' avvenuta
    await gestisciEventoChiaveMembro(richiesta(), ambiente(alice, rete));
    expect(Object.keys(alice.sessioni)).toEqual(['bob']);
    expect(alice.sessioni.bob).toBe(prima);
    segnaRichiesta('S');
    expect(await gestisciEventoChiaveMembro(inoltro(alice), ambiente(bob, rete))).toEqual({ sue: 1, proprie: 0 });
    expect(Object.keys(bob.sessioni)).toEqual(['alice']);
  });

  it('bob ritrova un suo messaggio (il registro lo sa suo): alice gli restituisce la chiave e l\'autore resta bob', async () => {
    vi.useFakeTimers();
    const { alice, bob, sidBob, cifratoBob, rete } = scena({ chiaveDiBob: true, bobEntrato: ORA + 999999 });
    expect(await gestisciEventoChiaveMembro(richiesta(), ambiente(alice, rete))).toBe(1); // solo quella di bob: entrato "dopo"
    segnaRichiesta('S');
    const attesa = { 'stanza:S': [{ messageId: 'm1', roomId: 'S', cipherBody: cifratoBob }] };
    const ritenta = vi.fn(async (item) => bob.entranti[sidBob].decrypt(item.cipherBody).plaintext);
    expect(await gestisciEventoChiaveMembro(inoltro(alice), ambiente(bob, rete, { inAttesa: attesa, ritenta }))).toEqual({ sue: 0, proprie: 1 });
    expect(await ritenta.mock.results[0].value).toBe('mio messaggio perso');
    expect(leggiCreatore('bob', sidBob)).toMatchObject({ utente: 'bob', verifica: 'propria' });
  });

  it('chiave dichiarata propria ma sconosciuta al registro: rifiutata (la si perde, ma non si attribuisce male)', async () => {
    vi.useFakeTimers();
    const { alice, bob, sid, sidBob, rete } = scena({ chiaveDiBob: true, registroDiBob: false });
    await gestisciEventoChiaveMembro(richiesta(), ambiente(alice, rete));
    segnaRichiesta('S');
    expect(await gestisciEventoChiaveMembro(inoltro(alice), ambiente(bob, rete))).toEqual({ sue: 1, proprie: 0 });
    expect(bob.entranti[sidBob]).toBeUndefined();
    expect(leggiCreatore('bob', sidBob)).toBeNull();
    expect(leggiCreatore('bob', sid)).toMatchObject({ utente: 'alice' }); // quella di alice invece arriva
  });

  it('membro scorretto: dichiara "di bob" una chiave creata da lui -> rifiutata, i suoi messaggi non diventano di bob', async () => {
    vi.useFakeTimers();
    const { alice, bob, sid, rete } = scena();
    await gestisciEventoChiaveMembro(richiesta(), ambiente(alice, rete, {}, { altera: (c) => c.map((x) => ({ ...x, creatore: 'bob' })) }));
    segnaRichiesta('S');
    expect(await gestisciEventoChiaveMembro(inoltro(alice), ambiente(bob, rete))).toBe(false);
    expect(bob.entranti[sid]).toBeUndefined();
    expect(leggiCreatore('bob', sid)).toBeNull();
  });

  it('chi e\' entrato dopo la nascita della chiave non la riceve', async () => {
    vi.useFakeTimers();
    const { alice, rete } = scena({ bobEntrato: ORA + 60000 });
    expect(await gestisciEventoChiaveMembro(richiesta(), ambiente(alice, rete))).toBe(0);
    expect(alice.inviati).toEqual([]);
  });

  it('richieste ripetute dalla stessa persona: si risponde una volta ogni 30 secondi', async () => {
    vi.useFakeTimers();
    const { alice, rete } = scena();
    expect(await gestisciEventoChiaveMembro(richiesta(), ambiente(alice, rete))).toBe(1);
    expect(await gestisciEventoChiaveMembro(richiesta(), ambiente(alice, rete))).toBe(0);
  });

  it('chiavi inoltrate senza averle chieste: ignorate', async () => {
    vi.useFakeTimers();
    const { alice, bob, sid, rete } = scena();
    await gestisciEventoChiaveMembro(richiesta(), ambiente(alice, rete));
    expect(await gestisciEventoChiaveMembro(inoltro(alice), ambiente(bob, rete))).toBe(false);
    expect(bob.entranti[sid]).toBeUndefined();
  });

  it('chiave che il registro attribuisce a un altro: ignorata', async () => {
    vi.useFakeTimers();
    const { alice, bob, sid, rete } = scena();
    await gestisciEventoChiaveMembro(richiesta(), ambiente(alice, rete));
    registraCreatore('bob', sid, { utente: 'carol', verifica: 'coerente', stanza: 'S' });
    segnaRichiesta('S');
    expect(await gestisciEventoChiaveMembro(inoltro(alice), ambiente(bob, rete))).toBe(false);
    expect(bob.entranti[sid]).toBeUndefined();
  });

  it('autore dichiarato un terzo: ignorata', async () => {
    vi.useFakeTimers();
    const { alice, bob, sid, rete } = scena();
    await gestisciEventoChiaveMembro(richiesta(), ambiente(alice, rete, {}, { altera: (c) => c.map((x) => ({ ...x, creatore: 'carol' })) }));
    segnaRichiesta('S');
    expect(await gestisciEventoChiaveMembro(inoltro(alice), ambiente(bob, rete))).toBe(false);
    expect(bob.entranti[sid]).toBeUndefined();
    expect(leggiCreatore('bob', sid)).toBeNull();
  });

  it('chiave con un identificativo falso: scartata', async () => {
    vi.useFakeTimers();
    const { alice, bob, sid, rete } = scena();
    await gestisciEventoChiaveMembro(richiesta(), ambiente(alice, rete, {}, { altera: (c) => c.map((x) => ({ ...x, session_id: 'ID-FALSO' })) }));
    segnaRichiesta('S');
    expect(await gestisciEventoChiaveMembro(inoltro(alice), ambiente(bob, rete))).toBe(false);
    expect(bob.entranti['ID-FALSO']).toBeUndefined();
    expect(bob.entranti[sid]).toBeUndefined();
  });

  it('formato di N5/N5b (una chiave, di chi la manda): ancora accettato', async () => {
    vi.useFakeTimers();
    const { alice, bob, sid, rete } = scena();
    const vecchio = { type: 'm.forwarded_room_key', content: { algorithm: 'm.megolm.v1.aes-sha2', room_id: 'S', session_id: sid, session_key: alice.entranti[sid].export_session(0) } };
    const c = sessioneVerso(alice, 'bob').encrypt(JSON.stringify(vecchio));
    segnaRichiesta('S');
    const ev = { eventType: 'm.forwarded_room_key', mittente: 'alice', data: { sender_key: alice.ik }, content: { ciphertext: { [bob.ik]: { type: c.type, body: c.body } } } };
    expect(await gestisciEventoChiaveMembro(ev, ambiente(bob, rete))).toEqual({ sue: 1, proprie: 0 });
    expect(leggiCreatore('bob', sid)).toMatchObject({ utente: 'alice' });
  });

  it('eventi dai propri dispositivi non passano di qui (restano a v1.14-B)', async () => {
    rubrica.clear();
    const alice = persona('alice');
    expect(await gestisciEventoChiaveMembro({ eventType: 'm.room_key_request', mittente: 'alice', content: {} }, ambiente(alice, {}))).toBeNull();
  });
});

describe('App.jsx (eccezione mirata N5)', () => {
  const app = () => readFileSync('src/App.jsx', 'utf8');
  it('chiede ai membri sia per i messaggi del canale anonimo sia per quelli con session_id', () => {
    expect(app().split('chiediChiaviAiMembri(normalizedRoom);').length - 1).toBe(2);
  });
  it('gli eventi di altri utenti vanno a gestisciEventoChiaveMembro, i propri restano a handleOwnDeviceKeyEvent', () => {
    const a = app();
    expect(a).toContain('await gestisciEventoChiaveMembro(');
    expect(a).toMatch(/senderUsername && senderUsername !== username[\s\S]{0,80}gestisciEventoChiaveMembro/);
    expect(a).toContain('await handleOwnDeviceKeyEvent({ data, eventType, content, username, token, account });');
  });
  it('la richiesta ai membri non porta il session_id', () => {
    const a = app();
    const i = a.indexOf('const chiediChiaviAiMembri');
    const blocco = a.slice(i, a.indexOf('// [palacan-n5] fine', i));
    expect(blocco).toContain("eventType: 'm.room_key_request'");
    expect(blocco).not.toMatch(/session_id/);
  });
});
