// src/public/testiPagine.js  [palacan-v4] [palacan-v4b] + pagina Documenti (unico posto con i PDF)
//
// Testi delle pagine pubbliche Sicurezza, Codice (Open Source) e Tecnologia, in 5 lingue (inglese = predefinito e
// riserva). Seguono la lingua scelta nel selettore (i18next), come la home (components/testiHome.js).
// Ogni frase deve essere VERA oggi: i dettagli tecnici e i limiti sono nei documenti pubblici su GitHub
// (docs/PROTOCOL.md, docs/ARCHITECTURE.md, docs/VERIFICATION.md, SECURITY.md, formale/README.md). I collegamenti
// "href" sono percorsi del repository pubblico. Tutte le lingue hanno le stesse voci (tests/v4PaginePubbliche.test.js).
import { useTranslation } from 'react-i18next';

export const REPOSITORY_PUBBLICO = 'https://github.com/Sbirringa/palacan-client';

/** Indirizzo su GitHub di un file del repository pubblico. */
export function suGitHub(percorso) {
  return `${REPOSITORY_PUBBLICO}/blob/main/${String(percorso || '').replace(/^\/+/, '')}`;
}

// [palacan-v4b] I PDF da scaricare: SOLO qui e nella pagina Documenti (/documenti). Solo in inglese, generati dai file
// "fonti" del repository pubblico. pagine e kb devono corrispondere ai file in public/whitepapers (test v4b).
export const DATA_DOCUMENTI = '2026-11-09';
export const DOCUMENTI = [
  { key: 'whitepaper', file: '/whitepapers/palacan-security-whitepaper.pdf', pagine: 16, kb: 180, fonti: ['docs/PROTOCOL.md', 'docs/ARCHITECTURE.md', 'docs/VERIFICATION.md'] },
  { key: 'protocol', file: '/whitepapers/palacan-protocol.pdf', pagine: 8, kb: 117, fonti: ['docs/PROTOCOL.md'] },
  { key: 'architecture', file: '/whitepapers/palacan-architecture.pdf', pagine: 5, kb: 75, fonti: ['docs/ARCHITECTURE.md'] },
  { key: 'verification', file: '/whitepapers/palacan-verification.pdf', pagine: 4, kb: 69, fonti: ['docs/VERIFICATION.md'] },
  { key: 'policy', file: '/whitepapers/palacan-security-policy.pdf', pagine: 4, kb: 58, fonti: ['SECURITY.md'] },
];

const en = {
  common: {
    docsTitle: 'Documents',
    docsSub: 'The security whitepaper, the protocol, the architecture and how to verify everything: all the PDFs are on the Documents page. In English.',
    docsCta: 'Go to Documents',
    github: 'Go to the code on GitHub',
    flow: {
      sender: 'Sender device', senderLines: ['You write the message', 'It is encrypted before it leaves'],
      server: 'Server', serverLines: ['Forwards the encrypted message', 'Cannot read it: it has no keys'],
      recipient: 'Recipient device', recipientLines: ['It arrives still encrypted', 'Only this device can decrypt it'],
    },
  },
  security: {
    title: 'Security is not a feature. It is the principle.',
    intro: 'Palacan is built so that you do not have to trust us. The protection of your messages depends on how the system works, and you can check how it works.',
    sections: [
      { key: 'e2ee', title: 'End-to-end encryption', paragraphs: [
        'Every message is encrypted on your device and can be decrypted only by the devices of the people you are writing to. The server forwards and stores data that is already encrypted, and never has the keys to read it.',
      ] },
      { key: 'olm', title: 'Olm and Megolm, with vodozemac', paragraphs: [
        'We did not invent our own cryptography. Palacan uses Olm for conversations between devices and Megolm for chats and groups, through vodozemac, the audited Rust implementation used by the Matrix ecosystem.',
        'Keys change continuously: someone who stole a key today could not read your past messages. The key of a chat is replaced after 100 messages or 7 days, and whenever a device leaves the chat.',
      ] },
      { key: 'pq', title: 'Ready for quantum computers', paragraphs: [
        'Someone could record encrypted traffic today and try to decrypt it in the future with a quantum computer. To prevent this, every chat key travels inside a second, post-quantum envelope (ML-KEM-768). To read it, an attacker would have to break both the classical and the post-quantum encryption.',
        'The post-quantum envelope is mandatory: a chat key is never sent without it. The signatures that protect keys are hybrid (Ed25519 + ML-DSA-65): they are valid only if both hold.',
      ] },
      { key: 'verify', title: 'You know who you are talking to', paragraphs: [
        'Each person has a principal key that signs their devices: a device that is not signed does not receive your messages. You can compare a safety number or scan a QR code to be sure nobody is in the middle.',
        'If the key of a contact you have verified changes, Palacan warns you and blocks sending and calls until you check.',
      ] },
      { key: 'keys', title: 'Your keys stay yours', paragraphs: [
        'Keys are created on your device and stored there, encrypted with a key that not even the app\'s code can read. Your private keys never reach the server in readable form.',
        'To move to a new device you can use an encrypted backup. It is encrypted in your browser with a key derived from a passphrase you choose (Argon2id). We never see the passphrase and cannot recover it.',
      ] },
      { key: 'infra', title: 'Infrastructure', items: [
        'Every connection uses HTTPS/TLS, without exceptions.',
        'A strict security policy: the page runs only code from Palacan itself, with no third-party scripts, fonts or trackers.',
        'We store only a hash of your password, never the password itself.',
        'Sessions expire, and you can remove a device from your account at any time.',
      ] },
      { key: 'proofs', title: 'Proven, not just claimed', paragraphs: [
        'The main properties are proven with formal tools (ProVerif and Kani) and checked by thousands of automated tests at every change, also with real browsers. Each guarantee is listed with its proof and its limits.',
      ], link: { label: 'Formal proofs and register of guarantees', href: 'formale/README.md' } },
      { key: 'limits', title: 'What we do not promise', paragraphs: [
        'No system protects against everything, and we prefer to say so clearly:',
      ], items: [
        'The server needs some metadata to deliver messages, for example who is a member of which chat and when a device is connected.',
        'Keys are trusted the first time they are seen. For certainty, compare the safety number.',
        'In the browser, the app is delivered by the server each time. The Palacan Verifica extension checks that it is exactly the published, signed code.',
        'Malware on an unlocked computer can see what you see.',
      ], link: { label: 'All the limits, in detail', href: 'docs/ARCHITECTURE.md' } },
      { key: 'report', title: 'Found a problem?', paragraphs: [
        'If you find a vulnerability, please report it privately. We answer every report, and research done in good faith is welcome.',
      ], link: { label: 'How to report a vulnerability', href: 'SECURITY.md' } },
    ],
    company: {
      title: 'Companies: administering is not reading',
      paragraphs: [
        'If you use Palacan privately, nobody administers your account. In a company workspace there is an administrator, but administering and reading are separate by design, not by promise.',
      ],
      canTitle: 'An administrator can', can: ['Create and manage employee accounts', 'Assign roles', 'Manage the workspace and its tasks'],
      cannotTitle: 'An administrator cannot', cannot: ['Read conversations', 'See who sent a message', 'Recover users\' keys or passphrases'],
      after: 'The keys are not on the server, so an administrator has no way to open a conversation, even if they wanted to.',
    },
  },
  openSource: {
    title: 'Public to be verified, not to be believed.',
    intro: 'The code that runs on your device is public on GitHub: the app, the cryptography module, the formal proofs and the documentation. Anyone can read it, build it and check that the website runs exactly that code.',
    sections: [
      { key: 'what', title: 'What is public', items: [
        'The web app: where keys are created, messages are encrypted before they leave and decrypted when they arrive.',
        'The cryptography module (Rust): vodozemac, ML-KEM-768 and ML-DSA-65.',
        'The formal models and the automated tests.',
        'The Palacan Verifica browser extension.',
        'The technical documentation: protocol, architecture and threat model.',
      ] },
      { key: 'licence', title: 'Public, but not open source', paragraphs: [
        'We want to be precise: the code is public so that it can be verified, not reused. The licence allows you to read it, build it on your computer, compare it with the website and do security research on it. It does not allow you to copy it into other products or to run your own service with it.',
      ] },
      { key: 'build', title: 'The website is exactly this code', paragraphs: [
        'The build is reproducible: the same code always produces the same files, byte for byte. The list of their fingerprints is signed with a hybrid key (Ed25519 + ML-DSA-65) that has never been on our servers.',
        'With the Palacan Verifica extension your browser checks every file of the site, every time you open it. You can also do the same check by hand, and GitHub repeats the build at every change.',
      ], link: { label: 'How to verify the website yourself', href: 'docs/VERIFICATION.md' } },
      { key: 'server', title: 'Why the server code is not public', paragraphs: [
        'Your messages are encrypted on your device, by the public code, before they reach the server. The server forwards data it cannot read, so to check that your messages are protected what matters is the code on your device.',
        'What the server can still see, and the limits of this protection, are described openly.',
      ], link: { label: 'What the server can see', href: 'docs/ARCHITECTURE.md' } },
      { key: 'checks', title: 'What anyone can check', items: [
        'Messages are encrypted on the device, before they are sent.',
        'Private keys never leave the device in readable form.',
        'There is no hidden mechanism that bypasses the encryption.',
        'There are no third-party analytics or trackers in the app.',
        'Every change of the code can be followed over time.',
      ] },
      { key: 'report', title: 'Found a problem?', paragraphs: [
        'Reading the code is welcome. If you find a vulnerability, please report it privately.',
      ], link: { label: 'How to report a vulnerability', href: 'SECURITY.md' } },
    ],
    outro: 'Most services ask you to believe what they say about privacy. Palacan gives you the tools to check it.',
  },
  technology: {
    title: 'An architecture designed so that the server cannot read.',
    intro: 'Everything that protects your messages happens on your device. Here is how the parts fit together.',
    sections: [
      { key: 'stack', title: 'The components', items: [
        'The app runs in your browser (React).',
        'The cryptography is a Rust module compiled to WebAssembly: vodozemac for Olm and Megolm, libcrux for ML-KEM-768 and ML-DSA-65.',
        'The server (Python, PostgreSQL) stores and forwards encrypted data in real time over WebSocket.',
        'Calls use WebRTC and always pass through a relay, so the other person never sees your IP address.',
      ] },
      { key: 'keys', title: 'Keys', paragraphs: [
        'Each device has its own keys, and each person has a principal key that signs their devices. Keys for post-quantum encryption are renewed every week and carry a signed creation date: old keys are refused.',
      ] },
      { key: 'storage', title: 'Data on your device', paragraphs: [
        'Keys, chat history and drafts are stored on your device encrypted with a key that the browser creates and that not even the app\'s code can read. The chat history is deleted when you log out.',
      ] },
      { key: 'backup', title: 'Encrypted key backup', paragraphs: [
        'To restore your chats on a new device you can keep an encrypted backup on the server. It is encrypted in your browser with a key derived from your passphrase (Argon2id). The passphrase is never sent and cannot be recovered if you lose it.',
      ] },
      { key: 'auth', title: 'Account and sign-in', paragraphs: [
        'You sign up with a username and a password: no email and no phone number. The server stores only a hash of the password. Sessions expire, and every device of your account is visible and can be removed.',
      ] },
      { key: 'server', title: 'What the server can see', paragraphs: [
        'The server cannot read messages, reactions, calls or the names of private groups. To deliver messages it still knows:',
      ], items: [
        'your username and your devices, with their public keys;',
        'which chats you are a member of;',
        'when your devices are connected;',
        'encrypted messages, until they are delivered or expire.',
      ], after: 'For private chats it does not store who sent a message, times are rounded to the hour and the length of messages is hidden.', link: { label: 'Architecture and threat model', href: 'docs/ARCHITECTURE.md' } },
      { key: 'build', title: 'Verifiable from the outside', paragraphs: [
        'The website is built in a reproducible way and every release is signed. The code that runs on your device, the formal proofs and the documentation are public.',
      ], link: { label: 'The protocol, step by step', href: 'docs/PROTOCOL.md' } },
    ],
  },
  documents: {
    title: 'Documents',
    intro: 'All of Palacan\'s technical documents, in one place. Each PDF is generated from the public documentation on GitHub, where you always find the most recent version.',
    locale: 'en-GB',
    version: 'Version of',
    featured: 'Start here',
    parts: 'The same content, one document at a time',
    pages: 'pages',
    english: 'English',
    download: 'Download PDF',
    source: 'Source on GitHub',
    items: {
      whitepaper: { title: 'Security whitepaper', description: 'The complete technical description of Palacan: the protocol, the architecture, what the server can see, the threat model and how to verify everything. It contains the three documents below.' },
      protocol: { title: 'Protocol', description: 'How messages are encrypted and keys are managed: Olm and Megolm, the post-quantum envelope, hybrid signatures, the principal key, sealed delivery, calls and backup.' },
      architecture: { title: 'Architecture and threat model', description: 'The components, what runs where, what the server can and cannot see, and what Palacan is and is not designed to protect against.' },
      verification: { title: 'Verifying Palacan', description: 'How to check that the website runs exactly the public code, and how to run the formal proofs and the tests yourself.' },
      policy: { title: 'Security policy', description: 'How to report a vulnerability, what is in scope, the rules for testing and which versions are supported.' },
    },
    originTitle: 'Where these documents come from',
    origin: 'The cover of each PDF names the commit of the public repository it was generated from and its source files. The documents are in English only. If a PDF and the files on GitHub ever differ, the files on GitHub are the reference.',
  },
};

const it = {
  common: {
    docsTitle: 'Documenti',
    docsSub: 'Il whitepaper di sicurezza, il protocollo, l\'architettura e come verificare tutto: tutti i PDF sono nella pagina Documenti. In inglese.',
    docsCta: 'Vai a Documenti',
    github: 'Vai al codice su GitHub',
    flow: {
      sender: 'Dispositivo di chi scrive', senderLines: ['Scrivi il messaggio', 'Viene cifrato prima di partire'],
      server: 'Server', serverLines: ['Inoltra il messaggio cifrato', 'Non può leggerlo: non ha le chiavi'],
      recipient: 'Dispositivo di chi riceve', recipientLines: ['Arriva ancora cifrato', 'Solo questo dispositivo può decifrarlo'],
    },
  },
  security: {
    title: 'La sicurezza non è una funzione. È il principio.',
    intro: 'Palacan è costruito perché tu non debba fidarti di noi. La protezione dei tuoi messaggi dipende da come funziona il sistema, e come funziona lo puoi controllare.',
    sections: [
      { key: 'e2ee', title: 'Crittografia end-to-end', paragraphs: [
        'Ogni messaggio viene cifrato sul tuo dispositivo e può essere decifrato solo dai dispositivi delle persone a cui scrivi. Il server inoltra e conserva dati già cifrati, e non ha mai le chiavi per leggerli.',
      ] },
      { key: 'olm', title: 'Olm e Megolm, con vodozemac', paragraphs: [
        'Non abbiamo inventato una crittografia nostra. Palacan usa Olm per le conversazioni tra dispositivi e Megolm per le chat e i gruppi, tramite vodozemac, l\'implementazione in Rust con audit pubblico usata dall\'ecosistema Matrix.',
        'Le chiavi cambiano di continuo: chi rubasse una chiave oggi non potrebbe leggere i tuoi messaggi passati. La chiave di una chat si sostituisce dopo 100 messaggi o 7 giorni, e ogni volta che un dispositivo esce dalla chat.',
      ] },
      { key: 'pq', title: 'Pronto per i computer quantistici', paragraphs: [
        'Qualcuno potrebbe registrare oggi il traffico cifrato e provare a decifrarlo in futuro con un computer quantistico. Per impedirlo, ogni chiave di chat viaggia dentro una seconda busta, post-quantum (ML-KEM-768). Per leggerla bisognerebbe rompere sia la cifratura classica sia quella post-quantum.',
        'La busta post-quantum è obbligatoria: una chiave di chat non parte mai senza. Le firme che proteggono le chiavi sono ibride (Ed25519 + ML-DSA-65): valgono solo se reggono entrambe.',
      ] },
      { key: 'verify', title: 'Sai con chi stai parlando', paragraphs: [
        'Ogni persona ha una chiave principale che firma i suoi dispositivi: un dispositivo non firmato non riceve i tuoi messaggi. Puoi confrontare un numero di sicurezza o inquadrare un codice QR per essere sicuro che nessuno si sia messo in mezzo.',
        'Se cambia la chiave di un contatto che hai verificato, Palacan ti avvisa e blocca invii e chiamate finché non controlli.',
      ] },
      { key: 'keys', title: 'Le tue chiavi restano tue', paragraphs: [
        'Le chiavi nascono sul tuo dispositivo e restano lì, cifrate con una chiave che nemmeno il codice dell\'app può leggere. Le tue chiavi private non arrivano mai al server in forma leggibile.',
        'Per passare a un dispositivo nuovo puoi usare un backup cifrato. Viene cifrato nel tuo browser con una chiave ricavata da una passphrase che scegli tu (Argon2id). Noi non vediamo mai la passphrase e non possiamo recuperarla.',
      ] },
      { key: 'infra', title: 'Infrastruttura', items: [
        'Ogni connessione passa da HTTPS/TLS, senza eccezioni.',
        'Una politica di sicurezza rigida: la pagina esegue solo codice di Palacan, senza script, font o sistemi di tracciamento di terzi.',
        'Della tua password conserviamo solo un hash, mai la password.',
        'Le sessioni scadono, e puoi togliere un dispositivo dal tuo account in qualunque momento.',
      ] },
      { key: 'proofs', title: 'Dimostrato, non solo dichiarato', paragraphs: [
        'Le proprietà principali sono dimostrate con strumenti formali (ProVerif e Kani) e controllate da migliaia di test automatici a ogni modifica, anche con browser veri. Ogni garanzia è elencata con la sua prova e i suoi limiti.',
      ], link: { label: 'Prove formali e registro delle garanzie', href: 'formale/README.md' } },
      { key: 'limits', title: 'Cosa non promettiamo', paragraphs: [
        'Nessun sistema protegge da tutto, e preferiamo dirlo chiaramente:',
      ], items: [
        'Per consegnare i messaggi il server ha bisogno di alcuni metadati, per esempio chi fa parte di quale chat e quando un dispositivo è collegato.',
        'Le chiavi si considerano affidabili la prima volta che si vedono. Per esserne certo, confronta il numero di sicurezza.',
        'Nel browser l\'app arriva dal server a ogni apertura. L\'estensione Palacan Verifica controlla che sia esattamente il codice pubblicato e firmato.',
        'Un programma malevolo su un computer sbloccato può vedere quello che vedi tu.',
      ], link: { label: 'Tutti i limiti, nel dettaglio', href: 'docs/ARCHITECTURE.md' } },
      { key: 'report', title: 'Hai trovato un problema?', paragraphs: [
        'Se trovi una vulnerabilità, segnalala in privato. Rispondiamo a ogni segnalazione, e la ricerca fatta in buona fede è benvenuta.',
      ], link: { label: 'Come segnalare una vulnerabilità', href: 'SECURITY.md' } },
    ],
    company: {
      title: 'Aziende: amministrare non è leggere',
      paragraphs: [
        'Se usi Palacan da privato, nessuno amministra il tuo account. In uno spazio aziendale c\'è un amministratore, ma amministrare e leggere sono separati per progettazione, non per promessa.',
      ],
      canTitle: 'Un amministratore può', can: ['Creare e gestire gli account dei dipendenti', 'Assegnare ruoli', 'Gestire lo spazio aziendale e le sue attività'],
      cannotTitle: 'Un amministratore non può', cannot: ['Leggere le conversazioni', 'Vedere chi ha mandato un messaggio', 'Recuperare chiavi o passphrase degli utenti'],
      after: 'Le chiavi non sono sul server, quindi un amministratore non ha modo di aprire una conversazione, nemmeno volendo.',
    },
  },
  openSource: {
    title: 'Pubblico per essere verificato, non per essere creduto.',
    intro: 'Il codice che gira sul tuo dispositivo è pubblico su GitHub: l\'app, il modulo crittografico, le prove formali e la documentazione. Chiunque può leggerlo, compilarlo e controllare che il sito esegua esattamente quel codice.',
    sections: [
      { key: 'what', title: 'Cosa è pubblico', items: [
        'L\'app web: dove nascono le chiavi, dove i messaggi si cifrano prima di partire e si decifrano quando arrivano.',
        'Il modulo crittografico (Rust): vodozemac, ML-KEM-768 e ML-DSA-65.',
        'I modelli formali e i test automatici.',
        'L\'estensione per il browser Palacan Verifica.',
        'La documentazione tecnica: protocollo, architettura e modello delle minacce.',
      ] },
      { key: 'licence', title: 'Pubblico, ma non open source', paragraphs: [
        'Vogliamo essere precisi: il codice è pubblico perché si possa verificare, non riutilizzare. La licenza ti permette di leggerlo, compilarlo sul tuo computer, confrontarlo con il sito e farci ricerca di sicurezza. Non ti permette di copiarlo in altri prodotti né di farci girare un servizio tuo.',
      ] },
      { key: 'build', title: 'Il sito è esattamente questo codice', paragraphs: [
        'La build è riproducibile: lo stesso codice produce sempre gli stessi file, byte per byte. L\'elenco delle loro impronte è firmato con una chiave ibrida (Ed25519 + ML-DSA-65) che non è mai stata sui nostri server.',
        'Con l\'estensione Palacan Verifica il tuo browser controlla ogni file del sito, ogni volta che lo apri. Puoi fare lo stesso controllo anche a mano, e GitHub ripete la build a ogni modifica.',
      ], link: { label: 'Come verificare il sito da te', href: 'docs/VERIFICATION.md' } },
      { key: 'server', title: 'Perché il codice del server non è pubblico', paragraphs: [
        'I tuoi messaggi vengono cifrati sul tuo dispositivo, dal codice pubblico, prima di arrivare al server. Il server inoltra dati che non può leggere: per controllare che i tuoi messaggi siano protetti conta il codice che gira sul tuo dispositivo.',
        'Quello che il server può comunque vedere, e i limiti di questa protezione, sono descritti apertamente.',
      ], link: { label: 'Cosa può vedere il server', href: 'docs/ARCHITECTURE.md' } },
      { key: 'checks', title: 'Cosa può controllare chiunque', items: [
        'I messaggi si cifrano sul dispositivo, prima dell\'invio.',
        'Le chiavi private non lasciano mai il dispositivo in forma leggibile.',
        'Non c\'è nessun meccanismo nascosto che aggiri la cifratura.',
        'Nell\'app non ci sono analisi statistiche né sistemi di tracciamento di terzi.',
        'Ogni modifica del codice si può seguire nel tempo.',
      ] },
      { key: 'report', title: 'Hai trovato un problema?', paragraphs: [
        'Leggere il codice è benvenuto. Se trovi una vulnerabilità, segnalala in privato.',
      ], link: { label: 'Come segnalare una vulnerabilità', href: 'SECURITY.md' } },
    ],
    outro: 'La maggior parte dei servizi ti chiede di credere a quello che dice sulla privacy. Palacan ti dà gli strumenti per controllarlo.',
  },
  technology: {
    title: 'Un\'architettura pensata perché il server non possa leggere.',
    intro: 'Tutto ciò che protegge i tuoi messaggi avviene sul tuo dispositivo. Ecco come si incastrano le parti.',
    sections: [
      { key: 'stack', title: 'Le parti', items: [
        'L\'app gira nel tuo browser (React).',
        'La crittografia è un modulo Rust compilato in WebAssembly: vodozemac per Olm e Megolm, libcrux per ML-KEM-768 e ML-DSA-65.',
        'Il server (Python, PostgreSQL) conserva e inoltra dati cifrati in tempo reale, via WebSocket.',
        'Le chiamate usano WebRTC e passano sempre da un server di inoltro: l\'altra persona non vede mai il tuo indirizzo IP.',
      ] },
      { key: 'keys', title: 'Chiavi', paragraphs: [
        'Ogni dispositivo ha le sue chiavi, e ogni persona ha una chiave principale che firma i suoi dispositivi. Le chiavi per la cifratura post-quantum si rinnovano ogni settimana e portano una data di creazione firmata: quelle vecchie si rifiutano.',
      ] },
      { key: 'storage', title: 'I dati sul tuo dispositivo', paragraphs: [
        'Chiavi, cronologia delle chat e bozze restano sul tuo dispositivo, cifrate con una chiave che il browser crea e che nemmeno il codice dell\'app può leggere. La cronologia si cancella quando esci dall\'account.',
      ] },
      { key: 'backup', title: 'Backup cifrato delle chiavi', paragraphs: [
        'Per ritrovare le tue chat su un dispositivo nuovo puoi tenere un backup cifrato sul server. Viene cifrato nel tuo browser con una chiave ricavata dalla tua passphrase (Argon2id). La passphrase non viene mai inviata e, se la perdi, non si può recuperare.',
      ] },
      { key: 'auth', title: 'Account e accesso', paragraphs: [
        'Ti registri con un nome utente e una password: niente email e niente numero di telefono. Il server conserva solo un hash della password. Le sessioni scadono, e ogni dispositivo del tuo account è visibile e si può togliere.',
      ] },
      { key: 'server', title: 'Cosa può vedere il server', paragraphs: [
        'Il server non può leggere messaggi, reazioni, chiamate né i nomi dei gruppi privati. Per consegnare i messaggi sa comunque:',
      ], items: [
        'il tuo nome utente e i tuoi dispositivi, con le loro chiavi pubbliche;',
        'di quali chat fai parte;',
        'quando i tuoi dispositivi sono collegati;',
        'i messaggi cifrati, finché non sono consegnati o scadono.',
      ], after: 'Per le chat private non conserva chi ha mandato un messaggio, arrotonda l\'ora e nasconde la lunghezza dei messaggi.', link: { label: 'Architettura e modello delle minacce', href: 'docs/ARCHITECTURE.md' } },
      { key: 'build', title: 'Verificabile da fuori', paragraphs: [
        'Il sito si costruisce in modo riproducibile e ogni versione è firmata. Il codice che gira sul tuo dispositivo, le prove formali e la documentazione sono pubblici.',
      ], link: { label: 'Il protocollo, passo per passo', href: 'docs/PROTOCOL.md' } },
    ],
  },
  documents: {
    title: 'Documenti',
    intro: 'Tutti i documenti tecnici di Palacan, in un solo posto. Ogni PDF è generato dalla documentazione pubblica su GitHub, dove trovi sempre la versione più recente.',
    locale: 'it-IT',
    version: 'Versione del',
    featured: 'Inizia da qui',
    parts: 'Lo stesso contenuto, un documento alla volta',
    pages: 'pagine',
    english: 'in inglese',
    download: 'Scarica il PDF',
    source: 'Sorgente su GitHub',
    items: {
      whitepaper: { title: 'Whitepaper di sicurezza', description: 'La descrizione tecnica completa di Palacan: il protocollo, l\'architettura, cosa vede il server, il modello delle minacce e come verificare tutto. Contiene i tre documenti qui sotto.' },
      protocol: { title: 'Protocollo', description: 'Come vengono cifrati i messaggi e gestite le chiavi: Olm e Megolm, la busta post-quantistica, le firme ibride, la chiave principale, la consegna sigillata, le chiamate e il backup.' },
      architecture: { title: 'Architettura e modello delle minacce', description: 'I componenti, cosa gira dove, cosa il server può e non può vedere, e da cosa Palacan è pensato per proteggerti e da cosa no.' },
      verification: { title: 'Verificare Palacan', description: 'Come controllare che il sito esegua esattamente il codice pubblico, e come lanciare da te le prove formali e i test.' },
      policy: { title: 'Politica di sicurezza', description: 'Come segnalare una vulnerabilità, cosa rientra nel perimetro, le regole per i test e quali versioni sono supportate.' },
    },
    originTitle: 'Da dove vengono questi documenti',
    origin: 'La copertina di ogni PDF indica il commit del repository pubblico da cui è stato generato e i suoi file sorgente. I documenti sono solo in inglese. Se un PDF e i file su GitHub dovessero differire, fanno fede i file su GitHub.',
  },
};

const fr = {
  common: {
    docsTitle: 'Documents',
    docsSub: 'Le livre blanc sur la sécurité, le protocole, l\'architecture et comment tout vérifier : tous les PDF sont sur la page Documents. En anglais.',
    docsCta: 'Aller aux Documents',
    github: 'Voir le code sur GitHub',
    flow: {
      sender: 'Appareil de l\'expéditeur', senderLines: ['Vous écrivez le message', 'Il est chiffré avant de partir'],
      server: 'Serveur', serverLines: ['Transmet le message chiffré', 'Ne peut pas le lire : il n\'a pas les clés'],
      recipient: 'Appareil du destinataire', recipientLines: ['Il arrive toujours chiffré', 'Seul cet appareil peut le déchiffrer'],
    },
  },
  security: {
    title: 'La sécurité n\'est pas une fonction. C\'est le principe.',
    intro: 'Palacan est conçu pour que vous n\'ayez pas à nous faire confiance. La protection de vos messages dépend du fonctionnement du système, et ce fonctionnement, vous pouvez le vérifier.',
    sections: [
      { key: 'e2ee', title: 'Chiffrement de bout en bout', paragraphs: [
        'Chaque message est chiffré sur votre appareil et ne peut être déchiffré que par les appareils des personnes à qui vous écrivez. Le serveur transmet et conserve des données déjà chiffrées et n\'a jamais les clés pour les lire.',
      ] },
      { key: 'olm', title: 'Olm et Megolm, avec vodozemac', paragraphs: [
        'Nous n\'avons pas inventé notre propre cryptographie. Palacan utilise Olm pour les conversations entre appareils et Megolm pour les discussions et les groupes, via vodozemac, l\'implémentation en Rust auditée utilisée par l\'écosystème Matrix.',
        'Les clés changent en permanence : quelqu\'un qui volerait une clé aujourd\'hui ne pourrait pas lire vos messages passés. La clé d\'une discussion est remplacée après 100 messages ou 7 jours, et chaque fois qu\'un appareil quitte la discussion.',
      ] },
      { key: 'pq', title: 'Prêt pour les ordinateurs quantiques', paragraphs: [
        'Quelqu\'un pourrait enregistrer aujourd\'hui le trafic chiffré et tenter de le déchiffrer plus tard avec un ordinateur quantique. Pour l\'empêcher, chaque clé de discussion voyage dans une deuxième enveloppe, post-quantique (ML-KEM-768). Pour la lire, il faudrait casser à la fois le chiffrement classique et le chiffrement post-quantique.',
        'L\'enveloppe post-quantique est obligatoire : une clé de discussion ne part jamais sans elle. Les signatures qui protègent les clés sont hybrides (Ed25519 + ML-DSA-65) : elles ne sont valides que si les deux tiennent.',
      ] },
      { key: 'verify', title: 'Vous savez à qui vous parlez', paragraphs: [
        'Chaque personne a une clé principale qui signe ses appareils : un appareil non signé ne reçoit pas vos messages. Vous pouvez comparer un numéro de sécurité ou scanner un code QR pour être sûr que personne ne s\'est interposé.',
        'Si la clé d\'un contact que vous avez vérifié change, Palacan vous prévient et bloque les envois et les appels jusqu\'à ce que vous vérifiiez.',
      ] },
      { key: 'keys', title: 'Vos clés restent les vôtres', paragraphs: [
        'Les clés sont créées sur votre appareil et y restent, chiffrées avec une clé que même le code de l\'application ne peut pas lire. Vos clés privées n\'arrivent jamais sur le serveur sous une forme lisible.',
        'Pour passer à un nouvel appareil, vous pouvez utiliser une sauvegarde chiffrée. Elle est chiffrée dans votre navigateur avec une clé dérivée d\'une phrase secrète que vous choisissez (Argon2id). Nous ne voyons jamais la phrase secrète et ne pouvons pas la récupérer.',
      ] },
      { key: 'infra', title: 'Infrastructure', items: [
        'Chaque connexion passe par HTTPS/TLS, sans exception.',
        'Une politique de sécurité stricte : la page n\'exécute que du code de Palacan, sans scripts, polices ni traceurs de tiers.',
        'Nous ne conservons qu\'une empreinte (hash) de votre mot de passe, jamais le mot de passe.',
        'Les sessions expirent, et vous pouvez retirer un appareil de votre compte à tout moment.',
      ] },
      { key: 'proofs', title: 'Prouvé, pas seulement affirmé', paragraphs: [
        'Les propriétés principales sont prouvées avec des outils formels (ProVerif et Kani) et contrôlées par des milliers de tests automatiques à chaque modification, y compris avec de vrais navigateurs. Chaque garantie est listée avec sa preuve et ses limites.',
      ], link: { label: 'Preuves formelles et registre des garanties', href: 'formale/README.md' } },
      { key: 'limits', title: 'Ce que nous ne promettons pas', paragraphs: [
        'Aucun système ne protège contre tout, et nous préférons le dire clairement :',
      ], items: [
        'Pour livrer les messages, le serveur a besoin de certaines métadonnées, par exemple qui fait partie de quelle discussion et quand un appareil est connecté.',
        'Les clés sont considérées comme fiables la première fois qu\'on les voit. Pour en être certain, comparez le numéro de sécurité.',
        'Dans le navigateur, l\'application est envoyée par le serveur à chaque ouverture. L\'extension Palacan Verifica vérifie qu\'il s\'agit exactement du code publié et signé.',
        'Un logiciel malveillant sur un ordinateur déverrouillé peut voir ce que vous voyez.',
      ], link: { label: 'Toutes les limites, en détail', href: 'docs/ARCHITECTURE.md' } },
      { key: 'report', title: 'Vous avez trouvé un problème ?', paragraphs: [
        'Si vous trouvez une vulnérabilité, signalez-la en privé. Nous répondons à chaque signalement, et la recherche menée de bonne foi est la bienvenue.',
      ], link: { label: 'Comment signaler une vulnérabilité', href: 'SECURITY.md' } },
    ],
    company: {
      title: 'Entreprises : administrer n\'est pas lire',
      paragraphs: [
        'Si vous utilisez Palacan à titre personnel, personne n\'administre votre compte. Dans un espace d\'entreprise il y a un administrateur, mais administrer et lire sont séparés par conception, pas par promesse.',
      ],
      canTitle: 'Un administrateur peut', can: ['Créer et gérer les comptes des employés', 'Attribuer des rôles', 'Gérer l\'espace d\'entreprise et ses tâches'],
      cannotTitle: 'Un administrateur ne peut pas', cannot: ['Lire les conversations', 'Voir qui a envoyé un message', 'Récupérer les clés ou phrases secrètes des utilisateurs'],
      after: 'Les clés ne sont pas sur le serveur : un administrateur n\'a donc aucun moyen d\'ouvrir une conversation, même s\'il le voulait.',
    },
  },
  openSource: {
    title: 'Public pour être vérifié, pas pour être cru.',
    intro: 'Le code qui tourne sur votre appareil est public sur GitHub : l\'application, le module cryptographique, les preuves formelles et la documentation. Tout le monde peut le lire, le compiler et vérifier que le site exécute exactement ce code.',
    sections: [
      { key: 'what', title: 'Ce qui est public', items: [
        'L\'application web : là où les clés sont créées, où les messages sont chiffrés avant de partir et déchiffrés à l\'arrivée.',
        'Le module cryptographique (Rust) : vodozemac, ML-KEM-768 et ML-DSA-65.',
        'Les modèles formels et les tests automatiques.',
        'L\'extension de navigateur Palacan Verifica.',
        'La documentation technique : protocole, architecture et modèle de menaces.',
      ] },
      { key: 'licence', title: 'Public, mais pas open source', paragraphs: [
        'Nous voulons être précis : le code est public pour être vérifié, pas réutilisé. La licence vous permet de le lire, de le compiler sur votre ordinateur, de le comparer au site et d\'y faire de la recherche en sécurité. Elle ne vous permet pas de le copier dans d\'autres produits ni de faire tourner votre propre service avec.',
      ] },
      { key: 'build', title: 'Le site est exactement ce code', paragraphs: [
        'La compilation est reproductible : le même code produit toujours les mêmes fichiers, octet par octet. La liste de leurs empreintes est signée avec une clé hybride (Ed25519 + ML-DSA-65) qui n\'a jamais été sur nos serveurs.',
        'Avec l\'extension Palacan Verifica, votre navigateur vérifie chaque fichier du site, à chaque ouverture. Vous pouvez aussi faire la même vérification à la main, et GitHub refait la compilation à chaque modification.',
      ], link: { label: 'Comment vérifier le site vous-même', href: 'docs/VERIFICATION.md' } },
      { key: 'server', title: 'Pourquoi le code du serveur n\'est pas public', paragraphs: [
        'Vos messages sont chiffrés sur votre appareil, par le code public, avant d\'arriver au serveur. Le serveur transmet des données qu\'il ne peut pas lire : pour vérifier que vos messages sont protégés, c\'est le code de votre appareil qui compte.',
        'Ce que le serveur peut tout de même voir, et les limites de cette protection, sont décrits ouvertement.',
      ], link: { label: 'Ce que le serveur peut voir', href: 'docs/ARCHITECTURE.md' } },
      { key: 'checks', title: 'Ce que tout le monde peut vérifier', items: [
        'Les messages sont chiffrés sur l\'appareil, avant l\'envoi.',
        'Les clés privées ne quittent jamais l\'appareil sous une forme lisible.',
        'Il n\'existe aucun mécanisme caché qui contourne le chiffrement.',
        'L\'application ne contient ni outils d\'analyse ni traceurs de tiers.',
        'Chaque modification du code peut être suivie dans le temps.',
      ] },
      { key: 'report', title: 'Vous avez trouvé un problème ?', paragraphs: [
        'Lire le code est le bienvenu. Si vous trouvez une vulnérabilité, signalez-la en privé.',
      ], link: { label: 'Comment signaler une vulnérabilité', href: 'SECURITY.md' } },
    ],
    outro: 'La plupart des services vous demandent de croire ce qu\'ils disent sur la confidentialité. Palacan vous donne les outils pour le vérifier.',
  },
  technology: {
    title: 'Une architecture conçue pour que le serveur ne puisse pas lire.',
    intro: 'Tout ce qui protège vos messages se passe sur votre appareil. Voici comment les éléments s\'articulent.',
    sections: [
      { key: 'stack', title: 'Les composants', items: [
        'L\'application tourne dans votre navigateur (React).',
        'La cryptographie est un module Rust compilé en WebAssembly : vodozemac pour Olm et Megolm, libcrux pour ML-KEM-768 et ML-DSA-65.',
        'Le serveur (Python, PostgreSQL) conserve et transmet des données chiffrées en temps réel, via WebSocket.',
        'Les appels utilisent WebRTC et passent toujours par un relais : l\'autre personne ne voit jamais votre adresse IP.',
      ] },
      { key: 'keys', title: 'Clés', paragraphs: [
        'Chaque appareil a ses propres clés, et chaque personne a une clé principale qui signe ses appareils. Les clés de chiffrement post-quantique sont renouvelées chaque semaine et portent une date de création signée : les anciennes sont refusées.',
      ] },
      { key: 'storage', title: 'Les données sur votre appareil', paragraphs: [
        'Les clés, l\'historique des discussions et les brouillons restent sur votre appareil, chiffrés avec une clé que le navigateur crée et que même le code de l\'application ne peut pas lire. L\'historique est effacé quand vous vous déconnectez.',
      ] },
      { key: 'backup', title: 'Sauvegarde chiffrée des clés', paragraphs: [
        'Pour retrouver vos discussions sur un nouvel appareil, vous pouvez garder une sauvegarde chiffrée sur le serveur. Elle est chiffrée dans votre navigateur avec une clé dérivée de votre phrase secrète (Argon2id). La phrase secrète n\'est jamais envoyée et ne peut pas être récupérée si vous la perdez.',
      ] },
      { key: 'auth', title: 'Compte et connexion', paragraphs: [
        'Vous vous inscrivez avec un nom d\'utilisateur et un mot de passe : ni e-mail ni numéro de téléphone. Le serveur ne conserve qu\'une empreinte du mot de passe. Les sessions expirent, et chaque appareil de votre compte est visible et peut être retiré.',
      ] },
      { key: 'server', title: 'Ce que le serveur peut voir', paragraphs: [
        'Le serveur ne peut lire ni les messages, ni les réactions, ni les appels, ni les noms des groupes privés. Pour livrer les messages, il connaît tout de même :',
      ], items: [
        'votre nom d\'utilisateur et vos appareils, avec leurs clés publiques ;',
        'les discussions dont vous faites partie ;',
        'les moments où vos appareils sont connectés ;',
        'les messages chiffrés, jusqu\'à leur livraison ou leur expiration.',
      ], after: 'Pour les discussions privées, il ne conserve pas l\'expéditeur d\'un message, arrondit l\'heure et masque la longueur des messages.', link: { label: 'Architecture et modèle de menaces', href: 'docs/ARCHITECTURE.md' } },
      { key: 'build', title: 'Vérifiable de l\'extérieur', paragraphs: [
        'Le site est compilé de façon reproductible et chaque version est signée. Le code qui tourne sur votre appareil, les preuves formelles et la documentation sont publics.',
      ], link: { label: 'Le protocole, étape par étape', href: 'docs/PROTOCOL.md' } },
    ],
  },
  documents: {
    title: 'Documents',
    intro: 'Tous les documents techniques de Palacan, au même endroit. Chaque PDF est généré à partir de la documentation publique sur GitHub, où vous trouvez toujours la version la plus récente.',
    locale: 'fr-FR',
    version: 'Version du',
    featured: 'Commencez ici',
    parts: 'Le même contenu, un document à la fois',
    pages: 'pages',
    english: 'en anglais',
    download: 'Télécharger le PDF',
    source: 'Source sur GitHub',
    items: {
      whitepaper: { title: 'Livre blanc sur la sécurité', description: 'La description technique complète de Palacan : le protocole, l\'architecture, ce que le serveur peut voir, le modèle de menaces et comment tout vérifier. Il contient les trois documents ci-dessous.' },
      protocol: { title: 'Protocole', description: 'Comment les messages sont chiffrés et les clés gérées : Olm et Megolm, l\'enveloppe post-quantique, les signatures hybrides, la clé principale, la livraison scellée, les appels et la sauvegarde.' },
      architecture: { title: 'Architecture et modèle de menaces', description: 'Les composants, ce qui s\'exécute où, ce que le serveur peut et ne peut pas voir, et ce contre quoi Palacan est conçu pour protéger, ou non.' },
      verification: { title: 'Vérifier Palacan', description: 'Comment vérifier que le site exécute exactement le code public, et comment lancer vous-même les preuves formelles et les tests.' },
      policy: { title: 'Politique de sécurité', description: 'Comment signaler une vulnérabilité, ce qui entre dans le périmètre, les règles pour les tests et les versions prises en charge.' },
    },
    originTitle: 'D\'où viennent ces documents',
    origin: 'La couverture de chaque PDF indique le commit du dépôt public à partir duquel il a été généré et ses fichiers sources. Les documents sont uniquement en anglais. Si un PDF et les fichiers sur GitHub diffèrent, ce sont les fichiers sur GitHub qui font foi.',
  },
};

const es = {
  common: {
    docsTitle: 'Documentos',
    docsSub: 'El whitepaper de seguridad, el protocolo, la arquitectura y cómo verificarlo todo: todos los PDF están en la página Documentos. En inglés.',
    docsCta: 'Ir a Documentos',
    github: 'Ver el código en GitHub',
    flow: {
      sender: 'Dispositivo de quien escribe', senderLines: ['Escribes el mensaje', 'Se cifra antes de salir'],
      server: 'Servidor', serverLines: ['Reenvía el mensaje cifrado', 'No puede leerlo: no tiene las claves'],
      recipient: 'Dispositivo de quien recibe', recipientLines: ['Llega todavía cifrado', 'Solo este dispositivo puede descifrarlo'],
    },
  },
  security: {
    title: 'La seguridad no es una función. Es el principio.',
    intro: 'Palacan está construido para que no tengas que confiar en nosotros. La protección de tus mensajes depende de cómo funciona el sistema, y cómo funciona lo puedes comprobar.',
    sections: [
      { key: 'e2ee', title: 'Cifrado de extremo a extremo', paragraphs: [
        'Cada mensaje se cifra en tu dispositivo y solo pueden descifrarlo los dispositivos de las personas a las que escribes. El servidor reenvía y guarda datos ya cifrados, y nunca tiene las claves para leerlos.',
      ] },
      { key: 'olm', title: 'Olm y Megolm, con vodozemac', paragraphs: [
        'No hemos inventado una criptografía propia. Palacan usa Olm para las conversaciones entre dispositivos y Megolm para los chats y los grupos, mediante vodozemac, la implementación en Rust auditada que usa el ecosistema Matrix.',
        'Las claves cambian continuamente: quien robara una clave hoy no podría leer tus mensajes anteriores. La clave de un chat se sustituye tras 100 mensajes o 7 días, y cada vez que un dispositivo sale del chat.',
      ] },
      { key: 'pq', title: 'Preparado para los ordenadores cuánticos', paragraphs: [
        'Alguien podría grabar hoy el tráfico cifrado e intentar descifrarlo en el futuro con un ordenador cuántico. Para impedirlo, cada clave de chat viaja dentro de un segundo sobre, poscuántico (ML-KEM-768). Para leerla habría que romper tanto el cifrado clásico como el poscuántico.',
        'El sobre poscuántico es obligatorio: una clave de chat nunca sale sin él. Las firmas que protegen las claves son híbridas (Ed25519 + ML-DSA-65): solo son válidas si se sostienen las dos.',
      ] },
      { key: 'verify', title: 'Sabes con quién hablas', paragraphs: [
        'Cada persona tiene una clave principal que firma sus dispositivos: un dispositivo no firmado no recibe tus mensajes. Puedes comparar un número de seguridad o escanear un código QR para estar seguro de que nadie se ha puesto en medio.',
        'Si cambia la clave de un contacto que has verificado, Palacan te avisa y bloquea los envíos y las llamadas hasta que lo compruebes.',
      ] },
      { key: 'keys', title: 'Tus claves siguen siendo tuyas', paragraphs: [
        'Las claves se crean en tu dispositivo y se quedan allí, cifradas con una clave que ni siquiera el código de la aplicación puede leer. Tus claves privadas nunca llegan al servidor de forma legible.',
        'Para pasar a un dispositivo nuevo puedes usar una copia de seguridad cifrada. Se cifra en tu navegador con una clave derivada de una frase de contraseña que eliges tú (Argon2id). Nunca vemos la frase de contraseña y no podemos recuperarla.',
      ] },
      { key: 'infra', title: 'Infraestructura', items: [
        'Cada conexión pasa por HTTPS/TLS, sin excepciones.',
        'Una política de seguridad estricta: la página solo ejecuta código de Palacan, sin scripts, fuentes ni rastreadores de terceros.',
        'De tu contraseña solo guardamos un hash, nunca la contraseña.',
        'Las sesiones caducan, y puedes quitar un dispositivo de tu cuenta en cualquier momento.',
      ] },
      { key: 'proofs', title: 'Demostrado, no solo declarado', paragraphs: [
        'Las propiedades principales están demostradas con herramientas formales (ProVerif y Kani) y comprobadas por miles de pruebas automáticas en cada cambio, también con navegadores reales. Cada garantía aparece con su prueba y sus límites.',
      ], link: { label: 'Pruebas formales y registro de garantías', href: 'formale/README.md' } },
      { key: 'limits', title: 'Lo que no prometemos', paragraphs: [
        'Ningún sistema protege contra todo, y preferimos decirlo claramente:',
      ], items: [
        'Para entregar los mensajes, el servidor necesita algunos metadatos, por ejemplo quién forma parte de qué chat y cuándo está conectado un dispositivo.',
        'Las claves se consideran fiables la primera vez que se ven. Para estar seguro, compara el número de seguridad.',
        'En el navegador, la aplicación llega desde el servidor cada vez que la abres. La extensión Palacan Verifica comprueba que sea exactamente el código publicado y firmado.',
        'Un programa malicioso en un ordenador desbloqueado puede ver lo que ves tú.',
      ], link: { label: 'Todos los límites, en detalle', href: 'docs/ARCHITECTURE.md' } },
      { key: 'report', title: '¿Has encontrado un problema?', paragraphs: [
        'Si encuentras una vulnerabilidad, comunícala en privado. Respondemos a cada informe, y la investigación hecha de buena fe es bienvenida.',
      ], link: { label: 'Cómo informar de una vulnerabilidad', href: 'SECURITY.md' } },
    ],
    company: {
      title: 'Empresas: administrar no es leer',
      paragraphs: [
        'Si usas Palacan a título personal, nadie administra tu cuenta. En un espacio de empresa hay un administrador, pero administrar y leer están separados por diseño, no por promesa.',
      ],
      canTitle: 'Un administrador puede', can: ['Crear y gestionar las cuentas de los empleados', 'Asignar roles', 'Gestionar el espacio de empresa y sus tareas'],
      cannotTitle: 'Un administrador no puede', cannot: ['Leer las conversaciones', 'Ver quién ha enviado un mensaje', 'Recuperar las claves o frases de contraseña de los usuarios'],
      after: 'Las claves no están en el servidor, así que un administrador no tiene forma de abrir una conversación, aunque quisiera.',
    },
  },
  openSource: {
    title: 'Público para ser verificado, no para ser creído.',
    intro: 'El código que se ejecuta en tu dispositivo es público en GitHub: la aplicación, el módulo criptográfico, las pruebas formales y la documentación. Cualquiera puede leerlo, compilarlo y comprobar que el sitio ejecuta exactamente ese código.',
    sections: [
      { key: 'what', title: 'Qué es público', items: [
        'La aplicación web: donde se crean las claves, y donde los mensajes se cifran antes de salir y se descifran al llegar.',
        'El módulo criptográfico (Rust): vodozemac, ML-KEM-768 y ML-DSA-65.',
        'Los modelos formales y las pruebas automáticas.',
        'La extensión de navegador Palacan Verifica.',
        'La documentación técnica: protocolo, arquitectura y modelo de amenazas.',
      ] },
      { key: 'licence', title: 'Público, pero no de código abierto', paragraphs: [
        'Queremos ser precisos: el código es público para que se pueda verificar, no reutilizar. La licencia te permite leerlo, compilarlo en tu ordenador, compararlo con el sitio e investigar su seguridad. No te permite copiarlo en otros productos ni ejecutar tu propio servicio con él.',
      ] },
      { key: 'build', title: 'El sitio es exactamente este código', paragraphs: [
        'La compilación es reproducible: el mismo código produce siempre los mismos archivos, byte a byte. La lista de sus huellas está firmada con una clave híbrida (Ed25519 + ML-DSA-65) que nunca ha estado en nuestros servidores.',
        'Con la extensión Palacan Verifica, tu navegador comprueba cada archivo del sitio cada vez que lo abres. También puedes hacer la misma comprobación a mano, y GitHub repite la compilación en cada cambio.',
      ], link: { label: 'Cómo verificar el sitio tú mismo', href: 'docs/VERIFICATION.md' } },
      { key: 'server', title: 'Por qué el código del servidor no es público', paragraphs: [
        'Tus mensajes se cifran en tu dispositivo, con el código público, antes de llegar al servidor. El servidor reenvía datos que no puede leer: para comprobar que tus mensajes están protegidos, lo que cuenta es el código de tu dispositivo.',
        'Lo que el servidor sí puede ver, y los límites de esta protección, están descritos abiertamente.',
      ], link: { label: 'Qué puede ver el servidor', href: 'docs/ARCHITECTURE.md' } },
      { key: 'checks', title: 'Lo que cualquiera puede comprobar', items: [
        'Los mensajes se cifran en el dispositivo, antes del envío.',
        'Las claves privadas nunca salen del dispositivo de forma legible.',
        'No hay ningún mecanismo oculto que eluda el cifrado.',
        'En la aplicación no hay herramientas de analítica ni rastreadores de terceros.',
        'Cada cambio del código se puede seguir en el tiempo.',
      ] },
      { key: 'report', title: '¿Has encontrado un problema?', paragraphs: [
        'Leer el código es bienvenido. Si encuentras una vulnerabilidad, comunícala en privado.',
      ], link: { label: 'Cómo informar de una vulnerabilidad', href: 'SECURITY.md' } },
    ],
    outro: 'La mayoría de los servicios te piden que creas lo que dicen sobre la privacidad. Palacan te da las herramientas para comprobarlo.',
  },
  technology: {
    title: 'Una arquitectura pensada para que el servidor no pueda leer.',
    intro: 'Todo lo que protege tus mensajes ocurre en tu dispositivo. Así encajan las piezas.',
    sections: [
      { key: 'stack', title: 'Los componentes', items: [
        'La aplicación se ejecuta en tu navegador (React).',
        'La criptografía es un módulo Rust compilado a WebAssembly: vodozemac para Olm y Megolm, libcrux para ML-KEM-768 y ML-DSA-65.',
        'El servidor (Python, PostgreSQL) guarda y reenvía datos cifrados en tiempo real, mediante WebSocket.',
        'Las llamadas usan WebRTC y siempre pasan por un servidor de retransmisión: la otra persona nunca ve tu dirección IP.',
      ] },
      { key: 'keys', title: 'Claves', paragraphs: [
        'Cada dispositivo tiene sus propias claves, y cada persona tiene una clave principal que firma sus dispositivos. Las claves para el cifrado poscuántico se renuevan cada semana y llevan una fecha de creación firmada: las antiguas se rechazan.',
      ] },
      { key: 'storage', title: 'Los datos en tu dispositivo', paragraphs: [
        'Las claves, el historial de los chats y los borradores se quedan en tu dispositivo, cifrados con una clave que crea el navegador y que ni siquiera el código de la aplicación puede leer. El historial se borra al cerrar la sesión.',
      ] },
      { key: 'backup', title: 'Copia de seguridad cifrada de las claves', paragraphs: [
        'Para recuperar tus chats en un dispositivo nuevo puedes guardar una copia de seguridad cifrada en el servidor. Se cifra en tu navegador con una clave derivada de tu frase de contraseña (Argon2id). La frase de contraseña nunca se envía y, si la pierdes, no se puede recuperar.',
      ] },
      { key: 'auth', title: 'Cuenta y acceso', paragraphs: [
        'Te registras con un nombre de usuario y una contraseña: sin correo electrónico y sin número de teléfono. El servidor solo guarda un hash de la contraseña. Las sesiones caducan, y cada dispositivo de tu cuenta es visible y se puede quitar.',
      ] },
      { key: 'server', title: 'Qué puede ver el servidor', paragraphs: [
        'El servidor no puede leer mensajes, reacciones, llamadas ni los nombres de los grupos privados. Para entregar los mensajes, aun así conoce:',
      ], items: [
        'tu nombre de usuario y tus dispositivos, con sus claves públicas;',
        'de qué chats formas parte;',
        'cuándo están conectados tus dispositivos;',
        'los mensajes cifrados, hasta que se entregan o caducan.',
      ], after: 'En los chats privados no guarda quién ha enviado un mensaje, redondea la hora y oculta la longitud de los mensajes.', link: { label: 'Arquitectura y modelo de amenazas', href: 'docs/ARCHITECTURE.md' } },
      { key: 'build', title: 'Verificable desde fuera', paragraphs: [
        'El sitio se compila de forma reproducible y cada versión está firmada. El código que se ejecuta en tu dispositivo, las pruebas formales y la documentación son públicos.',
      ], link: { label: 'El protocolo, paso a paso', href: 'docs/PROTOCOL.md' } },
    ],
  },
  documents: {
    title: 'Documentos',
    intro: 'Todos los documentos técnicos de Palacan, en un solo lugar. Cada PDF se genera a partir de la documentación pública en GitHub, donde siempre encuentras la versión más reciente.',
    locale: 'es-ES',
    version: 'Versión del',
    featured: 'Empieza aquí',
    parts: 'El mismo contenido, un documento cada vez',
    pages: 'páginas',
    english: 'en inglés',
    download: 'Descargar el PDF',
    source: 'Fuente en GitHub',
    items: {
      whitepaper: { title: 'Whitepaper de seguridad', description: 'La descripción técnica completa de Palacan: el protocolo, la arquitectura, lo que puede ver el servidor, el modelo de amenazas y cómo verificarlo todo. Contiene los tres documentos de abajo.' },
      protocol: { title: 'Protocolo', description: 'Cómo se cifran los mensajes y se gestionan las claves: Olm y Megolm, el sobre poscuántico, las firmas híbridas, la clave principal, la entrega sellada, las llamadas y la copia de seguridad.' },
      architecture: { title: 'Arquitectura y modelo de amenazas', description: 'Los componentes, qué se ejecuta dónde, qué puede y qué no puede ver el servidor, y de qué está pensado Palacan para protegerte y de qué no.' },
      verification: { title: 'Verificar Palacan', description: 'Cómo comprobar que el sitio ejecuta exactamente el código público, y cómo lanzar tú mismo las pruebas formales y los tests.' },
      policy: { title: 'Política de seguridad', description: 'Cómo informar de una vulnerabilidad, qué entra en el alcance, las reglas para las pruebas y qué versiones tienen soporte.' },
    },
    originTitle: 'De dónde vienen estos documentos',
    origin: 'La portada de cada PDF indica el commit del repositorio público del que se generó y sus archivos fuente. Los documentos están solo en inglés. Si un PDF y los archivos de GitHub llegaran a diferir, los archivos de GitHub son la referencia.',
  },
};

const de = {
  common: {
    docsTitle: 'Dokumente',
    docsSub: 'Das Sicherheits-Whitepaper, das Protokoll, die Architektur und wie du alles prüfst: Alle PDFs findest du auf der Seite Dokumente. Auf Englisch.',
    docsCta: 'Zu den Dokumenten',
    github: 'Zum Code auf GitHub',
    flow: {
      sender: 'Gerät des Absenders', senderLines: ['Du schreibst die Nachricht', 'Sie wird verschlüsselt, bevor sie losgeht'],
      server: 'Server', serverLines: ['Leitet die verschlüsselte Nachricht weiter', 'Kann sie nicht lesen: Er hat die Schlüssel nicht'],
      recipient: 'Gerät des Empfängers', recipientLines: ['Sie kommt noch verschlüsselt an', 'Nur dieses Gerät kann sie entschlüsseln'],
    },
  },
  security: {
    title: 'Sicherheit ist keine Funktion. Sie ist das Prinzip.',
    intro: 'Palacan ist so gebaut, dass du uns nicht vertrauen musst. Der Schutz deiner Nachrichten hängt davon ab, wie das System funktioniert, und wie es funktioniert, kannst du prüfen.',
    sections: [
      { key: 'e2ee', title: 'Ende-zu-Ende-Verschlüsselung', paragraphs: [
        'Jede Nachricht wird auf deinem Gerät verschlüsselt und kann nur von den Geräten der Menschen entschlüsselt werden, denen du schreibst. Der Server leitet bereits verschlüsselte Daten weiter und speichert sie, hat aber nie die Schlüssel, um sie zu lesen.',
      ] },
      { key: 'olm', title: 'Olm und Megolm, mit vodozemac', paragraphs: [
        'Wir haben keine eigene Kryptografie erfunden. Palacan nutzt Olm für Gespräche zwischen Geräten und Megolm für Chats und Gruppen, über vodozemac, die geprüfte Rust-Implementierung, die auch im Matrix-Ökosystem verwendet wird.',
        'Die Schlüssel wechseln ständig: Wer heute einen Schlüssel stiehlt, kann deine früheren Nachrichten nicht lesen. Der Schlüssel eines Chats wird nach 100 Nachrichten oder 7 Tagen ersetzt und jedes Mal, wenn ein Gerät den Chat verlässt.',
      ] },
      { key: 'pq', title: 'Bereit für Quantencomputer', paragraphs: [
        'Jemand könnte heute verschlüsselten Datenverkehr aufzeichnen und ihn später mit einem Quantencomputer zu entschlüsseln versuchen. Um das zu verhindern, reist jeder Chat-Schlüssel in einem zweiten, Post-Quanten-Umschlag (ML-KEM-768). Um ihn zu lesen, müsste man sowohl die klassische als auch die Post-Quanten-Verschlüsselung brechen.',
        'Der Post-Quanten-Umschlag ist Pflicht: Ein Chat-Schlüssel wird nie ohne ihn verschickt. Die Signaturen, die die Schlüssel schützen, sind hybrid (Ed25519 + ML-DSA-65): Sie gelten nur, wenn beide halten.',
      ] },
      { key: 'verify', title: 'Du weißt, mit wem du sprichst', paragraphs: [
        'Jede Person hat einen Hauptschlüssel, der ihre Geräte signiert: Ein nicht signiertes Gerät erhält deine Nachrichten nicht. Du kannst eine Sicherheitsnummer vergleichen oder einen QR-Code scannen, um sicher zu sein, dass sich niemand dazwischengeschaltet hat.',
        'Ändert sich der Schlüssel eines Kontakts, den du verifiziert hast, warnt dich Palacan und sperrt Nachrichten und Anrufe, bis du es geprüft hast.',
      ] },
      { key: 'keys', title: 'Deine Schlüssel bleiben deine', paragraphs: [
        'Die Schlüssel entstehen auf deinem Gerät und bleiben dort, verschlüsselt mit einem Schlüssel, den nicht einmal der Code der App lesen kann. Deine privaten Schlüssel erreichen den Server nie in lesbarer Form.',
        'Für den Wechsel auf ein neues Gerät kannst du ein verschlüsseltes Backup nutzen. Es wird in deinem Browser mit einem Schlüssel verschlüsselt, der aus einer selbst gewählten Passphrase abgeleitet wird (Argon2id). Wir sehen die Passphrase nie und können sie nicht wiederherstellen.',
      ] },
      { key: 'infra', title: 'Infrastruktur', items: [
        'Jede Verbindung läuft über HTTPS/TLS, ohne Ausnahme.',
        'Eine strenge Sicherheitsrichtlinie: Die Seite führt nur Code von Palacan selbst aus, ohne Skripte, Schriften oder Tracker von Dritten.',
        'Von deinem Passwort speichern wir nur einen Hash, nie das Passwort selbst.',
        'Sitzungen laufen ab, und du kannst jederzeit ein Gerät aus deinem Konto entfernen.',
      ] },
      { key: 'proofs', title: 'Bewiesen, nicht nur behauptet', paragraphs: [
        'Die wichtigsten Eigenschaften sind mit formalen Werkzeugen bewiesen (ProVerif und Kani) und werden bei jeder Änderung von Tausenden automatischer Tests geprüft, auch mit echten Browsern. Jede Garantie ist mit ihrem Beweis und ihren Grenzen aufgeführt.',
      ], link: { label: 'Formale Beweise und Verzeichnis der Garantien', href: 'formale/README.md' } },
      { key: 'limits', title: 'Was wir nicht versprechen', paragraphs: [
        'Kein System schützt vor allem, und wir sagen das lieber klar:',
      ], items: [
        'Um Nachrichten zuzustellen, braucht der Server einige Metadaten, zum Beispiel, wer zu welchem Chat gehört und wann ein Gerät verbunden ist.',
        'Schlüssel gelten beim ersten Sehen als vertrauenswürdig. Um sicher zu sein, vergleiche die Sicherheitsnummer.',
        'Im Browser kommt die App bei jedem Öffnen vom Server. Die Erweiterung Palacan Verifica prüft, dass es genau der veröffentlichte und signierte Code ist.',
        'Schadsoftware auf einem entsperrten Computer kann sehen, was du siehst.',
      ], link: { label: 'Alle Grenzen im Detail', href: 'docs/ARCHITECTURE.md' } },
      { key: 'report', title: 'Ein Problem gefunden?', paragraphs: [
        'Wenn du eine Schwachstelle findest, melde sie bitte vertraulich. Wir beantworten jede Meldung, und Forschung in gutem Glauben ist willkommen.',
      ], link: { label: 'Wie man eine Schwachstelle meldet', href: 'SECURITY.md' } },
    ],
    company: {
      title: 'Unternehmen: Verwalten heißt nicht Lesen',
      paragraphs: [
        'Wenn du Palacan privat nutzt, verwaltet niemand dein Konto. In einem Unternehmensbereich gibt es einen Administrator, aber Verwalten und Lesen sind durch das Design getrennt, nicht durch ein Versprechen.',
      ],
      canTitle: 'Ein Administrator kann', can: ['Konten der Mitarbeitenden anlegen und verwalten', 'Rollen vergeben', 'Den Unternehmensbereich und seine Aufgaben verwalten'],
      cannotTitle: 'Ein Administrator kann nicht', cannot: ['Gespräche lesen', 'Sehen, wer eine Nachricht geschickt hat', 'Schlüssel oder Passphrasen der Nutzer wiederherstellen'],
      after: 'Die Schlüssel liegen nicht auf dem Server, deshalb kann ein Administrator ein Gespräch nicht öffnen, selbst wenn er wollte.',
    },
  },
  openSource: {
    title: 'Öffentlich, um geprüft zu werden, nicht um geglaubt zu werden.',
    intro: 'Der Code, der auf deinem Gerät läuft, ist auf GitHub öffentlich: die App, das Kryptografie-Modul, die formalen Beweise und die Dokumentation. Jeder kann ihn lesen, selbst bauen und prüfen, dass die Website genau diesen Code ausführt.',
    sections: [
      { key: 'what', title: 'Was öffentlich ist', items: [
        'Die Web-App: Hier entstehen die Schlüssel, hier werden Nachrichten vor dem Versand verschlüsselt und bei der Ankunft entschlüsselt.',
        'Das Kryptografie-Modul (Rust): vodozemac, ML-KEM-768 und ML-DSA-65.',
        'Die formalen Modelle und die automatischen Tests.',
        'Die Browser-Erweiterung Palacan Verifica.',
        'Die technische Dokumentation: Protokoll, Architektur und Bedrohungsmodell.',
      ] },
      { key: 'licence', title: 'Öffentlich, aber nicht Open Source', paragraphs: [
        'Wir wollen genau sein: Der Code ist öffentlich, damit man ihn prüfen kann, nicht damit man ihn wiederverwendet. Die Lizenz erlaubt dir, ihn zu lesen, auf deinem Computer zu bauen, mit der Website zu vergleichen und Sicherheitsforschung damit zu betreiben. Sie erlaubt nicht, ihn in andere Produkte zu kopieren oder einen eigenen Dienst damit zu betreiben.',
      ] },
      { key: 'build', title: 'Die Website ist genau dieser Code', paragraphs: [
        'Der Build ist reproduzierbar: Derselbe Code ergibt immer dieselben Dateien, Byte für Byte. Die Liste ihrer Fingerabdrücke ist mit einem hybriden Schlüssel (Ed25519 + ML-DSA-65) signiert, der nie auf unseren Servern war.',
        'Mit der Erweiterung Palacan Verifica prüft dein Browser jede Datei der Website, jedes Mal, wenn du sie öffnest. Du kannst dieselbe Prüfung auch von Hand machen, und GitHub wiederholt den Build bei jeder Änderung.',
      ], link: { label: 'Wie du die Website selbst prüfst', href: 'docs/VERIFICATION.md' } },
      { key: 'server', title: 'Warum der Server-Code nicht öffentlich ist', paragraphs: [
        'Deine Nachrichten werden auf deinem Gerät verschlüsselt, vom öffentlichen Code, bevor sie den Server erreichen. Der Server leitet Daten weiter, die er nicht lesen kann: Um zu prüfen, ob deine Nachrichten geschützt sind, zählt der Code auf deinem Gerät.',
        'Was der Server trotzdem sehen kann und wo dieser Schutz endet, ist offen beschrieben.',
      ], link: { label: 'Was der Server sehen kann', href: 'docs/ARCHITECTURE.md' } },
      { key: 'checks', title: 'Was jeder prüfen kann', items: [
        'Nachrichten werden auf dem Gerät verschlüsselt, vor dem Versand.',
        'Private Schlüssel verlassen das Gerät nie in lesbarer Form.',
        'Es gibt keinen versteckten Mechanismus, der die Verschlüsselung umgeht.',
        'In der App gibt es keine Analyse-Werkzeuge oder Tracker von Dritten.',
        'Jede Änderung am Code lässt sich über die Zeit verfolgen.',
      ] },
      { key: 'report', title: 'Ein Problem gefunden?', paragraphs: [
        'Den Code zu lesen ist willkommen. Wenn du eine Schwachstelle findest, melde sie bitte vertraulich.',
      ], link: { label: 'Wie man eine Schwachstelle meldet', href: 'SECURITY.md' } },
    ],
    outro: 'Die meisten Dienste verlangen, dass du ihnen beim Datenschutz glaubst. Palacan gibt dir die Werkzeuge, es zu prüfen.',
  },
  technology: {
    title: 'Eine Architektur, die so gebaut ist, dass der Server nicht lesen kann.',
    intro: 'Alles, was deine Nachrichten schützt, geschieht auf deinem Gerät. So greifen die Teile ineinander.',
    sections: [
      { key: 'stack', title: 'Die Bestandteile', items: [
        'Die App läuft in deinem Browser (React).',
        'Die Kryptografie ist ein Rust-Modul, kompiliert zu WebAssembly: vodozemac für Olm und Megolm, libcrux für ML-KEM-768 und ML-DSA-65.',
        'Der Server (Python, PostgreSQL) speichert verschlüsselte Daten und leitet sie in Echtzeit über WebSocket weiter.',
        'Anrufe nutzen WebRTC und laufen immer über einen Relay-Server: Die andere Person sieht nie deine IP-Adresse.',
      ] },
      { key: 'keys', title: 'Schlüssel', paragraphs: [
        'Jedes Gerät hat eigene Schlüssel, und jede Person hat einen Hauptschlüssel, der ihre Geräte signiert. Die Schlüssel für die Post-Quanten-Verschlüsselung werden jede Woche erneuert und tragen ein signiertes Erstellungsdatum: Alte werden abgelehnt.',
      ] },
      { key: 'storage', title: 'Die Daten auf deinem Gerät', paragraphs: [
        'Schlüssel, Chatverlauf und Entwürfe bleiben auf deinem Gerät, verschlüsselt mit einem Schlüssel, den der Browser erzeugt und den nicht einmal der Code der App lesen kann. Der Verlauf wird beim Abmelden gelöscht.',
      ] },
      { key: 'backup', title: 'Verschlüsseltes Schlüssel-Backup', paragraphs: [
        'Um deine Chats auf einem neuen Gerät wiederherzustellen, kannst du ein verschlüsseltes Backup auf dem Server ablegen. Es wird in deinem Browser mit einem aus deiner Passphrase abgeleiteten Schlüssel verschlüsselt (Argon2id). Die Passphrase wird nie übertragen und kann nicht wiederhergestellt werden, wenn du sie verlierst.',
      ] },
      { key: 'auth', title: 'Konto und Anmeldung', paragraphs: [
        'Du registrierst dich mit einem Benutzernamen und einem Passwort: ohne E-Mail und ohne Telefonnummer. Der Server speichert nur einen Hash des Passworts. Sitzungen laufen ab, und jedes Gerät deines Kontos ist sichtbar und kann entfernt werden.',
      ] },
      { key: 'server', title: 'Was der Server sehen kann', paragraphs: [
        'Der Server kann weder Nachrichten noch Reaktionen, Anrufe oder die Namen privater Gruppen lesen. Um Nachrichten zuzustellen, kennt er trotzdem:',
      ], items: [
        'deinen Benutzernamen und deine Geräte, mit ihren öffentlichen Schlüsseln;',
        'die Chats, zu denen du gehörst;',
        'wann deine Geräte verbunden sind;',
        'verschlüsselte Nachrichten, bis sie zugestellt sind oder ablaufen.',
      ], after: 'Bei privaten Chats speichert er nicht, wer eine Nachricht geschickt hat, rundet die Uhrzeit und verbirgt die Länge der Nachrichten.', link: { label: 'Architektur und Bedrohungsmodell', href: 'docs/ARCHITECTURE.md' } },
      { key: 'build', title: 'Von außen überprüfbar', paragraphs: [
        'Die Website wird reproduzierbar gebaut, und jede Version ist signiert. Der Code, der auf deinem Gerät läuft, die formalen Beweise und die Dokumentation sind öffentlich.',
      ], link: { label: 'Das Protokoll, Schritt für Schritt', href: 'docs/PROTOCOL.md' } },
    ],
  },
  documents: {
    title: 'Dokumente',
    intro: 'Alle technischen Dokumente zu Palacan an einem Ort. Jedes PDF wird aus der öffentlichen Dokumentation auf GitHub erzeugt, wo du immer die neueste Version findest.',
    locale: 'de-DE',
    version: 'Stand vom',
    featured: 'Hier anfangen',
    parts: 'Derselbe Inhalt, ein Dokument nach dem anderen',
    pages: 'Seiten',
    english: 'auf Englisch',
    download: 'PDF herunterladen',
    source: 'Quelle auf GitHub',
    items: {
      whitepaper: { title: 'Sicherheits-Whitepaper', description: 'Die vollständige technische Beschreibung von Palacan: das Protokoll, die Architektur, was der Server sehen kann, das Bedrohungsmodell und wie du alles prüfst. Es enthält die drei Dokumente unten.' },
      protocol: { title: 'Protokoll', description: 'Wie Nachrichten verschlüsselt und Schlüssel verwaltet werden: Olm und Megolm, der Post-Quanten-Umschlag, hybride Signaturen, der Hauptschlüssel, die versiegelte Zustellung, Anrufe und das Backup.' },
      architecture: { title: 'Architektur und Bedrohungsmodell', description: 'Die Komponenten, was wo läuft, was der Server sehen kann und was nicht, und wovor Palacan schützen soll und wovor nicht.' },
      verification: { title: 'Palacan überprüfen', description: 'Wie du prüfst, dass die Website genau den öffentlichen Code ausführt, und wie du die formalen Beweise und die Tests selbst ausführst.' },
      policy: { title: 'Sicherheitsrichtlinie', description: 'Wie du eine Schwachstelle meldest, was dazugehört, die Regeln für Tests und welche Versionen unterstützt werden.' },
    },
    originTitle: 'Woher diese Dokumente kommen',
    origin: 'Auf dem Deckblatt jedes PDFs stehen der Commit des öffentlichen Repositorys, aus dem es erzeugt wurde, und seine Quelldateien. Die Dokumente gibt es nur auf Englisch. Sollten ein PDF und die Dateien auf GitHub einmal abweichen, gelten die Dateien auf GitHub.',
  },
};

export const TESTI_PAGINE = { en, it, fr, es, de };

/** Testi delle pagine nella lingua scelta (inglese se la lingua non c'e'). */
export function useTestiPagine() {
  const { i18n } = useTranslation();
  const lingua = String((i18n && (i18n.resolvedLanguage || i18n.language)) || 'en').split('-')[0];
  return TESTI_PAGINE[lingua] || TESTI_PAGINE.en;
}
