//! Prove per proprieta' della parte post-quantum [palacan-pq6b]: invece di pochi esempi scritti a mano, proptest
//! genera migliaia di input casuali (anche ostili: byte qualsiasi, lunghezze sbagliate, bit alterati) e, se una
//! proprieta' cade, riduce l'input al caso minimo che la fa cadere. Completano le dimostrazioni di Kani in
//! src/formato_pq.rs (esaustive ma su input piccoli) e i modelli ProVerif in formale/ (il protocollo).
//!
//! 1. Formati (formato_pq.rs, puri): regola del contesto, testo ibrido che si scompone in modo unico, busta che si
//!    divide senza panico per QUALSIASI input.
//! 2. Busta ML-KEM (pq.rs): si apre solo intatta, con il seme giusto e lo stesso contesto; mai panico.
//! 3. Firma ibrida (firma_pq.rs): vale solo se reggono entrambe le firme sullo stesso testo; mai panico.
//! 4. Formato invariato: busta, testo e firme identici, byte per byte, a quelli del codice prima di PQ6b.

use palacan_crypto::formato_pq::{self, MINIMO_BUSTA};
use palacan_crypto::{firma_pq, pq};
use proptest::prelude::*;
use sha2_pq::{Digest, Sha256};
use vodozemac::{Ed25519PublicKey, Ed25519SecretKey};

fn esa(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn sha(b: &[u8]) -> String {
    esa(&Sha256::digest(b))
}

// La regola del contesto scritta in un altro modo (indipendente dal codice provato).
fn contesto_secondo_la_regola(c: &[u8]) -> bool {
    (1..=64).contains(&c.len()) && c.iter().all(|b| "abcdefghijklmnopqrstuvwxyz0123456789-.:_".as_bytes().contains(b))
}

// Il testo ibrido come lo scriveva il codice prima di PQ6b (format!): il nuovo deve dare gli stessi byte.
fn testo_ibrido_di_prima(contesto: &str, ed: &str, pq_pubblica: &[u8], messaggio: &str) -> String {
    format!("palacan-firma-ibrida-v1|{contesto}|{ed}|{}|{messaggio}", sha(pq_pubblica))
}

fn contesto() -> impl Strategy<Value = String> {
    "[a-z0-9\\-.:_]{1,64}"
}

fn parte_di_chiave() -> impl Strategy<Value = Vec<u8>> {
    proptest::collection::vec(proptest::sample::select(b"ABCxyz019+/".to_vec()), 0..48)
}

fn byte_qualsiasi(massimo: usize) -> impl Strategy<Value = Vec<u8>> {
    proptest::collection::vec(any::<u8>(), 0..massimo)
}

// Byte qualsiasi, oppure contesti quasi validi: caratteri ammessi con qualche intruso ('|', maiuscole, spazi,
// '/', byte non ASCII) e lunghezze attorno al limite di 64, cosi' i casi di confine escono spesso.
fn quasi_contesto() -> impl Strategy<Value = Vec<u8>> {
    prop_oneof![
        byte_qualsiasi(80),
        proptest::collection::vec(proptest::sample::select(b"az09-.:_|A /\xff\x00".to_vec()), 0..3),
        proptest::collection::vec(proptest::sample::select(b"az09-.:_".to_vec()), 60..68),
        (contesto(), proptest::sample::select(b"|AZ /=+\xc3".to_vec()), any::<prop::sample::Index>()).prop_map(|(c, x, i)| {
            let mut c = c.into_bytes();
            let dove = i.index(c.len());
            c[dove] = x;
            c
        }),
    ]
}

fn quasi_chiave() -> impl Strategy<Value = Vec<u8>> {
    prop_oneof![
        3 => parte_di_chiave(),
        1 => proptest::collection::vec(proptest::sample::select(b"Az9+/=-_ .:\xff".to_vec()), 0..6),
    ]
}

fn chiave_ed(seme: [u8; 32]) -> (Ed25519SecretKey, String) {
    let privata = Ed25519SecretKey::from_slice(&seme);
    let pubblica = privata.public_key().to_base64();
    (privata, pubblica)
}

fn firma_completa(privata: &Ed25519SecretKey, seme_pq: &[u8], c: &str, ed: &str, m: &str, casuale: [u8; 32]) -> (String, Vec<u8>) {
    let pq_pubblica = firma_pq::chiave_pubblica_firma(seme_pq).unwrap();
    let testo = firma_pq::testo_ibrido(c, ed, &pq_pubblica, m).unwrap();
    let fe = privata.sign(testo.as_bytes()).to_base64();
    let fq = firma_pq::firma_ibrida_pq(seme_pq, c, ed, m, casuale).unwrap();
    (fe, fq)
}

// ------------------------------------------------------------------------------------------------ 1. formati
proptest! {
    #![proptest_config(ProptestConfig::with_cases(4000))]

    #[test]
    fn contesto_accettato_esattamente_secondo_la_regola(c in quasi_contesto()) {
        prop_assert_eq!(formato_pq::contesto_valido(&c), contesto_secondo_la_regola(&c));
    }

    #[test]
    fn contesto_accettato_senza_separatore(c in contesto()) {
        prop_assert!(formato_pq::contesto_valido(c.as_bytes()));
        prop_assert!(!c.as_bytes().contains(&b'|'));
    }

    #[test]
    fn testo_ibrido_si_scompone_nelle_sue_parti(
        c in contesto(), e in parte_di_chiave(), i in parte_di_chiave(), m in byte_qualsiasi(200),
    ) {
        let testo = formato_pq::componi_testo_ibrido(c.as_bytes(), &e, &i, &m);
        let (c2, e2, i2, m2) = formato_pq::scomponi_testo_ibrido(&testo).expect("testo ben formato");
        prop_assert_eq!(c2, c.as_bytes());
        prop_assert_eq!(e2, &e[..]);
        prop_assert_eq!(i2, &i[..]);
        prop_assert_eq!(m2, &m[..]);
    }

    #[test]
    fn testi_ibridi_uguali_solo_se_le_parti_sono_uguali(
        a in (contesto(), parte_di_chiave(), parte_di_chiave(), byte_qualsiasi(40)),
        b in (contesto(), parte_di_chiave(), parte_di_chiave(), byte_qualsiasi(40)),
    ) {
        let ta = formato_pq::componi_testo_ibrido(a.0.as_bytes(), &a.1, &a.2, &a.3);
        let tb = formato_pq::componi_testo_ibrido(b.0.as_bytes(), &b.1, &b.2, &b.3);
        prop_assert_eq!(ta == tb, a == b);
    }

    #[test]
    fn testo_qualsiasi_mai_panico_e_una_sola_lettura(t in byte_qualsiasi(120), prefisso in any::<bool>()) {
        let t = if prefisso { [b"palacan-firma-ibrida-v1|".to_vec(), t].concat() } else { t };
        if let Some((c, e, i, m)) = formato_pq::scomponi_testo_ibrido(&t) {
            prop_assert!(formato_pq::contesto_valido(c));
            prop_assert_eq!(formato_pq::componi_testo_ibrido(c, e, i, m), t);
        }
    }

    #[test]
    fn testo_accettato_solo_se_ogni_parte_e_valida(
        c in quasi_contesto(), e in quasi_chiave(), i in quasi_chiave(), m in byte_qualsiasi(30),
    ) {
        let senza_barre = |v: Vec<u8>| -> Vec<u8> { v.into_iter().filter(|b| *b != b'|').collect() };
        let (c, e, i) = (senza_barre(c), senza_barre(e), senza_barre(i));
        let t = [b"palacan-firma-ibrida-v1|".to_vec(), c.clone(), b"|".to_vec(), e.clone(), b"|".to_vec(), i.clone(), b"|".to_vec(), m.clone()].concat();
        let di_chiave = |v: &[u8]| v.iter().all(|b| b.is_ascii_alphanumeric() || *b == b'+' || *b == b'/');
        let atteso = contesto_secondo_la_regola(&c) && di_chiave(&e) && di_chiave(&i);
        prop_assert_eq!(formato_pq::scomponi_testo_ibrido(&t).is_some(), atteso);
    }

    #[test]
    fn busta_qualsiasi_divisa_senza_panico(
        corpo in byte_qualsiasi(64), lunga in any::<bool>(), versione in prop_oneof![Just(1u8), any::<u8>()],
    ) {
        let mut busta = if lunga { vec![0u8; MINIMO_BUSTA - 1] } else { Vec::new() };
        busta.extend_from_slice(&corpo);
        if !busta.is_empty() {
            busta[0] = versione;
        }
        match formato_pq::dividi_busta(&busta) {
            Ok((ct, nonce, cifrato)) => {
                prop_assert!(busta.len() >= MINIMO_BUSTA && busta[0] == formato_pq::VERSIONE_BUSTA);
                prop_assert_eq!(ct.len(), pq::LUNGHEZZA_CT);
                prop_assert!(cifrato.len() >= formato_pq::LUNGHEZZA_TAG);
                prop_assert_eq!(formato_pq::componi_busta(ct, &nonce, cifrato), busta);
            }
            Err(_) => prop_assert!(busta.len() < MINIMO_BUSTA || busta[0] != formato_pq::VERSIONE_BUSTA),
        }
    }
}

// --------------------------------------------------------------------------------------------- 2. busta ML-KEM
proptest! {
    #![proptest_config(ProptestConfig::with_cases(48))]

    #[test]
    fn busta_si_apre_con_seme_e_contesto_giusti(
        seme in proptest::array::uniform32(any::<u8>()), seme2 in proptest::array::uniform32(any::<u8>()),
        contesto in byte_qualsiasi(80), testo in byte_qualsiasi(300),
        casuale in proptest::array::uniform32(any::<u8>()), nonce in proptest::array::uniform24(any::<u8>()),
    ) {
        let s = [seme, seme2].concat();
        let pubblica = pq::chiave_pubblica(&s).unwrap();
        let busta = pq::sigilla(&pubblica, &contesto, &testo, casuale, nonce).unwrap();
        prop_assert_eq!(busta.len(), MINIMO_BUSTA + testo.len());
        prop_assert_eq!(busta[0], 1);
        prop_assert_eq!(&busta[1 + pq::LUNGHEZZA_CT..1 + pq::LUNGHEZZA_CT + pq::LUNGHEZZA_NONCE], &nonce[..]);
        prop_assert_eq!(pq::apri(&s, &contesto, &busta).unwrap(), testo);
    }

    #[test]
    fn busta_alterata_contesto_diverso_o_seme_sbagliato_rifiutati(
        seme in proptest::array::uniform32(any::<u8>()), contesto in byte_qualsiasi(40), altro in byte_qualsiasi(40),
        testo in byte_qualsiasi(100), posizione in any::<prop::sample::Index>(), bit in 0u8..8,
    ) {
        let s = [seme, [3u8; 32]].concat();
        let pubblica = pq::chiave_pubblica(&s).unwrap();
        let busta = pq::sigilla(&pubblica, &contesto, &testo, [1u8; 32], [2u8; 24]).unwrap();
        let mut alterata = busta.clone();
        alterata[posizione.index(busta.len())] ^= 1 << bit;
        prop_assert!(pq::apri(&s, &contesto, &alterata).is_err(), "busta alterata aperta");
        if altro != contesto {
            prop_assert!(pq::apri(&s, &altro, &busta).is_err(), "contesto diverso accettato");
        }
        // seme sbagliato: si altera d (i primi 32 byte, da cui nasce la coppia di chiavi). La seconda meta' (z di
        // FIPS 203) serve solo al rifiuto implicito e non cambia la chiave: lo ha trovato proptest, e' ML-KEM.
        let mut sbagliato = s.clone();
        sbagliato[posizione.index(32)] ^= 1 << bit;
        prop_assert!(pq::apri(&sbagliato, &contesto, &busta).is_err(), "seme sbagliato accettato");
        prop_assert!(pq::apri(&s, &contesto, &busta[..busta.len() - 1]).is_err(), "busta troncata aperta");
        prop_assert!(pq::apri(&s, &contesto, &[busta.clone(), vec![0]].concat()).is_err(), "busta allungata aperta");
    }

    #[test]
    fn ml_kem_ritrova_il_segreto_e_un_ct_alterato_ne_da_un_altro(
        seme in proptest::array::uniform32(any::<u8>()), casuale in proptest::array::uniform32(any::<u8>()),
        posizione in any::<prop::sample::Index>(), bit in 0u8..8,
    ) {
        let s = [[9u8; 32], seme].concat();
        let pubblica = pq::chiave_pubblica(&s).unwrap();
        let (mut ct, segreto) = pq::incapsula(&pubblica, casuale).unwrap();
        prop_assert_eq!(pq::decapsula(&s, &ct).unwrap(), segreto);
        let dove = posizione.index(ct.len());
        ct[dove] ^= 1 << bit;
        // ML-KEM rifiuta "implicitamente": il ct alterato da' un segreto diverso (pseudo-casuale), mai quello vero
        prop_assert_ne!(pq::decapsula(&s, &ct).unwrap(), segreto);
    }

    #[test]
    fn input_qualsiasi_mai_panico_nella_busta(
        seme in byte_qualsiasi(80), pubblica in byte_qualsiasi(1300), busta in byte_qualsiasi(1300),
        contesto in byte_qualsiasi(20), buona in any::<bool>(),
    ) {
        let seme = if buona { vec![4u8; 64] } else { seme };
        let busta = if buona && busta.len() > 4 { [vec![1u8; MINIMO_BUSTA], busta].concat() } else { busta };
        let _ = pq::apri(&seme, &contesto, &busta);
        let _ = pq::decapsula(&seme, &busta);
        let _ = pq::chiave_pubblica(&seme);
        prop_assert!(pq::incapsula(&pubblica, [0u8; 32]).is_err() || pubblica.len() == pq::LUNGHEZZA_PUBBLICA);
        let _ = pq::sigilla(&pubblica, &contesto, b"x", [0u8; 32], [0u8; 24]);
    }
}

// -------------------------------------------------------------------------------------------- 3. firma ibrida
proptest! {
    #![proptest_config(ProptestConfig::with_cases(24))]

    #[test]
    fn firma_ibrida_vale_solo_intera(
        seme_ed in proptest::array::uniform32(any::<u8>()), seme_pq in proptest::array::uniform32(any::<u8>()),
        c in contesto(), c2 in contesto(), m in ".{0,80}", m2 in ".{0,80}",
        casuale in proptest::array::uniform32(any::<u8>()), posizione in any::<prop::sample::Index>(), bit in 0u8..8,
    ) {
        let (privata, ed) = chiave_ed(seme_ed);
        let pq_pubblica = firma_pq::chiave_pubblica_firma(&seme_pq).unwrap();
        let (fe, fq) = firma_completa(&privata, &seme_pq, &c, &ed, &m, casuale);
        prop_assert!(firma_pq::verifica_ibrida(&c, &ed, &pq_pubblica, &m, &fe, &fq));

        let mut fq_alterata = fq.clone();
        fq_alterata[posizione.index(fq.len())] ^= 1 << bit;
        prop_assert!(!firma_pq::verifica_ibrida(&c, &ed, &pq_pubblica, &m, &fe, &fq_alterata), "ML-DSA alterata");
        let mut fe_byte = vodozemac::Ed25519Signature::from_base64(&fe).unwrap().to_bytes();
        fe_byte[posizione.index(64)] ^= 1 << bit;
        let fe_alterata = base64_senza_uguali(&fe_byte);
        prop_assert!(!firma_pq::verifica_ibrida(&c, &ed, &pq_pubblica, &m, &fe_alterata, &fq), "ed25519 alterata");
        if c2 != c {
            prop_assert!(!firma_pq::verifica_ibrida(&c2, &ed, &pq_pubblica, &m, &fe, &fq), "contesto spostato");
        }
        if m2 != m {
            prop_assert!(!firma_pq::verifica_ibrida(&c, &ed, &pq_pubblica, &m2, &fe, &fq), "messaggio cambiato");
        }
        // solo una delle due firme (l'altra di un'altra persona, sullo stesso contesto e messaggio)
        let (privata_z, ed_z) = chiave_ed([seme_ed[0] ^ 0xff; 32]);
        let seme_pq_z = [seme_pq[0] ^ 0xff; 32];
        let pq_z = firma_pq::chiave_pubblica_firma(&seme_pq_z).unwrap();
        let (fe_z, fq_z) = firma_completa(&privata_z, &seme_pq_z, &c, &ed_z, &m, casuale);
        prop_assert!(!firma_pq::verifica_ibrida(&c, &ed, &pq_pubblica, &m, &fe, &fq_z), "ML-DSA di un altro");
        prop_assert!(!firma_pq::verifica_ibrida(&c, &ed, &pq_pubblica, &m, &fe_z, &fq), "ed25519 di un altro");
        prop_assert!(!firma_pq::verifica_ibrida(&c, &ed_z, &pq_pubblica, &m, &fe_z, &fq), "chiavi mescolate (ed)");
        prop_assert!(!firma_pq::verifica_ibrida(&c, &ed, &pq_z, &m, &fe, &fq_z), "chiavi mescolate (ML-DSA)");
        // ed25519 sul solo messaggio (formato senza legame alle chiavi): rifiutata
        let fe_nuda = privata.sign(m.as_bytes()).to_base64();
        prop_assert!(!firma_pq::verifica_ibrida(&c, &ed, &pq_pubblica, &m, &fe_nuda, &fq), "ed25519 senza legame");
    }

    #[test]
    fn testo_ibrido_reale_identico_a_prima_e_scomponibile(
        seme_ed in proptest::array::uniform32(any::<u8>()), seme_pq in proptest::array::uniform32(any::<u8>()),
        c in contesto(), m in "\\PC{0,120}",
    ) {
        let (_, ed) = chiave_ed(seme_ed);
        let pq_pubblica = firma_pq::chiave_pubblica_firma(&seme_pq).unwrap();
        let testo = firma_pq::testo_ibrido(&c, &ed, &pq_pubblica, &m).unwrap();
        prop_assert_eq!(&testo, &testo_ibrido_di_prima(&c, &ed, &pq_pubblica, &m));
        let impronta = sha(&pq_pubblica);
        let (c2, e2, i2, m2) = formato_pq::scomponi_testo_ibrido(testo.as_bytes()).expect("si scompone");
        prop_assert_eq!(c2, c.as_bytes());
        prop_assert_eq!(e2, ed.as_bytes());
        prop_assert_eq!(i2, impronta.as_bytes());
        prop_assert_eq!(m2, m.as_bytes());
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(512))]

    #[test]
    fn input_qualsiasi_mai_panico_nella_firma(
        c in "\\PC{0,70}", ed in "\\PC{0,60}", pq_pubblica in byte_qualsiasi(2000), m in "\\PC{0,40}",
        fe in "\\PC{0,100}", fq in byte_qualsiasi(3400), lunghezze_giuste in any::<bool>(),
    ) {
        let (pq_pubblica, fq) = if lunghezze_giuste {
            (vec![7u8; firma_pq::LUNGHEZZA_PUBBLICA_FIRMA], vec![1u8; firma_pq::LUNGHEZZA_FIRMA_PQ])
        } else {
            (pq_pubblica, fq)
        };
        let _ = firma_pq::testo_ibrido(&c, &ed, &pq_pubblica, &m);
        prop_assert!(!firma_pq::verifica_ibrida(&c, &ed, &pq_pubblica, &m, &fe, &fq));
        prop_assert!(!firma_pq::verifica_ml_dsa(&pq_pubblica, c.as_bytes(), m.as_bytes(), &fq));
        if !contesto_secondo_la_regola(c.as_bytes()) {
            prop_assert!(firma_pq::testo_ibrido(&c, &ed, &pq_pubblica, &m).is_err());
        }
    }
}

fn base64_senza_uguali(b: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD_NO_PAD.encode(b)
}

// ------------------------------------------------------------------------------------- 4. formato invariato
// Valori calcolati con il codice PRIMA di PQ6b (commit d6f5365): se cambiasse un solo byte, i dispositivi gia'
// online non si capirebbero piu'. Busta e firme sono deterministiche qui (casuali fissati), solo nelle prove.

#[test]
fn busta_identica_byte_per_byte_a_prima() {
    let s: Vec<u8> = (0..64u8).map(|i| i.wrapping_mul(29).wrapping_add(3)).collect();
    let pubblica = pq::chiave_pubblica(&s).unwrap();
    let busta = pq::sigilla(&pubblica, b"palacan|alice|bob|stanza", b"chiave di stanza \x00\xff|", [7u8; 32], [9u8; 24]).unwrap();
    assert_eq!(busta.len(), 1149);
    assert_eq!(sha(&busta), "9286a3b68488033c9a0652ab68dd742832e26f4a8a13cc9a3a0232a88d854f48");
    assert_eq!(pq::apri(&s, b"palacan|alice|bob|stanza", &busta).unwrap(), b"chiave di stanza \x00\xff|");
}

#[test]
fn testo_e_firme_ibride_identici_byte_per_byte_a_prima() {
    let privata = Ed25519SecretKey::from_slice(&[5u8; 32]);
    let ed = privata.public_key().to_base64();
    assert_eq!(ed, "bnoc3Smwt4/ROvTFWY/v9O8qlxZuPKby5Pv8zYBQW/E");
    assert!(Ed25519PublicKey::from_base64(&ed).is_ok());
    let seme_pq: Vec<u8> = (0..32u8).map(|i| i.wrapping_mul(13).wrapping_add(1)).collect();
    let pq_pubblica = firma_pq::chiave_pubblica_firma(&seme_pq).unwrap();
    let m = "messaggio | con barre ✓";
    let testo = firma_pq::testo_ibrido("chiavi-pq:v1", &ed, &pq_pubblica, m).unwrap();
    assert_eq!(
        testo,
        "palacan-firma-ibrida-v1|chiavi-pq:v1|bnoc3Smwt4/ROvTFWY/v9O8qlxZuPKby5Pv8zYBQW/E|\
         8c8f344daa90cc074fdb9eeb2595f1464f2b215d179d2217649c7f2814a8fe7f|messaggio | con barre ✓"
    );
    assert_eq!(sha(testo.as_bytes()), "7d66fb619aa0310aeceb945bd8d97779b5424031fe359dd9fc837fca2d8f2eb2");
    let fq = firma_pq::firma_ibrida_pq(&seme_pq, "chiavi-pq:v1", &ed, m, [0u8; 32]).unwrap();
    assert_eq!(sha(&fq), "276cf0b2e06224caa453519b121461c5e103c0d02b6ea29cda7a32810944a273");
    let fe = privata.sign(testo.as_bytes()).to_base64();
    assert_eq!(fe, "a4OeatT46mRRB/UmW/u5oEAVdbmh3Ar2VGUcaBT0LbXna/TAOM++GKfXBlb299/j/uviUhrzzEGZx5/cpFJbAA");
    assert!(firma_pq::verifica_ibrida("chiavi-pq:v1", &ed, &pq_pubblica, m, &fe, &fq));
}

#[test]
fn busta_ai_confini_di_lunghezza_e_versione() {
    for lunghezza in [0, 1, MINIMO_BUSTA - 1, MINIMO_BUSTA, MINIMO_BUSTA + 1] {
        for versione in [0u8, 1, 2, 255] {
            let mut busta = vec![0u8; lunghezza];
            if lunghezza > 0 {
                busta[0] = versione;
            }
            let accettata = formato_pq::dividi_busta(&busta).is_ok();
            assert_eq!(accettata, lunghezza >= MINIMO_BUSTA && versione == 1, "lunghezza {lunghezza}, versione {versione}");
        }
    }
}

#[test]
fn costanti_della_busta_e_del_dominio_coerenti() {
    assert_eq!(formato_pq::DOMINIO_IBRIDO, firma_pq::DOMINIO_IBRIDO.as_bytes());
    assert_eq!(formato_pq::LUNGHEZZA_CT, pq::LUNGHEZZA_CT);
    assert_eq!(formato_pq::LUNGHEZZA_NONCE, pq::LUNGHEZZA_NONCE);
    assert_eq!(formato_pq::VERSIONE_BUSTA, pq::VERSIONE_BUSTA);
    assert_eq!(MINIMO_BUSTA, 1 + 1088 + 24 + 16);
}
