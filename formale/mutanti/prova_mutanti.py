"""
formale/mutanti/prova_mutanti.py  [palacan-pq6b]

"Chi controlla i controllori?": una prova che passa sempre non prova niente. Qui si introducono, uno alla volta, ERRORI
VERI e plausibili nel codice post-quantum (mutanti: un contesto che accetta '|', una firma ibrida a cui basta una sola
firma, una busta aperta senza contesto autenticato, ...) e si controlla che le prove per proprieta'
(crypto/palacan-crypto/tests/proprieta_pq.rs) li SCOPRANO tutti. Ogni file torna sempre identico, byte per byte, anche
se si interrompe a meta'. Se un mutante sopravvive, le prove hanno un buco: la CI diventa rossa.

Uso (dalla radice del repository):  python formale/mutanti/prova_mutanti.py
"""
import os
import subprocess
import sys

RADICE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODULO = os.path.join(RADICE, "crypto", "palacan-crypto")
COMANDO = "cargo test --locked --test proprieta_pq"
# proptest salva qui gli input delle prove cadute: con i mutanti cadono apposta, il file torna sempre com'era
REGRESSIONI = os.path.join(MODULO, "tests", "proprieta_pq.proptest-regressions")

# (file, testo originale, testo con l'errore, descrizione). Il testo originale deve esserci UNA volta: se il codice
# cambia, questo script si ferma e chiede di aggiornare i mutanti insieme al codice.
MUTANTI = [
    ("src/formato_pq.rs", "|| b == b'_';", "|| b == b'_' || b == b'|';",
     "contesto che accetta il separatore '|'"),
    ("src/formato_pq.rs", '    if busta[0] != VERSIONE_BUSTA {\n        return Err("VERSIONE_SCONOSCIUTA");\n    }\n', "",
     "busta senza controllo della versione"),
    ("src/formato_pq.rs", "if busta.len() < MINIMO_BUSTA {", "if busta.len() < MINIMO_BUSTA + 1 {",
     "busta di lunghezza minima rifiutata (errore di uno)"),
    ("src/formato_pq.rs", "    if !contesto_valido(contesto) || !solo", "    if !solo",
     "testo ibrido scomposto senza controllare il contesto"),
    ("src/formato_pq.rs", "    t.extend_from_slice(ed);\n    t.push(SEPARATORE);\n", "    t.extend_from_slice(ed);\n",
     "testo ibrido con un separatore mancante"),
    ("src/firma_pq.rs", "ed.verify(testo.as_bytes(), &f).is_ok() && verifica_ml_dsa",
     "ed.verify(testo.as_bytes(), &f).is_ok() || verifica_ml_dsa",
     "firma ibrida a cui basta UNA delle due firme"),
    ("src/firma_pq.rs", "impronta.as_bytes(), messaggio.as_bytes());", 'b"", messaggio.as_bytes());',
     "testo ibrido non legato alla chiave ML-DSA"),
    ("src/pq.rs", ".decrypt(&XNonce::from(nonce), Payload { msg: cifrato, aad: contesto })",
     '.decrypt(&XNonce::from(nonce), Payload { msg: cifrato, aad: b"" })',
     "busta aperta senza contesto autenticato"),
]


def main():
    print(f"=== {len(MUTANTI)} mutanti: ognuno deve far fallire {COMANDO} ===", flush=True)
    sopravvissuti = []
    regressioni = open(REGRESSIONI, "rb").read() if os.path.isfile(REGRESSIONI) else None
    for i, (rel, vecchio, nuovo, nome) in enumerate(MUTANTI, 1):
        p = os.path.join(MODULO, rel)
        with open(p, "rb") as fh:
            originale = fh.read()
        testo = originale.decode("utf-8")
        crlf = "\r\n" in testo
        normale = testo.replace("\r\n", "\n")
        if normale.count(vecchio) != 1:
            sys.exit(f"ERRORE: mutante {i} ({nome}): testo originale non trovato una volta in {rel}. "
                     "Il codice e' cambiato: aggiorna i mutanti in questo file.")
        mutato = normale.replace(vecchio, nuovo)
        if crlf:
            mutato = mutato.replace("\n", "\r\n")
        try:
            with open(p, "wb") as fh:
                fh.write(mutato.encode("utf-8"))
            r = subprocess.run(COMANDO, cwd=MODULO, shell=True, capture_output=True, text=True,
                               encoding="utf-8", errors="replace")
        finally:
            with open(p, "wb") as fh:
                fh.write(originale)
            if regressioni is None:
                if os.path.exists(REGRESSIONI):
                    os.remove(REGRESSIONI)
            else:
                with open(REGRESSIONI, "wb") as fh:
                    fh.write(regressioni)
        uscita = (r.stdout or "") + (r.stderr or "")
        cadute = [x.split()[1] for x in uscita.splitlines() if x.startswith("test ") and x.endswith("FAILED")]
        scoperto = r.returncode != 0 and bool(cadute)
        print(f"  {'SCOPERTO   ' if scoperto else 'SOPRAVVISSUTO'} {i}. {nome}"
              + (f"  <- {', '.join(cadute)}" if cadute else ""), flush=True)
        if not scoperto:
            if r.returncode != 0:
                print("\n".join(uscita.splitlines()[-30:]))
            sopravvissuti.append(nome)
    print()
    if sopravvissuti:
        print(f"!!! {len(sopravvissuti)} mutanti NON scoperti: le prove hanno un buco: {sopravvissuti}")
        sys.exit(1)
    print(f"{len(MUTANTI)}/{len(MUTANTI)} mutanti scoperti dalle prove")


if __name__ == "__main__":
    main()
