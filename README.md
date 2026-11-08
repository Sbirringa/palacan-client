# Palacan - client source code (read and verify only)

## What is Palacan

Palacan is an end-to-end encrypted messenger for people and for companies. It runs in the browser and is available
in English, Italian, French, Spanish and German.

### For everyone (free)

- Free for everyone.
- Sign up with just a username and a password: no email, no phone number.
- One-to-one and group chats, end-to-end encrypted (Olm and Megolm via vodozemac) with post-quantum protection
  (ML-KEM-768, ML-DSA-65).
- Voice and video calls, always relayed, so the other person never sees your IP address.
- Safety numbers to verify a contact, and a warning if a contact's key changes.
- Several devices on the same account, and an encrypted backup protected by your password.
- Your chat history is stored encrypted on your device.
- Reactions are end-to-end encrypted too, like messages.
- Nobody can write to you out of the blue: an invite link only lets someone *find* you, and you accept the request.
  You join groups only by direct invitation.
- Messages that delete themselves after a time you choose.
- Minimal metadata: for private chats the server does not store who sent a message, times are rounded to the hour
  and messages are padded to hide their length. Details and limits are in `formale/README.md`.

### For companies

- A separate workspace for each company.
- No email or phone number needed for company accounts either.
- Company accounts are fully separate: employees cannot find or contact free users, or employees of other companies.
- Admin roles, employee accounts created by the admin, and tasks.
- Company chats are end-to-end encrypted too: the server does not store who sent a message, and the admin cannot
  look it up. Company messages are never deleted automatically.

## This repository

This repository contains **only the code that runs on your device**: the Palacan web app, the cryptography module
(`crypto/palacan-crypto`: vodozemac + ML-KEM-768 + ML-DSA-65) and the formal models (`formale/`).

License: **all rights reserved**. You may only read and verify this code (see `LICENSE`).

Exported from the development repository, commit `c58901e` (2026-11-09).

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
