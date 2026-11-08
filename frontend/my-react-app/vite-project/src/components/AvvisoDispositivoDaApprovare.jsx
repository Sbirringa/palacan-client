import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, X } from 'lucide-react';
import { statoQuestoDispositivo, EVENTO_STATO_DISPOSITIVO } from '../utils/chiavePrincipale';
import { codiceApprovazione } from '../utils/approvazioneDispositivi';

/**
 * [palacan-l4c5] Avviso "questo dispositivo aspetta l'approvazione", visibile appena si entra nella chat.
 * Un dispositivo nuovo senza la frase del backup non riceve i messaggi nuovi finche' un altro dispositivo non lo
 * approva (firma incrociata, L4c4): qui si dice subito, con il codice di confronto (calcolato dalla chiave VERA di
 * questo dispositivo) e un pulsante che apre "I miei dispositivi". Sparisce da solo quando il dispositivo e'
 * approvato; "Piu' tardi" lo nasconde fino al prossimo accesso.
 */
const CHIAVE_NASCOSTO = 'palacan_avviso_approvazione_nascosto';

function nascostoInQuestaSessione() {
  try {
    return sessionStorage.getItem(CHIAVE_NASCOSTO) === '1';
  } catch (_) {
    return false;
  }
}

export default function AvvisoDispositivoDaApprovare({ onApri }) {
  const { t } = useTranslation();
  const [stato, setStato] = useState(() => statoQuestoDispositivo());
  const [codice, setCodice] = useState(null);
  const [nascosto, setNascosto] = useState(nascostoInQuestaSessione);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const aggiorna = () => setStato(statoQuestoDispositivo());
    aggiorna();
    window.addEventListener(EVENTO_STATO_DISPOSITIVO, aggiorna);
    return () => window.removeEventListener(EVENTO_STATO_DISPOSITIVO, aggiorna);
  }, []);

  const daApprovare = Boolean(stato && stato.stato === 'da_approvare');

  useEffect(() => {
    let annullato = false;
    if (!daApprovare) {
      setCodice(null);
      return undefined;
    }
    codiceApprovazione(stato.io, stato.dispositivo, stato.curva)
      .then((c) => { if (!annullato) setCodice(c); })
      .catch(() => {});
    return () => {
      annullato = true;
    };
  }, [daApprovare, stato]);

  const handlePiuTardi = () => {
    try {
      sessionStorage.setItem(CHIAVE_NASCOSTO, '1');
    } catch (_) { /* resta nascosto solo in questa schermata */ }
    setNascosto(true);
  };

  if (!daApprovare || nascosto || !codice) return null;

  return (
    <div
      role="alert"
      data-testid="avviso-dispositivo-da-approvare"
      className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-md rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 shadow-2xl dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert size={18} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">{t('account.devices_this_pending_title', 'Questo dispositivo aspetta l\'approvazione')}</p>
          <p className="text-xs opacity-80">
            {t('account.devices_this_pending_body', 'Finché non è approvato non riceve i messaggi nuovi. Su un tuo altro dispositivo apri "I miei dispositivi" e approva questo solo se il codice è uguale a quello qui sotto.')}
          </p>
          <p className="mt-1 font-mono text-lg tracking-widest">{codice}</p>
          <div className="mt-2 flex gap-2">
            {onApri && (
              <button
                type="button"
                onClick={onApri}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
              >
                {t('account.devices_pending_banner_open', 'Apri "I miei dispositivi"')}
              </button>
            )}
            <button
              type="button"
              onClick={handlePiuTardi}
              className="rounded-lg border border-amber-600/40 px-3 py-1.5 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40"
            >
              {t('account.devices_pending_banner_later', 'Più tardi')}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handlePiuTardi}
          aria-label={t('account.devices_pending_banner_later', 'Più tardi')}
          className="shrink-0 rounded-lg p-1 opacity-70 hover:opacity-100"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
