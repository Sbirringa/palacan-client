//! Post-quantum di Palacan [palacan-pq1]: ML-KEM-768 (FIPS 203) e la "busta PQ" delle chiavi di stanza.
//!
//! Perche': i messaggi dei gruppi (Megolm) usano solo crittografia simmetrica, che un computer quantistico non
//! rompe. Le chiavi Megolm pero' viaggiano su Olm (X25519): chi registra oggi quel traffico potrebbe un domani
//! rompere X25519 e leggere tutto ("harvest now, decrypt later"). Ogni chiave di stanza viaggera' quindi dentro
//! DUE buste: la busta PQ (questo file) dentro il messaggio Olm. Per leggerla bisogna rompere X25519 E ML-KEM.
//!
//! Scelte:
//! - ML-KEM-768 di `libcrux-ml-kem` (Cryspen): la stessa implementazione che usa Signal (SPQR), con il codice
//!   portabile verificato formalmente (hax + F*). Versione fissata.
//! - Chiave privata conservata come SEME di 64 byte (d || z di FIPS 203): la coppia si rigenera identica dal seme.
//! - Busta: KEM fresco per ogni busta; chiave = HKDF-SHA256(ss, sale = SHA-256(dominio || pk || ct),
//!   info = dominio || contesto); XChaCha20-Poly1305 con nonce casuale di 24 byte e il contesto come dati
//!   autenticati. Legare pk e ct alla chiave impedisce di riusare un ct con un'altra chiave pubblica; il contesto
//!   (es. mittente, destinatario, stanza) impedisce di spostare una busta altrove.
//! - Formato: versione (1 byte = 1) || ct (1088) || nonce (24) || cifrato+tag.
//! - Nessun segreto nei messaggi d'errore; segreti azzerati dopo l'uso.
//!
//! Questo file non dipende da wasm-bindgen: si prova con test nativi (`cargo test`).

use crate::formato_pq;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use hkdf::Hkdf;
use libcrux_ml_kem::mlkem768;
use sha2_pq::{Digest, Sha256};
use zeroize::Zeroize;

pub const LUNGHEZZA_SEME: usize = 64;
pub const LUNGHEZZA_PUBBLICA: usize = 1184;
// [palacan-pq6b] formato della busta in formato_pq.rs (dimostrato con Kani): qui solo gli stessi valori
pub const LUNGHEZZA_CT: usize = formato_pq::LUNGHEZZA_CT;
pub const LUNGHEZZA_NONCE: usize = formato_pq::LUNGHEZZA_NONCE;
pub const VERSIONE_BUSTA: u8 = formato_pq::VERSIONE_BUSTA;
const DOMINIO: &[u8] = b"palacan-pq-busta-v1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ErrorePq(pub String);

pub type EsitoPq<T> = Result<T, ErrorePq>;

fn errore(codice: &str) -> ErrorePq {
    ErrorePq(format!("PQ.{codice}"))
}

fn seme_da(seme: &[u8]) -> EsitoPq<[u8; LUNGHEZZA_SEME]> {
    seme.try_into().map_err(|_| errore("SEME_NON_VALIDO"))
}

/// Chiave pubblica ML-KEM-768 (1184 byte) ricavata dal seme di 64 byte.
pub fn chiave_pubblica(seme: &[u8]) -> EsitoPq<Vec<u8>> {
    let coppia = mlkem768::generate_key_pair(seme_da(seme)?);
    Ok(coppia.public_key().as_slice().to_vec())
}

/// Incapsulamento verso una chiave pubblica: (ct 1088 byte, segreto condiviso 32 byte). "casuale": 32 byte.
pub fn incapsula(pubblica: &[u8], casuale: [u8; 32]) -> EsitoPq<(Vec<u8>, [u8; 32])> {
    let pk = mlkem768::MlKem768PublicKey::try_from(pubblica).map_err(|_| errore("CHIAVE_PUBBLICA_NON_VALIDA"))?;
    if !mlkem768::validate_public_key(&pk) {
        return Err(errore("CHIAVE_PUBBLICA_NON_VALIDA"));
    }
    let (ct, ss) = mlkem768::encapsulate(&pk, casuale);
    let mut segreto = [0u8; 32];
    segreto.copy_from_slice(ss.as_ref());
    Ok((ct.as_slice().to_vec(), segreto))
}

/// Decapsulamento con il seme: segreto condiviso di 32 byte (con un ct alterato ML-KEM restituisce un segreto
/// diverso, e la busta non si apre).
pub fn decapsula(seme: &[u8], ct: &[u8]) -> EsitoPq<[u8; 32]> {
    let mut s = seme_da(seme)?;
    let coppia = mlkem768::generate_key_pair(s);
    s.zeroize();
    let ct = mlkem768::MlKem768Ciphertext::try_from(ct).map_err(|_| errore("BUSTA_NON_VALIDA"))?;
    let ss = mlkem768::decapsulate(coppia.private_key(), &ct);
    let mut segreto = [0u8; 32];
    segreto.copy_from_slice(ss.as_ref());
    Ok(segreto)
}

fn chiave_busta(segreto: &[u8; 32], pubblica: &[u8], ct: &[u8], contesto: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(DOMINIO);
    h.update(pubblica);
    h.update(ct);
    let sale = h.finalize();
    let mut info = Vec::with_capacity(DOMINIO.len() + contesto.len());
    info.extend_from_slice(DOMINIO);
    info.extend_from_slice(contesto);
    let mut chiave = [0u8; 32];
    Hkdf::<Sha256>::new(Some(sale.as_slice()), segreto)
        .expand(&info, &mut chiave)
        .expect("32 byte sono una lunghezza valida per HKDF-SHA256");
    chiave
}

fn cifrario(chiave: &[u8; 32]) -> XChaCha20Poly1305 {
    XChaCha20Poly1305::new(&(*chiave).into())
}

/// Chiude "testo" in una busta che solo il possessore del seme di "pubblica" puo' aprire.
/// "casuale_kem": 32 byte, "nonce": 24 byte (entrambi casuali e mai riusati).
pub fn sigilla(pubblica: &[u8], contesto: &[u8], testo: &[u8], casuale_kem: [u8; 32], nonce: [u8; LUNGHEZZA_NONCE]) -> EsitoPq<Vec<u8>> {
    let (ct, mut segreto) = incapsula(pubblica, casuale_kem)?;
    let mut chiave = chiave_busta(&segreto, pubblica, &ct, contesto);
    segreto.zeroize();
    let cifrato = cifrario(&chiave)
        .encrypt(&XNonce::from(nonce), Payload { msg: testo, aad: contesto })
        .map_err(|_| errore("CIFRATURA"));
    chiave.zeroize();
    let cifrato = cifrato?;
    Ok(formato_pq::componi_busta(&ct, &nonce, &cifrato))
}

/// Apre una busta con il seme della chiave a cui era destinata e lo stesso contesto.
pub fn apri(seme: &[u8], contesto: &[u8], busta: &[u8]) -> EsitoPq<Vec<u8>> {
    let (ct, nonce, cifrato) = formato_pq::dividi_busta(busta).map_err(errore)?;
    let pubblica = chiave_pubblica(seme)?;
    let mut segreto = decapsula(seme, ct)?;
    let mut chiave = chiave_busta(&segreto, &pubblica, ct, contesto);
    segreto.zeroize();
    let testo = cifrario(&chiave)
        .decrypt(&XNonce::from(nonce), Payload { msg: cifrato, aad: contesto })
        .map_err(|_| errore("BUSTA_NON_APRIBILE"));
    chiave.zeroize();
    testo
}
