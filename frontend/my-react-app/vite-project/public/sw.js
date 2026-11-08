// public/sw.js
//
// Palacan - service worker delle notifiche push (metadati fase 2d).
//
// La push e' solo una "sveglia": il server invia sempre lo stesso contenuto, senza nomi,
// stanze, anteprime o indirizzi. Questo file IGNORA qualunque dato ricevuto e mostra un
// testo neutro nella lingua del dispositivo. I messaggi veri si scaricano e si decifrano
// nell'app, sul dispositivo. Tutte le notifiche usano la stessa etichetta: piu' messaggi
// si accorpano in una sola, cosi' la schermata di blocco non rivela quanti ne sono arrivati.

/* eslint-disable no-restricted-globals */

const TESTI = {
  it: 'Hai un nuovo messaggio',
  en: 'You have a new message',
  es: 'Tienes un mensaje nuevo',
  fr: 'Vous avez un nouveau message',
  de: 'Du hast eine neue Nachricht',
};

function testoNeutro() {
  const lingua = String((self.navigator && self.navigator.language) || 'en').slice(0, 2).toLowerCase();
  return TESTI[lingua] || TESTI.en;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // Il contenuto ricevuto non viene letto ne' mostrato: e' una sveglia, sempre uguale.
  const options = {
    body: testoNeutro(),
    tag: 'palacan-nuovo',
    renotify: false,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: '/' },
  };
  event.waitUntil(self.registration.showNotification('Palacan', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
      return undefined;
    }),
  );
});
