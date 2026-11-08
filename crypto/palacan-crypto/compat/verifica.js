// La libolm VERA legge cio' che ha prodotto palacan-crypto (vodozemac): compatibilita' nella direzione opposta.
const Olm = require('@matrix-org/olm');
const fs = require('fs');
const assert = require('assert');

(async () => {
  await Olm.init();
  const L = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); // vettori libolm (pickle originali)
  const V = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')); // vettori vodozemac
  let ok = 0;
  const prova = (nome, f) => { f(); ok += 1; console.log('  ok', nome); };

  prova('Bob (libolm) apre la sessione creata da Carla (vodozemac)', () => {
    const bob = new Olm.Account(); bob.unpickle(L.chiave_pickle, L.bob_pickle);
    const s = new Olm.Session();
    s.create_inbound_from(bob, V.carla_identita.curve25519, V.carla_verso_bob.body);
    assert.strictEqual(s.session_id(), V.carla_verso_bob.session_id);
    assert.strictEqual(s.decrypt(0, V.carla_verso_bob.body), 'ciao Bob, sono Carla (vodozemac)');
  });

  prova('Alice (libolm) legge la risposta di Bob convertito a vodozemac', () => {
    const s = new Olm.Session(); s.unpickle(L.chiave_pickle, L.sessione_alice_pickle);
    assert.strictEqual(s.decrypt(V.risposta_bob.type, V.risposta_bob.body), 'risposta di Bob, ora con vodozemac');
  });

  prova('gruppo creato da vodozemac letto da libolm', () => {
    const g = new Olm.InboundGroupSession(); g.create(V.gruppo_chiave);
    assert.strictEqual(g.session_id(), V.gruppo_id);
    assert.deepStrictEqual(g.decrypt(V.gruppo_m0), { plaintext: 'gruppo vodozemac 0', message_index: 0 });
    assert.deepStrictEqual(g.decrypt(V.gruppo_m1), { plaintext: 'gruppo vodozemac 1 ✓', message_index: 1 });
  });

  prova('chiave esportata da vodozemac importata da libolm (indice 1)', () => {
    const g = new Olm.InboundGroupSession(); g.import_session(V.gruppo_esportata_1);
    assert.strictEqual(g.first_known_index(), 1);
    assert.strictEqual(g.decrypt(V.gruppo_m1).plaintext, 'gruppo vodozemac 1 ✓');
    assert.throws(() => g.decrypt(V.gruppo_m0));
  });

  prova('firma di vodozemac verificata da libolm', () => {
    const u = new Olm.Utility();
    u.ed25519_verify(V.carla_identita.ed25519, V.firma_messaggio, V.firma);
    assert.throws(() => u.ed25519_verify(V.carla_identita.ed25519, 'altro testo', V.firma));
  });

  console.log(`libolm ${Olm.get_library_version().join('.')}: ${ok}/5 verifiche superate`);
})().catch((e) => { console.error('FALLITO:', e && e.message ? e.message : e); process.exit(1); });
