"""
verifica.py  [palacan-pq6a]

Lancia ProVerif sui modelli di questa cartella e controlla che OGNI risultato sia quello atteso, nell'ordine delle
query di ciascun file. "cannot be proved" o un risultato diverso -> errore (la CI diventa rossa).
Risultati attesi:
  vero  = la proprieta' e' DIMOSTRATA ("RESULT ... is true.")
  falso = ProVerif trova l'attacco o raggiunge l'evento ("RESULT ... is false."): serve a mostrare che il modello
          vede davvero gli attacchi (senza busta ML-KEM, con la sola ed25519) e che non e' vuoto.

Uso: python3 verifica.py   (con proverif nel PATH; in CI: opam exec -- python3 formale/proverif/verifica.py)
"""
import os
import re
import subprocess
import sys

QUI = os.path.dirname(os.path.abspath(__file__))
ATTESI = {
    "1_raccogli_ora_decifra_dopo.pv": [
        ("chiave di stanza nella busta ML-KEM segreta anche col computer quantistico", "vero"),
        ("la stessa chiave SENZA busta (solo Olm) col computer quantistico si scopre", "falso"),
        ("la consegna avviene (modello non vuoto)", "falso"),
    ],
    "2_firma_ibrida.pv": [
        ("chiave ML-KEM accettata con firma ibrida = chiave vera di Bob, anche con ed25519 rotta", "vero"),
        ("Alice accetta chiavi di Bob (modello non vuoto)", "falso"),
    ],
    "2b_solo_ed25519.pv": [
        ("con la sola ed25519 rotta l'attaccante fa accettare una sua chiave", "falso"),
        ("nello stesso scenario la firma ibrida regge", "vero"),
    ],
    "3_classico_regge.pv": [
        ("con ML-KEM rotto la chiave di stanza resta protetta da Olm", "vero"),
        ("la consegna avviene (modello non vuoto)", "falso"),
    ],
    "4_megolm_ratchet.pv": [  # [palacan-l6]
        ("Megolm: messaggio inviato PRIMA della fotografia dello stato resta segreto", "vero"),
        ("Megolm: messaggio DOPO, stessa sessione, si legge (serve la rotazione)", "falso"),
        ("Megolm: messaggio dopo la rotazione resta segreto", "vero"),
        ("Megolm: la cronologia gia' sul dispositivo rubato si legge (limite dichiarato)", "falso"),
        ("Megolm: dopo la rotazione L3b il dispositivo rubato non legge piu'", "vero"),
        ("Megolm: chi ruba un destinatario non scrive a nome del mittente (firma della sessione)", "vero"),
        ("Megolm: senza la firma potrebbe farlo (il modello vede l'attacco)", "falso"),
        ("Megolm: la consegna dopo la rotazione avviene (modello non vuoto)", "falso"),
    ],
    "5_olm_double_ratchet.pv": [  # [palacan-l6]
        ("Olm: messaggio inviato PRIMA del furto dello stato resta segreto", "vero"),
        ("Olm: messaggio sulla stessa catena DOPO il furto si legge", "falso"),
        ("Olm: dopo un giro DH nuovo non manomesso la sicurezza torna", "vero"),
        ("Olm: se l'attaccante manomette quel giro, non torna (limite dichiarato)", "falso"),
        ("Olm: Bob riceve il messaggio dopo la guarigione (modello non vuoto)", "falso"),
    ],
    "6_rinnovo_prechiavi.pv": [  # [palacan-cl2d]
        ("PQ: busta verso una chiave usa e getta gia' usata segreta anche dopo il furto", "vero"),
        ("PQ: busta verso una chiave rubata non rinnovata si legge (per questo CL2c)", "falso"),
        ("PQ: dopo il rinnovo CL2c le buste nuove sono segrete", "vero"),
        ("PQ: dopo il rinnovo, il server ripropone la chiave vecchia rubata (firma valida): si legge (limite)", "falso"),  # [palacan-cl2d3]
        ("PQ: Bob apre la busta dopo il rinnovo (modello non vuoto)", "falso"),
    ],
}


def main():
    sbagliati = 0
    for nome, attese in ATTESI.items():
        p = os.path.join(QUI, nome)
        r = subprocess.run(["proverif", p], capture_output=True, text=True)
        uscita = (r.stdout or "") + (r.stderr or "")
        risultati = re.findall(r"^RESULT .* (is true|is false|cannot be proved)\.\s*$", uscita, re.M)
        print(f"\n=== {nome} ===")
        if r.returncode != 0 or len(risultati) != len(attese):
            print(uscita[-4000:])
            print(f"ERRORE: ProVerif ha dato {len(risultati)} risultati, attesi {len(attese)} (codice {r.returncode})")
            sbagliati += 1
            continue
        for (descrizione, atteso), trovato in zip(attese, risultati):
            ottenuto = {"is true": "vero", "is false": "falso"}.get(trovato, "non dimostrabile")
            ok = ottenuto == atteso
            sbagliati += 0 if ok else 1
            print(f"  {'OK ' if ok else 'NO '} {descrizione}: {ottenuto} (atteso {atteso})")
        for riga in re.findall(r"^RESULT .*$", uscita, re.M):
            print(f"      {riga}")
    if sbagliati:
        print(f"\n!!! {sbagliati} risultato/i diversi da quelli attesi")
        sys.exit(1)
    print("\n=== tutti i risultati come attesi ===")


if __name__ == "__main__":
    main()
