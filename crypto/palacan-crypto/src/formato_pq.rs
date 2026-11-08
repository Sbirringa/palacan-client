//! Formati della parte post-quantum di Palacan [palacan-pq6b]: SOLO logica pura, senza crittografia e senza
//! dipendenze, cosi' le sue proprieta' si dimostrano con il model checker Kani (in fondo al file, `cfg(kani)`) per
//! TUTTI gli input entro i limiti indicati, oltre alle prove con dati casuali (tests/proprieta_pq.rs).
//!
//! - Testo della firma ibrida (firma_pq.rs): "palacan-firma-ibrida-v1|<contesto>|<chiave ed25519>|<impronta>|<msg>".
//!   Proprieta' dimostrata: il testo si SCOMPONE in modo unico nelle sue parti (scomponi(componi(x)) = x), quindi due
//!   firme ibride su contesti, chiavi o messaggi diversi non firmano mai lo stesso testo. Vale perche' contesto
//!   ([a-z0-9-.:_]), chiave ed25519 (base64) e impronta (esadecimale) non contengono mai '|'.
//! - Busta post-quantum (pq.rs): versione (1 byte) || ct ML-KEM (1088) || nonce (24) || cifrato + tag (>= 16).
//!   Proprieta' dimostrate: dividere una busta qualsiasi non va mai in panico; accetta esattamente le buste di forma
//!   giusta; ricomporre le parti ridà la busta identica.
//!
//! pq.rs e firma_pq.rs usano QUESTE funzioni: le dimostrazioni valgono per il codice che va online, non per una copia.

pub const DOMINIO_IBRIDO: &[u8] = b"palacan-firma-ibrida-v1";
pub const MASSIMO_CONTESTO: usize = 64;
pub const SEPARATORE: u8 = b'|';

pub const VERSIONE_BUSTA: u8 = 1;
pub const LUNGHEZZA_CT: usize = 1088;
pub const LUNGHEZZA_NONCE: usize = 24;
pub const LUNGHEZZA_TAG: usize = 16;
pub const MINIMO_BUSTA: usize = 1 + LUNGHEZZA_CT + LUNGHEZZA_NONCE + LUNGHEZZA_TAG;

/// Contesto della firma ibrida: 1..=64 byte, solo [a-z0-9-.:_].
pub fn contesto_valido(contesto: &[u8]) -> bool {
    if contesto.is_empty() || contesto.len() > MASSIMO_CONTESTO {
        return false;
    }
    let mut i = 0;
    while i < contesto.len() {
        let b = contesto[i];
        let ok = b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'.' || b == b':' || b == b'_';
        if !ok {
            return false;
        }
        i += 1;
    }
    true
}

/// Carattere ammesso in una chiave ed25519 in base64 (senza '=') o in un'impronta esadecimale.
pub fn carattere_di_chiave(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'+' || b == b'/'
}

/// Vero se ogni byte e' un carattere di chiave (base64 o esadecimale): mai '|'.
pub fn solo_caratteri_di_chiave(parte: &[u8]) -> bool {
    let mut i = 0;
    while i < parte.len() {
        if !carattere_di_chiave(parte[i]) {
            return false;
        }
        i += 1;
    }
    true
}

/// Testo firmato da ENTRAMBE le chiavi. Le parti devono essere gia' controllate (contesto_valido, chiave e impronta
/// fatte solo di caratteri di chiave): firma_pq.rs lo fa prima di chiamare.
pub fn componi_testo_ibrido(contesto: &[u8], ed: &[u8], impronta: &[u8], messaggio: &[u8]) -> Vec<u8> {
    let mut t = Vec::with_capacity(DOMINIO_IBRIDO.len() + contesto.len() + ed.len() + impronta.len() + messaggio.len() + 4);
    t.extend_from_slice(DOMINIO_IBRIDO);
    t.push(SEPARATORE);
    t.extend_from_slice(contesto);
    t.push(SEPARATORE);
    t.extend_from_slice(ed);
    t.push(SEPARATORE);
    t.extend_from_slice(impronta);
    t.push(SEPARATORE);
    t.extend_from_slice(messaggio);
    t
}

fn prossimo_separatore(t: &[u8], da: usize) -> Option<usize> {
    let mut i = da;
    while i < t.len() {
        if t[i] == SEPARATORE {
            return Some(i);
        }
        i += 1;
    }
    None
}

/// L'inverso di componi_testo_ibrido: (contesto, chiave ed25519, impronta, messaggio) oppure None se il testo non e'
/// un testo ibrido ben formato. Il messaggio (ultima parte) puo' contenere '|'.
pub fn scomponi_testo_ibrido(t: &[u8]) -> Option<(&[u8], &[u8], &[u8], &[u8])> {
    let n = DOMINIO_IBRIDO.len();
    if t.len() <= n || &t[..n] != DOMINIO_IBRIDO || t[n] != SEPARATORE {
        return None;
    }
    let a = n + 1;
    let b = prossimo_separatore(t, a)?;
    let c = prossimo_separatore(t, b + 1)?;
    let d = prossimo_separatore(t, c + 1)?;
    let (contesto, ed, impronta, messaggio) = (&t[a..b], &t[b + 1..c], &t[c + 1..d], &t[d + 1..]);
    if !contesto_valido(contesto) || !solo_caratteri_di_chiave(ed) || !solo_caratteri_di_chiave(impronta) {
        return None;
    }
    Some((contesto, ed, impronta, messaggio))
}

/// Divide una busta nelle sue parti (ct, nonce, cifrato+tag). Errori: "BUSTA_NON_VALIDA" (troppo corta),
/// "VERSIONE_SCONOSCIUTA". Mai panico, per nessun input.
pub fn dividi_busta(busta: &[u8]) -> Result<(&[u8], [u8; LUNGHEZZA_NONCE], &[u8]), &'static str> {
    if busta.len() < MINIMO_BUSTA {
        return Err("BUSTA_NON_VALIDA");
    }
    if busta[0] != VERSIONE_BUSTA {
        return Err("VERSIONE_SCONOSCIUTA");
    }
    let ct = &busta[1..1 + LUNGHEZZA_CT];
    let mut nonce = [0u8; LUNGHEZZA_NONCE];
    nonce.copy_from_slice(&busta[1 + LUNGHEZZA_CT..1 + LUNGHEZZA_CT + LUNGHEZZA_NONCE]);
    Ok((ct, nonce, &busta[1 + LUNGHEZZA_CT + LUNGHEZZA_NONCE..]))
}

/// Compone una busta dalle sue parti (l'inverso di dividi_busta).
pub fn componi_busta(ct: &[u8], nonce: &[u8; LUNGHEZZA_NONCE], cifrato: &[u8]) -> Vec<u8> {
    let mut busta = Vec::with_capacity(1 + ct.len() + LUNGHEZZA_NONCE + cifrato.len());
    busta.push(VERSIONE_BUSTA);
    busta.extend_from_slice(ct);
    busta.extend_from_slice(nonce);
    busta.extend_from_slice(cifrato);
    busta
}

// ---------------------------------------------------------------------------------------------------------------
// Dimostrazioni con Kani (https://model-checking.github.io/kani), nella CI "Modelli formali" (formale/kani compila
// QUESTO stesso file). Ogni #[kani::proof] vale per TUTTI i valori dei byte simbolici, alle lunghezze indicate:
// e' una dimostrazione esaustiva entro quei limiti, non un campione di casi.
#[cfg(kani)]
mod dimostrazioni {
    use super::*;

    /// Un contesto accettato e' lungo 1..=64 e nessuno dei suoi byte e' il separatore '|'.
    #[kani::proof]
    #[kani::unwind(67)]
    #[kani::solver(cadical)]
    fn contesto_valido_senza_separatore() {
        let byte: [u8; 65] = kani::any();
        let lunghezza: usize = kani::any();
        kani::assume(lunghezza <= 65);
        let c = &byte[..lunghezza];
        let k: usize = kani::any();
        kani::assume(k < lunghezza);
        if contesto_valido(c) {
            assert!(!c.is_empty() && c.len() <= MASSIMO_CONTESTO);
            assert!(c[k] != SEPARATORE);
        }
    }

    /// Lettura unica del testo ibrido, andata e ritorno. Per QUALSIASI sequenza di byte (fino a 34) che ha la forma
    /// di un testo ibrido con i separatori nelle posizioni b, c, d (prefisso "palacan-firma-ibrida-v1|", contesto
    /// valido, chiave e impronta fatte di caratteri di chiave, messaggio qualsiasi, anche con '|'):
    ///   1. scomponi la legge ESATTAMENTE in quelle posizioni (nessun testo ha due letture);
    ///   2. componi, con quelle parti, riscrive ESATTAMENTE quel testo (componi scrive sempre questa forma).
    /// Insieme: per ogni (contesto, chiave, impronta, messaggio) validi, scomponi(componi(x)) = x, quindi due firme
    /// ibride su parti diverse non firmano mai lo stesso testo. L'input e' un array di dimensione fissa (cosi' Kani
    /// lo risolve in poco: partire da un testo costruito da componi sullo heap esaurisce la memoria della macchina).
    #[kani::proof]
    #[kani::unwind(36)]
    #[kani::solver(cadical)]
    fn testo_ibrido_lettura_unica() {
        const MASSIMO: usize = 34;
        let byte: [u8; MASSIMO] = kani::any();
        let lunghezza: usize = kani::any();
        kani::assume(lunghezza <= MASSIMO);
        let t = &byte[..lunghezza];
        let n = DOMINIO_IBRIDO.len();
        let (b, c, d): (usize, usize, usize) = (kani::any(), kani::any(), kani::any());
        kani::assume(n < b && b < c && c < d && d < lunghezza);
        let mut k = 0;
        while k < n {
            kani::assume(t[k] == DOMINIO_IBRIDO[k]);
            k += 1;
        }
        kani::assume(t[n] == SEPARATORE && t[b] == SEPARATORE && t[c] == SEPARATORE && t[d] == SEPARATORE);
        kani::assume(contesto_valido(&t[n + 1..b]));
        kani::assume(solo_caratteri_di_chiave(&t[b + 1..c]) && solo_caratteri_di_chiave(&t[c + 1..d]));
        let parti = scomponi_testo_ibrido(t);
        assert!(parti.is_some());
        let (contesto, ed, impronta, messaggio) = parti.unwrap();
        assert!(contesto.as_ptr() == t[n + 1..].as_ptr() && contesto.len() == b - n - 1);
        assert!(ed.as_ptr() == t[b + 1..].as_ptr() && ed.len() == c - b - 1);
        assert!(impronta.as_ptr() == t[c + 1..].as_ptr() && impronta.len() == d - c - 1);
        assert!(messaggio.as_ptr() == t[d + 1..].as_ptr() && messaggio.len() == lunghezza - d - 1);
        assert!(componi_testo_ibrido(contesto, ed, impronta, messaggio) == t);
    }

    /// Per QUALSIASI sequenza di byte (fino a 34): scomponi non va in panico e, se accetta, ricomponendo le parti si
    /// riottiene esattamente lo stesso testo (nessun testo ha due letture diverse).
    #[kani::proof]
    #[kani::unwind(36)]
    #[kani::solver(cadical)]
    fn testo_qualsiasi_senza_panico_e_lettura_unica() {
        const MASSIMO: usize = 34;
        let byte: [u8; MASSIMO] = kani::any();
        let lunghezza: usize = kani::any();
        kani::assume(lunghezza <= MASSIMO);
        let t = &byte[..lunghezza];
        if let Some((c, e, i, m)) = scomponi_testo_ibrido(t) {
            assert!(contesto_valido(c));
            assert!(componi_testo_ibrido(c, e, i, m) == t);
        }
    }

    /// Dividere una busta di QUALSIASI contenuto e lunghezza (fino a MINIMO_BUSTA + 4) non va mai in panico, accetta
    /// esattamente le buste lunghe almeno MINIMO_BUSTA con versione 1, le parti sono quelle attese, e ricomponendole
    /// si riottiene la busta identica (controllato su un byte simbolico, quindi su tutti).
    #[kani::proof]
    #[kani::unwind(3)]
    #[kani::solver(cadical)]
    fn busta_divisa_senza_panico_e_ricomposta_identica() {
        const MASSIMO: usize = MINIMO_BUSTA + 4;
        let byte: [u8; MASSIMO] = kani::any();
        let lunghezza: usize = kani::any();
        kani::assume(lunghezza <= MASSIMO);
        let busta = &byte[..lunghezza];
        match dividi_busta(busta) {
            Ok((ct, nonce, cifrato)) => {
                assert!(lunghezza >= MINIMO_BUSTA && busta[0] == VERSIONE_BUSTA);
                assert!(ct.len() == LUNGHEZZA_CT && cifrato.len() == lunghezza - 1 - LUNGHEZZA_CT - LUNGHEZZA_NONCE);
                assert!(cifrato.len() >= LUNGHEZZA_TAG);
                let ricomposta = componi_busta(ct, &nonce, cifrato);
                assert!(ricomposta.len() == lunghezza);
                let k: usize = kani::any();
                kani::assume(k < lunghezza);
                assert!(ricomposta[k] == busta[k]);
            }
            Err(_) => {
                assert!(lunghezza < MINIMO_BUSTA || busta[0] != VERSIONE_BUSTA);
            }
        }
    }
}
