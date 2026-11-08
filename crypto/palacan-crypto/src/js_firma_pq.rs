//! Strato per il browser delle firme post-quantum [palacan-pq5a]: testo in base64 (senza padding, come il resto di
//! Palacan). Errori: `Error` con messaggio "PQ.<CODICE>", mai con segreti.
//!   pqfirma_nuovo_seme()                                         -> seme privato ML-DSA-65 di 32 byte
//!   pqfirma_chiave_pubblica(seme)                                -> chiave pubblica ML-DSA-65 (1952 byte)
//!   pqfirma_testo_ibrido(contesto, ed, pq, messaggio)            -> il testo da far firmare all'account Olm
//!   pqfirma_firma(seme, contesto, ed, messaggio)                 -> parte ML-DSA della firma ibrida (3309 byte)
//!   pqfirma_verifica_ibrida(contesto, ed, pq, messaggio, fe, fq) -> true solo se reggono ed25519 E ML-DSA-65

use crate::firma_pq;
use crate::pq::ErrorePq;
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
use base64::engine::DecodePaddingMode;
use base64::Engine;
use wasm_bindgen::prelude::*;
use zeroize::Zeroize;

const B64: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::STANDARD,
    GeneralPurposeConfig::new().with_encode_padding(false).with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

fn errore(e: ErrorePq) -> JsError {
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
pub fn pqfirma_nuovo_seme() -> Result<String, JsError> {
    let mut seme = casuali::<{ firma_pq::LUNGHEZZA_SEME_FIRMA }>()?;
    let testo = B64.encode(seme);
    seme.zeroize();
    Ok(testo)
}

#[wasm_bindgen]
pub fn pqfirma_chiave_pubblica(seme: &str) -> Result<String, JsError> {
    let mut s = da_b64(seme)?;
    let esito = firma_pq::chiave_pubblica_firma(&s).map(|p| B64.encode(p)).map_err(errore);
    s.zeroize();
    esito
}

#[wasm_bindgen]
pub fn pqfirma_testo_ibrido(contesto: &str, ed_pubblica: &str, pq_pubblica: &str, messaggio: &str) -> Result<String, JsError> {
    let pq = da_b64(pq_pubblica)?;
    firma_pq::testo_ibrido(contesto, ed_pubblica, &pq, messaggio).map_err(errore)
}

#[wasm_bindgen]
pub fn pqfirma_firma(seme: &str, contesto: &str, ed_pubblica: &str, messaggio: &str) -> Result<String, JsError> {
    let mut s = da_b64(seme)?;
    let mut casuale = casuali::<32>()?;
    let esito = firma_pq::firma_ibrida_pq(&s, contesto, ed_pubblica, messaggio, casuale).map(|f| B64.encode(f)).map_err(errore);
    s.zeroize();
    casuale.zeroize();
    esito
}

#[wasm_bindgen]
pub fn pqfirma_verifica_ibrida(
    contesto: &str,
    ed_pubblica: &str,
    pq_pubblica: &str,
    messaggio: &str,
    firma_ed: &str,
    firma_pq: &str,
) -> bool {
    let (Ok(pq), Ok(fq)) = (B64.decode(pq_pubblica.trim()), B64.decode(firma_pq.trim())) else {
        return false;
    };
    firma_pq::verifica_ibrida(contesto, ed_pubblica, &pq, messaggio, firma_ed, &fq)
}
