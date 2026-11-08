// tests/firmaIbrida.test.js  [palacan-pq5c]
//
// Firma ibrida OBBLIGATORIA (ed25519 + ML-DSA-65) per chi ha annunciato una chiave ML-DSA-65, con crittografia VERA
// (WASM: ML-DSA-65, firme ed25519 degli account Olm):
//   - attestati d'autore dei messaggi di gruppo: parte ibrida nel primo messaggio della sessione e poi ogni 32; la
//     sessione e' dimostrata una volta, poi valgono anche i messaggi senza; la sola ed25519 non corregge piu' il
//     registro (niente downgrade); parte ibrida falsa -> 'falsa'; chiave non ancora scaricata -> il messaggio aspetta
//     e si ritenta quando arriva;
//   - stato del gruppo: firmato in modo ibrido e verificato; dopo il primo stato ibrido, uno stato con la sola ed25519
//     non vale piu'; uno stato vecchio (scritto prima della chiave ML-DSA-65) si accetta e si riscrive ibrido.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';

vi.mock('../src/utils/cronologiaLocale', () => ({ salvaDato: vi.fn(async () => true), leggiDato: vi.fn(async () => null) }));

import Olm from '../src/crypto/olm.js';
import { _usaArchivio } from '../src/utils/chiaveDispositivo';
import {
  impostaFirmatario, impostaRitentativo, conChiaviMittente, imparaDaPayloadOlm, aggiungiAttestato, verificaAttestato,
  confermaAutoreFirmato, mettiInAttesaDiFirma, OGNI_IBRIDO, _azzeraFirmaAutore,
} from '../src/utils/firmaAutore';
import { assicuraFirmaPq, chiavePqFirma, _azzeraFirmaPq } from '../src/utils/firmaPq';
import { registraCreatore, leggiCreatore } from '../src/utils/creatoriChiavi';
import { confermaSegreto, nuovoSegretoStanza, dimenticaSegreti } from '../src/utils/segretiStanze';
import { sincronizzaStatoGruppo, decifraStato, cifraStato, canonico, dimenticaStati, statoConosciuto } from '../src/utils/statoGruppo';

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
const attendi = () => new Promise((r) => setTimeout(r, 0));
const sessione = (id, indice) => ({ session_id: () => id, message_index: () => indice });

function serverFirme() {
  const s = { chiavi: new Map() };
  s.api = {
    putPqFirma: async ({ chiave, legameEd, legamePq }) => { s.chiavi.set(impronta(chiave), { chiave, legame_ed: legameEd, legame_pq: legamePq }); },
    getPqFirma: async (u, i) => {
      if (!s.chiavi.has(i)) throw Object.assign(new Error('Chiave non trovata'), { status: 404 });
      return { ...s.chiavi.get(i) };
    },
  };
  return s;
}

// p (firmatario di questa pagina) prepara la sua chiave ML-DSA-65 (idempotente) e ne annuncia l'impronta
async function pronto(p, s) {
  comeFirmatario(p);
  await assicuraFirmaPq({ io: p.nome, token: 't', dispositivo: `D-${p.nome}`, ed: p.ed, curva: p.curva, firmaEd: p.firma, api: s.api });
  return JSON.parse(conChiaviMittente('{"type":"x"}')).chiavi_mittente.pqf;
}

// bob impara (via Olm) la chiave di firma e l'impronta di p; con scarica=true scarica anche la chiave ML-DSA-65
async function bobImpara(bob, p, s, { scarica = true } = {}) {
  comeFirmatario(p);
  const msg = conChiaviMittente(JSON.stringify({ type: 'm.room_key', content: {} }));
  comeFirmatario(bob);
  imparaDaPayloadOlm('bob', p.nome, p.curva, msg);
  const i = JSON.parse(msg).chiavi_mittente.pqf;
  if (scarica && i) await chiavePqFirma({ io: 'bob', utente: p.nome, curva: p.curva, ed: p.ed, impronta: i, token: 't', api: s.api });
  return i;
}

describe('PQ5c - firma ibrida obbligatoria (ed25519 + ML-DSA-65)', () => {
  let alice;
  let bob;
  let s;
  beforeEach(() => {
    localStorage.clear();
    _usaArchivio(archivioInMemoria());
    _azzeraFirmaAutore();
    _azzeraFirmaPq();
    dimenticaStati();
    dimenticaSegreti();
    alice = persona('alice');
    bob = persona('bob');
    s = serverFirme();
  });

  it('attestato: parte ibrida nel primo messaggio della sessione e poi ogni 32; senza chiave ML-DSA-65, come prima', async () => {
    comeFirmatario(alice);
    expect(aggiungiAttestato({ text: 'x' }, sessione('S0', 0)).attestato.h).toBeUndefined();
    const i = await pronto(alice, s);
    const a0 = aggiungiAttestato({ text: 'x' }, sessione('S1', 0)).attestato;
    expect(a0.h).toEqual({ q: i, fe: expect.any(String), fq: expect.any(String) });
    expect(aggiungiAttestato({ text: 'x' }, sessione('S1', 1)).attestato.h).toBeUndefined();
    expect(aggiungiAttestato({ text: 'x' }, sessione('S1', OGNI_IBRIDO)).attestato.h).toEqual(a0.h); // calcolata una volta
    expect(aggiungiAttestato({ text: 'x' }, sessione('S1', OGNI_IBRIDO + 1)).attestato.h).toBeUndefined();
  });

  it('chi ha la chiave ML-DSA-65 dell\'autore: sessione dimostrata dalla parte ibrida, poi valgono anche i messaggi senza', async () => {
    await pronto(alice, s);
    const a0 = aggiungiAttestato({}, sessione('S1', 0)).attestato;
    const a1 = aggiungiAttestato({}, sessione('S1', 1)).attestato;
    const b1 = aggiungiAttestato({}, sessione('S2', 1)).attestato;
    await bobImpara(bob, alice, s);
    expect(verificaAttestato('bob', 'S1', a1)).toBe('sconosciuta'); // sessione non ancora dimostrata
    expect(verificaAttestato('bob', 'S1', a0)).toBe('valida');
    expect(verificaAttestato('bob', 'S1', a1)).toBe('valida');
    expect(verificaAttestato('bob', 'S2', b1)).toBe('sconosciuta'); // un'altra sessione: va dimostrata a parte
    expect(verificaAttestato('bob', 'S2', a0)).toBe('falsa'); // attestato copiato in un'altra sessione
  });

  it('niente downgrade: la sola ed25519 non corregge il registro per un autore con chiave ML-DSA-65', async () => {
    await pronto(alice, s);
    const b0 = aggiungiAttestato({}, sessione('S2', 0)).attestato;
    const b1 = aggiungiAttestato({}, sessione('S2', 1)).attestato;
    await bobImpara(bob, alice, s);
    registraCreatore('bob', 'S2', { utente: 'zed', verifica: 'prima_volta', stanza: 'r' }); // inoltro di zed
    expect(confermaAutoreFirmato('bob', 'S2', 'r', { attestato: b1 })).toEqual({ sospetto: true, utente: 'alice' });
    expect(leggiCreatore('bob', 'S2').utente).toBe('zed'); // la sola ed25519 non sposta l'autore
    expect(confermaAutoreFirmato('bob', 'S2', 'r', { attestato: b0 })).toMatchObject({ sospetto: false, firmato: true });
    expect(leggiCreatore('bob', 'S2')).toMatchObject({ utente: 'alice', verifica: 'firmata' });
  });

  it('parte ibrida falsa, di un\'altra sessione o con un\'impronta mai annunciata: non vale', async () => {
    await pronto(alice, s);
    const a0 = aggiungiAttestato({}, sessione('S1', 0)).attestato;
    const c0 = aggiungiAttestato({}, sessione('S3', 0)).attestato;
    await bobImpara(bob, alice, s);
    expect(verificaAttestato('bob', 'S1', { ...a0, h: { ...a0.h, fq: c0.h.fq } })).toBe('falsa'); // ML-DSA di un'altra sessione
    expect(verificaAttestato('bob', 'S1', { ...a0, h: { ...a0.h, fe: c0.h.fe } })).toBe('falsa'); // ed25519 di un'altra sessione
    expect(verificaAttestato('bob', 'S1', { ...a0, h: { ...a0.h, q: 'f'.repeat(64) } })).toBe('sconosciuta');
    expect(verificaAttestato('bob', 'S1', a0)).toBe('valida');
  });

  it('chiave ML-DSA-65 non ancora scaricata: il messaggio aspetta e si ritenta quando arriva', async () => {
    await pronto(alice, s);
    const a0 = aggiungiAttestato({}, sessione('S1', 0)).attestato;
    const i = await bobImpara(bob, alice, s, { scarica: false });
    registraCreatore('bob', 'S1', { utente: 'zed', verifica: 'prima_volta', stanza: 'r' });
    const esito = confermaAutoreFirmato('bob', 'S1', 'r', { attestato: a0 });
    expect(esito).toEqual({ sospetto: true, utente: 'alice' });
    const ritentati = [];
    impostaRitentativo((voci) => ritentati.push(...voci));
    mettiInAttesaDiFirma(esito.utente, { messageId: 'm1' });
    await chiavePqFirma({ io: 'bob', utente: 'alice', curva: alice.curva, ed: alice.ed, impronta: i, token: 't', api: s.api });
    await attendi();
    expect(ritentati.map((v) => v.messageId)).toEqual(['m1']);
    expect(confermaAutoreFirmato('bob', 'S1', 'r', { attestato: a0 })).toMatchObject({ sospetto: false, firmato: true });
  });

  it('autore senza chiave ML-DSA-65 (non ancora aggiornato): tutto come prima, basta la ed25519', async () => {
    const carol = persona('carol');
    comeFirmatario(carol);
    const a1 = aggiungiAttestato({}, sessione('S5', 1)).attestato;
    expect(a1.h).toBeUndefined();
    await bobImpara(bob, carol, s);
    expect(verificaAttestato('bob', 'S5', a1)).toBe('valida');
  });

  describe('stato del gruppo', () => {
    const STANZA = 'stanza-pq5c';
    let server;
    const leggi = async () => ({ stato: server.stato, versione: server.versione });
    const scrivi = async (stanza, gettone, stato, attesa) => {
      if (attesa !== server.versione) throw Object.assign(new Error('conflitto'), { status: 409 });
      server.stato = stato;
      server.versione += 1;
      return { versione: server.versione };
    };
    let segreto;
    const utenti = Object.assign([{ username: 'alice' }, { username: 'bob' }], { creatore: 'alice' });
    const da = (p) => ({ roomId: STANZA, utenti, io: p.nome, token: 't', firmatore: p.firma, miaChiave: p.ed, leggi, scrivi, chiavePubblicata: async () => true });

    beforeEach(() => {
      server = { stato: null, versione: 0 };
      segreto = nuovoSegretoStanza();
      confermaSegreto(STANZA, segreto, 'v'.repeat(64));
    });

    it('stato firmato in modo ibrido e verificato; poi uno stato con la sola ed25519 non vale piu\'', async () => {
      await pronto(alice, s);
      expect(await sincronizzaStatoGruppo(da(alice))).toBe(true);
      const dentro = await decifraStato(segreto, STANZA, server.stato);
      expect(dentro.firma_pq).toEqual({ q: expect.any(String), fe: expect.any(String), fq: expect.any(String) });
      await bobImpara(bob, alice, s);
      dimenticaStati();
      expect(await sincronizzaStatoGruppo(da(bob))).toBe(true);
      expect(statoConosciuto(STANZA).firma_pq.q).toBe(dentro.firma_pq.q);
      // stato falso con la sola ed25519 di alice (come se qualcuno sapesse falsificarla): respinto
      const falso = { ...dentro, versione: 2, nome: 'Rinomina con la sola ed25519', modificato_il: new Date().toISOString() };
      delete falso.firma;
      delete falso.firma_pq;
      falso.firma = alice.firma(canonico(falso));
      server = { stato: await cifraStato(segreto, STANZA, falso), versione: 2 };
      dimenticaStati();
      expect(await sincronizzaStatoGruppo(da(bob))).toBe(false);
      expect(statoConosciuto(STANZA)).toBeNull();
      // e una parte ibrida rotta non passa nemmeno lei
      const rotto = { ...dentro, firma_pq: { ...dentro.firma_pq, fq: dentro.firma_pq.fq.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) } };
      server = { stato: await cifraStato(segreto, STANZA, rotto), versione: 1 };
      dimenticaStati();
      expect(await sincronizzaStatoGruppo(da(bob))).toBe(false);
    });

    it('stato vecchio (prima della chiave ML-DSA-65): accettato, poi riscritto con la firma ibrida dal suo autore', async () => {
      comeFirmatario(alice);
      expect(await sincronizzaStatoGruppo(da(alice))).toBe(true); // alice non ha ancora la chiave ML-DSA-65
      expect((await decifraStato(segreto, STANZA, server.stato)).firma_pq).toBeUndefined();
      await pronto(alice, s);
      await bobImpara(bob, alice, s);
      dimenticaStati();
      expect(await sincronizzaStatoGruppo(da(bob))).toBe(true); // bob lo accetta (ma non sa firmare ibrido per alice)
      expect(server.versione).toBe(1);
      await pronto(alice, s);
      dimenticaStati();
      expect(await sincronizzaStatoGruppo(da(alice))).toBe(true);
      expect(server.versione).toBe(2);
      const nuovo = await decifraStato(segreto, STANZA, server.stato);
      expect(nuovo.firma_pq).toBeTruthy();
      expect(nuovo.membri).toEqual(['alice', 'bob']);
    });
  });
});
