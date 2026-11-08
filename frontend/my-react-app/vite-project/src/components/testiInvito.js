// src/components/testiInvito.js
//
// Palacan - testi della pagina d'invito, nelle cinque lingue dell'app (inglese per impostazione predefinita).
// Seguono la lingua scelta nel selettore (i18next), come i testi della home (testiHome).

const en = {
  caricamento: 'Opening your invite…',
  ingresso: 'Sending your contact request…',
  invitatoDa: (chi) => `${chi} invited you to Palacan`,
  invitato: "You've been invited to Palacan",
  conversazione: (nome) => `Conversation: ${nome}`,
  spiegazione: "Create an account and your contact request will reach them. As soon as it's accepted, you can chat. Your messages are end-to-end encrypted: only the people in the conversation can read them.",
  password: "You'll also need a password to join this conversation. Ask the person who invited you for it, on a different channel from this link.",
  creaAccount: 'Create an account',
  accedi: 'I already have an account',
  nonDisponibile: 'This invite is no longer available',
  nonDisponibileSpiega: 'The link may have expired or already been used. Ask the person who invited you to send you a new one.',
  suggerimento: 'Move the pointer to change the point of view',
  rivedi: 'Replay',
};

const it = {
  caricamento: "Apertura dell'invito…",
  ingresso: 'Invio della richiesta di contatto…',
  invitatoDa: (chi) => `${chi} ti ha invitato su Palacan`,
  invitato: 'Hai ricevuto un invito su Palacan',
  conversazione: (nome) => `Conversazione: ${nome}`,
  spiegazione: 'Crea un account e la tua richiesta di contatto arriverà a chi ti ha invitato. Appena verrà accettata, potrete chattare. I messaggi sono cifrati end-to-end: possono leggerli solo le persone nella conversazione.',
  password: 'Per entrare in questa conversazione ti servirà anche una password: chiedila a chi ti ha invitato, su un canale diverso da questo link.',
  creaAccount: 'Crea un account',
  accedi: 'Ho già un account',
  nonDisponibile: 'Questo invito non è più disponibile',
  nonDisponibileSpiega: 'Il link potrebbe essere scaduto o già stato usato. Chiedi a chi ti ha invitato di mandartene uno nuovo.',
  suggerimento: 'Muovi il puntatore per cambiare punto di vista',
  rivedi: 'Rivedi',
};

const fr = {
  caricamento: "Ouverture de l'invitation…",
  ingresso: 'Envoi de votre demande de contact…',
  invitatoDa: (chi) => `${chi} vous invite sur Palacan`,
  invitato: 'Vous avez reçu une invitation sur Palacan',
  conversazione: (nome) => `Conversation : ${nome}`,
  spiegazione: "Créez un compte et votre demande de contact sera envoyée à la personne qui vous a invité. Dès qu'elle sera acceptée, vous pourrez discuter. Vos messages sont chiffrés de bout en bout : seules les personnes présentes dans la conversation peuvent les lire.",
  password: "Il vous faudra aussi un mot de passe pour rejoindre cette conversation. Demandez-le à la personne qui vous a invité, par un autre canal que ce lien.",
  creaAccount: 'Créer un compte',
  accedi: "J'ai déjà un compte",
  nonDisponibile: "Cette invitation n'est plus disponible",
  nonDisponibileSpiega: "Le lien a peut-être expiré ou a déjà été utilisé. Demandez à la personne qui vous a invité de vous en envoyer un nouveau.",
  suggerimento: 'Déplacez le pointeur pour changer de point de vue',
  rivedi: 'Revoir',
};

const es = {
  caricamento: 'Abriendo tu invitación…',
  ingresso: 'Enviando tu solicitud de contacto…',
  invitatoDa: (chi) => `${chi} te ha invitado a Palacan`,
  invitato: 'Has recibido una invitación a Palacan',
  conversazione: (nome) => `Conversación: ${nome}`,
  spiegazione: 'Crea una cuenta y tu solicitud de contacto llegará a quien te invitó. En cuanto la acepte, podréis chatear. Tus mensajes están cifrados de extremo a extremo: solo las personas de la conversación pueden leerlos.',
  password: 'Para unirte a esta conversación también necesitarás una contraseña. Pídesela a quien te invitó, por un canal distinto de este enlace.',
  creaAccount: 'Crear una cuenta',
  accedi: 'Ya tengo una cuenta',
  nonDisponibile: 'Esta invitación ya no está disponible',
  nonDisponibileSpiega: 'Es posible que el enlace haya caducado o ya se haya usado. Pide a quien te invitó que te envíe uno nuevo.',
  suggerimento: 'Mueve el puntero para cambiar el punto de vista',
  rivedi: 'Volver a ver',
};

const de = {
  caricamento: 'Einladung wird geöffnet …',
  ingresso: 'Kontaktanfrage wird gesendet …',
  invitatoDa: (chi) => `${chi} hat dich zu Palacan eingeladen`,
  invitato: 'Du hast eine Einladung zu Palacan erhalten',
  conversazione: (nome) => `Unterhaltung: ${nome}`,
  spiegazione: 'Erstelle ein Konto, und deine Kontaktanfrage geht an die Person, die dich eingeladen hat. Sobald sie angenommen ist, könnt ihr chatten. Deine Nachrichten sind Ende-zu-Ende-verschlüsselt: Nur die Personen in der Unterhaltung können sie lesen.',
  password: 'Für diese Unterhaltung brauchst du außerdem ein Passwort. Frag die Person, die dich eingeladen hat – über einen anderen Kanal als diesen Link.',
  creaAccount: 'Konto erstellen',
  accedi: 'Ich habe bereits ein Konto',
  nonDisponibile: 'Diese Einladung ist nicht mehr verfügbar',
  nonDisponibileSpiega: 'Der Link ist möglicherweise abgelaufen oder wurde bereits verwendet. Bitte die Person, die dich eingeladen hat, dir einen neuen zu schicken.',
  suggerimento: 'Bewege den Zeiger, um den Blickwinkel zu ändern',
  rivedi: 'Erneut ansehen',
};

export const TESTI_INVITO = { en, it, fr, es, de };

export function testiInvito(lingua) {
  return TESTI_INVITO[String(lingua || 'en').slice(0, 2).toLowerCase()] || en;
}
