//! Compatibilita' con la libolm VERA (3.2.15): dati e messaggi generati da libolm (tests_vettori_libolm.json,
//! prodotto da genera.js) devono essere letti da palacan-crypto; e quello che produce palacan-crypto viene scritto
//! in tests_vettori_vodozemac.json, che verifica.js fa leggere a libolm (direzione opposta).

use palacan_crypto::nucleo::*;
use serde_json::{json, Value};
use std::fs;

fn vettori() -> Value {
    let testo = fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests_vettori_libolm.json"))
        .expect("manca tests_vettori_libolm.json: lancia prima genera.js");
    serde_json::from_str(&testo).unwrap()
}

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or_else(|| panic!("manca {k}"))
}

#[test]
fn account_libolm_convertito_con_le_stesse_chiavi() {
    let v = vettori();
    let chiave = s(&v, "chiave_pickle").as_bytes();
    let (bob, convertito) = Conto::da_pickle(chiave, s(&v, "bob_pickle")).unwrap();
    assert!(convertito, "un pickle libolm deve risultare convertito");
    let id: Value = serde_json::from_str(&bob.chiavi_identita()).unwrap();
    assert_eq!(id, v["bob_identita"]);
    let otk: Value = serde_json::from_str(&bob.chiavi_usa_e_getta()).unwrap();
    assert_eq!(otk, v["bob_otk"], "le chiavi usa e getta non pubblicate devono restare le stesse");

    // risalvato nel formato nuovo e riletto: identico, non piu' "convertito"
    let nuovo = bob.pickle(chiave);
    assert!(nuovo.starts_with(PREFISSO));
    let (di_nuovo, convertito) = Conto::da_pickle(chiave, &nuovo).unwrap();
    assert!(!convertito);
    assert_eq!(di_nuovo.chiavi_identita(), bob.chiavi_identita());
}

#[test]
fn pickle_con_chiave_sbagliata_rifiutato_in_entrambi_i_formati() {
    let v = vettori();
    assert!(Conto::da_pickle(b"chiave-sbagliata", s(&v, "bob_pickle")).is_err());
    let (bob, _) = Conto::da_pickle(s(&v, "chiave_pickle").as_bytes(), s(&v, "bob_pickle")).unwrap();
    let nuovo = bob.pickle(b"giusta");
    let errore = Conto::da_pickle(b"sbagliata", &nuovo).err().unwrap();
    assert!(!errore.0.contains("giusta"), "l'errore non deve contenere la chiave");
}

#[test]
fn messaggi_olm_di_libolm_decifrati_da_vodozemac() {
    let v = vettori();
    let chiave = s(&v, "chiave_pickle").as_bytes();
    let p1 = &v["prekey_1"];
    let p2 = &v["prekey_2"];
    assert_eq!(p1["type"], 0);

    // senza chiave del mittente (create_inbound)
    let (mut bob, _) = Conto::da_pickle(chiave, s(&v, "bob_pickle")).unwrap();
    let mut sess = SessioneOlm::entrante(&mut bob, s(p1, "body")).unwrap();
    assert_eq!(sess.id(), s(&v, "sessione_alice_id"), "stesso id di sessione dei due lati");
    assert!(sess.corrisponde(s(p1, "body")));
    assert!(sess.corrisponde_da(s(&v["alice_identita"], "curve25519"), s(p1, "body")));
    assert!(!sess.corrisponde_da(s(&v["bob_identita"], "curve25519"), s(p1, "body")));
    assert_eq!(sess.decifra(0, s(p1, "body")).unwrap(), "ciao Bob, sono Alice (libolm)");
    assert_eq!(sess.decifra(0, s(p2, "body")).unwrap(), "secondo messaggio prima della risposta");

    // con la chiave del mittente (create_inbound_from), su un'altra copia dell'account
    let (mut bob2, _) = Conto::da_pickle(chiave, s(&v, "bob_pickle")).unwrap();
    let mut sess2 = SessioneOlm::entrante_da(&mut bob2, s(&v["alice_identita"], "curve25519"), s(p1, "body")).unwrap();
    assert_eq!(sess2.decifra(0, s(p1, "body")).unwrap(), "ciao Bob, sono Alice (libolm)");
    // chiave del mittente sbagliata: rifiutata
    let (mut bob3, _) = Conto::da_pickle(chiave, s(&v, "bob_pickle")).unwrap();
    assert!(SessioneOlm::entrante_da(&mut bob3, s(&v["bob_identita"], "curve25519"), s(p1, "body")).is_err());

    // la chiave usa e getta usata e' consumata (come remove_one_time_keys di libolm)
    let otk: Value = serde_json::from_str(&bob.chiavi_usa_e_getta()).unwrap();
    assert_eq!(otk["curve25519"].as_object().unwrap().len(), 2);
}

#[test]
fn sessione_olm_libolm_convertita_mantiene_l_id() {
    let v = vettori();
    let (mut sess, convertita) =
        SessioneOlm::da_pickle(s(&v, "chiave_pickle").as_bytes(), s(&v, "sessione_alice_pickle")).unwrap();
    assert!(convertita);
    assert_eq!(sess.id(), s(&v, "sessione_alice_id"));
    // nessuna risposta ricevuta ancora: continua a mandare pre-key (tipo 0)
    assert_eq!(sess.cifra("terzo da alice convertita").unwrap().tipo, 0);
}

#[test]
fn megolm_di_libolm_letto_da_vodozemac() {
    let v = vettori();
    let chiave = s(&v, "chiave_pickle").as_bytes();
    let messaggi: Vec<&str> = v["gruppo_messaggi"].as_array().unwrap().iter().map(|m| m.as_str().unwrap()).collect();
    let attesi = ["primo nel gruppo", "secondo nel gruppo", "terzo 🎉 àèìòù"];

    let mut entrante = GruppoEntrante::da_chiave(s(&v, "gruppo_chiave")).unwrap();
    assert_eq!(entrante.id(), s(&v, "gruppo_id"));
    for (i, m) in messaggi.iter().enumerate() {
        assert_eq!(entrante.decifra(m).unwrap(), Decifrato { testo: attesi[i].into(), indice: i as u32 });
    }

    // pickle libolm della sessione in entrata
    let (mut dal_pickle, conv) = GruppoEntrante::da_pickle(chiave, s(&v, "gruppo_entrante_pickle")).unwrap();
    assert!(conv);
    assert_eq!(dal_pickle.decifra(messaggi[2]).unwrap().testo, attesi[2]);

    // chiave esportata da libolm all'indice 1: il messaggio 0 resta illeggibile
    let mut esportata = GruppoEntrante::da_esportata(s(&v, "gruppo_esportata_1")).unwrap();
    assert_eq!(esportata.primo_indice(), 1);
    assert!(esportata.decifra(messaggi[0]).is_err());
    assert_eq!(esportata.decifra(messaggi[1]).unwrap().testo, attesi[1]);

    // pickle libolm della sessione in uscita: prosegue dall'indice giusto
    let (mut uscente, conv) = GruppoUscente::da_pickle(chiave, s(&v, "gruppo_uscente_pickle")).unwrap();
    assert!(conv);
    assert_eq!(uscente.id(), s(&v, "gruppo_id"));
    assert_eq!(uscente.indice(), v["gruppo_uscente_indice"].as_u64().unwrap() as u32);
    let quarto = uscente.cifra("quarto, dalla sessione convertita");
    assert_eq!(entrante.decifra(&quarto).unwrap(), Decifrato { testo: "quarto, dalla sessione convertita".into(), indice: 3 });
}

#[test]
fn firma_libolm_verificata_e_firma_alterata_rifiutata() {
    let v = vettori();
    let k = s(&v["alice_identita"], "ed25519");
    assert!(verifica_ed25519(k, s(&v, "firma_messaggio"), s(&v, "firma")).is_ok());
    assert!(verifica_ed25519(k, "testo diverso", s(&v, "firma")).is_err());
}

#[test]
fn messaggio_manomesso_rifiutato() {
    let v = vettori();
    let mut entrante = GruppoEntrante::da_chiave(s(&v, "gruppo_chiave")).unwrap();
    let m = v["gruppo_messaggi"][0].as_str().unwrap();
    let mut caratteri: Vec<char> = m.chars().collect();
    let i = caratteri.len() / 2;
    caratteri[i] = if caratteri[i] == 'A' { 'B' } else { 'A' };
    let alterato: String = caratteri.into_iter().collect();
    assert!(entrante.decifra(&alterato).is_err());
}

/// Produce i dati che verifica.js fa leggere a libolm (direzione vodozemac -> libolm).
#[test]
fn produce_vettori_per_libolm() {
    let v = vettori();
    let chiave = s(&v, "chiave_pickle").as_bytes();

    // Carla (vodozemac) apre una sessione verso Bob (libolm) con la seconda chiave usa e getta
    let carla = Conto::nuovo();
    let otk: Vec<&str> = v["bob_otk"]["curve25519"].as_object().unwrap().values().map(|x| x.as_str().unwrap()).collect();
    let mut verso_bob = SessioneOlm::uscente(&carla, s(&v["bob_identita"], "curve25519"), otk[1]).unwrap();
    let p = verso_bob.cifra("ciao Bob, sono Carla (vodozemac)").unwrap();
    assert_eq!(p.tipo, 0);

    // Bob (convertito) risponde ad Alice (libolm): messaggio normale (tipo 1) dopo aver ricevuto
    let (mut bob, _) = Conto::da_pickle(chiave, s(&v, "bob_pickle")).unwrap();
    let mut da_alice = SessioneOlm::entrante(&mut bob, s(&v["prekey_1"], "body")).unwrap();
    da_alice.decifra(0, s(&v["prekey_1"], "body")).unwrap();
    let risposta = da_alice.cifra("risposta di Bob, ora con vodozemac").unwrap();
    assert_eq!(risposta.tipo, 1);

    // gruppo creato da vodozemac
    let mut gruppo = GruppoUscente::nuovo();
    let chiave_gruppo = gruppo.chiave_sessione();
    let m0 = gruppo.cifra("gruppo vodozemac 0");
    let m1 = gruppo.cifra("gruppo vodozemac 1 ✓");
    let mut entrante = GruppoEntrante::da_chiave(&chiave_gruppo).unwrap();
    entrante.decifra(&m0).unwrap();
    let esportata_1 = entrante.esporta(1).unwrap();

    let firma = carla.firma("firmato da vodozemac");
    let id_carla: Value = serde_json::from_str(&carla.chiavi_identita()).unwrap();

    let out = json!({
        "carla_identita": id_carla,
        "carla_verso_bob": { "type": p.tipo, "body": p.corpo, "session_id": verso_bob.id() },
        "risposta_bob": { "type": risposta.tipo, "body": risposta.corpo },
        "gruppo_id": gruppo.id(), "gruppo_chiave": chiave_gruppo, "gruppo_m0": m0, "gruppo_m1": m1,
        "gruppo_esportata_1": esportata_1,
        "firma_messaggio": "firmato da vodozemac", "firma": firma,
    });
    fs::write(concat!(env!("CARGO_MANIFEST_DIR"), "/tests_vettori_vodozemac.json"), serde_json::to_string_pretty(&out).unwrap()).unwrap();
}

#[test]
fn codici_d_errore_come_libolm() {
    let v = vettori();
    let msgs = &v["gruppo_messaggi"];
    let mut da_1 = GruppoEntrante::da_esportata(s(&v, "gruppo_esportata_1")).unwrap();
    let e = da_1.decifra(msgs[0].as_str().unwrap()).unwrap_err();
    assert!(e.0.starts_with("OLM.UNKNOWN_MESSAGE_INDEX"), "{}", e.0);
    assert!(da_1.esporta(0).unwrap_err().0.starts_with("OLM.UNKNOWN_MESSAGE_INDEX"));
    assert!(Conto::da_pickle(b"sbagliata", s(&v, "bob_pickle")).err().unwrap().0.starts_with("OLM.BAD_ACCOUNT_KEY"));
    assert!(verifica_ed25519(s(&v["alice_identita"], "ed25519"), "altro", s(&v, "firma")).unwrap_err().0.starts_with("OLM.BAD_MESSAGE_MAC"));
    let (mut bob, _) = Conto::da_pickle(s(&v, "chiave_pickle").as_bytes(), s(&v, "bob_pickle")).unwrap();
    assert!(SessioneOlm::entrante(&mut bob, "non-base64-!!").err().unwrap().0.starts_with("OLM.INVALID_BASE64"));
}

#[test]
fn primo_messaggio_restituito_una_volta_sola_come_libolm() {
    let v = vettori();
    let (mut bob, _) = Conto::da_pickle(s(&v, "chiave_pickle").as_bytes(), s(&v, "bob_pickle")).unwrap();
    let corpo = s(&v["prekey_1"], "body");
    let mut sess = SessioneOlm::entrante(&mut bob, corpo).unwrap();
    assert_eq!(sess.decifra(0, corpo).unwrap(), "ciao Bob, sono Alice (libolm)");
    assert!(sess.decifra(0, corpo).is_err(), "lo stesso messaggio non si decifra due volte");
}

#[test]
fn stesso_account_salvato_e_riletto_continua_le_sessioni() {
    // ciclo completo come nell'app: Alice e Bob vodozemac, pickle e unpickle in mezzo a ogni passo
    let k = b"chiave";
    let mut bob = Conto::nuovo();
    bob.genera_chiavi_usa_e_getta(1);
    let otk: Value = serde_json::from_str(&bob.chiavi_usa_e_getta()).unwrap();
    let otk = otk["curve25519"].as_object().unwrap().values().next().unwrap().as_str().unwrap().to_string();
    bob.segna_pubblicate();
    let id_bob: Value = serde_json::from_str(&bob.chiavi_identita()).unwrap();
    let alice = Conto::nuovo();
    let mut a = SessioneOlm::uscente(&alice, id_bob["curve25519"].as_str().unwrap(), &otk).unwrap();
    let m1 = a.cifra("uno").unwrap();
    let (mut bob, _) = Conto::da_pickle(k, &bob.pickle(k)).unwrap();
    let mut b = SessioneOlm::entrante(&mut bob, &m1.corpo).unwrap();
    assert_eq!(b.decifra(0, &m1.corpo).unwrap(), "uno");
    let (mut b, _) = SessioneOlm::da_pickle(k, &b.pickle(k)).unwrap();
    let r = b.cifra("due").unwrap();
    let (mut a, _) = SessioneOlm::da_pickle(k, &a.pickle(k)).unwrap();
    assert_eq!(a.decifra(r.tipo, &r.corpo).unwrap(), "due");
    assert_eq!(a.cifra("tre").unwrap().tipo, 1, "dopo la risposta i messaggi diventano di tipo 1");
}
