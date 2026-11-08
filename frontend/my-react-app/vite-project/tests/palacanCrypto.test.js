// tests/palacanCrypto.test.js  [palacan-vodozemac]
//
// Il motore dell'app e' palacan-crypto (vodozemac) e non piu' libolm: stessa interfaccia, dati libolm VERI
// (vettori generati con @matrix-org/olm 3.2.15 in crypto/palacan-crypto) letti e convertiti, errori come libolm.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import Olm from '../src/crypto/olm.js';

const qui = dirname(fileURLToPath(import.meta.url));
const V = JSON.parse(readFileSync(resolve(qui, '../../../../crypto/palacan-crypto/tests_vettori_libolm.json'), 'utf8'));
const K = V.chiave_pickle;

describe('motore crittografico: palacan-crypto (vodozemac)', () => {
  it('si avvia (anche piu\' volte) ed e\' vodozemac', async () => {
    await Olm.init();
    await Olm.init({ locateFile: () => '/olm.wasm' });
    expect(Olm.versione()).toMatch(/vodozemac 0\.11\.1/);
  });

  it('account salvato da libolm: letto, convertito, stesse chiavi; risalvato nel formato nuovo', async () => {
    await Olm.init();
    const a = new Olm.Account();
    a.unpickle(K, V.bob_pickle);
    expect(a.ultimo_unpickle_convertito()).toBe(true);
    expect(JSON.parse(a.identity_keys())).toEqual(V.bob_identita);
    expect(JSON.parse(a.one_time_keys())).toEqual(V.bob_otk);
    const nuovo = a.pickle(K);
    expect(nuovo.startsWith('vz1:')).toBe(true);
    const b = new Olm.Account();
    b.unpickle(K, nuovo);
    expect(b.ultimo_unpickle_convertito()).toBe(false);
    expect(b.identity_keys()).toBe(a.identity_keys());
    a.free();
    b.free();
  });

  it('messaggi Olm e Megolm di libolm decifrati; chiavi di gruppo libolm convertite', async () => {
    await Olm.init();
    const bob = new Olm.Account();
    bob.unpickle(K, V.bob_pickle);
    const s = new Olm.Session();
    s.create_inbound_from(bob, V.alice_identita.curve25519, V.prekey_1.body);
    expect(s.decrypt(0, V.prekey_1.body)).toBe('ciao Bob, sono Alice (libolm)');
    const g = new Olm.InboundGroupSession();
    g.unpickle(K, V.gruppo_entrante_pickle);
    expect(g.decrypt(V.gruppo_messaggi[2])).toEqual({ plaintext: 'terzo 🎉 àèìòù', message_index: 2 });
  });

  it('errori con gli stessi codici di libolm (li leggono olmService e App)', async () => {
    await Olm.init();
    const g = new Olm.InboundGroupSession();
    g.import_session(V.gruppo_esportata_1);
    expect(() => g.decrypt(V.gruppo_messaggi[0])).toThrow(/UNKNOWN_MESSAGE_INDEX/);
    const bob = new Olm.Account();
    bob.create();
    expect(() => new Olm.Session().create_inbound(bob, V.prekey_1.body)).toThrow(/BAD_MESSAGE_KEY_ID/);
    expect(() => new Olm.Account().unpickle('sbagliata', V.bob_pickle)).toThrow(/OLM\.BAD_ACCOUNT_KEY/);
  });

  it('nessun file dell\'app importa piu\' @matrix-org/olm', () => {
    const src = resolve(qui, '../src');
    const residui = [];
    const visita = (d) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) {
          if (n !== 'pkg') visita(p);
        } else if (/\.(jsx?|mjs|tsx?)$/.test(n) && /['"]@matrix-org\/olm['"]/.test(readFileSync(p, 'utf8'))) {
          residui.push(p);
        }
      }
    };
    visita(src);
    expect(residui).toEqual([]);
    expect(readFileSync(join(src, 'olmService.js'), 'utf8')).toContain("from './crypto/olm.js'");
  });
});
