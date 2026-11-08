# palacan-crypto

Crittografia di Palacan: **vodozemac** (implementazione Rust ufficiale di Olm/Megolm, con audit pubblico) al posto
di libolm, con la **stessa interfaccia JavaScript di libolm** (`Account`, `Session`, `OutboundGroupSession`,
`InboundGroupSession`, `Utility`), cosi' `olmService.js` cambia solo l'import.

- Formati sul filo identici a libolm (Olm e Megolm versione 1): dispositivi con libolm e con vodozemac si parlano.
- Migrazione automatica: un pickle libolm (senza prefisso `vz1:`) viene letto e convertito; i pickle nuovi sono
  quelli di vodozemac, cifrati con una chiave di 32 byte ricavata dalla chiave di pickle di Palacan.
- Errori come libolm: `Error` con messaggio che inizia con `OLM.<CODICE>`.

## Test

    cargo test                       # nucleo + compatibilita' con i vettori di libolm 3.2.15
    node compat/verifica.js tests_vettori_libolm.json tests_vettori_vodozemac.json   # libolm legge vodozemac

`compat/genera.js` rigenera `tests_vettori_libolm.json` con la libolm vera (`npm i @matrix-org/olm@3.2.15` in `compat/`).

## Compilazione per il browser

    rustup target add wasm32-unknown-unknown
    wasm-pack build --release --target web --out-dir ../../frontend/my-react-app/vite-project/src/crypto/pkg

## Post-quantum [palacan-pq1]

ML-KEM-768 (FIPS 203) di `libcrux-ml-kem` (la stessa implementazione di Signal, codice portabile verificato con
hax/F*) e la "busta PQ" delle chiavi di stanza (`src/pq.rs`): KEM fresco per ogni busta, chiave HKDF-SHA256 legata
a chiave pubblica, testo cifrato e contesto, XChaCha20-Poly1305. Funzioni per il browser in `src/js_pq.rs`
(`pq_nuovo_seme`, `pq_chiave_pubblica`, `pq_sigilla`, `pq_apri`).

    cargo test --test pq             # contro un'implementazione indipendente di FIPS 203 (tests_vettori_mlkem768.json)
    node compat/prova_pq_wasm.mjs    # le stesse prove sul WASM compilato

## Firme post-quantum [palacan-pq5a]

ML-DSA-65 (FIPS 204) di `libcrux-ml-dsa` e la firma IBRIDA ed25519 + ML-DSA-65 (`src/firma_pq.rs`): vale solo se
reggono entrambe. Le due firme coprono lo stesso testo
`palacan-firma-ibrida-v1|<contesto>|<chiave ed25519>|<SHA-256 della chiave ML-DSA>|<messaggio>`, cosi' non si puo'
staccarne una ne' mescolare o sostituire le chiavi. Seme privato di 32 byte, firma hedged. Funzioni per il browser in
`src/js_firma_pq.rs` (`pqfirma_nuovo_seme`, `pqfirma_chiave_pubblica`, `pqfirma_testo_ibrido`, `pqfirma_firma`,
`pqfirma_verifica_ibrida`).

    cargo test --test firma_pq             # contro un'implementazione indipendente di FIPS 204 (tests_vettori_mldsa65.json)
    node compat/prova_firma_pq_wasm.mjs    # le stesse prove sul WASM compilato, con un account Olm vero

## Verifica dei formati post-quantum [palacan-pq6b]

`src/formato_pq.rs` contiene SOLO la logica pura dei formati (regola del contesto, testo della firma ibrida, divisione
e composizione della busta): `pq.rs` e `firma_pq.rs` la usano, e il model checker Kani la dimostra per tutti gli input
entro limiti dati (CI "Modelli formali", pacchetto `formale/kani`). `tests/proprieta_pq.rs` prova con proptest le
proprieta' di busta ML-KEM e firma ibrida su migliaia di input casuali e fissa il formato byte per byte;
`formale/mutanti/prova_mutanti.py` controlla che quelle prove scoprano errori veri introdotti apposta.

    cargo test --test proprieta_pq
    python3 ../../formale/mutanti/prova_mutanti.py
