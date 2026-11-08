//! Prove delle firme post-quantum [palacan-pq5a]: ML-DSA-65 contro un'implementazione INDIPENDENTE di FIPS 204
//! (vettori in tests_vettori_mldsa65.json, generati con dilithium-py) e la firma ibrida ed25519 + ML-DSA-65.

use palacan_crypto::firma_pq::{self, DOMINIO_IBRIDO, LUNGHEZZA_FIRMA_PQ, LUNGHEZZA_PUBBLICA_FIRMA};
use sha2_pq::{Digest, Sha256};
use vodozemac::olm::Account;

fn esa(testo: &str) -> Vec<u8> {
    (0..testo.len()).step_by(2).map(|i| u8::from_str_radix(&testo[i..i + 2], 16).unwrap()).collect()
}

fn esa_di(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn sha(b: &[u8]) -> String {
    esa_di(&Sha256::digest(b))
}

fn seme(n: u8) -> Vec<u8> {
    (0..32u8).map(|i| i.wrapping_mul(29).wrapping_add(n)).collect()
}

fn vettori() -> Vec<serde_json::Value> {
    let dati: serde_json::Value =
        serde_json::from_str(include_str!("../tests_vettori_mldsa65.json")).expect("vettori leggibili");
    dati["vettori"].as_array().expect("elenco").clone()
}

#[test]
fn ml_dsa_65_chiavi_e_firme_identiche_all_implementazione_indipendente() {
    let vv = vettori();
    assert!(vv.len() >= 4);
    for v in &vv {
        let s = esa(v["seme"].as_str().unwrap());
        let pubblica = firma_pq::chiave_pubblica_firma(&s).unwrap();
        assert_eq!(pubblica.len(), LUNGHEZZA_PUBBLICA_FIRMA);
        assert_eq!(sha(&pubblica), v["sha256_pubblica"].as_str().unwrap(), "chiave pubblica diversa");
        let messaggio = esa(v["messaggio"].as_str().unwrap());
        let contesto = esa(v["contesto"].as_str().unwrap());
        // variante deterministica di FIPS 204 (casuale = 0): stessa firma byte per byte
        let firma = firma_pq::firma_ml_dsa(&s, &contesto, &messaggio, [0u8; 32]).unwrap();
        assert_eq!(firma.len(), LUNGHEZZA_FIRMA_PQ);
        assert_eq!(sha(&firma), v["sha256_firma_deterministica"].as_str().unwrap(), "firma diversa");
        assert!(firma_pq::verifica_ml_dsa(&pubblica, &contesto, &messaggio, &firma));
    }
}

#[test]
fn ml_dsa_65_verifica_una_firma_fatta_dall_implementazione_indipendente() {
    let v = &vettori()[1];
    let pubblica = esa(v["pubblica"].as_str().unwrap());
    let firma = esa(v["firma_deterministica"].as_str().unwrap());
    let messaggio = esa(v["messaggio"].as_str().unwrap());
    let contesto = esa(v["contesto"].as_str().unwrap());
    assert!(firma_pq::verifica_ml_dsa(&pubblica, &contesto, &messaggio, &firma));
    assert!(!firma_pq::verifica_ml_dsa(&pubblica, b"altro", &messaggio, &firma), "contesto diverso");
    assert!(!firma_pq::verifica_ml_dsa(&pubblica, &contesto, b"altro messaggio", &firma), "messaggio diverso");
    for posizione in [0usize, 31, 32, 1000, LUNGHEZZA_FIRMA_PQ - 1] {
        let mut alterata = firma.clone();
        alterata[posizione] ^= 0x01;
        assert!(!firma_pq::verifica_ml_dsa(&pubblica, &contesto, &messaggio, &alterata), "firma alterata al byte {posizione}");
    }
    let mut pk_alterata = pubblica.clone();
    pk_alterata[100] ^= 0x01;
    assert!(!firma_pq::verifica_ml_dsa(&pk_alterata, &contesto, &messaggio, &firma), "chiave alterata");
    assert!(!firma_pq::verifica_ml_dsa(&pubblica, &contesto, &messaggio, &firma[..100]), "firma troncata");
    assert!(!firma_pq::verifica_ml_dsa(&pubblica[..100], &contesto, &messaggio, &firma), "chiave troncata");
}

#[test]
fn firma_hedged_diversa_ogni_volta_ma_sempre_valida() {
    let s = seme(1);
    let pubblica = firma_pq::chiave_pubblica_firma(&s).unwrap();
    let a = firma_pq::firma_ml_dsa(&s, b"c", b"m", [1u8; 32]).unwrap();
    let b = firma_pq::firma_ml_dsa(&s, b"c", b"m", [2u8; 32]).unwrap();
    assert_ne!(a, b);
    assert!(firma_pq::verifica_ml_dsa(&pubblica, b"c", b"m", &a));
    assert!(firma_pq::verifica_ml_dsa(&pubblica, b"c", b"m", &b));
    assert!(firma_pq::firma_ml_dsa(&s, &[0u8; 256], b"m", [0u8; 32]).is_err(), "contesto oltre 255 byte");
    assert!(firma_pq::chiave_pubblica_firma(&[0u8; 31]).is_err());
}

struct Persona {
    conto: Account,
    seme: Vec<u8>,
}

impl Persona {
    fn nuova(n: u8) -> Self {
        Persona { conto: Account::new(), seme: seme(n) }
    }
    fn ed(&self) -> String {
        self.conto.ed25519_key().to_base64()
    }
    fn pq(&self) -> Vec<u8> {
        firma_pq::chiave_pubblica_firma(&self.seme).unwrap()
    }
    // come fara' l'app: l'account Olm firma il testo ibrido, il seme ML-DSA firma lo stesso testo
    fn firma(&self, contesto: &str, messaggio: &str) -> (String, Vec<u8>) {
        let testo = firma_pq::testo_ibrido(contesto, &self.ed(), &self.pq(), messaggio).unwrap();
        let fe = self.conto.sign(testo.as_bytes()).to_base64();
        let fq = firma_pq::firma_ibrida_pq(&self.seme, contesto, &self.ed(), messaggio, [7u8; 32]).unwrap();
        (fe, fq)
    }
}

#[test]
fn firma_ibrida_andata_e_ritorno() {
    let alice = Persona::nuova(1);
    let (fe, fq) = alice.firma("attestato", "palacan-attestato-v1|sessione|alice");
    assert!(firma_pq::verifica_ibrida("attestato", &alice.ed(), &alice.pq(), "palacan-attestato-v1|sessione|alice", &fe, &fq));
    let testo = firma_pq::testo_ibrido("attestato", &alice.ed(), &alice.pq(), "m").unwrap();
    assert!(testo.starts_with(&format!("{DOMINIO_IBRIDO}|attestato|{}|", alice.ed())));
    assert!(testo.ends_with("|m"));
}

#[test]
fn firma_ibrida_cade_se_cade_una_delle_due() {
    let alice = Persona::nuova(2);
    let zed = Persona::nuova(3);
    let (fe, fq) = alice.firma("attestato", "messaggio");
    let (fe_zed, fq_zed) = zed.firma("attestato", "messaggio");
    let ok = |c: &str, ed: &str, pq: &[u8], m: &str, fe: &str, fq: &[u8]| firma_pq::verifica_ibrida(c, ed, pq, m, fe, fq);
    assert!(ok("attestato", &alice.ed(), &alice.pq(), "messaggio", &fe, &fq));
    // una sola delle due (stripping): ed25519 vera + ML-DSA di un altro, o viceversa
    assert!(!ok("attestato", &alice.ed(), &alice.pq(), "messaggio", &fe, &fq_zed), "ML-DSA di un altro");
    assert!(!ok("attestato", &alice.ed(), &alice.pq(), "messaggio", &fe_zed, &fq), "ed25519 di un altro");
    // chiavi mescolate: la ML-DSA di alice con la ed25519 di zed (testo legato a entrambe le chiavi)
    assert!(!ok("attestato", &zed.ed(), &alice.pq(), "messaggio", &fe_zed, &fq), "chiavi mescolate");
    assert!(!ok("attestato", &alice.ed(), &zed.pq(), "messaggio", &fe, &fq_zed), "chiavi mescolate (2)");
    // sostituzione della chiave ML-DSA: zed firma con la SUA ML-DSA un testo con la ed25519 di alice e riusa la
    // firma ed25519 vera di alice. Regge solo se il testo non lega la chiave ML-DSA: deve cadere.
    let fq_sostituita = firma_pq::firma_ibrida_pq(&zed.seme, "attestato", &alice.ed(), "messaggio", [3u8; 32]).unwrap();
    assert!(!ok("attestato", &alice.ed(), &zed.pq(), "messaggio", &fe, &fq_sostituita), "chiave ML-DSA sostituita");
    // altro contesto, altro messaggio
    assert!(!ok("stato-gruppo", &alice.ed(), &alice.pq(), "messaggio", &fe, &fq), "contesto spostato");
    assert!(!ok("attestato", &alice.ed(), &alice.pq(), "messaggio!", &fe, &fq), "messaggio cambiato");
    // ed25519 firmata sul messaggio nudo (vecchio formato): non vale come ibrida
    let nuda = alice.conto.sign(b"messaggio").to_base64();
    assert!(!ok("attestato", &alice.ed(), &alice.pq(), "messaggio", &nuda, &fq), "firma ed25519 del formato vecchio");
    // ML-DSA "pura" sul testo ma senza il contesto di dominio ibrido
    let testo = firma_pq::testo_ibrido("attestato", &alice.ed(), &alice.pq(), "messaggio").unwrap();
    let senza_dominio = firma_pq::firma_ml_dsa(&alice.seme, b"", testo.as_bytes(), [1u8; 32]).unwrap();
    assert!(!ok("attestato", &alice.ed(), &alice.pq(), "messaggio", &fe, &senza_dominio), "senza dominio ML-DSA");
}

#[test]
fn dati_non_validi_danno_falso_o_errore_senza_panico() {
    let alice = Persona::nuova(4);
    let (fe, fq) = alice.firma("attestato", "m");
    for contesto in ["", "Maiuscolo", "con|barra", "spazio no", &"x".repeat(65)] {
        assert!(firma_pq::testo_ibrido(contesto, &alice.ed(), &alice.pq(), "m").is_err(), "contesto {contesto:?}");
        assert!(!firma_pq::verifica_ibrida(contesto, &alice.ed(), &alice.pq(), "m", &fe, &fq));
    }
    assert!(firma_pq::testo_ibrido("attestato", "non-base64!", &alice.pq(), "m").is_err());
    assert!(firma_pq::testo_ibrido("attestato", &alice.ed(), &[0u8; 10], "m").is_err());
    assert!(!firma_pq::verifica_ibrida("attestato", "xx", &alice.pq(), "m", &fe, &fq));
    assert!(!firma_pq::verifica_ibrida("attestato", &alice.ed(), &alice.pq(), "m", "non-base64!", &fq));
    assert!(!firma_pq::verifica_ibrida("attestato", &alice.ed(), &alice.pq(), "m", &fe, &[]));
    let e = firma_pq::firma_ibrida_pq(&[1u8; 5], "attestato", &alice.ed(), "m", [0u8; 32]).unwrap_err();
    assert!(e.0.starts_with("PQ."));
}
