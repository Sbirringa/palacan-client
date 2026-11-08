//! Strato per il browser del post-quantum [palacan-pq1]: funzioni semplici con testo in base64 (senza padding,
//! come il resto di Palacan). Errori: `Error` con messaggio che inizia con "PQ.<CODICE>", mai con segreti.
//!   pq_nuovo_seme()                        -> seme privato di 64 byte (casuale del sistema)
//!   pq_chiave_pubblica(seme)               -> chiave pubblica ML-KEM-768 (1184 byte)
//!   pq_sigilla(pubblica, contesto, testo)  -> busta (KEM fresco + XChaCha20-Poly1305, vedi pq.rs)
//!   pq_apri(seme, contesto, busta)         -> testo

use crate::pq;
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
use base64::engine::DecodePaddingMode;
use base64::Engine;
use wasm_bindgen::prelude::*;
use zeroize::Zeroize;

const B64: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::STANDARD,
    GeneralPurposeConfig::new().with_encode_padding(false).with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

fn errore(e: pq::ErrorePq) -> JsError {
    JsError::new(&e.0)
}

fn da_b64(testo: &str) -> Result<Vec<u8>, JsError> {
    B64.decode(testo.trim()).map_err(|_| JsError::new("PQ.BASE64"))
}

fn casuali<const N: usize>() -> Result<[u8; N], JsError> {
    let mut b = [0u8; N];
    getrandom::fill(&mut b).map_err(|_| JsError::new("PQ.NOT_ENOUGH_RANDOM"))?;
    Ok(b)
}

#[wasm_bindgen]
pub fn pq_nuovo_seme() -> Result<String, JsError> {
    let mut seme = casuali::<{ pq::LUNGHEZZA_SEME }>()?;
    let testo = B64.encode(seme);
    seme.zeroize();
    Ok(testo)
}

#[wasm_bindgen]
pub fn pq_chiave_pubblica(seme: &str) -> Result<String, JsError> {
    let mut s = da_b64(seme)?;
    let esito = pq::chiave_pubblica(&s).map(|p| B64.encode(p)).map_err(errore);
    s.zeroize();
    esito
}

#[wasm_bindgen]
pub fn pq_sigilla(pubblica: &str, contesto: &str, testo: &str) -> Result<String, JsError> {
    let pk = da_b64(pubblica)?;
    let mut casuale = casuali::<32>()?;
    let nonce = casuali::<{ pq::LUNGHEZZA_NONCE }>()?;
    let esito = pq::sigilla(&pk, contesto.as_bytes(), testo.as_bytes(), casuale, nonce).map(|b| B64.encode(b)).map_err(errore);
    casuale.zeroize();
    esito
}

#[wasm_bindgen]
pub fn pq_apri(seme: &str, contesto: &str, busta: &str) -> Result<String, JsError> {
    let mut s = da_b64(seme)?;
    let b = da_b64(busta)?;
    let esito = pq::apri(&s, contesto.as_bytes(), &b);
    s.zeroize();
    let testo = esito.map_err(errore)?;
    String::from_utf8(testo).map_err(|_| JsError::new("PQ.UTF8"))
}
