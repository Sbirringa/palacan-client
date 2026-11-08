import { useTranslation } from 'react-i18next';

// ============================================================
// Testi della home, della navigazione pubblica e delle sezioni
// "telefoni" e "codice", in 5 lingue. Inglese = default e fallback.
// Seguono la lingua scelta nel selettore (i18next).
// ============================================================

const en = {
  nav: {
    security: 'Security', technology: 'Technology', openSource: 'Open Source', ecosystem: 'Ecosystem', about: 'About', faq: 'FAQ',
    privacy: 'Privacy', terms: 'Terms', login: 'Log in', getStarted: 'Get started', home: 'Home',
    menuOpen: 'Open menu', menuClose: 'Close menu', language: 'Language', skip: 'Skip to content',
  },
  hero: {
    tagline: 'Private. From every point of view.',
    sub: 'Messages, calls and video, end-to-end encrypted. Free for everyone. Built for teams too.',
    cta: 'Get started free', how: 'See how it works',
    hint: 'Move to leave the point of view', replay: 'Replay',
  },
  identity: {
    eyebrow: 'Your identity',
    title1: 'No number. No email.', title2: 'Just a name you choose.',
    sub: 'Other apps start from your phone number. Palacan starts from a name you pick, and nothing else. Try yours.',
    hint: 'Type the name you want', claim: 'Claim this name', note: "Just a preview. You'll confirm it when you sign up.",
    examples: ['maya', 'leo.nord', 'nightowl', 'studio_kobe', 'ana.rt'],
  },
  features: [
    { t: 'Messages', d: 'Private and group chats, end-to-end encrypted, with reactions and disappearing messages.' },
    { t: 'Voice calls', d: 'Real-time audio, always through a relay: your IP address is never exposed.' },
    { t: 'Video calls', d: 'Encrypted video between devices, never visible to the server, never stored.' },
  ],
  journey: {
    eyebrow: 'In transit',
    title: 'A message is never readable in transit.',
    sub: "It leaves your phone already encrypted, crosses the server as scattered fragments, and comes back together only on the recipient's phone.",
    names: ['Maya', 'Leo'],
    messages: ['See you at 8 pm', 'Perfect, see you tonight'],
    phoneOf: (n) => `${n}'s phone`,
    e2e: 'End-to-end encrypted', composer: 'Message',
    status: { sending: 'Sending…', encrypted: 'Encrypted', delivered: 'Delivered', read: 'Read' },
    server: 'Palacan server', serverIdle: 'forwards, never reads', serverActive: 'sees only this', online: 'online',
    steps: ['Written', 'Encrypted on the phone', 'The server sees only fragments', 'Decrypted on arrival', 'Read'],
    foot: 'The server carries the message. It never knows what it says.',
  },
  vault: {
    eyebrow: "Inside the server",
    title: "Write something. See what reaches our database.",
    sub: "Your message is encrypted right here, in your browser, before it goes anywhere.",
    placeholder: "Write a message…", send: "Encrypt and send", defaultMsg: "This stays between us",
    you: "you",
    captionServer: "This is your message as our database stores it: ciphertext. The key never reaches the server, so no one here can read it.",
    foot: "Real AES-GCM encryption, done in your browser with a key that exists only on this page. In the app, messages are encrypted with Olm and Megolm.",
    noCrypto: "Your browser does not allow encryption on this page (it needs HTTPS).",
    captionAll: "Sender, room, time and message: every field arrives encrypted. The server stores them without being able to read any of them.",
    readable: (n) => `Fields readable by the server: 0 of ${n}`,
    slot: "Your message will land here, encrypted.",
  },
  code: {
    eyebrow: 'Open source', title: 'Real code, not promises.', sub: 'Our code is public. Hover over a line to read what it does.',
    tabs: { MESSAGING: 'Messages', IDENTITY: 'Identity', DEVICES: 'Devices', SECURITY: 'Backup' },
    lines: {
      MESSAGING: [
        'Opens a direct encrypted session with the other person, using their public keys, never the private ones.',
        'The message is encrypted here, on the device, before it ever touches the network.',
        'Only the ciphertext leaves the device. The server receives data it cannot read.',
        "Only the recipient's device, holding the right key, can decrypt it.",
      ],
      IDENTITY: [
        "Computes a unique fingerprint of the contact's identity key, so it can be compared.",
        'If the fingerprint changes from the saved one, the user is warned immediately.',
        'Computes a code shared by both identities, verifiable out of band.',
      ],
      DEVICES: [
        'Each device has its own identifier, generated once and never shared.',
        "Only the device's public key is uploaded to the server, never the private one.",
        'Revoking a device ends its session on the server immediately.',
      ],
      SECURITY: [
        'The backup key is derived from your passphrase with Argon2id, resistant to GPU cracking.',
        'The backup is encrypted with AES-GCM before it leaves the device.',
        'Every endpoint checks authorization before returning any data.',
      ],
    },
  },
  keys: {
    title: 'Your private keys never leave your device.',
    sub: 'Not because of a policy: the protocol itself (Olm for one-to-one, Megolm for groups) makes it impossible for the server to access them.',
    points: [
      'Every message is encrypted on your device before it leaves. The server only routes unreadable data.',
      'A new encryption step for every message: compromising one message never compromises the next.',
      'Your encrypted backup is protected with Argon2id, resistant to dedicated cracking hardware.',
      'Not even a compromised database would reveal past conversations.',
    ],
  },
  verify: {
    title: "Know exactly who you're talking to.",
    sub: 'Compare the safety number with the other person, face to face or on a call. If it matches, nobody is in the middle.',
    match: 'The numbers match', undo: 'Undo', done: 'Identity verified', todo: "Compare with the other person's screen",
  },
  devices: {
    title: 'One identity. Every device verified on its own.',
    sub: 'Each device creates and keeps its own keys. No private key is ever shared between devices, not even yours.',
    points: [
      'Review, rename or revoke any device in seconds, right from the app.',
      'Voice and video always go through a relay: never a direct connection that reveals your IP address.',
    ],
  },
  business: {
    eyebrow: 'For business',
    title: 'Free for everyone. Powerful for teams.',
    sub: 'A business workspace adds departments, roles, licenses and employee management, without ever touching message content, not even for admins.',
    points: [
      'Activate your workspace with a license token and create the first admin in minutes.',
      'Granular roles and permissions, from a single room to the whole organization.',
      'Encryption protects every conversation even from admins: not even a compromised account can read it.',
      'Sessions, devices and admin actions are logged, without ever touching message content.',
    ],
    activate: 'Activate your company', login: 'Business login',
  },
  final: { title: 'Your conversations. Your keys. No one else.', cta: 'Create your free account', preparing: 'Preparing encryption on your device…' },
  footer: { tagline: 'End-to-end encrypted with Olm and Megolm.', login: 'Already have an account? Log in' },
};

const it = {
  nav: {
    security: 'Sicurezza', technology: 'Tecnologia', openSource: 'Open Source', ecosystem: 'Ecosistema', about: 'Chi siamo', faq: 'FAQ',
    privacy: 'Privacy', terms: 'Termini', login: 'Accedi', getStarted: 'Inizia', home: 'Home',
    menuOpen: 'Apri il menu', menuClose: 'Chiudi il menu', language: 'Lingua', skip: 'Vai al contenuto',
  },
  hero: {
    tagline: 'Privato. Da ogni punto di vista.',
    sub: 'Messaggi, chiamate e video cifrati end-to-end. Gratis per tutti. Pensato anche per i team.',
    cta: 'Inizia gratis', how: 'Guarda come funziona',
    hint: 'Muoviti per uscire dal punto di vista', replay: 'Rivedi',
  },
  identity: {
    eyebrow: 'La tua identità',
    title1: 'Nessun numero. Nessuna email.', title2: 'Solo un nome che scegli tu.',
    sub: "Le altre app partono dal tuo numero di telefono. Palacan parte da un nome che scegli tu, e da nient'altro. Prova il tuo.",
    hint: 'Scrivi il nome che vuoi', claim: 'Prendi questo nome', note: "Solo un'anteprima: lo confermerai in registrazione.",
    examples: ['maya', 'leo.nord', 'nightowl', 'studio_kobe', 'ana.rt'],
  },
  features: [
    { t: 'Messaggi', d: 'Chat private e di gruppo cifrate end-to-end, con reazioni e messaggi a scomparsa.' },
    { t: 'Chiamate vocali', d: 'Audio in tempo reale, sempre attraverso un relay: il tuo indirizzo IP non viene mai esposto.' },
    { t: 'Videochiamate', d: 'Video cifrato tra i dispositivi, mai visibile al server, mai salvato.' },
  ],
  journey: {
    eyebrow: 'In transito',
    title: 'Un messaggio non è mai leggibile in transito.',
    sub: 'Esce dal telefono già cifrato, attraversa il server in frammenti sparsi e si ricompone solo sul telefono di chi lo riceve.',
    names: ['Maya', 'Leo'],
    messages: ['Ci vediamo alle 20:00', 'Perfetto, a stasera'],
    phoneOf: (n) => `Telefono di ${n}`,
    e2e: 'Cifratura end-to-end', composer: 'Messaggio',
    status: { sending: 'Invio…', encrypted: 'Cifrato', delivered: 'Consegnato', read: 'Letto' },
    server: 'Server Palacan', serverIdle: 'inoltra, non legge', serverActive: 'vede solo questo', online: 'in linea',
    steps: ['Scritto', 'Cifrato sul telefono', 'Il server vede solo frammenti', "Decifrato all'arrivo", 'Letto'],
    foot: 'Il server trasporta il messaggio. Non sa mai cosa dice.',
  },
  vault: {
    eyebrow: "Dentro il server",
    title: "Scrivi qualcosa. Guarda cosa arriva nel nostro database.",
    sub: "Il tuo messaggio viene cifrato qui, nel tuo browser, prima di andare da qualsiasi parte.",
    placeholder: "Scrivi un messaggio…", send: "Cifra e invia", defaultMsg: "Questo resta tra noi",
    you: "tu",
    captionServer: "Ecco il tuo messaggio come lo conserva il nostro database: testo cifrato. La chiave non arriva mai al server, quindi qui nessuno può leggerlo.",
    foot: "Cifratura AES-GCM reale, eseguita nel tuo browser con una chiave che esiste solo in questa pagina. Nell'app i messaggi sono cifrati con Olm e Megolm.",
    noCrypto: "Il tuo browser non consente la cifratura in questa pagina (serve HTTPS).",
    captionAll: "Mittente, stanza, orario e messaggio: ogni campo arriva cifrato. Il server li conserva senza poterne leggere nessuno.",
    readable: (n) => `Campi leggibili dal server: 0 su ${n}`,
    slot: "Il tuo messaggio arriverà qui, cifrato.",
  },
  code: {
    eyebrow: 'Open source', title: 'Codice vero, non promesse.', sub: 'Il nostro codice è pubblico. Passa il mouse su una riga per leggere cosa fa.',
    tabs: { MESSAGING: 'Messaggi', IDENTITY: 'Identità', DEVICES: 'Dispositivi', SECURITY: 'Backup' },
    lines: {
      MESSAGING: [
        "Stabilisce una sessione cifrata diretta con l'altra persona, usando le sue chiavi pubbliche, mai quelle private.",
        'Il messaggio viene cifrato qui, sul dispositivo, prima ancora di essere inviato in rete.',
        'Solo il testo cifrato lascia il dispositivo. Il server riceve dati che non può leggere.',
        'Solo il dispositivo del destinatario, con la chiave giusta, può decifrarlo.',
      ],
      IDENTITY: [
        "Calcola un'impronta unica della chiave di identità del contatto, per poterla confrontare.",
        "Se l'impronta cambia rispetto a quella salvata, l'utente viene avvisato subito.",
        'Calcola un codice condiviso da entrambe le identità, verificabile fuori banda.',
      ],
      DEVICES: [
        'Ogni dispositivo ha un identificativo proprio, generato una sola volta e mai condiviso.',
        'Sul server viene caricata solo la chiave pubblica del dispositivo, mai quella privata.',
        'Revocare un dispositivo termina subito la sua sessione sul server.',
      ],
      SECURITY: [
        'La chiave del backup deriva dalla tua passphrase con Argon2id, resistente al cracking via GPU.',
        'Il backup viene cifrato con AES-GCM prima di lasciare il dispositivo.',
        "Ogni endpoint verifica l'autorizzazione prima di restituire qualunque dato.",
      ],
    },
  },
  keys: {
    title: 'Le tue chiavi private non lasciano mai il dispositivo.',
    sub: 'Non per una regola scritta da qualche parte: il protocollo stesso (Olm per le conversazioni singole, Megolm per i gruppi) rende impossibile al server accedervi.',
    points: [
      'Ogni messaggio è cifrato sul tuo dispositivo prima di partire. Il server smista solo dati illeggibili.',
      'Un nuovo passo di cifratura a ogni messaggio: compromettere un messaggio non compromette il successivo.',
      'Il backup cifrato è protetto con Argon2id, resistente al cracking con hardware dedicato.',
      'Nemmeno un database compromesso rivelerebbe le conversazioni passate.',
    ],
  },
  verify: {
    title: 'Sai con certezza con chi stai parlando.',
    sub: "Confronta il safety number con l'altra persona, di persona o in chiamata. Se coincide, nessuno si è messo in mezzo.",
    match: 'I numeri coincidono', undo: 'Annulla', done: 'Identità verificata', todo: "Confronta con lo schermo dell'altra persona",
  },
  devices: {
    title: "Un'identità. Ogni dispositivo verificato singolarmente.",
    sub: 'Ogni dispositivo crea e conserva le proprie chiavi. Nessuna chiave privata viene condivisa tra dispositivi, nemmeno tra i tuoi.',
    points: [
      "Rivedi, rinomina o revoca qualsiasi dispositivo in pochi secondi, direttamente dall'app.",
      'Voce e video passano sempre da un relay: mai una connessione diretta che riveli il tuo indirizzo IP.',
    ],
  },
  business: {
    eyebrow: 'Per le aziende',
    title: 'Gratis per tutti. Potente per i team.',
    sub: 'Un workspace aziendale aggiunge reparti, ruoli, licenze e gestione dei dipendenti, senza mai toccare il contenuto dei messaggi, nemmeno per gli amministratori.',
    points: [
      'Attiva il workspace con un token di licenza e crea il primo amministratore in pochi minuti.',
      "Ruoli e permessi granulari, da una singola stanza all'intera organizzazione.",
      'La cifratura protegge ogni conversazione anche dagli amministratori: nemmeno un account compromesso può leggerla.',
      'Sessioni, dispositivi e azioni amministrative restano tracciati, senza mai toccare il contenuto dei messaggi.',
    ],
    activate: 'Attiva la tua azienda', login: 'Accesso aziendale',
  },
  final: { title: 'Le tue conversazioni. Le tue chiavi. Nessun altro.', cta: 'Crea il tuo account gratuito', preparing: 'Preparazione della cifratura sul tuo dispositivo…' },
  footer: { tagline: 'Cifratura end-to-end con Olm e Megolm.', login: 'Hai già un account? Accedi' },
};

const fr = {
  nav: {
    security: 'Sécurité', technology: 'Technologie', openSource: 'Open Source', ecosystem: 'Écosystème', about: 'À propos', faq: 'FAQ',
    privacy: 'Confidentialité', terms: 'Conditions', login: 'Se connecter', getStarted: 'Commencer', home: 'Accueil',
    menuOpen: 'Ouvrir le menu', menuClose: 'Fermer le menu', language: 'Langue', skip: 'Aller au contenu',
  },
  hero: {
    tagline: 'Privé. Sous tous les angles.',
    sub: 'Messages, appels et vidéo chiffrés de bout en bout. Gratuit pour tous. Pensé aussi pour les équipes.',
    cta: 'Commencer gratuitement', how: 'Voir comment ça marche',
    hint: 'Bougez pour quitter le point de vue', replay: 'Revoir',
  },
  identity: {
    eyebrow: 'Votre identité',
    title1: "Pas de numéro. Pas d'e-mail.", title2: 'Juste un nom que vous choisissez.',
    sub: "Les autres apps partent de votre numéro de téléphone. Palacan part d'un nom que vous choisissez, et de rien d'autre. Essayez le vôtre.",
    hint: 'Tapez le nom que vous voulez', claim: 'Réserver ce nom', note: "Simple aperçu : vous le confirmerez à l'inscription.",
    examples: ['maya', 'leo.nord', 'nightowl', 'studio_kobe', 'ana.rt'],
  },
  features: [
    { t: 'Messages', d: 'Discussions privées et de groupe chiffrées de bout en bout, avec réactions et messages éphémères.' },
    { t: 'Appels vocaux', d: 'Audio en temps réel, toujours via un relais : votre adresse IP n’est jamais exposée.' },
    { t: 'Appels vidéo', d: 'Vidéo chiffrée entre les appareils, jamais visible par le serveur, jamais enregistrée.' },
  ],
  journey: {
    eyebrow: 'En transit',
    title: "Un message n'est jamais lisible en transit.",
    sub: "Il quitte votre téléphone déjà chiffré, traverse le serveur en fragments épars et ne se recompose que sur le téléphone du destinataire.",
    names: ['Maya', 'Leo'],
    messages: ['On se voit à 20 h', 'Parfait, à ce soir'],
    phoneOf: (n) => `Téléphone de ${n}`,
    e2e: 'Chiffré de bout en bout', composer: 'Message',
    status: { sending: 'Envoi…', encrypted: 'Chiffré', delivered: 'Distribué', read: 'Lu' },
    server: 'Serveur Palacan', serverIdle: 'transmet, ne lit pas', serverActive: 'ne voit que ceci', online: 'en ligne',
    steps: ['Écrit', 'Chiffré sur le téléphone', 'Le serveur ne voit que des fragments', "Déchiffré à l'arrivée", 'Lu'],
    foot: "Le serveur transporte le message. Il ne sait jamais ce qu'il dit.",
  },
  vault: {
    eyebrow: "Dans le serveur",
    title: "Écrivez quelque chose. Voyez ce qui arrive dans notre base de données.",
    sub: "Votre message est chiffré ici, dans votre navigateur, avant d'aller où que ce soit.",
    placeholder: "Écrivez un message…", send: "Chiffrer et envoyer", defaultMsg: "Ça reste entre nous",
    you: "vous",
    captionServer: "Voici votre message tel que notre base de données le conserve : du texte chiffré. La clé n'arrive jamais au serveur, donc personne ici ne peut le lire.",
    foot: "Vrai chiffrement AES-GCM, effectué dans votre navigateur avec une clé qui n'existe que sur cette page. Dans l'app, les messages sont chiffrés avec Olm et Megolm.",
    noCrypto: "Votre navigateur n'autorise pas le chiffrement sur cette page (HTTPS requis).",
    captionAll: "Expéditeur, salon, heure et message : chaque champ arrive chiffré. Le serveur les conserve sans pouvoir en lire aucun.",
    readable: (n) => `Champs lisibles par le serveur : 0 sur ${n}`,
    slot: "Votre message arrivera ici, chiffré.",
  },
  code: {
    eyebrow: 'Open source', title: 'Du vrai code, pas des promesses.', sub: 'Notre code est public. Survolez une ligne pour lire ce qu’elle fait.',
    tabs: { MESSAGING: 'Messages', IDENTITY: 'Identité', DEVICES: 'Appareils', SECURITY: 'Sauvegarde' },
    lines: {
      MESSAGING: [
        "Ouvre une session chiffrée directe avec l'autre personne, avec ses clés publiques, jamais les privées.",
        "Le message est chiffré ici, sur l'appareil, avant même de toucher le réseau.",
        "Seul le texte chiffré quitte l'appareil. Le serveur reçoit des données qu'il ne peut pas lire.",
        "Seul l'appareil du destinataire, avec la bonne clé, peut le déchiffrer.",
      ],
      IDENTITY: [
        "Calcule une empreinte unique de la clé d'identité du contact, pour pouvoir la comparer.",
        "Si l'empreinte change par rapport à celle enregistrée, l'utilisateur est averti aussitôt.",
        'Calcule un code partagé par les deux identités, vérifiable hors ligne.',
      ],
      DEVICES: [
        'Chaque appareil a son propre identifiant, créé une seule fois et jamais partagé.',
        "Seule la clé publique de l'appareil est envoyée au serveur, jamais la clé privée.",
        'Révoquer un appareil met fin immédiatement à sa session sur le serveur.',
      ],
      SECURITY: [
        'La clé de sauvegarde est dérivée de votre phrase secrète avec Argon2id, résistant au cassage par GPU.',
        "La sauvegarde est chiffrée avec AES-GCM avant de quitter l'appareil.",
        "Chaque point d'accès vérifie l'autorisation avant de renvoyer la moindre donnée.",
      ],
    },
  },
  keys: {
    title: 'Vos clés privées ne quittent jamais votre appareil.',
    sub: "Pas à cause d'une règle : le protocole lui-même (Olm en tête-à-tête, Megolm pour les groupes) empêche le serveur d'y accéder.",
    points: [
      "Chaque message est chiffré sur votre appareil avant de partir. Le serveur n'achemine que des données illisibles.",
      "Une nouvelle étape de chiffrement à chaque message : en compromettre un ne compromet jamais le suivant.",
      'Votre sauvegarde chiffrée est protégée par Argon2id, résistant au matériel de cassage dédié.',
      'Même une base de données compromise ne révélerait pas les conversations passées.',
    ],
  },
  verify: {
    title: 'Sachez exactement à qui vous parlez.',
    sub: "Comparez le numéro de sécurité avec l'autre personne, en face à face ou en appel. S'il correspond, personne ne s'est glissé entre vous.",
    match: 'Les numéros correspondent', undo: 'Annuler', done: 'Identité vérifiée', todo: "Comparez avec l'écran de l'autre personne",
  },
  devices: {
    title: 'Une identité. Chaque appareil vérifié séparément.',
    sub: "Chaque appareil crée et garde ses propres clés. Aucune clé privée n'est partagée entre appareils, pas même les vôtres.",
    points: [
      "Consultez, renommez ou révoquez n'importe quel appareil en quelques secondes, depuis l'app.",
      'La voix et la vidéo passent toujours par un relais : jamais de connexion directe qui révèle votre adresse IP.',
    ],
  },
  business: {
    eyebrow: 'Pour les entreprises',
    title: 'Gratuit pour tous. Puissant pour les équipes.',
    sub: "Un espace de travail entreprise ajoute services, rôles, licences et gestion des employés, sans jamais toucher au contenu des messages, pas même pour les administrateurs.",
    points: [
      'Activez votre espace avec un jeton de licence et créez le premier administrateur en quelques minutes.',
      "Rôles et permissions précis, d'un simple salon à toute l'organisation.",
      'Le chiffrement protège chaque conversation même des administrateurs : même un compte compromis ne peut pas la lire.',
      'Sessions, appareils et actions administratives sont journalisés, sans jamais toucher au contenu des messages.',
    ],
    activate: 'Activer votre entreprise', login: 'Connexion entreprise',
  },
  final: { title: 'Vos conversations. Vos clés. Personne d’autre.', cta: 'Créer votre compte gratuit', preparing: 'Préparation du chiffrement sur votre appareil…' },
  footer: { tagline: 'Chiffré de bout en bout avec Olm et Megolm.', login: 'Déjà un compte ? Se connecter' },
};

const es = {
  nav: {
    security: 'Seguridad', technology: 'Tecnología', openSource: 'Open Source', ecosystem: 'Ecosistema', about: 'Quiénes somos', faq: 'FAQ',
    privacy: 'Privacidad', terms: 'Términos', login: 'Iniciar sesión', getStarted: 'Empezar', home: 'Inicio',
    menuOpen: 'Abrir menú', menuClose: 'Cerrar menú', language: 'Idioma', skip: 'Ir al contenido',
  },
  hero: {
    tagline: 'Privado. Desde cualquier punto de vista.',
    sub: 'Mensajes, llamadas y vídeo cifrados de extremo a extremo. Gratis para todos. Pensado también para equipos.',
    cta: 'Empieza gratis', how: 'Mira cómo funciona',
    hint: 'Muévete para salir del punto de vista', replay: 'Repetir',
  },
  identity: {
    eyebrow: 'Tu identidad',
    title1: 'Sin número. Sin email.', title2: 'Solo un nombre que eliges tú.',
    sub: 'Otras apps empiezan por tu número de teléfono. Palacan empieza por un nombre que eliges tú, y nada más. Prueba el tuyo.',
    hint: 'Escribe el nombre que quieras', claim: 'Quedarme este nombre', note: 'Solo una vista previa: lo confirmarás al registrarte.',
    examples: ['maya', 'leo.nord', 'nightowl', 'studio_kobe', 'ana.rt'],
  },
  features: [
    { t: 'Mensajes', d: 'Chats privados y de grupo cifrados de extremo a extremo, con reacciones y mensajes temporales.' },
    { t: 'Llamadas de voz', d: 'Audio en tiempo real, siempre a través de un relay: tu dirección IP nunca queda expuesta.' },
    { t: 'Videollamadas', d: 'Vídeo cifrado entre dispositivos, nunca visible para el servidor, nunca guardado.' },
  ],
  journey: {
    eyebrow: 'En tránsito',
    title: 'Un mensaje nunca es legible en tránsito.',
    sub: 'Sale de tu teléfono ya cifrado, cruza el servidor en fragmentos dispersos y solo se recompone en el teléfono de quien lo recibe.',
    names: ['Maya', 'Leo'],
    messages: ['Nos vemos a las 20:00', 'Perfecto, hasta esta noche'],
    phoneOf: (n) => `Teléfono de ${n}`,
    e2e: 'Cifrado de extremo a extremo', composer: 'Mensaje',
    status: { sending: 'Enviando…', encrypted: 'Cifrado', delivered: 'Entregado', read: 'Leído' },
    server: 'Servidor de Palacan', serverIdle: 'reenvía, no lee', serverActive: 'solo ve esto', online: 'en línea',
    steps: ['Escrito', 'Cifrado en el teléfono', 'El servidor solo ve fragmentos', 'Descifrado al llegar', 'Leído'],
    foot: 'El servidor transporta el mensaje. Nunca sabe lo que dice.',
  },
  vault: {
    eyebrow: "Dentro del servidor",
    title: "Escribe algo. Mira lo que llega a nuestra base de datos.",
    sub: "Tu mensaje se cifra aquí, en tu navegador, antes de ir a ninguna parte.",
    placeholder: "Escribe un mensaje…", send: "Cifrar y enviar", defaultMsg: "Esto queda entre nosotros",
    you: "tú",
    captionServer: "Así guarda tu mensaje nuestra base de datos: texto cifrado. La clave nunca llega al servidor, así que aquí nadie puede leerlo.",
    foot: "Cifrado AES-GCM real, hecho en tu navegador con una clave que solo existe en esta página. En la app, los mensajes se cifran con Olm y Megolm.",
    noCrypto: "Tu navegador no permite el cifrado en esta página (necesita HTTPS).",
    captionAll: "Remitente, sala, hora y mensaje: cada campo llega cifrado. El servidor los guarda sin poder leer ninguno.",
    readable: (n) => `Campos legibles por el servidor: 0 de ${n}`,
    slot: "Tu mensaje llegará aquí, cifrado.",
  },
  code: {
    eyebrow: 'Open source', title: 'Código real, no promesas.', sub: 'Nuestro código es público. Pasa el ratón por una línea para leer qué hace.',
    tabs: { MESSAGING: 'Mensajes', IDENTITY: 'Identidad', DEVICES: 'Dispositivos', SECURITY: 'Copia de seguridad' },
    lines: {
      MESSAGING: [
        'Abre una sesión cifrada directa con la otra persona, usando sus claves públicas, nunca las privadas.',
        'El mensaje se cifra aquí, en el dispositivo, antes de tocar la red.',
        'Solo el texto cifrado sale del dispositivo. El servidor recibe datos que no puede leer.',
        'Solo el dispositivo del destinatario, con la clave correcta, puede descifrarlo.',
      ],
      IDENTITY: [
        'Calcula una huella única de la clave de identidad del contacto, para poder compararla.',
        'Si la huella cambia respecto a la guardada, el usuario recibe un aviso al instante.',
        'Calcula un código compartido por ambas identidades, verificable fuera de línea.',
      ],
      DEVICES: [
        'Cada dispositivo tiene su propio identificador, creado una sola vez y nunca compartido.',
        'Al servidor solo se sube la clave pública del dispositivo, nunca la privada.',
        'Revocar un dispositivo termina su sesión en el servidor al instante.',
      ],
      SECURITY: [
        'La clave de la copia se deriva de tu frase de contraseña con Argon2id, resistente al cracking por GPU.',
        'La copia de seguridad se cifra con AES-GCM antes de salir del dispositivo.',
        'Cada endpoint comprueba la autorización antes de devolver cualquier dato.',
      ],
    },
  },
  keys: {
    title: 'Tus claves privadas nunca salen de tu dispositivo.',
    sub: 'No por una norma: el propio protocolo (Olm para chats individuales, Megolm para grupos) hace imposible que el servidor acceda a ellas.',
    points: [
      'Cada mensaje se cifra en tu dispositivo antes de salir. El servidor solo encamina datos ilegibles.',
      'Un nuevo paso de cifrado en cada mensaje: comprometer uno nunca compromete el siguiente.',
      'Tu copia cifrada está protegida con Argon2id, resistente a hardware de cracking dedicado.',
      'Ni siquiera una base de datos comprometida revelaría conversaciones pasadas.',
    ],
  },
  verify: {
    title: 'Sabe exactamente con quién hablas.',
    sub: 'Compara el número de seguridad con la otra persona, en persona o en una llamada. Si coincide, nadie se ha metido en medio.',
    match: 'Los números coinciden', undo: 'Deshacer', done: 'Identidad verificada', todo: 'Compara con la pantalla de la otra persona',
  },
  devices: {
    title: 'Una identidad. Cada dispositivo verificado por separado.',
    sub: 'Cada dispositivo crea y guarda sus propias claves. Ninguna clave privada se comparte entre dispositivos, ni siquiera entre los tuyos.',
    points: [
      'Revisa, renombra o revoca cualquier dispositivo en segundos, desde la app.',
      'La voz y el vídeo pasan siempre por un relay: nunca una conexión directa que revele tu dirección IP.',
    ],
  },
  business: {
    eyebrow: 'Para empresas',
    title: 'Gratis para todos. Potente para equipos.',
    sub: 'Un espacio de trabajo empresarial añade departamentos, roles, licencias y gestión de empleados, sin tocar nunca el contenido de los mensajes, ni siquiera para los administradores.',
    points: [
      'Activa tu espacio con un token de licencia y crea el primer administrador en minutos.',
      'Roles y permisos detallados, desde una sala hasta toda la organización.',
      'El cifrado protege cada conversación incluso de los administradores: ni una cuenta comprometida puede leerla.',
      'Sesiones, dispositivos y acciones de administración quedan registrados, sin tocar nunca el contenido de los mensajes.',
    ],
    activate: 'Activa tu empresa', login: 'Acceso para empresas',
  },
  final: { title: 'Tus conversaciones. Tus claves. Nadie más.', cta: 'Crea tu cuenta gratis', preparing: 'Preparando el cifrado en tu dispositivo…' },
  footer: { tagline: 'Cifrado de extremo a extremo con Olm y Megolm.', login: '¿Ya tienes cuenta? Inicia sesión' },
};

const de = {
  nav: {
    security: 'Sicherheit', technology: 'Technologie', openSource: 'Open Source', ecosystem: 'Ökosystem', about: 'Über uns', faq: 'FAQ',
    privacy: 'Datenschutz', terms: 'AGB', login: 'Anmelden', getStarted: 'Loslegen', home: 'Start',
    menuOpen: 'Menü öffnen', menuClose: 'Menü schließen', language: 'Sprache', skip: 'Zum Inhalt springen',
  },
  hero: {
    tagline: 'Privat. Aus jedem Blickwinkel.',
    sub: 'Nachrichten, Anrufe und Video, Ende-zu-Ende-verschlüsselt. Kostenlos für alle. Auch für Teams gemacht.',
    cta: 'Kostenlos starten', how: "So funktioniert's",
    hint: 'Bewege dich, um den Blickwinkel zu verlassen', replay: 'Nochmal',
  },
  identity: {
    eyebrow: 'Deine Identität',
    title1: 'Keine Nummer. Keine E-Mail.', title2: 'Nur ein Name, den du wählst.',
    sub: 'Andere Apps beginnen mit deiner Telefonnummer. Palacan beginnt mit einem Namen, den du wählst, und mit nichts sonst. Probier deinen aus.',
    hint: 'Tippe den Namen, den du willst', claim: 'Diesen Namen sichern', note: 'Nur eine Vorschau: Du bestätigst ihn bei der Registrierung.',
    examples: ['maya', 'leo.nord', 'nightowl', 'studio_kobe', 'ana.rt'],
  },
  features: [
    { t: 'Nachrichten', d: 'Private und Gruppenchats, Ende-zu-Ende-verschlüsselt, mit Reaktionen und selbstlöschenden Nachrichten.' },
    { t: 'Sprachanrufe', d: 'Audio in Echtzeit, immer über ein Relay: Deine IP-Adresse wird nie preisgegeben.' },
    { t: 'Videoanrufe', d: 'Verschlüsseltes Video zwischen Geräten, nie für den Server sichtbar, nie gespeichert.' },
  ],
  journey: {
    eyebrow: 'Unterwegs',
    title: 'Eine Nachricht ist unterwegs nie lesbar.',
    sub: 'Sie verlässt dein Telefon bereits verschlüsselt, durchquert den Server als verstreute Fragmente und setzt sich erst auf dem Telefon des Empfängers wieder zusammen.',
    names: ['Maya', 'Leo'],
    messages: ['Wir sehen uns um 20 Uhr', 'Perfekt, bis heute Abend'],
    phoneOf: (n) => `${n}s Telefon`,
    e2e: 'Ende-zu-Ende-verschlüsselt', composer: 'Nachricht',
    status: { sending: 'Wird gesendet…', encrypted: 'Verschlüsselt', delivered: 'Zugestellt', read: 'Gelesen' },
    server: 'Palacan-Server', serverIdle: 'leitet weiter, liest nie', serverActive: 'sieht nur das', online: 'online',
    steps: ['Geschrieben', 'Auf dem Telefon verschlüsselt', 'Der Server sieht nur Fragmente', 'Bei Ankunft entschlüsselt', 'Gelesen'],
    foot: 'Der Server transportiert die Nachricht. Er weiß nie, was sie sagt.',
  },
  vault: {
    eyebrow: "Im Server",
    title: "Schreib etwas. Sieh, was in unserer Datenbank ankommt.",
    sub: "Deine Nachricht wird hier in deinem Browser verschlüsselt, bevor sie irgendwohin geht.",
    placeholder: "Schreib eine Nachricht…", send: "Verschlüsseln und senden", defaultMsg: "Das bleibt unter uns",
    you: "du",
    captionServer: "So speichert unsere Datenbank deine Nachricht: als verschlüsselten Text. Der Schlüssel erreicht nie den Server, also kann ihn hier niemand lesen.",
    foot: "Echte AES-GCM-Verschlüsselung, in deinem Browser ausgeführt, mit einem Schlüssel, der nur auf dieser Seite existiert. In der App werden Nachrichten mit Olm und Megolm verschlüsselt.",
    noCrypto: "Dein Browser erlaubt auf dieser Seite keine Verschlüsselung (HTTPS erforderlich).",
    captionAll: "Absender, Raum, Uhrzeit und Nachricht: Jedes Feld kommt verschlüsselt an. Der Server speichert sie, ohne eines davon lesen zu können.",
    readable: (n) => `Für den Server lesbare Felder: 0 von ${n}`,
    slot: "Deine Nachricht landet hier, verschlüsselt.",
  },
  code: {
    eyebrow: 'Open Source', title: 'Echter Code, keine Versprechen.', sub: 'Unser Code ist öffentlich. Fahre über eine Zeile, um zu lesen, was sie tut.',
    tabs: { MESSAGING: 'Nachrichten', IDENTITY: 'Identität', DEVICES: 'Geräte', SECURITY: 'Backup' },
    lines: {
      MESSAGING: [
        'Öffnet eine direkte verschlüsselte Sitzung mit der anderen Person, mit ihren öffentlichen Schlüsseln, nie den privaten.',
        'Die Nachricht wird hier auf dem Gerät verschlüsselt, bevor sie das Netzwerk berührt.',
        'Nur der verschlüsselte Text verlässt das Gerät. Der Server erhält Daten, die er nicht lesen kann.',
        'Nur das Gerät des Empfängers mit dem richtigen Schlüssel kann sie entschlüsseln.',
      ],
      IDENTITY: [
        'Berechnet einen eindeutigen Fingerabdruck des Identitätsschlüssels des Kontakts, um ihn vergleichen zu können.',
        'Ändert sich der Fingerabdruck gegenüber dem gespeicherten, wird der Nutzer sofort gewarnt.',
        'Berechnet einen gemeinsamen Code beider Identitäten, außerhalb der App überprüfbar.',
      ],
      DEVICES: [
        'Jedes Gerät hat eine eigene Kennung, einmal erzeugt und nie geteilt.',
        'Auf den Server wird nur der öffentliche Schlüssel des Geräts hochgeladen, nie der private.',
        'Das Widerrufen eines Geräts beendet seine Sitzung auf dem Server sofort.',
      ],
      SECURITY: [
        'Der Backup-Schlüssel wird mit Argon2id aus deiner Passphrase abgeleitet, resistent gegen GPU-Cracking.',
        'Das Backup wird mit AES-GCM verschlüsselt, bevor es das Gerät verlässt.',
        'Jeder Endpunkt prüft die Berechtigung, bevor er Daten zurückgibt.',
      ],
    },
  },
  keys: {
    title: 'Deine privaten Schlüssel verlassen nie dein Gerät.',
    sub: 'Nicht wegen einer Regel: Das Protokoll selbst (Olm für Einzelchats, Megolm für Gruppen) macht es dem Server unmöglich, darauf zuzugreifen.',
    points: [
      'Jede Nachricht wird auf deinem Gerät verschlüsselt, bevor sie es verlässt. Der Server leitet nur unlesbare Daten weiter.',
      'Ein neuer Verschlüsselungsschritt für jede Nachricht: Eine kompromittierte Nachricht gefährdet nie die nächste.',
      'Dein verschlüsseltes Backup ist mit Argon2id geschützt, resistent gegen spezielle Cracking-Hardware.',
      'Nicht einmal eine kompromittierte Datenbank würde vergangene Gespräche offenlegen.',
    ],
  },
  verify: {
    title: 'Wisse genau, mit wem du sprichst.',
    sub: 'Vergleiche die Sicherheitsnummer mit der anderen Person, persönlich oder im Anruf. Stimmt sie überein, hat sich niemand dazwischengeschaltet.',
    match: 'Die Nummern stimmen überein', undo: 'Rückgängig', done: 'Identität bestätigt', todo: 'Vergleiche mit dem Bildschirm der anderen Person',
  },
  devices: {
    title: 'Eine Identität. Jedes Gerät einzeln überprüft.',
    sub: 'Jedes Gerät erzeugt und verwahrt eigene Schlüssel. Kein privater Schlüssel wird zwischen Geräten geteilt, nicht einmal zwischen deinen.',
    points: [
      'Prüfe, benenne oder widerrufe jedes Gerät in Sekunden, direkt in der App.',
      'Sprache und Video laufen immer über ein Relay: nie eine direkte Verbindung, die deine IP-Adresse verrät.',
    ],
  },
  business: {
    eyebrow: 'Für Unternehmen',
    title: 'Kostenlos für alle. Stark für Teams.',
    sub: 'Ein Unternehmens-Workspace ergänzt Abteilungen, Rollen, Lizenzen und Mitarbeiterverwaltung, ohne jemals Nachrichteninhalte zu berühren, auch nicht für Admins.',
    points: [
      'Aktiviere deinen Workspace mit einem Lizenz-Token und lege in Minuten den ersten Admin an.',
      'Feingranulare Rollen und Rechte, vom einzelnen Raum bis zur ganzen Organisation.',
      'Die Verschlüsselung schützt jedes Gespräch auch vor Admins: Nicht einmal ein kompromittiertes Konto kann es lesen.',
      'Sitzungen, Geräte und Admin-Aktionen werden protokolliert, ohne je Nachrichteninhalte zu berühren.',
    ],
    activate: 'Unternehmen aktivieren', login: 'Unternehmens-Login',
  },
  final: { title: 'Deine Gespräche. Deine Schlüssel. Niemand sonst.', cta: 'Kostenloses Konto erstellen', preparing: 'Verschlüsselung wird auf deinem Gerät vorbereitet…' },
  footer: { tagline: 'Ende-zu-Ende-verschlüsselt mit Olm und Megolm.', login: 'Schon ein Konto? Anmelden' },
};

// Ogni lingua viene completata con l'inglese: se una voce manca (per
// esempio dopo una modifica a mano), si vede il testo inglese invece
// di un errore che blocca la pagina.
function completa(base, lingua) {
  if (Array.isArray(base)) return Array.isArray(lingua) ? lingua : base;
  if (typeof base !== 'object' || base === null) return lingua ?? base;
  const out = {};
  Object.keys(base).forEach((k) => {
    out[k] = completa(base[k], lingua ? lingua[k] : undefined);
  });
  return out;
}

export const TESTI = { en, it: completa(en, it), fr: completa(en, fr), es: completa(en, es), de: completa(en, de) };
export const LINGUE = [
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
];

export function linguaAttiva(i18n) {
  const code = String(i18n?.resolvedLanguage || i18n?.language || 'en').slice(0, 2).toLowerCase();
  return TESTI[code] ? code : 'en';
}

export function useTesti() {
  const { i18n } = useTranslation();
  const code = linguaAttiva(i18n);
  return { t: TESTI[code], lingua: code, i18n };
}
