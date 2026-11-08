//! Strato per il browser: le stesse classi e gli stessi metodi di libolm (@matrix-org/olm 3.2.x), cosi'
//! olmService.js cambia solo l'import. Come in libolm: `new Account()` crea un contenitore vuoto, poi `create()`
//! oppure `unpickle(chiave, pickle)`; gli errori sono `Error` con messaggio che inizia con "OLM.<CODICE>".
//! In piu' rispetto a libolm: `ultimo_unpickle_convertito()` dice se l'ultimo unpickle ha letto un pickle libolm
//! (da risalvare nel formato nuovo). `free()` lo genera wasm-bindgen per ogni classe, come in libolm.

use crate::nucleo::{self, Errore};
use js_sys::{Object, Reflect, Uint8Array};
use wasm_bindgen::prelude::*;

fn errore(e: Errore) -> JsError {
    JsError::new(&e.0)
}

fn vuoto(cosa: &str) -> JsError {
    JsError::new(&format!("OLM.NOT_ENOUGH_RANDOM: {cosa} non inizializzato (manca create/unpickle)"))
}

/// Chiave di pickle come in libolm: stringa (in UTF-8) oppure Uint8Array.
fn byte_chiave(chiave: &JsValue) -> Result<Vec<u8>, JsError> {
    if let Some(testo) = chiave.as_string() {
        Ok(testo.into_bytes())
    } else if chiave.is_instance_of::<Uint8Array>() {
        Ok(Uint8Array::new(chiave).to_vec())
    } else {
        Err(JsError::new("OLM.BAD_ACCOUNT_KEY: chiave di pickle non valida (attesa stringa o Uint8Array)"))
    }
}

fn oggetto(coppie: &[(&str, JsValue)]) -> Result<JsValue, JsError> {
    let o = Object::new();
    for (k, v) in coppie {
        Reflect::set(&o, &JsValue::from_str(k), v).map_err(|_| JsError::new("OLM.BAD_MESSAGE_FORMAT: oggetto"))?;
    }
    Ok(o.into())
}

// ------------------------------------------------------------------------------------------------ Account

#[wasm_bindgen(js_name = Account)]
pub struct Account {
    interno: Option<nucleo::Conto>,
    convertito: bool,
}

#[wasm_bindgen(js_class = Account)]
impl Account {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Account {
        Account { interno: None, convertito: false }
    }

    pub fn create(&mut self) {
        self.interno = Some(nucleo::Conto::nuovo());
        self.convertito = false;
    }

    fn c(&self) -> Result<&nucleo::Conto, JsError> {
        self.interno.as_ref().ok_or_else(|| vuoto("Account"))
    }

    fn c_mut(&mut self) -> Result<&mut nucleo::Conto, JsError> {
        self.interno.as_mut().ok_or_else(|| vuoto("Account"))
    }

    pub fn identity_keys(&self) -> Result<String, JsError> {
        Ok(self.c()?.chiavi_identita())
    }

    pub fn one_time_keys(&self) -> Result<String, JsError> {
        Ok(self.c()?.chiavi_usa_e_getta())
    }

    pub fn generate_one_time_keys(&mut self, quante: u32) -> Result<(), JsError> {
        self.c_mut()?.genera_chiavi_usa_e_getta(quante);
        Ok(())
    }

    pub fn mark_keys_as_published(&mut self) -> Result<(), JsError> {
        self.c_mut()?.segna_pubblicate();
        Ok(())
    }

    pub fn max_number_of_one_time_keys(&self) -> Result<u32, JsError> {
        Ok(self.c()?.massimo_chiavi_usa_e_getta())
    }

    /// In vodozemac la chiave usa e getta si consuma gia' quando nasce la sessione in entrata: qui non resta
    /// niente da togliere. Esiste per compatibilita' con libolm.
    pub fn remove_one_time_keys(&mut self, _sessione: &Session) -> Result<(), JsError> {
        self.c()?;
        Ok(())
    }

    pub fn sign(&self, messaggio: &str) -> Result<String, JsError> {
        Ok(self.c()?.firma(messaggio))
    }

    pub fn pickle(&self, chiave: &JsValue) -> Result<String, JsError> {
        Ok(self.c()?.pickle(&byte_chiave(chiave)?))
    }

    pub fn unpickle(&mut self, chiave: &JsValue, pickle: &str) -> Result<(), JsError> {
        let (c, convertito) = nucleo::Conto::da_pickle(&byte_chiave(chiave)?, pickle).map_err(errore)?;
        self.interno = Some(c);
        self.convertito = convertito;
        Ok(())
    }

    pub fn ultimo_unpickle_convertito(&self) -> bool {
        self.convertito
    }

}

impl Default for Account {
    fn default() -> Self {
        Self::new()
    }
}

// ------------------------------------------------------------------------------------------------ Session

#[wasm_bindgen(js_name = Session)]
pub struct Session {
    interno: Option<nucleo::SessioneOlm>,
    convertito: bool,
}

#[wasm_bindgen(js_class = Session)]
impl Session {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Session {
        Session { interno: None, convertito: false }
    }

    fn s(&self) -> Result<&nucleo::SessioneOlm, JsError> {
        self.interno.as_ref().ok_or_else(|| vuoto("Session"))
    }

    fn s_mut(&mut self) -> Result<&mut nucleo::SessioneOlm, JsError> {
        self.interno.as_mut().ok_or_else(|| vuoto("Session"))
    }

    pub fn create_outbound(&mut self, account: &Account, identita: &str, usa_e_getta: &str) -> Result<(), JsError> {
        self.interno = Some(nucleo::SessioneOlm::uscente(account.c()?, identita, usa_e_getta).map_err(errore)?);
        Ok(())
    }

    pub fn create_inbound(&mut self, account: &mut Account, corpo: &str) -> Result<(), JsError> {
        self.interno = Some(nucleo::SessioneOlm::entrante(account.c_mut()?, corpo).map_err(errore)?);
        Ok(())
    }

    pub fn create_inbound_from(&mut self, account: &mut Account, identita: &str, corpo: &str) -> Result<(), JsError> {
        self.interno = Some(nucleo::SessioneOlm::entrante_da(account.c_mut()?, identita, corpo).map_err(errore)?);
        Ok(())
    }

    pub fn session_id(&self) -> Result<String, JsError> {
        Ok(self.s()?.id())
    }

    pub fn has_received_message(&self) -> Result<bool, JsError> {
        Ok(self.s()?.ha_ricevuto())
    }

    pub fn matches_inbound(&self, corpo: &str) -> Result<bool, JsError> {
        Ok(self.s()?.corrisponde(corpo))
    }

    pub fn matches_inbound_from(&self, identita: &str, corpo: &str) -> Result<bool, JsError> {
        Ok(self.s()?.corrisponde_da(identita, corpo))
    }

    /// Come libolm: `{ type, body }`.
    pub fn encrypt(&mut self, testo: &str) -> Result<JsValue, JsError> {
        let c = self.s_mut()?.cifra(testo).map_err(errore)?;
        oggetto(&[("type", JsValue::from(c.tipo)), ("body", JsValue::from_str(&c.corpo))])
    }

    pub fn decrypt(&mut self, tipo: u32, corpo: &str) -> Result<String, JsError> {
        self.s_mut()?.decifra(tipo, corpo).map_err(errore)
    }

    pub fn pickle(&self, chiave: &JsValue) -> Result<String, JsError> {
        Ok(self.s()?.pickle(&byte_chiave(chiave)?))
    }

    pub fn unpickle(&mut self, chiave: &JsValue, pickle: &str) -> Result<(), JsError> {
        let (s, convertito) = nucleo::SessioneOlm::da_pickle(&byte_chiave(chiave)?, pickle).map_err(errore)?;
        self.interno = Some(s);
        self.convertito = convertito;
        Ok(())
    }

    pub fn ultimo_unpickle_convertito(&self) -> bool {
        self.convertito
    }
}

impl Default for Session {
    fn default() -> Self {
        Self::new()
    }
}

// ------------------------------------------------------------------------------------------------ Megolm in uscita

#[wasm_bindgen(js_name = OutboundGroupSession)]
pub struct OutboundGroupSession {
    interno: Option<nucleo::GruppoUscente>,
    convertito: bool,
}

#[wasm_bindgen(js_class = OutboundGroupSession)]
impl OutboundGroupSession {
    #[wasm_bindgen(constructor)]
    pub fn new() -> OutboundGroupSession {
        OutboundGroupSession { interno: None, convertito: false }
    }

    pub fn create(&mut self) {
        self.interno = Some(nucleo::GruppoUscente::nuovo());
        self.convertito = false;
    }

    fn g(&self) -> Result<&nucleo::GruppoUscente, JsError> {
        self.interno.as_ref().ok_or_else(|| vuoto("OutboundGroupSession"))
    }

    pub fn session_id(&self) -> Result<String, JsError> {
        Ok(self.g()?.id())
    }

    pub fn session_key(&self) -> Result<String, JsError> {
        Ok(self.g()?.chiave_sessione())
    }

    pub fn message_index(&self) -> Result<u32, JsError> {
        Ok(self.g()?.indice())
    }

    pub fn encrypt(&mut self, testo: &str) -> Result<String, JsError> {
        Ok(self.interno.as_mut().ok_or_else(|| vuoto("OutboundGroupSession"))?.cifra(testo))
    }

    pub fn pickle(&self, chiave: &JsValue) -> Result<String, JsError> {
        Ok(self.g()?.pickle(&byte_chiave(chiave)?))
    }

    pub fn unpickle(&mut self, chiave: &JsValue, pickle: &str) -> Result<(), JsError> {
        let (g, convertito) = nucleo::GruppoUscente::da_pickle(&byte_chiave(chiave)?, pickle).map_err(errore)?;
        self.interno = Some(g);
        self.convertito = convertito;
        Ok(())
    }

    pub fn ultimo_unpickle_convertito(&self) -> bool {
        self.convertito
    }
}

impl Default for OutboundGroupSession {
    fn default() -> Self {
        Self::new()
    }
}

// ------------------------------------------------------------------------------------------------ Megolm in entrata

#[wasm_bindgen(js_name = InboundGroupSession)]
pub struct InboundGroupSession {
    interno: Option<nucleo::GruppoEntrante>,
    convertito: bool,
}

#[wasm_bindgen(js_class = InboundGroupSession)]
impl InboundGroupSession {
    #[wasm_bindgen(constructor)]
    pub fn new() -> InboundGroupSession {
        InboundGroupSession { interno: None, convertito: false }
    }

    fn g(&self) -> Result<&nucleo::GruppoEntrante, JsError> {
        self.interno.as_ref().ok_or_else(|| vuoto("InboundGroupSession"))
    }

    fn g_mut(&mut self) -> Result<&mut nucleo::GruppoEntrante, JsError> {
        self.interno.as_mut().ok_or_else(|| vuoto("InboundGroupSession"))
    }

    pub fn create(&mut self, chiave_sessione: &str) -> Result<(), JsError> {
        self.interno = Some(nucleo::GruppoEntrante::da_chiave(chiave_sessione).map_err(errore)?);
        self.convertito = false;
        Ok(())
    }

    pub fn import_session(&mut self, esportata: &str) -> Result<(), JsError> {
        self.interno = Some(nucleo::GruppoEntrante::da_esportata(esportata).map_err(errore)?);
        self.convertito = false;
        Ok(())
    }

    pub fn session_id(&self) -> Result<String, JsError> {
        Ok(self.g()?.id())
    }

    pub fn first_known_index(&self) -> Result<u32, JsError> {
        Ok(self.g()?.primo_indice())
    }

    pub fn export_session(&mut self, indice: u32) -> Result<String, JsError> {
        self.g_mut()?.esporta(indice).map_err(errore)
    }

    /// Come libolm: `{ plaintext, message_index }`.
    pub fn decrypt(&mut self, messaggio: &str) -> Result<JsValue, JsError> {
        let d = self.g_mut()?.decifra(messaggio).map_err(errore)?;
        oggetto(&[("plaintext", JsValue::from_str(&d.testo)), ("message_index", JsValue::from(d.indice))])
    }

    pub fn pickle(&self, chiave: &JsValue) -> Result<String, JsError> {
        Ok(self.g()?.pickle(&byte_chiave(chiave)?))
    }

    pub fn unpickle(&mut self, chiave: &JsValue, pickle: &str) -> Result<(), JsError> {
        let (g, convertito) = nucleo::GruppoEntrante::da_pickle(&byte_chiave(chiave)?, pickle).map_err(errore)?;
        self.interno = Some(g);
        self.convertito = convertito;
        Ok(())
    }

    pub fn ultimo_unpickle_convertito(&self) -> bool {
        self.convertito
    }
}

impl Default for InboundGroupSession {
    fn default() -> Self {
        Self::new()
    }
}

// ------------------------------------------------------------------------------------------------ Utility

#[wasm_bindgen(js_name = Utility)]
#[derive(Default)]
pub struct Utility {}

#[wasm_bindgen(js_class = Utility)]
impl Utility {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Utility {
        Utility {}
    }

    /// Come libolm: errore se la firma non e' valida, niente se e' valida.
    pub fn ed25519_verify(&self, chiave: &str, messaggio: &str, firma: &str) -> Result<(), JsError> {
        nucleo::verifica_ed25519(chiave, messaggio, firma).map_err(errore)
    }
}

#[wasm_bindgen]
pub fn versione() -> String {
    nucleo::versione()
}
