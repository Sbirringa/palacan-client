# Palacan - client source code (read and verify only)

This repository contains **only the code that runs on your device**: the Palacan web app, the cryptography module
(`crypto/palacan-crypto`: vodozemac + ML-KEM-768 + ML-DSA-65) and the formal models (`formale/`).

License: **all rights reserved**. You may only read and verify this code (see `LICENSE`).

Exported from the development repository, commit `f63e0ba` (2026-11-08).

## Why the server code is not here

Palacan uses end-to-end encryption. Your messages are encrypted **on your device**, by the code in this
repository, **before** they leave it, and only your recipients' devices can decrypt them. The server only receives
and forwards data that is already encrypted, and it never has the keys.

So to check that your messages are really protected, what matters is the code running on your device, which is
this code, not the server's. What the server can still see (for example, when a message is sent) is described,
together with its limits, in `formale/README.md`.

## Check that the website is exactly this code

    cd frontend/my-react-app/vite-project
    npm ci
    npm run build
    node scripts/verificaSito.mjs --confronta dist/palacan-impronte.json

`verificaSito.mjs` downloads from the website the list of SHA-256 fingerprints of every file, compares it with the
build you have just made and checks the list's **signature** (ed25519 + ML-DSA-65) against the public release key
in `frontend/my-react-app/vite-project/sicurezza/chiave-rilascio-pubblica.json`. Every change to this repository repeats the same build on GitHub
("Build verificabile") and publishes its fingerprint.

To do this automatically every time you open the website, use the **Palacan Verifica** browser extension
(`frontend/my-react-app/vite-project/estensione/`, instructions in `LEGGIMI.txt`).

## What is proven

The cryptographic properties (post-quantum envelope, hybrid signature, Olm and Megolm ratchets) are proven with
ProVerif and Kani: see `formale/README.md`, which also states the limits.

## Reporting a vulnerability

Use "Report a vulnerability" in the **Security** tab of this repository (private report).

Note: most comments and documents inside the code are in Italian.
