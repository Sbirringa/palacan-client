//! Firme post-quantum di Palacan [palacan-pq5a]: ML-DSA-65 (FIPS 204) e la FIRMA IBRIDA ed25519 + ML-DSA-65.
//!
//! Perche': le firme di Palacan (attestazioni d'autore N5e, firme delle chiavi post-quantum, stato dei gruppi)
//! sono oggi solo ed25519, che un computer quantistico falsificherebbe. Con la firma ibrida una firma vale solo
//! se reggono ENTRAMBE: ed25519 (provata da decenni) E ML-DSA-65 (resistente ai computer quantistici). Per
//! falsificarla bisogna rompere tutte e due.
//!
//! Scelte:
//! - ML-DSA-65 di `libcrux-ml-dsa` (Cryspen, la stessa famiglia di ML-KEM gia' in uso), versione fissata, solo 65.
//! - Chiave privata conservata come SEME di 32 byte (xi di FIPS 204): la coppia si rigenera identica dal seme, la
//!   chiave privata espansa vive solo durante la firma ed e' azzerata subito dopo.
//! - Firma "hedged" (FIPS 204): 32 byte casuali freschi a ogni firma, mai deterministica in produzione.
//! - Testo firmato (lo STESSO per ed25519 e ML-DSA):
//!     "palacan-firma-ibrida-v1|<contesto>|<chiave ed25519>|<SHA-256 esadecimale della chiave ML-DSA>|<messaggio>"
//!   Legare entrambe le chiavi pubbliche impedisce di staccare una delle due firme e attaccarla a un'altra chiave
//!   ("stripping" / mescolanza di chiavi); il contesto (solo [a-z0-9-.:_], max 64) separa gli usi tra loro, e in
//!   piu' ML-DSA usa "palacan-firma-ibrida-v1" come proprio contesto di dominio (FIPS 204).
//! - La verifica ibrida e' una sola funzione: ritorna vero solo se reggono entrambe le firme. Mai panico, mai
//!   segreti nei messaggi d'errore ("PQ.<CODICE>").
//!
//! Questo file non dipende da wasm-bindgen: si prova con test nativi (`cargo test --test firma_pq`).

use crate::formato_pq;
use crate::pq::ErrorePq;
use libcrux_ml_dsa::ml_dsa_65::{self, MLDSA65Signature, MLDSA65VerificationKey};
use sha2_pq::{Digest, Sha256};
use vodozemac::{Ed25519PublicKey, Ed25519Signature};
use zeroize::Zeroize;

pub const LUNGHEZZA_SEME_FIRMA: usize = 32;
pub const LUNGHEZZA_PUBBLICA_FIRMA: usize = 1952;
pub const LUNGHEZZA_FIRMA_PQ: usize = 3309;
pub const DOMINIO_IBRIDO: &str = "palacan-firma-ibrida-v1";

pub type EsitoFirma<T> = Result<T, ErrorePq>;

fn errore(codice: &str) -> ErrorePq {
    ErrorePq(format!("PQ.{codice}"))
}

fn seme_da(seme: &[u8]) -> EsitoFirma<[u8; LUNGHEZZA_SEME_FIRMA]> {
    seme.try_into().map_err(|_| errore("SEME_NON_VALIDO"))
}

fn esadecimale(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Chiave pubblica ML-DSA-65 (1952 byte) ricavata dal seme di 32 byte.
pub fn chiave_pubblica_firma(seme: &[u8]) -> EsitoFirma<Vec<u8>> {
    let mut s = seme_da(seme)?;
    let mut coppia = ml_dsa_65::generate_key_pair(s);
    s.zeroize();
    let pubblica = coppia.verification_key.as_slice().to_vec();
    coppia.signing_key.as_mut_slice().zeroize();
    Ok(pubblica)
}

/// Firma ML-DSA-65 "pura" (FIPS 204, Algoritmo 2) con il contesto di dominio dato (max 255 byte).
/// "casuale": 32 byte (tutti zero = variante deterministica di FIPS 204, usata SOLO dalle prove).
pub fn firma_ml_dsa(seme: &[u8], contesto: &[u8], messaggio: &[u8], casuale: [u8; 32]) -> EsitoFirma<Vec<u8>> {
    if contesto.len() > 255 {
        return Err(errore("CONTESTO_NON_VALIDO"));
    }
    let mut s = seme_da(seme)?;
    let mut coppia = ml_dsa_65::generate_key_pair(s);
    s.zeroize();
    let esito = ml_dsa_65::sign(&coppia.signing_key, messaggio, contesto, casuale);
    coppia.signing_key.as_mut_slice().zeroize();
    esito.map(|f| f.as_slice().to_vec()).map_err(|_| errore("FIRMA"))
}

/// Verifica ML-DSA-65: vero solo se la firma e' valida. Dati di forma sbagliata = falso, mai panico.
pub fn verifica_ml_dsa(pubblica: &[u8], contesto: &[u8], messaggio: &[u8], firma: &[u8]) -> bool {
    let (Ok(pk), Ok(f)) = (
        <[u8; LUNGHEZZA_PUBBLICA_FIRMA]>::try_from(pubblica),
        <[u8; LUNGHEZZA_FIRMA_PQ]>::try_from(firma),
    ) else {
        return false;
    };
    if contesto.len() > 255 {
        return false;
    }
    ml_dsa_65::verify(&MLDSA65VerificationKey::new(pk), messaggio, contesto, &MLDSA65Signature::new(f)).is_ok()
}

// [palacan-pq6b] regole e composizione del testo in formato_pq.rs (dimostrate con Kani, provate con proptest)
fn contesto_valido(contesto: &str) -> bool {
    formato_pq::contesto_valido(contesto.as_bytes())
}

/// Il testo che firmano ENTRAMBE le chiavi (vedi in cima al file).
pub fn testo_ibrido(contesto: &str, ed_pubblica: &str, pq_pubblica: &[u8], messaggio: &str) -> EsitoFirma<String> {
    if !contesto_valido(contesto) {
        return Err(errore("CONTESTO_NON_VALIDO"));
    }
    let ed = Ed25519PublicKey::from_base64(ed_pubblica.trim()).map_err(|_| errore("CHIAVE_ED25519_NON_VALIDA"))?;
    if pq_pubblica.len() != LUNGHEZZA_PUBBLICA_FIRMA {
        return Err(errore("CHIAVE_PUBBLICA_NON_VALIDA"));
    }
    let ed = ed.to_base64();
    let impronta = esadecimale(&Sha256::digest(pq_pubblica));
    if !formato_pq::solo_caratteri_di_chiave(ed.as_bytes()) || !formato_pq::solo_caratteri_di_chiave(impronta.as_bytes()) {
        return Err(errore("CHIAVE_ED25519_NON_VALIDA"));
    }
    let testo = formato_pq::componi_testo_ibrido(contesto.as_bytes(), ed.as_bytes(), impronta.as_bytes(), messaggio.as_bytes());
    String::from_utf8(testo).map_err(|_| errore("TESTO_NON_VALIDO"))
}

/// Parte ML-DSA della firma ibrida (la parte ed25519 la fa l'account Olm sullo stesso `testo_ibrido`).
pub fn firma_ibrida_pq(seme: &[u8], contesto: &str, ed_pubblica: &str, messaggio: &str, casuale: [u8; 32]) -> EsitoFirma<Vec<u8>> {
    let pq_pubblica = chiave_pubblica_firma(seme)?;
    let testo = testo_ibrido(contesto, ed_pubblica, &pq_pubblica, messaggio)?;
    firma_ml_dsa(seme, DOMINIO_IBRIDO.as_bytes(), testo.as_bytes(), casuale)
}

/// Verifica ibrida: vero SOLO se reggono entrambe, ed25519 E ML-DSA-65, sullo stesso testo legato alle due chiavi.
pub fn verifica_ibrida(
    contesto: &str,
    ed_pubblica: &str,
    pq_pubblica: &[u8],
    messaggio: &str,
    firma_ed: &str,
    firma_pq: &[u8],
) -> bool {
    let Ok(testo) = testo_ibrido(contesto, ed_pubblica, pq_pubblica, messaggio) else {
        return false;
    };
    let (Ok(ed), Ok(f)) = (
        Ed25519PublicKey::from_base64(ed_pubblica.trim()),
        Ed25519Signature::from_base64(firma_ed.trim()),
    ) else {
        return false;
    };
    ed.verify(testo.as_bytes(), &f).is_ok() && verifica_ml_dsa(pq_pubblica, DOMINIO_IBRIDO.as_bytes(), testo.as_bytes(), firma_pq)
}
