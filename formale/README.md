# Modelli formali di Palacan

In questa cartella ci sono le dimostrazioni automatiche delle proprietà di sicurezza della parte post-quantum di
Palacan. Le controlla ProVerif (Inria) a ogni modifica, nel workflow `.github/workflows/modelli-formali.yml`.

Il registro di tutte le garanzie dell'app (L1–L4, R1), con le prove e i limiti dichiarati, è più sotto, nella
sezione «Chiusura dei limiti».

## Cosa è dimostrato (PQ6a, ProVerif)

| Modello | Proprietà | Risultato atteso |
|---|---|---|
| `1_raccogli_ora_decifra_dopo.pv` | Un attaccante registra oggi tutto il traffico e controlla il server. Domani, con un computer quantistico, scopre **tutti** i segreti classici (X25519, ed25519). La chiave di stanza nella busta ML-KEM resta comunque segreta. | dimostrata |
| | La stessa chiave mandata **senza** busta, solo con Olm, verrebbe scoperta. Serve a mostrare che il modello vede davvero l'attacco. | attacco trovato |
| `2_firma_ibrida.pv` | Con la firma ed25519 di Bob falsificabile da un computer quantistico, Alice accetta solo chiavi ML-KEM davvero di Bob. Questo vale perché la firma è ibrida ed25519 + ML-DSA-65 e la chiave ML-DSA è legata a quella ed25519 dalla prova di legame. | dimostrata |
| `2b_solo_ed25519.pv` | Con la **sola** ed25519 (come le chiavi post-quantum di Signal oggi) l'attaccante fa accettare una sua chiave. Nello stesso scenario la firma ibrida regge. | attacco trovato / dimostrata |
| `3_classico_regge.pv` | Se un giorno ML-KEM o ML-DSA risultassero rotti, la chiave di stanza resta protetta da Olm, come prima. | dimostrata |

Ogni modello contiene anche una query che controlla che il protocollo arrivi davvero in fondo. Se il modello fosse
"vuoto", tutte le proprietà risulterebbero vere senza dimostrare niente.

## Cosa è dimostrato sul ratchet (L6, ProVerif)

Il ratchet è il meccanismo che cambia la chiave a ogni messaggio. Questi due modelli dicono cosa succede quando
qualcuno ruba lo stato delle chiavi: cosa resta protetto, cosa no e cosa lo ripara.
<!-- [palacan-l6] -->

| Modello | Proprietà | Risultato atteso |
|---|---|---|
| `4_megolm_ratchet.pv` | **Megolm** (la chiave della chat). Chi ottiene lo stato del mittente all'indice 2 non legge i messaggi di prima: il passo del ratchet è a senso unico. | dimostrata |
| | Con quello stato legge i messaggi successivi **della stessa sessione**. Per questo la sessione cambia ogni 100 messaggi o 7 giorni (L3a). | attacco trovato |
| | Dopo la rotazione i messaggi nuovi sono di nuovo segreti. | dimostrata |
| | Un dispositivo destinatario rubato legge la cronologia che aveva già ricevuto: è il comportamento di Megolm, ed è un limite dichiarato. | attacco trovato |
| | Quando un dispositivo sparisce, la sessione nuova non gli arriva e non legge più niente (L3b). | dimostrata |
| | Chi ha rubato un destinatario **non può scrivere a nome del mittente**, perché ogni messaggio è firmato con la chiave della sessione, che ha solo il mittente. | dimostrata |
| | Senza quella firma (solo la chiave del ratchet) potrebbe farlo: il modello vede l'attacco. | attacco trovato |
| `5_olm_double_ratchet.pv` | **Olm** (double ratchet tra due dispositivi). Chi ruba lo stato di Alice non legge i messaggi di prima (segretezza in avanti). | dimostrata |
| | Legge i messaggi successivi sulla stessa catena, fino al passo DH nuovo. | attacco trovato |
| | Dopo un giro di chiavi DH nuove la sicurezza **torna** (sicurezza dopo il furto), se in quel giro l'attaccante guarda ma non modifica. | dimostrata |
| | Se l'attaccante manomette proprio quel giro, sostituendo la chiave di Bob, la sicurezza non torna: è un limite dichiarato, lo stesso di Signal. | attacco trovato |

Anche qui ogni modello controlla che la consegna avvenga davvero (modello non vuoto).

## Cosa è dimostrato sul rinnovo delle chiavi post-quantum (CL2d, ProVerif)
<!-- [palacan-cl2d] -->

Le chiavi di stanza viaggiano in una busta ML-KEM verso una chiave usa e getta del dispositivo destinatario (CL2b: la
busta è obbligatoria). Questo modello dice cosa succede quando qualcuno ruba lo stato di quel dispositivo, e perché le
chiavi usa e getta non usate si rinnovano ogni 7 giorni (CL2c). Caso peggiore: lo strato Olm intorno alla busta è già
rotto da un computer quantistico, quindi conta solo ML-KEM.

| Modello | Proprietà | Risultato atteso |
|---|---|---|
| `6_rinnovo_prechiavi.pv` | Una busta mandata a una chiave usa e getta **già usata** resta segreta anche dopo il furto: il seme si cancella appena la busta si apre. | dimostrata |
| | Una busta mandata a una chiave **rubata** e ancora pubblicata si legge. Succedeva prima di CL2c, quando le chiavi non usate restavano valide per sempre, e succede ancora nella finestra prima del rinnovo (al massimo 7 giorni). | attacco trovato |
| | Dopo il rinnovo le buste nuove sono di nuovo segrete (sicurezza dopo il furto), se la chiave nuova arriva senza manomissioni. | dimostrata |
| | Se il ladro controlla anche il server e, al posto della chiave nuova, consegna la chiave **vecchia** rubata, che ha ancora la sua firma valida, la sicurezza non torna: è un limite dichiarato, lo stesso del modello 5. | attacco trovato |
| | Bob apre la busta mandata dopo il rinnovo (modello non vuoto). | raggiungibile |

## Cosa è dimostrato nel codice Rust (PQ6b: Kani, proptest, mutanti)

ProVerif ragiona sul protocollo. Il codice Rust che va online (`crypto/palacan-crypto`) è controllato a parte:

| Strumento | Cosa | Come |
|---|---|---|
| **Kani** (AWS, model checker) | `src/formato_pq.rs`, lo stesso file usato da `pq.rs` e `firma_pq.rs`: un contesto accettato non contiene mai `\|`; il testo della firma ibrida si scompone in **un solo** modo (due firme su contesti, chiavi o messaggi diversi non firmano mai lo stesso testo); dividere una busta qualsiasi non va mai in panico, accetta esattamente le buste ben formate e ricomponendola si riottiene identica. | Dimostrazione **esaustiva** per tutti gli input entro i limiti scritti in ogni dimostrazione (es. buste fino a 1137 byte, testi fino a 34 byte, andata e ritorno: scomponi(componi(x)) = x con componi compreso). Job `kani` di questo workflow, pacchetto `formale/kani`. |
| **proptest** | Busta ML-KEM: si apre solo intatta, con il seme e il contesto giusti; un bit alterato, una busta troncata o allungata, un contesto diverso: rifiutata. Firma ibrida: vale solo se reggono entrambe; un bit alterato, il messaggio o il contesto cambiati, la firma o la chiave di un altro: rifiutata. Mai panico con input qualsiasi. Formato identico, byte per byte, a prima. | Migliaia di input casuali (anche ostili) a ogni CI, ridotti al caso minimo se una proprietà cade (`tests/proprieta_pq.rs`). |
| **Mutanti** | Le prove scoprono 8 errori veri introdotti apposta: contesto che accetta `\|`, firma ibrida a cui basta una firma, busta senza contesto autenticato, controlli di versione e di lunghezza sbagliati, testo ibrido non legato alla chiave ML-DSA. | `formale/mutanti/prova_mutanti.py`, job `mutanti`. |

Una cosa trovata da proptest e tenuta così di proposito: alterare la **seconda metà** del seme ML-KEM (`z` di
FIPS 203) non impedisce di aprire le buste, perché `z` serve solo al rifiuto implicito e non cambia la chiave. È il
comportamento di ML-KEM, non un difetto di Palacan: il seme resta segreto per intero.

## Limiti (detti chiaramente)

- **Kani è limitato.** Le dimostrazioni Kani valgono per tutti gli input **entro le lunghezze indicate**, non per
  lunghezze qualsiasi (le proprietà oltre quei limiti le copre proptest, per campioni). Kani non dimostra niente
  su ML-KEM e ML-DSA: quelle implementazioni (libcrux di Cryspen) sono verificate dai loro autori con hax/F* e qui
  sono confrontate con implementazioni indipendenti (vettori di prova).

- **Primitive ideali.** ProVerif tratta X25519, ML-KEM, ML-DSA, HKDF e AEAD come primitive perfette (modello
  simbolico, Dolev-Yao). Le dimostrazioni riguardano il **protocollo**, non le implementazioni. Le implementazioni
  sono verificate a parte: vettori di prova ufficiali (KAT) e librerie con audit (libcrux, vodozemac).
- **TOFU.** Le chiavi d'identità si imparano la prima volta che si vedono (trust on first use), come in Signal e
  Matrix. Un attaccante che ha **già** un computer quantistico quando le chiavi si imparano non è coperto, come in
  ogni protocollo ibrido di oggi, PQXDH di Signal compreso.
- **Olm è astratto nei modelli 1–3.** Lì Olm è modellato come la sua 3DH più una cifratura autenticata. Il ratchet di
  Olm e di Megolm è nei modelli 4 e 5 (L6), con un numero limitato di passi (tre per Megolm, due giri DH per Olm).
- **Corrispondenza con il codice.** Il modello è scritto a mano a partire dal codice
  (`frontend/my-react-app/vite-project/src/utils/bustePq.js`, `chiaviPq.js`, `firmaPq.js`,
  `crypto/palacan-crypto/src/pq.rs`, `firma_pq.rs`). Il workflow riparte quando cambia uno di questi file, così il
  modello si ricontrolla.

## Chiusura dei limiti (L1–L4, R1): cosa è garantito oggi e con quale prova

Questa parte riguarda l'app intera, non solo il post-quantum. Ogni riga dice cosa è garantito, in quale commit e con
quale prova. Le prove automatiche girano in CI a ogni modifica: chi vuole può ripeterle.
<!-- [palacan-registro-l1l4] -->

### L1 – Il codice che ricevi è quello pubblico e firmato

| Passo | Garanzia | Prova |
|---|---|---|
| **L1a** (`0329e49`) | La pagina può eseguire solo codice del sito stesso: Content-Security-Policy senza script in linea né da altri siti, più le altre intestazioni di sicurezza. Niente Google Fonts né immagini delle emoji da un CDN: nessun servizio esterno vede l'indirizzo IP di chi apre Palacan. | `frontend/my-react-app/vite-project/sicurezza/intestazioni.mjs`, `frontend/my-react-app/vite-project/tests/sicurezzaWeb.test.js`, `frontend/my-react-app/vite-project/scripts/verificaCsp.mjs` (Chromium vero, richieste esterne bloccate) |
| **L1b** (`38aa6ab`) | Build riproducibile: dallo stesso commit esce lo stesso sito, byte per byte. La build usa solo valori pubblici e scrive l'impronta SHA-256 di ogni file. GitHub rifà la build e pubblica le impronte, e chiunque può confrontarle con il sito vero. | `frontend/my-react-app/vite-project/sicurezza/impronte.mjs`, `frontend/my-react-app/vite-project/sicurezza/configurazione-pubblica.json`, `.github/workflows/build-verificabile.yml`, `frontend/my-react-app/vite-project/scripts/verificaSito.mjs`, `frontend/my-react-app/vite-project/tests/buildVerificabile.test.js` |
| **L1c** (`633eb7b`) | L'elenco delle impronte è **firmato** con la chiave di rilascio ibrida (ed25519 + ML-DSA-65). La parte privata non è mai stata sul server né su GitHub. Chi controlla il server può cambiare i file, ma non firmarli. Il numero di rilascio cresce sempre, quindi una versione vecchia non torna online senza che si veda. | `frontend/my-react-app/vite-project/sicurezza/rilascio.mjs`, `frontend/my-react-app/vite-project/scripts/firmaRilascio.mjs`, `strumenti/pubblica_frontend.py`, `frontend/my-react-app/vite-project/tests/firmaRilascio.test.js` |
| **L1d** (`8a112d0`) | Estensione per il browser **Palacan Verifica** (Chrome, Edge, Brave). A ogni apertura controlla la firma con la chiave fissata nell'estensione, l'impronta della pagina e di **ogni** file che la pagina carica (anche dopo), lo script di servizio, la CSP e il numero di rilascio. L'icona è verde, rossa con il motivo, oppure grigia. | `frontend/my-react-app/vite-project/estensione/controllo.js`, `frontend/my-react-app/vite-project/tests/estensioneVerifica.test.js` (stessi esiti della verifica di L1c, con il motore vero), `frontend/my-react-app/vite-project/scripts/verificaEstensione.mjs` (Chromium vero: verde sul sito giusto, rosso per file cambiati, pagina cambiata, versione vecchia, firma tolta, firma di un'altra chiave, CSP tolta) |

Chiave pubblica di rilascio: `frontend/my-react-app/vite-project/sicurezza/chiave-rilascio-pubblica.json`.
Impronte: ML-DSA-65 `b17eb99909ede552…`, ed25519 `laOmhJxypCT8…`.

### L2 – Il server tiene il meno possibile

| Passo | Garanzia | Prova |
|---|---|---|
| **L2a** (`bcb7af8`) | La pulizia automatica parte dalle richieste stesse, al massimo ogni 15 minuti, e scrive sempre il risultato. Cancella i dati di consegna scaduti e le sessioni morte (senza rinnovo, mai revocate, ferme da oltre 30 giorni). Verificato in produzione: dopo la pulizia tutti i conteggi sono a zero. | `backend/scheduler.py`, `backend/tests/security/test_l2a_pulizia.py` |
| **R1** (`4ffa081`) | `/health` in produzione non mostra più gli indirizzi di sviluppo. | `backend/tests/security/test_r1_health.py` |

### L3 – Chiavi di gruppo che cambiano quando devono

| Passo | Garanzia |
|---|---|
| **L3a** (`2541689`) | La chiave Megolm della chat cambia anche dopo 100 messaggi, e anche per le sessioni senza data di creazione. |
| **L3b** (`4d26089`) | Quando sparisce un dispositivo, la chiave cambia: il dispositivo uscito non legge i messaggi nuovi. Nessuna chiave agli utenti disattivati. |

### L4 – Sai con chi parli

| Passo | Garanzia |
|---|---|
| **L4a** (`02e1b89`) | Fiducia per singolo dispositivo (TOFU) e verifica per dispositivo. Verso un contatto verificato con una chiave mai vista, l'invio si blocca. |
| **L4b** (`0020ea3`) | Verifica dell'identità con codice QR, controllata nelle due direzioni. |
| **L4c1–L4c5** (`d1c7be8` … `d4c0e83`) | Chiave principale ibrida (ed25519 + ML-DSA-65) per persona, che firma i suoi dispositivi. I dispositivi non firmati non ricevono messaggi. Un dispositivo nuovo si approva da uno vecchio con un codice di confronto. Numero di sicurezza e QR v2 calcolati dalle chiavi principali. |
| **L4d** (`cbaf475`) | Chiamate e videochiamate bloccate verso un contatto verificato che presenta una chiave mai vista. |
| **L4e** (`d508ab5`) | Offerta, risposta e candidati ICE della chiamata cifrati end-to-end con la chiave Megolm della chat e autenticati: il server non può fare da intermediario sulla chiamata, perché le impronte DTLS viaggiano cifrate, e non vede se è una videochiamata. Più: protezione contro le ripetizioni e validità di 5 minuti. La chiave della chat si condivide al massimo una volta ogni 30 secondi per chiamata (R1). Prova: `frontend/my-react-app/vite-project/src/utils/segnaliChiamata.js`, `frontend/my-react-app/vite-project/tests/segnaliChiamata.test.js` (motore vero). |

### CL – Crittografia rafforzata: post-quantum senza eccezioni
<!-- [palacan-cl2d] -->

| Passo | Garanzia | Prova |
|---|---|---|
| **CL1** (`b6399bd`) | Le chiavi Curve25519 deboli (di ordine basso, che rendono nullo il Diffie-Hellman) sono rifiutate prima di aprire una sessione Olm. | `crypto/palacan-crypto/tests/chiavi_deboli.rs` (14 chiavi deboli) |
| **CL2e** (`c4699fb`) | Niente più ripiego sull'invio Olm vecchio quando l'invio cifrato non riesce: il messaggio resta in coda e riparte dal canale giusto. | `frontend/my-react-app/vite-project/tests/cl2eNienteRipiegoLegacy.test.js` |
| **CL2b** (`fee4f77`) | Busta post-quantum **obbligatoria**: una chiave di stanza non parte mai senza busta ML-KEM e non si accetta se arriva senza, nemmeno al primo contatto. | `frontend/my-react-app/vite-project/tests/bustePq.test.js` |
| **CL2f** (`f9549f7`, `fc6d998`) | Buste sigillate ibride X25519 + ML-KEM-768: chi manda una chiave di stanza e i nomi dei gruppi negli inviti restano nascosti anche a chi registra oggi il traffico e domani ha un computer quantistico. | `frontend/my-react-app/vite-project/tests/cl2fBusteIbride.test.js`, `backend/tests/security/test_cl2f_busta_pq.py` |
| **CL2c** (`f92f97e`) | Le chiavi ML-KEM usa e getta non usate si rinnovano ogni 7 giorni; i semi ritirati restano 30 giorni per le buste già partite, poi si cancellano. Un furto dello stato smette di servire dopo il rinnovo. | `frontend/my-react-app/vite-project/tests/cl2cRinnovoPq.test.js`, `formale/proverif/6_rinnovo_prechiavi.pv` |
| **CL2g** (`a18d9fa`) | La busta di ogni persona è firmata dalla sua chiave principale (ed25519 + ML-DSA-65): il server non può sostituirla con una sua. | `frontend/my-react-app/vite-project/tests/cl2gBustaFirmata.test.js`, `backend/tests/security/test_cl2g_busta_firmata.py` |
| **CL2d** | Modello formale 6: rinnovo delle chiavi post-quantum e furto dello stato (sezione più sopra). | `formale/proverif/6_rinnovo_prechiavi.pv`, `formale/proverif/verifica.py` |

### Limiti dichiarati (cosa NON è garantito oggi)

- **Il web dipende ancora dal server, per chi non usa l'estensione.** Chi apre Palacan senza Palacan Verifica riceve
  il codice dal server a ogni apertura. Un cambio mirato a una sola persona si può scoprire solo dopo, con
  `verificaSito.mjs`, e non prima. L'obiettivo è un'app installabile (Tauri o Capacitor) firmata con la chiave di
  rilascio, che si aggiorna solo con versioni firmate.
- **Limiti dell'estensione.** Controlla solo le pagine aperte dopo l'installazione: la prima versione vista fa da
  riferimento per i numeri. I file si riscaricano dalla cache del browser, e un file che non è in cache viene
  riscaricato: un server che sapesse distinguere le due richieste potrebbe rispondere in modo diverso. I file caricati
  dentro un worker non sono visti. Protegge solo chi la installa.
- **Custodia della chiave di rilascio.** La chiave di rilascio è una sola persona, con un solo PC e una copia su
  chiavetta, cifrata con una passphrase (scrypt + AES-256-GCM). Se va persa, serve una chiave nuova e una nuova
  versione dell'estensione. Chi ottiene sia il file sia la passphrase può firmare.
- **Metadati.** Il server vede chi parla con chi, quando e quanto (non cosa): non c'è nessun "mittente sigillato".
  La pulizia (L2a) riduce quanto a lungo questi dati restano, ma non li elimina mentre servono alla consegna.
- **Chiamate.** Il rifiuto e la fine di una chiamata viaggiano in chiaro. Chi controlla il server può chiudere una
  chiamata o impedirla (negazione del servizio), ma non ascoltarla né inserirsi. Il server di supporto della
  chiamata (TURN) vede gli indirizzi IP. La videochiamata è provata solo sullo stesso PC: la prova con due
  dispositivi veri è da fare.
- **Dispositivi da approvare.** Un dispositivo nuovo non firmato non riceve messaggi finché non lo approvi da uno
  vecchio. Chi perde tutti i dispositivi riparte dal backup protetto dalla passphrase.
- **R2b.** Un messaggio di un canale anonimo arrivato senza la sua chiave si mostra come "non disponibile": non si
  recupera dopo.
- **Modalità Riserva.** Nei browser senza IndexedDB l'app gira in modalità ridotta (Riserva), con una conservazione
  locale delle chiavi più debole di quella normale.
- **Busta firmata: fiducia al primo uso (CL2g).** La firma della busta si controlla con la chiave principale del
  destinatario. Se chi scrive non l'ha mai vista e il server non la consegna, la busta si usa come prima, senza
  firma: è la stessa fiducia al primo uso di L4c. Una chiave principale già vista vale anche se il server smette di
  consegnarla.
- **Rinnovo delle chiavi post-quantum (CL2c).** Dopo un furto dello stato del dispositivo, le buste verso le chiavi
  rubate restano leggibili fino al rinnovo (al massimo 7 giorni, con l'app aperta). E se il ladro controlla anche
  il server, può continuare a consegnare le chiavi vecchie rubate, che hanno ancora la loro firma valida (o chiavi sue
  firmate con le chiavi rubate): la sicurezza non torna da sola, serve togliere il dispositivo (modello 6).
- **Ratchet dimostrato in modo simbolico (L6).** Il ratchet di Olm e di Megolm è nei modelli 4 e 5, con primitive
  ideali e un numero limitato di passi. Restano due limiti, dichiarati e mostrati dai modelli: un dispositivo rubato
  legge la cronologia di Megolm che aveva già ricevuto; dopo un furto, Olm torna sicuro solo dopo un giro di chiavi
  non manomesso. Prossimo passo: L5 (CryptoVerif, sicurezza computazionale).

## In locale

Con opam:

```
opam install proverif
python3 formale/proverif/verifica.py
```

Prove per proprietà e mutanti (servono solo Rust e Python):

```
cd crypto/palacan-crypto && cargo test --test proprieta_pq && cd ../..
python3 formale/mutanti/prova_mutanti.py
```

Kani (Linux o macOS): `cargo install --locked kani-verifier && cargo kani setup`, poi `cargo kani` in `formale/kani`.
