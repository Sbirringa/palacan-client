// tests/firmaPq.test.js  [palacan-pq5b]
//
// Chiave di firma post-quantum (ML-DSA-65) del dispositivo con crittografia VERA (WASM: ML-DSA-65, firme ed25519):
// bob la genera, la pubblica con la prova di legame e ne annuncia l'impronta DENTRO Olm; alice impara l'impronta,
// scarica la chiave e la accetta solo se impronta e legame tornano. Poi i casi d'attacco: server che sostituisce la
// chiave o il legame, chiave ed25519 sbagliata, impronte nuove e annunci tolti; backup e account nuovo.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import Olm from '../src/crypto/olm.js';
import { _usaArchivio } from '../src/utils/chiaveDispositivo';
import {
  impostaFirmatario, conChiaviMittente, imparaDaPayloadOlm, impostaScaricatorePqFirma,
  improntePqFirmaPerCurva, improntePqFirmaPerChiave, _azzeraFirmaAutore,
} from '../src/utils/firmaAutore';
import {
  assicuraFirmaPq, chiavePqFirma, chiavePqFirmaNota, firmaIbrida, verificaIbrida, testoLegame, firmaPqPerBackup,
  ripristinaFirmaPqDaBackup, CONTESTO_LEGAME, CHIAVE_ARCHIVIO_PQFIRMA, _azzeraFirmaPq,
} from '../src/utils/firmaPq';

beforeAll(async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  await Olm.init();
});

function archivioInMemoria() {
  const m = new Map();
  return () => ({ leggi: async (v) => m.get(v), prendiOCrea: async (v, n) => { if (!m.has(v)) m.set(v, n); return m.get(v); } });
}

function persona(nome) {
  const conto = new Olm.Account();
  conto.create();
  const k = JSON.parse(conto.identity_keys());
  return { nome, conto, ed: k.ed25519, curva: k.curve25519, firma: (t) => conto.sign(t) };
}

const comeFirmatario = (p) => impostaFirmatario({ io: p.nome, chiave: p.ed, curva: p.curva, firma: p.firma });
const impronta = (b64) => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');

// server finto con le regole di PQ5b: chiavi per impronta (calcolata dal server)
function server() {
  const s = { chiavi: new Map(), caricamenti: 0, letture: 0, rompi: null, giu: false };
  s.api = {
    putPqFirma: async ({ chiave, legameEd, legamePq }) => {
      if (s.giu) throw Object.assign(new Error('Dispositivo non trovato'), { status: 404 });
      s.caricamenti += 1;
      s.chiavi.set(impronta(chiave), { chiave, legame_ed: legameEd, legame_pq: legamePq });
      return { impronta: impronta(chiave) };
    },
    getPqFirma: async (utente, i) => {
      s.letture += 1;
      const v = s.chiavi.get(i);
      if (!v) throw Object.assign(new Error('Chiave non trovata'), { status: 404 });
      return s.rompi ? { ...v, ...s.rompi } : { ...v };
    },
  };
  return s;
}

const prepara = (p, s) => assicuraFirmaPq({ io: p.nome, token: 't', dispositivo: `D-${p.nome}`, ed: p.ed, curva: p.curva, firmaEd: p.firma, api: s.api });

// bob (firmatario di questa pagina) prepara la sua chiave e scrive un messaggio Olm; alice (firmataria dopo di lui)
// ne impara la chiave di firma ed25519 e l'impronta ML-DSA-65. Un firmatario per volta, come in una pagina vera.
async function messaggioDiBob(bob, s) {
  comeFirmatario(bob);
  await prepara(bob, s);
  return conChiaviMittente(JSON.stringify({ type: 'm.room_key', content: {} }));
}

function aliceImpara(alice, bob, payload) {
  comeFirmatario(alice);
  return imparaDaPayloadOlm('alice', 'bob', bob.curva, payload);
}

const attendi = () => new Promise((r) => setTimeout(r, 0));

describe('PQ5b - chiave di firma post-quantum (ML-DSA-65) del dispositivo', () => {
  let alice;
  let bob;
  let s;
  beforeEach(() => {
    localStorage.clear();
    _usaArchivio(archivioInMemoria());
    _azzeraFirmaAutore();
    _azzeraFirmaPq();
    alice = persona('alice');
    bob = persona('bob');
    s = server();
  });

  it('pubblica la chiave con la prova di legame una volta sola e ne annuncia l\'impronta nei messaggi Olm', async () => {
    comeFirmatario(bob);
    expect(JSON.parse(conChiaviMittente('{"type":"x"}')).chiavi_mittente.pqf).toBeUndefined();
    const primo = await prepara(bob, s);
    expect(primo.pubblicata).toBe(true);
    expect(primo.impronta).toMatch(/^[0-9a-f]{64}$/);
    expect((await prepara(bob, s)).pubblicata).toBe(false);
    expect(s.caricamenti).toBe(1);
    const sulServer = s.chiavi.get(primo.impronta);
    expect(impronta(sulServer.chiave)).toBe(primo.impronta);
    expect(verificaIbrida({ contesto: CONTESTO_LEGAME, ed: bob.ed, pubblica: sulServer.chiave, messaggio: testoLegame('bob', bob.curva), fe: sulServer.legame_ed, fq: sulServer.legame_pq })).toBe(true);
    expect(JSON.parse(conChiaviMittente('{"type":"x"}')).chiavi_mittente.pqf).toBe(primo.impronta);
    // il seme resta sul dispositivo, cifrato
    const salvato = localStorage.getItem(CHIAVE_ARCHIVIO_PQFIRMA('bob'));
    expect(salvato).toMatch(/^(d1|r1)\./);
    expect(salvato).not.toContain(firmaPqPerBackup('bob').seme);
  });

  it('alice impara l\'impronta via Olm, scarica la chiave e la accetta: impronta e legame tornano', async () => {
    const messaggio = await messaggioDiBob(bob, s);
    const i = JSON.parse(messaggio).chiavi_mittente.pqf;
    const scaricate = [];
    impostaScaricatorePqFirma((v) => scaricate.push(v));
    expect(aliceImpara(alice, bob, messaggio)).toBe(true);
    await attendi();
    expect(scaricate).toEqual([{ utente: 'bob', curva: bob.curva, ed: bob.ed, impronta: i }]);
    expect(improntePqFirmaPerCurva('alice', 'bob', bob.curva)).toEqual([i]);
    expect(improntePqFirmaPerChiave('alice', 'bob', bob.ed)).toEqual([i]);
    const chiave = await chiavePqFirma({ io: 'alice', utente: 'bob', curva: bob.curva, ed: bob.ed, impronta: i, token: 't', api: s.api });
    expect(chiave).toBe(s.chiavi.get(i).chiave);
    expect(chiavePqFirmaNota('alice', i)).toBe(chiave);
    await chiavePqFirma({ io: 'alice', utente: 'bob', curva: bob.curva, ed: bob.ed, impronta: i, token: 't', api: s.api });
    expect(s.letture).toBe(1);
  });

  it('server che sostituisce la chiave o la prova di legame, o chiave ed25519 sbagliata: rifiutata', async () => {
    const { impronta: i } = await prepara(bob, s);
    const seme = firmaPqPerBackup('bob').seme;
    const chiedi = (extra = {}) => chiavePqFirma({ io: 'alice', utente: 'bob', curva: bob.curva, ed: bob.ed, impronta: i, token: 't', api: s.api, ...extra });
    // chiave sostituita (con un legame valido... di zed): l'impronta non torna
    const zed = persona('zed');
    const sz = server();
    const { impronta: iz } = await prepara(zed, sz);
    s.rompi = { ...sz.chiavi.get(iz) };
    expect(await chiedi()).toBeNull();
    // chiave giusta, legame fatto per un'altra curva (un altro dispositivo)
    const altrove = testoLegame('bob', zed.curva);
    s.rompi = {
      legame_ed: bob.firma(Olm.pqfirma_testo_ibrido(CONTESTO_LEGAME, bob.ed, s.chiavi.get(i).chiave, altrove)),
      legame_pq: Olm.pqfirma_firma(seme, CONTESTO_LEGAME, bob.ed, altrove),
    };
    expect(await chiedi()).toBeNull();
    // solo la parte ML-DSA del legame rotta
    s.rompi = { legame_pq: Olm.pqfirma_firma(seme, CONTESTO_LEGAME, bob.ed, 'altro') };
    expect(await chiedi()).toBeNull();
    // il server consegna una chiave VERA di bob ma un'altra (la sua chiave di prima, con un legame valido): solo
    // l'impronta lo scopre
    const primaDiBob = { ...s.chiavi.get(i) };
    _azzeraFirmaPq();
    comeFirmatario(bob);
    ripristinaFirmaPqDaBackup('bob', { seme: Olm.pqfirma_nuovo_seme(), ed: bob.ed });
    const { impronta: i2 } = await prepara(bob, s);
    expect(i2).not.toBe(i);
    s.rompi = primaDiBob;
    expect(await chiedi({ impronta: i2 })).toBeNull();
    s.rompi = null;
    expect(await chiedi({ impronta: i2 })).toBe(s.chiavi.get(i2).chiave);
    // tutto giusto ma la chiave ed25519 che alice ha imparato e' un'altra
    s.rompi = null;
    expect(await chiedi({ ed: zed.ed })).toBeNull();
    expect(await chiedi({ impronta: 'non-esadecimale' })).toBeNull();
    expect(chiavePqFirmaNota('alice', i)).toBeNull();
    // e alla fine, con tutto giusto, si accetta
    expect(await chiedi()).toBe(s.chiavi.get(i).chiave);
  });

  it('impronta nuova via Olm: sostituisce l\'attuale, la vecchia resta; un messaggio senza impronta non toglie niente', async () => {
    const messaggio = await messaggioDiBob(bob, s);
    const i1 = JSON.parse(messaggio).chiavi_mittente.pqf;
    expect(i1).toMatch(/^[0-9a-f]{64}$/);
    aliceImpara(alice, bob, messaggio);
    const conPqf = (pqf) => JSON.stringify({ type: 'm.room_key', content: {}, chiavi_mittente: { utente: 'bob', curve25519: bob.curva, ed25519: bob.ed, pqf } });
    const i2 = 'a'.repeat(64);
    aliceImpara(alice, bob, conPqf(i2));
    expect(improntePqFirmaPerCurva('alice', 'bob', bob.curva)).toEqual([i2, i1]);
    aliceImpara(alice, bob, JSON.stringify({ type: 'm.room_key', content: {}, chiavi_mittente: { utente: 'bob', curve25519: bob.curva, ed25519: bob.ed } }));
    aliceImpara(alice, bob, conPqf('zz-non-valida'));
    expect(improntePqFirmaPerCurva('alice', 'bob', bob.curva)).toEqual([i2, i1]);
    // un'impronta dichiarata con un'altra chiave ed25519 per la stessa curva: ignorata (come in N5e)
    const zed = persona('zed');
    aliceImpara(alice, bob, JSON.stringify({ type: 'x', chiavi_mittente: { utente: 'bob', curve25519: bob.curva, ed25519: zed.ed, pqf: 'b'.repeat(64) } }));
    expect(improntePqFirmaPerCurva('alice', 'bob', bob.curva)).toEqual([i2, i1]);
  });

  it('backup: la chiave torna con l\'account; un account diverso ha una chiave nuova', async () => {
    const { impronta: i1 } = await prepara(bob, s);
    const voce = firmaPqPerBackup('bob');
    expect(voce).toEqual({ seme: expect.any(String), ed: bob.ed });
    // browser nuovo: niente sul dispositivo, account Olm ripristinato dal backup
    localStorage.clear();
    _usaArchivio(archivioInMemoria());
    _azzeraFirmaPq();
    comeFirmatario(bob);
    ripristinaFirmaPqDaBackup('bob', voce);
    expect((await prepara(bob, s)).impronta).toBe(i1);
    // stesso nome, account Olm nuovo (altra chiave ed25519): il seme del backup non vale, chiave nuova
    _azzeraFirmaPq();
    const bob2 = { ...persona('bob') };
    comeFirmatario(bob2);
    ripristinaFirmaPqDaBackup('bob', voce);
    const { impronta: i3 } = await prepara(bob2, s);
    expect(i3).not.toBe(i1);
  });

  it('firma ibrida dell\'account: valida con la chiave pubblicata, cade se cambia il messaggio; null prima della chiave', async () => {
    comeFirmatario(bob);
    expect(firmaIbrida({ io: 'bob', contesto: 'attestato', messaggio: 'm', firmaEd: bob.firma })).toBeNull();
    const { impronta: i } = await prepara(bob, s);
    const f = firmaIbrida({ io: 'bob', contesto: 'attestato', messaggio: 'm', firmaEd: bob.firma });
    expect(f.q).toBe(i);
    const pubblica = s.chiavi.get(i).chiave;
    expect(verificaIbrida({ contesto: 'attestato', ed: bob.ed, pubblica, messaggio: 'm', fe: f.fe, fq: f.fq })).toBe(true);
    expect(verificaIbrida({ contesto: 'attestato', ed: bob.ed, pubblica, messaggio: 'm2', fe: f.fe, fq: f.fq })).toBe(false);
    expect(verificaIbrida({ contesto: 'stato-gruppo', ed: bob.ed, pubblica, messaggio: 'm', fe: f.fe, fq: f.fq })).toBe(false);
    expect(firmaIbrida({ io: 'alice', contesto: 'attestato', messaggio: 'm', firmaEd: bob.firma })).toBeNull();
  });

  it('dispositivo non registrato o server giu\': nessun annuncio (chi la imparerebbe non la troverebbe)', async () => {
    comeFirmatario(bob);
    s.giu = true;
    const esito = await prepara(bob, s);
    expect(esito.errore).toBeTruthy();
    expect(JSON.parse(conChiaviMittente('{"type":"x"}')).chiavi_mittente.pqf).toBeUndefined();
    s.giu = false;
    expect((await prepara(bob, s)).pubblicata).toBe(true);
    expect(JSON.parse(conChiaviMittente('{"type":"x"}')).chiavi_mittente.pqf).toMatch(/^[0-9a-f]{64}$/);
  });

  it('collegamenti in olmService, App, apiService e nella facciata del WASM', () => {
    const svc = readFileSync('src/olmService.js', 'utf8');
    for (const pezzo of [
      "import { firmaPqPerBackup, ripristinaFirmaPqDaBackup } from './utils/firmaPq';",
      'firmaPq: firmaPqPerBackup(normalizedUsername)',
      'ripristinaFirmaPqDaBackup(normalizedUsername, bundle.firmaPq);',
    ]) expect(svc).toContain(pezzo);
    const app = readFileSync('src/App.jsx', 'utf8');
    for (const pezzo of ['assicuraFirmaPq({', 'impostaScaricatorePqFirma((v) => chiavePqFirma(', 'impostaScaricatorePqFirma(null);']) expect(app).toContain(pezzo);
    const facciata = readFileSync('src/crypto/olm.js', 'utf8');
    for (const f of ['pqfirma_nuovo_seme', 'pqfirma_chiave_pubblica', 'pqfirma_testo_ibrido', 'pqfirma_firma', 'pqfirma_verifica_ibrida']) expect(facciata).toContain(f);
    const api = readFileSync('src/apiService.js', 'utf8');
    for (const f of ['export const putPqFirma', 'export const getPqFirma', "'/keys/pq/firma'"]) expect(api).toContain(f);
  });
});
