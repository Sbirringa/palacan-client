// Genera vettori con la libolm VERA (3.2.15) per i test di compatibilita' di palacan-crypto.
const Olm = require('@matrix-org/olm');
const fs = require('fs');

(async () => {
  await Olm.init();
  const CHIAVE = 'chiave-di-pickle-di-prova';
  const v = { chiave_pickle: CHIAVE, versione_libolm: Olm.get_library_version().join('.') };

  // Bob (libolm) con chiavi usa e getta; Alice (libolm) apre una sessione verso Bob
  const bob = new Olm.Account(); bob.create(); bob.generate_one_time_keys(3);
  const alice = new Olm.Account(); alice.create();
  v.bob_identita = JSON.parse(bob.identity_keys());
  v.bob_otk = JSON.parse(bob.one_time_keys());
  v.bob_pickle = bob.pickle(CHIAVE);
  v.alice_identita = JSON.parse(alice.identity_keys());

  const otk = Object.values(v.bob_otk.curve25519)[0];
  const s = new Olm.Session(); s.create_outbound(alice, v.bob_identita.curve25519, otk);
  v.prekey_1 = s.encrypt('ciao Bob, sono Alice (libolm)');
  v.prekey_2 = s.encrypt('secondo messaggio prima della risposta');
  v.sessione_alice_id = s.session_id();
  v.sessione_alice_pickle = s.pickle(CHIAVE);
  v.alice_pickle = alice.pickle(CHIAVE);

  // Megolm: Alice crea il gruppo
  const out = new Olm.OutboundGroupSession(); out.create();
  v.gruppo_id = out.session_id();
  v.gruppo_chiave = out.session_key();
  v.gruppo_messaggi = [out.encrypt('primo nel gruppo'), out.encrypt('secondo nel gruppo'), out.encrypt('terzo 🎉 àèìòù')];
  v.gruppo_uscente_pickle = out.pickle(CHIAVE);
  v.gruppo_uscente_indice = out.message_index();
  const inb = new Olm.InboundGroupSession(); inb.create(v.gruppo_chiave);
  v.gruppo_esportata_1 = inb.export_session(1);
  v.gruppo_entrante_pickle = inb.pickle(CHIAVE);

  // Firma
  v.firma_messaggio = 'testo canonico da firmare {"a":1}';
  v.firma = alice.sign(v.firma_messaggio);

  fs.writeFileSync(process.argv[2], JSON.stringify(v, null, 1));
  console.log('vettori libolm', v.versione_libolm, '->', process.argv[2]);
})();
