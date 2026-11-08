// src/pushService.js

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');  // [palacan-t1] come apiService: mai l'indirizzo scritto a mano
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

/**
 * Registra il service worker (sw.js) e restituisce la registration.
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service worker non supportato dal browser.');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service worker registrato:', registration);
    return registration;
  } catch (err) {
    console.error('Errore registrando il service worker:', err);
    return null;
  }
}

/**
 * Chiede il permesso per le notifiche al browser.
 */
export async function askNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('Notification API non supportata.');
    return 'denied';
  }

  // Se l’utente ha già messo "Blocca", non puoi chiedere di nuovo da codice
  if (Notification.permission === 'denied') {
    console.warn(
      'Permesso notifiche già negato dal browser. ' +
      'Per riattivarlo vai nelle impostazioni del sito e cambia "Notifiche" su Consenti o Chiedi.'
    );
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  console.log('Permission notifiche:', permission);
  return permission;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Registra il client per il push:
 * - crea la subscription nel browser
 * - la manda al backend /push/register con il token di autenticazione.
 */
export async function subscribeToPush(authToken) {
  if (!authToken) {
    console.warn('Nessun authToken fornito per subscribeToPush.');
    return null;
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications non supportate da questo browser.');
    return null;
  }

  // Se è già denied, evitiamo di chiamare requestPermission di nuovo
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    console.warn(
      'Permesso notifiche è "denied". ' +
      'Per cambiare, apri le impostazioni del sito nel browser e sblocca le notifiche.'
    );
    return null;
  }

  const registration = await registerServiceWorker();
  if (!registration) return null;

  const permission = await askNotificationPermission();
  if (permission !== 'granted') {
    console.warn('Permesso notifiche non concesso.');
    return null;
  }

  try {
    const options = {
      userVisibleOnly: true,
    };

    if (VAPID_PUBLIC_KEY) {
      options.applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    }

    const subscription = await registration.pushManager.subscribe(options);
    const subscriptionJson = subscription.toJSON();
    console.log('Push subscription creata:', subscriptionJson);

    // Invia la subscription al backend
    const res = await fetch(`${API_BASE_URL}/push/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(subscriptionJson),
    });

    if (!res.ok) {
      console.error('Errore registrando la subscription sul backend:', res.status);
      return null;
    }

    return subscriptionJson;
  } catch (err) {
    console.error('Errore creando la push subscription:', err);
    return null;
  }
}

/**
 * Cancella la subscription push:
 * - rimuove la subscription nel browser
 * - la rimuove dal backend /push/unregister usando l’endpoint.
 */
export async function unsubscribeFromPush(authToken) {
  if (!authToken) {
    console.warn('Nessun authToken fornito per unsubscribeFromPush.');
    return false;
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  const subscriptionJson = subscription.toJSON();

  try {
    const success = await subscription.unsubscribe();
    console.log('Push subscription cancellata localmente:', success);

    // Notifica il backend per rimuovere la subscription
    const res = await fetch(`${API_BASE_URL}/push/unregister`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(subscriptionJson),
    });

    if (!res.ok) {
      console.error('Errore nel cancellare la subscription sul backend:', res.status);
    }

    return success;
  } catch (err) {
    console.error('Errore cancellando la push subscription:', err);
    return false;
  }
}
