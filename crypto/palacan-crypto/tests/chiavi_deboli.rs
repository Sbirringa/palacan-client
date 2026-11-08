//! [palacan-cl1] Chiavi Curve25519 "deboli" (di ordine basso): con una di queste lo scambio Diffie-Hellman di Olm
//! da' un segreto tutto zero, cioe' noto a chiunque. Il problema e' stato segnalato in vodozemac a febbraio 2026
//! (https://matrix.org/blog/2026/02/analysis-of-reported-issues-in-vodozemac/): vodozemac 0.9 creava la sessione
//! lo stesso. Da vodozemac 0.11 la sessione viene rifiutata ("non-contributory"), e Palacan usa la 0.11.1.
//!
//! Questo test BLOCCA il comportamento giusto: se un domani si tornasse a una versione di vodozemac (o a un altro
//! motore) che accetta queste chiavi, la CI diventa rossa. Si provano tutte le 7 chiavi deboli note, anche con il
//! bit piu' alto acceso (X25519 lo ignora, RFC 7748): 14 chiavi, in tutti i punti in cui una chiave dell'ALTRO
//! entra nello scambio:
//!   - sessione in uscita: chiave d'identita' e chiave usa e getta del destinatario;
//!   - sessione in entrata: chiave d'identita' del mittente (presa dal messaggio, o attesa da Palacan).
//!
//! Il motivo del rifiuto deve essere proprio lo scambio non sicuro, non un altro errore qualsiasi.

use base64::engine::general_purpose::STANDARD_NO_PAD as B64;
use base64::Engine;
use palacan_crypto::nucleo::*;
use serde_json::Value;

const CHIAVE_PICKLE: &[u8] = b"prova-cl1";
const MOTIVO: &str = "non-contributory";

/// Le 7 chiavi Curve25519 di ordine basso (le stesse della lista di libsodium) e le loro varianti con il bit piu'
/// alto acceso: 14 chiavi.
fn chiavi_deboli() -> Vec<[u8; 32]> {
    let mut uno = [0u8; 32];
    uno[0] = 1;
    let ordine8_a: [u8; 32] = [
        0xe0, 0xeb, 0x7a, 0x7c, 0x3b, 0x41, 0xb8, 0xae, 0x16, 0x56, 0xe3, 0xfa, 0xf1, 0x9f, 0xc4, 0x6a, 0xda, 0x09,
        0x8d, 0xeb, 0x9c, 0x32, 0xb1, 0xfd, 0x86, 0x62, 0x05, 0x16, 0x5f, 0x49, 0xb8, 0x00,
    ];
    let ordine8_b: [u8; 32] = [
        0x5f, 0x9c, 0x95, 0xbc, 0xa3, 0x50, 0x8c, 0x24, 0xb1, 0xd0, 0xb1, 0x55, 0x9c, 0x83, 0xef, 0x5b, 0x04, 0x44,
        0x5c, 0xc4, 0x58, 0x1c, 0x8e, 0x86, 0xd8, 0x22, 0x4e, 0xdd, 0xd0, 0x9f, 0x11, 0x57,
    ];
    // p - 1, p, p + 1 con p = 2^255 - 19 (scritture non canoniche di -1, 0 e 1)
    let vicino_a_p = |primo: u8| {
        let mut b = [0xffu8; 32];
        b[0] = primo;
        b[31] = 0x7f;
        b
    };
    let base = vec![[0u8; 32], uno, ordine8_a, ordine8_b, vicino_a_p(0xec), vicino_a_p(0xed), vicino_a_p(0xee)];
    let mut tutte = base.clone();
    tutte.extend(base.iter().map(|k| {
        let mut alta = *k;
        alta[31] |= 0x80;
        alta
    }));
    tutte
}

fn identita(c: &Conto) -> String {
    let v: Value = serde_json::from_str(&c.chiavi_identita()).unwrap();
    v["curve25519"].as_str().unwrap().to_string()
}

fn una_usa_e_getta(c: &mut Conto) -> String {
    c.genera_chiavi_usa_e_getta(1);
    let v: Value = serde_json::from_str(&c.chiavi_usa_e_getta()).unwrap();
    v["curve25519"].as_object().unwrap().values().next().unwrap().as_str().unwrap().to_string()
}

fn rifiutata_per_scambio_non_sicuro<T>(esito: Esito<T>, dove: &str, k: &[u8; 32]) {
    match esito {
        Ok(_) => panic!("CL1: {dove}: chiave debole {} ACCETTATA", B64.encode(k)),
        Err(e) => assert!(e.0.contains(MOTIVO), "CL1: {dove}: chiave {} rifiutata per un altro motivo: {}", B64.encode(k), e.0),
    }
}

#[test]
fn le_chiavi_deboli_sono_14_e_tutte_diverse() {
    let mut k = chiavi_deboli();
    k.sort();
    k.dedup();
    assert_eq!(k.len(), 14);
}

#[test]
fn sessione_in_uscita_rifiuta_le_chiavi_deboli_del_destinatario() {
    let alice = Conto::nuovo();
    let mut bob = Conto::nuovo();
    let usa_e_getta = una_usa_e_getta(&mut bob);
    let id_bob = identita(&bob);
    for k in chiavi_deboli() {
        let debole = B64.encode(k);
        rifiutata_per_scambio_non_sicuro(SessioneOlm::uscente(&alice, &debole, &usa_e_getta), "identita' del destinatario", &k);
        rifiutata_per_scambio_non_sicuro(SessioneOlm::uscente(&alice, &id_bob, &debole), "chiave usa e getta del destinatario", &k);
    }
    // controllo: con le chiavi vere la sessione nasce e funziona
    let mut s = SessioneOlm::uscente(&alice, &id_bob, &usa_e_getta).expect("con chiavi vere la sessione deve nascere");
    assert_eq!(s.cifra("ciao").unwrap().tipo, 0);
}

#[test]
fn sessione_in_entrata_rifiuta_un_mittente_con_chiave_debole() {
    let alice = Conto::nuovo();
    let mut bob = Conto::nuovo();
    let usa_e_getta = una_usa_e_getta(&mut bob);
    let bob_salvato = bob.pickle(CHIAVE_PICKLE);
    let mut verso_bob = SessioneOlm::uscente(&alice, &identita(&bob), &usa_e_getta).unwrap();
    let primo = verso_bob.cifra("ciao Bob").unwrap();
    let byte = B64.decode(&primo.corpo).unwrap();
    let id_alice = B64.decode(identita(&alice)).unwrap();
    let posizione = byte.windows(32).position(|w| w == &id_alice[..]).expect("chiave d'identita' nel messaggio");

    for k in chiavi_deboli() {
        // lo stesso primo messaggio, ma con la chiave d'identita' del mittente sostituita da una debole
        let mut alterato = byte.clone();
        alterato[posizione..posizione + 32].copy_from_slice(&k);
        let corpo = B64.encode(&alterato);
        let (mut b1, _) = Conto::da_pickle(CHIAVE_PICKLE, &bob_salvato).unwrap();
        rifiutata_per_scambio_non_sicuro(SessioneOlm::entrante(&mut b1, &corpo), "mittente preso dal messaggio", &k);
        let (mut b2, _) = Conto::da_pickle(CHIAVE_PICKLE, &bob_salvato).unwrap();
        rifiutata_per_scambio_non_sicuro(SessioneOlm::entrante_da(&mut b2, &B64.encode(k), &corpo), "mittente atteso", &k);
    }
    // controllo: il messaggio vero viene accettato e letto
    let (mut b, _) = Conto::da_pickle(CHIAVE_PICKLE, &bob_salvato).unwrap();
    let mut s = SessioneOlm::entrante(&mut b, &primo.corpo).expect("il messaggio vero deve aprire la sessione");
    assert_eq!(s.decifra(0, &primo.corpo).unwrap(), "ciao Bob");
}
