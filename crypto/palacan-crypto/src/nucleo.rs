//! Nucleo di palacan-crypto: le stesse operazioni che Palacan faceva con libolm, eseguite da vodozemac.
//!
//! Regole:
//! - formati sul filo IDENTICI a libolm (base64 senza padding, Olm e Megolm "versione 1"): un dispositivo con
//!   vodozemac e uno ancora con libolm si parlano senza accorgersene;
//! - stato salvato ("pickle"): nel formato nuovo, cifrato con una chiave di 32 byte ricavata dalla chiave di
//!   pickle di Palacan, con il prefisso `vz1:`. Un pickle SENZA prefisso e' uno di libolm e viene convertito
//!   (migrazione automatica: nessun account, sessione o chiave di gruppo va perso);
//! - nessun segreto nei messaggi d'errore.
//!
//! Questo file non dipende da wasm-bindgen: si prova con test nativi (`cargo test`).

use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
use base64::engine::DecodePaddingMode;
use base64::Engine;
use sha2::{Digest, Sha256};
use vodozemac::megolm::{
    ExportedSessionKey, GroupSession, InboundGroupSession, MegolmMessage, SessionConfig as ConfigMegolm,
    SessionKey,
};
use vodozemac::olm::{Account, OlmMessage, PreKeyMessage, Session, SessionConfig as ConfigOlm};
use vodozemac::{Curve25519PublicKey, Ed25519PublicKey, Ed25519Signature};

pub const PREFISSO: &str = "vz1:";
const ETICHETTA_PICKLE: &[u8] = b"palacan-pickle-v1\0";

/// base64 standard: in uscita senza padding (come libolm), in entrata con o senza.
const B64: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::STANDARD,
    GeneralPurposeConfig::new().with_encode_padding(false).with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Errore(pub String);

impl Errore {
    /// Messaggio che inizia con lo stesso codice di libolm (es. "OLM.BAD_MESSAGE_MAC"), poi il dettaglio.
    fn da(codice: &str, cosa: &str, e: impl std::fmt::Display) -> Self {
        Errore(format!("OLM.{codice}: {cosa}: {e}"))
    }
}

pub type Esito<T> = Result<T, Errore>;

/// Chiave di 32 byte per i pickle nuovi, ricavata dalla chiave di pickle di Palacan (qualunque lunghezza).
pub fn chiave_pickle(chiave: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(ETICHETTA_PICKLE);
    h.update(chiave);
    h.finalize().into()
}

fn decodifica(testo: &str, cosa: &str) -> Esito<Vec<u8>> {
    B64.decode(testo.trim()).map_err(|e| Errore::da("INVALID_BASE64", cosa, e))
}

fn olm_da_parti(tipo: u32, corpo: &str) -> Esito<OlmMessage> {
    OlmMessage::from_parts(tipo as usize, &decodifica(corpo, "messaggio Olm non in base64")?)
        .map_err(|e| Errore::da("BAD_MESSAGE_FORMAT", "messaggio Olm non valido", e))
}

fn prekey(corpo: &str) -> Esito<PreKeyMessage> {
    match olm_da_parti(0, corpo)? {
        OlmMessage::PreKey(m) => Ok(m),
        OlmMessage::Normal(_) => Err(Errore("OLM.BAD_MESSAGE_TYPE: atteso un messaggio di tipo 0 (pre-key)".into())),
    }
}

/// Identificativo di una chiave usa e getta nel formato di libolm: vodozemac lo codifica su 8 byte
/// ("AAAAAAAAAAE"), libolm su 4 ("AAAAAQ"). Stesso numero, stessa chiave: cambia solo la scrittura. Senza questa
/// conversione un account migrato ripubblicherebbe le stesse chiavi con identificativi diversi.
pub fn id_come_libolm(id_vodozemac: &str) -> String {
    match decodifica(id_vodozemac, "id") {
        Ok(byte) if byte.len() == 8 => {
            let n = u64::from_be_bytes(byte.try_into().unwrap());
            match u32::try_from(n) {
                Ok(piccolo) => B64.encode(piccolo.to_be_bytes()),
                Err(_) => id_vodozemac.to_string(),
            }
        }
        _ => id_vodozemac.to_string(),
    }
}

fn curve(chiave: &str) -> Esito<Curve25519PublicKey> {
    Curve25519PublicKey::from_base64(chiave.trim()).map_err(|e| Errore::da("INVALID_BASE64", "chiave Curve25519 non valida", e))
}

// ------------------------------------------------------------------------------------------------ Account

pub struct Conto {
    pub(crate) interno: Account,
}

impl Default for Conto {
    fn default() -> Self {
        Self::nuovo()
    }
}

impl Conto {
    pub fn nuovo() -> Self {
        Conto { interno: Account::new() }
    }

    /// `{"curve25519": "...", "ed25519": "..."}` come libolm.
    pub fn chiavi_identita(&self) -> String {
        serde_json::json!({
            "curve25519": self.interno.curve25519_key().to_base64(),
            "ed25519": self.interno.ed25519_key().to_base64(),
        })
        .to_string()
    }

    /// `{"curve25519": {"<id>": "<chiave>"}}` con le sole chiavi non ancora pubblicate, come libolm.
    pub fn chiavi_usa_e_getta(&self) -> String {
        let mut mappa = serde_json::Map::new();
        for (id, chiave) in self.interno.one_time_keys() {
            mappa.insert(id_come_libolm(&id.to_base64()), serde_json::Value::String(chiave.to_base64()));
        }
        serde_json::json!({ "curve25519": mappa }).to_string()
    }

    pub fn genera_chiavi_usa_e_getta(&mut self, quante: u32) {
        let _ = self.interno.generate_one_time_keys(quante as usize);
    }

    pub fn segna_pubblicate(&mut self) {
        self.interno.mark_keys_as_published();
    }

    pub fn massimo_chiavi_usa_e_getta(&self) -> u32 {
        self.interno.max_number_of_one_time_keys() as u32
    }

    pub fn firma(&self, messaggio: &str) -> String {
        self.interno.sign(messaggio).to_base64()
    }

    pub fn pickle(&self, chiave: &[u8]) -> String {
        format!("{PREFISSO}{}", self.interno.pickle().encrypt(&chiave_pickle(chiave)))
    }

    /// Restituisce anche `true` se il pickle era di libolm (convertito: va risalvato nel formato nuovo).
    pub fn da_pickle(chiave: &[u8], testo: &str) -> Esito<(Self, bool)> {
        if let Some(resto) = testo.strip_prefix(PREFISSO) {
            let p = vodozemac::olm::AccountPickle::from_encrypted(resto, &chiave_pickle(chiave))
                .map_err(|e| Errore::da("BAD_ACCOUNT_KEY", "account non leggibile (chiave sbagliata o dati danneggiati)", e))?;
            Ok((Conto { interno: Account::from_pickle(p) }, false))
        } else {
            let a = Account::from_libolm_pickle(testo, chiave)
                .map_err(|e| Errore::da("BAD_ACCOUNT_KEY", "account libolm non convertibile (chiave sbagliata o dati danneggiati)", e))?;
            Ok((Conto { interno: a }, true))
        }
    }
}

// ------------------------------------------------------------------------------------------------ Sessione Olm

pub struct SessioneOlm {
    pub(crate) interno: Session,
    /// libolm crea la sessione in entrata SENZA decifrare e poi l'app chiama decrypt(0, corpo); vodozemac invece
    /// decifra il primo messaggio mentre crea la sessione. Il testo viene tenuto qui e restituito alla decrypt
    /// di quello stesso messaggio (una volta sola).
    primo: Option<(String, String)>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Cifrato {
    pub tipo: u32,
    pub corpo: String,
}

impl SessioneOlm {
    pub fn uscente(conto: &Conto, chiave_identita: &str, chiave_usa_e_getta: &str) -> Esito<Self> {
        let s = conto
            .interno
            .create_outbound_session(ConfigOlm::version_1(), curve(chiave_identita)?, curve(chiave_usa_e_getta)?)
            .map_err(|e| Errore::da("INVALID_BASE64", "sessione in uscita non creata", e))?;
        Ok(SessioneOlm { interno: s, primo: None })
    }

    /// Come libolm `create_inbound_from`: la chiave d'identita' del mittente deve coincidere con quella nel messaggio.
    pub fn entrante_da(conto: &mut Conto, chiave_identita: &str, corpo: &str) -> Esito<Self> {
        let m = prekey(corpo)?;
        let atteso = curve(chiave_identita)?;
        let r = conto
            .interno
            .create_inbound_session(ConfigOlm::version_1(), atteso, &m)
            .map_err(|e| Errore::da("BAD_MESSAGE_KEY_ID", "sessione in entrata non creata", e))?;
        let testo = String::from_utf8(r.plaintext).map_err(|e| Errore::da("BAD_MESSAGE_FORMAT", "testo non UTF-8", e))?;
        Ok(SessioneOlm { interno: r.session, primo: Some((corpo.trim().to_string(), testo)) })
    }

    /// Come libolm `create_inbound`: la chiave d'identita' si prende dal messaggio stesso.
    pub fn entrante(conto: &mut Conto, corpo: &str) -> Esito<Self> {
        let chiave = prekey(corpo)?.identity_key().to_base64();
        Self::entrante_da(conto, &chiave, corpo)
    }

    pub fn id(&self) -> String {
        self.interno.session_id()
    }

    pub fn ha_ricevuto(&self) -> bool {
        self.interno.has_received_message()
    }

    pub fn corrisponde(&self, corpo: &str) -> bool {
        prekey(corpo).map(|m| m.session_id() == self.interno.session_id()).unwrap_or(false)
    }

    pub fn corrisponde_da(&self, chiave_identita: &str, corpo: &str) -> bool {
        match (prekey(corpo), curve(chiave_identita)) {
            (Ok(m), Ok(k)) => m.identity_key() == k && m.session_id() == self.interno.session_id(),
            _ => false,
        }
    }

    pub fn cifra(&mut self, testo: &str) -> Esito<Cifrato> {
        let m = self.interno.encrypt(testo).map_err(|e| Errore::da("BAD_MESSAGE_FORMAT", "cifratura Olm non riuscita", e))?;
        let (tipo, byte) = m.to_parts();
        Ok(Cifrato { tipo: tipo as u32, corpo: B64.encode(byte) })
    }

    pub fn decifra(&mut self, tipo: u32, corpo: &str) -> Esito<String> {
        if tipo == 0 {
            if let Some((primo, testo)) = &self.primo {
                if primo == corpo.trim() {
                    let t = testo.clone();
                    self.primo = None;
                    return Ok(t);
                }
            }
        }
        let m = olm_da_parti(tipo, corpo)?;
        let byte = self.interno.decrypt(&m).map_err(|e| Errore::da("BAD_MESSAGE_MAC", "decifratura Olm non riuscita", e))?;
        self.primo = None;
        String::from_utf8(byte).map_err(|e| Errore::da("BAD_MESSAGE_FORMAT", "testo non UTF-8", e))
    }

    pub fn pickle(&self, chiave: &[u8]) -> String {
        format!("{PREFISSO}{}", self.interno.pickle().encrypt(&chiave_pickle(chiave)))
    }

    pub fn da_pickle(chiave: &[u8], testo: &str) -> Esito<(Self, bool)> {
        if let Some(resto) = testo.strip_prefix(PREFISSO) {
            let p = vodozemac::olm::SessionPickle::from_encrypted(resto, &chiave_pickle(chiave))
                .map_err(|e| Errore::da("BAD_ACCOUNT_KEY", "sessione non leggibile (chiave sbagliata o dati danneggiati)", e))?;
            Ok((SessioneOlm { interno: Session::from_pickle(p), primo: None }, false))
        } else {
            let s = Session::from_libolm_pickle(testo, chiave)
                .map_err(|e| Errore::da("BAD_ACCOUNT_KEY", "sessione libolm non convertibile (chiave sbagliata o dati danneggiati)", e))?;
            Ok((SessioneOlm { interno: s, primo: None }, true))
        }
    }
}

// ------------------------------------------------------------------------------------------------ Megolm in uscita

pub struct GruppoUscente {
    pub(crate) interno: GroupSession,
}

impl Default for GruppoUscente {
    fn default() -> Self {
        Self::nuovo()
    }
}

impl GruppoUscente {
    pub fn nuovo() -> Self {
        GruppoUscente { interno: GroupSession::new(ConfigMegolm::version_1()) }
    }

    pub fn id(&self) -> String {
        self.interno.session_id()
    }

    pub fn chiave_sessione(&self) -> String {
        self.interno.session_key().to_base64()
    }

    pub fn indice(&self) -> u32 {
        self.interno.message_index()
    }

    pub fn cifra(&mut self, testo: &str) -> String {
        self.interno.encrypt(testo).to_base64()
    }

    pub fn pickle(&self, chiave: &[u8]) -> String {
        format!("{PREFISSO}{}", self.interno.pickle().encrypt(&chiave_pickle(chiave)))
    }

    pub fn da_pickle(chiave: &[u8], testo: &str) -> Esito<(Self, bool)> {
        if let Some(resto) = testo.strip_prefix(PREFISSO) {
            let p = vodozemac::megolm::GroupSessionPickle::from_encrypted(resto, &chiave_pickle(chiave))
                .map_err(|e| Errore::da("BAD_ACCOUNT_KEY", "sessione di gruppo non leggibile (chiave sbagliata o dati danneggiati)", e))?;
            Ok((GruppoUscente { interno: GroupSession::from_pickle(p) }, false))
        } else {
            let s = GroupSession::from_libolm_pickle(testo, chiave)
                .map_err(|e| Errore::da("BAD_ACCOUNT_KEY", "sessione di gruppo libolm non convertibile", e))?;
            Ok((GruppoUscente { interno: s }, true))
        }
    }
}

// ------------------------------------------------------------------------------------------------ Megolm in entrata

pub struct GruppoEntrante {
    pub(crate) interno: InboundGroupSession,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Decifrato {
    pub testo: String,
    pub indice: u32,
}

impl GruppoEntrante {
    /// Come libolm `create(session_key)`: chiave condivisa dal creatore (con firma).
    pub fn da_chiave(chiave_sessione: &str) -> Esito<Self> {
        let k = SessionKey::from_base64(chiave_sessione.trim()).map_err(|e| Errore::da("BAD_SESSION_KEY", "chiave di sessione non valida", e))?;
        Ok(GruppoEntrante { interno: InboundGroupSession::new(&k, ConfigMegolm::version_1()) })
    }

    /// Come libolm `import_session(exported)`: chiave esportata (inoltrata da un altro dispositivo o membro).
    pub fn da_esportata(esportata: &str) -> Esito<Self> {
        let k = ExportedSessionKey::from_base64(esportata.trim())
            .map_err(|e| Errore::da("BAD_SESSION_KEY", "chiave esportata non valida", e))?;
        Ok(GruppoEntrante { interno: InboundGroupSession::import(&k, ConfigMegolm::version_1()) })
    }

    pub fn id(&self) -> String {
        self.interno.session_id()
    }

    pub fn primo_indice(&self) -> u32 {
        self.interno.first_known_index()
    }

    pub fn esporta(&mut self, indice: u32) -> Esito<String> {
        self.interno
            .export_at(indice)
            .map(|k| k.to_base64())
            .ok_or_else(|| Errore(format!("OLM.UNKNOWN_MESSAGE_INDEX: indice {indice} non disponibile (primo noto: {})", self.interno.first_known_index())))
    }

    pub fn decifra(&mut self, messaggio: &str) -> Esito<Decifrato> {
        let m = MegolmMessage::from_base64(messaggio.trim()).map_err(|e| Errore::da("BAD_MESSAGE_FORMAT", "messaggio Megolm non valido", e))?;
        let d = self.interno.decrypt(&m).map_err(|e| match e {
            vodozemac::megolm::DecryptionError::UnknownMessageIndex(..) => {
                Errore::da("UNKNOWN_MESSAGE_INDEX", "decifratura Megolm non riuscita", e)
            }
            vodozemac::megolm::DecryptionError::Signature(_) => Errore::da("BAD_SIGNATURE", "decifratura Megolm non riuscita", e),
            _ => Errore::da("BAD_MESSAGE_MAC", "decifratura Megolm non riuscita", e),
        })?;
        Ok(Decifrato {
            testo: String::from_utf8(d.plaintext).map_err(|e| Errore::da("BAD_MESSAGE_FORMAT", "testo non UTF-8", e))?,
            indice: d.message_index,
        })
    }

    pub fn pickle(&self, chiave: &[u8]) -> String {
        format!("{PREFISSO}{}", self.interno.pickle().encrypt(&chiave_pickle(chiave)))
    }

    pub fn da_pickle(chiave: &[u8], testo: &str) -> Esito<(Self, bool)> {
        if let Some(resto) = testo.strip_prefix(PREFISSO) {
            let p = vodozemac::megolm::InboundGroupSessionPickle::from_encrypted(resto, &chiave_pickle(chiave))
                .map_err(|e| Errore::da("BAD_ACCOUNT_KEY", "chiave di gruppo non leggibile (chiave sbagliata o dati danneggiati)", e))?;
            Ok((GruppoEntrante { interno: InboundGroupSession::from_pickle(p) }, false))
        } else {
            let s = InboundGroupSession::from_libolm_pickle(testo, chiave)
                .map_err(|e| Errore::da("BAD_ACCOUNT_KEY", "chiave di gruppo libolm non convertibile", e))?;
            Ok((GruppoEntrante { interno: s }, true))
        }
    }
}

// ------------------------------------------------------------------------------------------------ Utility

/// Come libolm `Utility.ed25519_verify`: errore se la firma non e' valida.
pub fn verifica_ed25519(chiave: &str, messaggio: &str, firma: &str) -> Esito<()> {
    let k = Ed25519PublicKey::from_base64(chiave.trim()).map_err(|e| Errore::da("INVALID_BASE64", "chiave Ed25519 non valida", e))?;
    let f = Ed25519Signature::from_base64(firma.trim()).map_err(|e| Errore::da("INVALID_BASE64", "firma non valida", e))?;
    k.verify(messaggio.as_bytes(), &f).map_err(|e| Errore::da("BAD_MESSAGE_MAC", "firma non verificata", e))
}

pub fn versione() -> String {
    format!("palacan-crypto {} (vodozemac 0.11.1)", env!("CARGO_PKG_VERSION"))
}
