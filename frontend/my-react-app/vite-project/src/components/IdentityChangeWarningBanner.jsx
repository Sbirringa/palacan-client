import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { getPeerIdentityChangeWarning, acknowledgePeerIdentityChange } from '../olmService';
import { contaNonFirmati, EVENTO_NON_FIRMATI } from '../utils/dispositiviNonFirmati';  // [palacan-l4c3]

/**
 * Banner "l'identita' di questo contatto e' cambiata" (TOFU/Safety
 * Number, stile Signal). Componente AUTONOMO - riceve solo username
 * (utente locale) e peerUsername (con chi sta chattando), legge da
 * solo lo stato del cambiamento gia' rilevato da savePeerIdentityKey.
 * Non renderizza nulla se non c'e' nessun avviso attivo (return null).
 *
 * [palacan-l4a] Se il contatto era VERIFICATO (numero di sicurezza confermato) l'avviso e' rosso e l'invio nella
 * chat 1:1 resta bloccato finche' non si conferma (come Signal): una chiave mai vista di un contatto verificato e'
 * esattamente cio' che un attacco produrrebbe. Il banner compare subito, anche a chat aperta
 * (evento "palacan:identita-cambiata").
 *
 * [palacan-l4c3] Sotto, se il contatto ha dispositivi NON firmati dalla sua chiave principale: quanti sono e che non
 * ricevono i messaggi finche' lui non li approva (firma incrociata).
 */
export default function IdentityChangeWarningBanner({ username, peerUsername }) {
  const { t } = useTranslation();
  const [warning, setWarning] = useState(null);
  const [nonFirmati, setNonFirmati] = useState(0);  // [palacan-l4c3]

  const checkWarning = useCallback(() => {
    if (!username || !peerUsername) {
      setWarning(null);
      return;
    }
    setWarning(getPeerIdentityChangeWarning(username, peerUsername));
  }, [username, peerUsername]);

  useEffect(() => {
    checkWarning();
  }, [checkWarning]);

  // [palacan-l4a] chiave cambiata mentre la chat e' aperta: il banner compare subito
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const aggiorna = () => checkWarning();
    window.addEventListener('palacan:identita-cambiata', aggiorna);
    return () => window.removeEventListener('palacan:identita-cambiata', aggiorna);
  }, [checkWarning]);

  // [palacan-l4c3] dispositivi del contatto esclusi perche' non firmati dalla sua chiave principale
  useEffect(() => {
    const conta = () => setNonFirmati(username && peerUsername ? contaNonFirmati(username, peerUsername) : 0);
    conta();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(EVENTO_NON_FIRMATI, conta);
    return () => window.removeEventListener(EVENTO_NON_FIRMATI, conta);
  }, [username, peerUsername]);

  const avvisoNonFirmati = nonFirmati > 0 ? (
    <div className="identity-unsigned-devices flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>
        {t('dashboard.chat_layout.unsigned_devices', {
          peer: peerUsername,
          count: nonFirmati,
          defaultValue: `${nonFirmati} dispositivi di ${peerUsername} non sono firmati dalla sua chiave principale: non ricevono i tuoi messaggi finché non li approva.`,
        })}
      </span>
    </div>
  ) : null;

  const handleAcknowledge = () => {
    acknowledgePeerIdentityChange(username, peerUsername);
    setWarning(null);
  };

  if (!warning) return avvisoNonFirmati;

  if (warning.verificato) {
    return (
      <>
      <div className="identity-change-warning-banner identity-change-warning-banner--verificato flex items-start gap-2 border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
        <ShieldAlert size={18} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">
            {t('dashboard.chat_layout.identity_changed_verified_title', { peer: peerUsername, defaultValue: `Hai verificato ${peerUsername}, ma ora usa una chiave mai vista` })}
          </p>
          <p className="text-xs opacity-80">
            {t('dashboard.chat_layout.identity_changed_verified_body', 'Invio bloccato. Può essere un dispositivo nuovo o una reinstallazione, oppure qualcuno che si mette in mezzo. Confronta di nuovo il numero di sicurezza, di persona o per telefono, prima di sbloccare.')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleAcknowledge}
          className="shrink-0 rounded-lg border border-red-600/40 px-2 py-1 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/40"
        >
          {t('dashboard.chat_layout.identity_changed_unlock', 'Ho capito, sblocca')}
        </button>
      </div>
      {avvisoNonFirmati}
      </>
    );
  }

  return (
    <>
    <div className="identity-change-warning-banner flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">
          {t('dashboard.chat_layout.identity_changed_title', { peer: peerUsername, defaultValue: `L'identità di ${peerUsername} è cambiata` })}
        </p>
        <p className="text-xs opacity-80">
          {t('dashboard.chat_layout.identity_changed_body', 'Potrebbe essere un cambio dispositivo legittimo, oppure qualcosa da verificare. Se non sei sicuro, chiedi conferma per un altro canale.')}
        </p>
      </div>
      <button
        type="button"
        onClick={handleAcknowledge}
        className="shrink-0 rounded-lg border border-amber-600/40 px-2 py-1 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40"
      >
        {t('dashboard.chat_layout.identity_changed_acknowledge', 'Ho capito')}
      </button>
    </div>
    {avvisoNonFirmati}
    </>
  );
}
