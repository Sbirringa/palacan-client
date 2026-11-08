//! Prove del post-quantum [palacan-pq1]: ML-KEM-768 contro un'implementazione INDIPENDENTE di FIPS 203
//! (vettori in tests_vettori_mlkem768.json, generati con kyber-py) e la busta PQ delle chiavi di stanza.

use palacan_crypto::pq::{self, LUNGHEZZA_CT, LUNGHEZZA_NONCE, LUNGHEZZA_PUBBLICA};
use sha2_pq::{Digest, Sha256};

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
    (0..64u8).map(|i| i.wrapping_mul(31).wrapping_add(n)).collect()
}

#[test]
fn ml_kem_768_coincide_con_l_implementazione_indipendente() {
    let dati: serde_json::Value =
        serde_json::from_str(include_str!("../tests_vettori_mlkem768.json")).expect("vettori leggibili");
    let vettori = dati["vettori"].as_array().expect("elenco");
    assert!(vettori.len() >= 3);
    for v in vettori {
        let s = esa(v["seme"].as_str().unwrap());
        let pubblica = pq::chiave_pubblica(&s).unwrap();
        assert_eq!(pubblica.len(), LUNGHEZZA_PUBBLICA);
        assert_eq!(sha(&pubblica), v["sha256_pubblica"].as_str().unwrap(), "chiave pubblica diversa");
        let mut casuale = [0u8; 32];
        casuale.copy_from_slice(&esa(v["casuale"].as_str().unwrap()));
        let (ct, ss) = pq::incapsula(&pubblica, casuale).unwrap();
        assert_eq!(ct.len(), LUNGHEZZA_CT);
        assert_eq!(sha(&ct), v["sha256_ct"].as_str().unwrap(), "testo cifrato diverso");
        assert_eq!(esa_di(&ss), v["segreto"].as_str().unwrap(), "segreto diverso");
        assert_eq!(pq::decapsula(&s, &ct).unwrap(), ss, "il decapsulamento non ritrova il segreto");
    }
}

#[test]
fn busta_andata_e_ritorno() {
    let s = seme(1);
    let pubblica = pq::chiave_pubblica(&s).unwrap();
    let busta = pq::sigilla(&pubblica, b"alice|bob|stanza", b"chiave di stanza", [7u8; 32], [9u8; LUNGHEZZA_NONCE]).unwrap();
    assert_eq!(busta[0], 1);
    assert_eq!(busta.len(), 1 + LUNGHEZZA_CT + LUNGHEZZA_NONCE + b"chiave di stanza".len() + 16);
    assert_eq!(pq::apri(&s, b"alice|bob|stanza", &busta).unwrap(), b"chiave di stanza");
}

#[test]
fn busta_non_si_apre_con_un_altro_seme_un_altro_contesto_o_se_alterata() {
    let s = seme(2);
    let pubblica = pq::chiave_pubblica(&s).unwrap();
    let busta = pq::sigilla(&pubblica, b"contesto", b"segreto", [1u8; 32], [2u8; LUNGHEZZA_NONCE]).unwrap();
    assert!(pq::apri(&seme(3), b"contesto", &busta).is_err(), "seme sbagliato");
    assert!(pq::apri(&s, b"contesto spostato", &busta).is_err(), "contesto diverso");
    for posizione in [0usize, 1, 500, 1 + LUNGHEZZA_CT, 1 + LUNGHEZZA_CT + LUNGHEZZA_NONCE, busta.len() - 1] {
        let mut alterata = busta.clone();
        alterata[posizione] ^= 0x01;
        assert!(pq::apri(&s, b"contesto", &alterata).is_err(), "busta alterata al byte {posizione} aperta");
    }
    assert!(pq::apri(&s, b"contesto", &busta[..100]).is_err(), "busta troncata");
}

#[test]
fn ogni_busta_e_diversa_e_dati_non_validi_danno_errore() {
    let s = seme(4);
    let pubblica = pq::chiave_pubblica(&s).unwrap();
    let a = pq::sigilla(&pubblica, b"c", b"x", [1u8; 32], [1u8; LUNGHEZZA_NONCE]).unwrap();
    let b = pq::sigilla(&pubblica, b"c", b"x", [2u8; 32], [2u8; LUNGHEZZA_NONCE]).unwrap();
    assert_ne!(a, b);
    assert!(pq::chiave_pubblica(&[0u8; 10]).is_err());
    assert!(pq::incapsula(&[0u8; 10], [0u8; 32]).is_err());
    assert!(pq::incapsula(&vec![0xffu8; LUNGHEZZA_PUBBLICA], [0u8; 32]).is_err(), "chiave pubblica fuori dal campo");
    assert!(pq::decapsula(&s, &[0u8; 10]).is_err());
    let e = pq::apri(&seme(5), b"c", &a).unwrap_err();
    assert!(!e.0.contains(&esa_di(&s)), "nessun segreto nei messaggi d'errore");
}
