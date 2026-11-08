import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as apiService from '../apiService';
import { getOrCreateDeviceId } from '../olmService';
import { chiavePrincipalePerBackup, firmaAltroDispositivo, statoQuestoDispositivo, EVENTO_STATO_DISPOSITIVO } from '../utils/chiavePrincipale';
import { codiceApprovazione, firmatoDaPrincipale } from '../utils/approvazioneDispositivi';

/**
 * Pannello self-service "I miei dispositivi" (Fase 4 multi-device).
 * Componente AUTONOMO - non presuppone nulla sul genitore, riceve solo
 * il token via prop. Nessun collegamento ancora a Dashboard.jsx/
 * AccountMenu: passo separato, dopo aver verificato questo da solo.
 *
 * [palacan-l4c4] Firma incrociata: accanto a ogni dispositivo attivo, "Firmato" oppure "Da approvare". Da un
 * dispositivo che ha la chiave principale si approva un dispositivo nuovo confrontando il codice di 8 cifre che il
 * nuovo mostra (calcolato dalla sua chiave vera) con quello qui (calcolato dalla chiave che consegna il server): se
 * coincidono, il server non ha infilato niente. Su un dispositivo che aspetta l'approvazione, in alto, il suo codice.
 */
export default function DeviceManagementPanel({ token }) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revokingId, setRevokingId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);  // [palacan-l4c4]
  const [stato, setStato] = useState(() => statoQuestoDispositivo());  // [palacan-l4c4]
  const [codici, setCodici] = useState({});  // [palacan-l4c4] id -> codice di confronto
  const [codiceMio, setCodiceMio] = useState(null);  // [palacan-l4c4]

  const io = stato ? stato.io : null;
  const mia = io ? chiavePrincipalePerBackup(io) : null;
  const mioDeviceId = (() => {
    try {
      return getOrCreateDeviceId();
    } catch (e) {
      return null;
    }
  })();

  const loadDevices = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await apiService.getMyDevices(token);
      setDevices(list);
    } catch (e) {
      console.error('DeviceManagementPanel: errore caricamento dispositivi', e);
      setError(t('account.devices_load_error', 'Errore nel caricamento dei dispositivi.'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // [palacan-l4c4] lo stato di questo dispositivo (firmato / da approvare) arriva in sottofondo
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const aggiorna = () => setStato(statoQuestoDispositivo());
    window.addEventListener(EVENTO_STATO_DISPOSITIVO, aggiorna);
    return () => window.removeEventListener(EVENTO_STATO_DISPOSITIVO, aggiorna);
  }, []);

  // [palacan-l4c4] codici di confronto: il mio dalla mia chiave VERA, gli altri dalla chiave che consegna il server
  useEffect(() => {
    let annullato = false;
    (async () => {
      if (stato && stato.stato === 'da_approvare') {
        const c = await codiceApprovazione(stato.io, stato.dispositivo, stato.curva);
        if (!annullato) setCodiceMio(c);
      } else if (!annullato) {
        setCodiceMio(null);
      }
      if (!io) return;
      const nuovi = {};
      for (const d of devices) {
        if (!d || d.revoked_at || !d.identity_key || d.device_id === mioDeviceId) continue;
        nuovi[d.id] = await codiceApprovazione(io, d.device_id, d.identity_key);
      }
      if (!annullato) setCodici(nuovi);
    })().catch(() => {});
    return () => {
      annullato = true;
    };
  }, [devices, stato, io, mioDeviceId]);

  const handleRevoke = async (deviceRowId) => {
    if (!deviceRowId || revokingId) return;
    setRevokingId(deviceRowId);
    try {
      await apiService.revokeDevice(deviceRowId, token);
      await loadDevices();
    } catch (e) {
      console.error('DeviceManagementPanel: errore revoca dispositivo', e);
      setError(t('account.devices_revoke_error', 'Errore nella revoca del dispositivo.'));
    } finally {
      setRevokingId(null);
    }
  };

  // [palacan-l4c4] approvare = firmare il dispositivo con la chiave principale di questo dispositivo
  const handleApprove = async (d) => {
    if (!d || approvingId || !io) return;
    setApprovingId(d.id);
    try {
      const ok = await firmaAltroDispositivo({ io, token, deviceId: d.device_id, curva: d.identity_key, api: apiService });
      if (!ok) throw new Error('firma non riuscita');
      await loadDevices();
    } catch (e) {
      console.error('DeviceManagementPanel: errore approvazione dispositivo', e);
      setError(t('account.devices_approve_error', 'Errore nell\'approvazione del dispositivo.'));
    } finally {
      setApprovingId(null);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  if (loading) {
    return <div className="device-panel-loading">{t('account.devices_loading', 'Caricamento dispositivi...')}</div>;
  }

  return (
    <div className="device-management-panel">
      <h3>{t('account.devices_title', 'I miei dispositivi')}</h3>

      {error && <div className="device-panel-error">{error}</div>}

      {codiceMio && (
        <div className="device-panel-pending mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">{t('account.devices_this_pending_title', 'Questo dispositivo aspetta l\'approvazione')}</p>
          <p className="text-xs opacity-80">
            {t('account.devices_this_pending_body', 'Finché non è approvato non riceve i messaggi nuovi. Su un tuo altro dispositivo apri "I miei dispositivi" e approva questo solo se il codice è uguale a quello qui sotto.')}
          </p>
          <p data-testid="codice-questo-dispositivo" className="mt-1 text-center font-mono text-lg tracking-widest">{codiceMio}</p>
        </div>
      )}

      {devices.length === 0 && !error && (
        <p>{t('account.devices_empty', 'Nessun dispositivo registrato ancora.')}</p>
      )}

      <ul className="device-list">
        {devices.map((d) => {
          const questo = d.device_id === mioDeviceId;
          const firmato = mia ? firmatoDaPrincipale(io, mia, d) : null;
          const daApprovare = !d.revoked_at && !questo && mia && !firmato && Boolean(codici[d.id]);
          return (
            <li key={d.id} className={d.revoked_at ? 'device-item revoked' : 'device-item'}>
              <div className="device-item-info">
                <span className="device-item-name">
                  {d.display_name || t('account.devices_unnamed', 'Dispositivo senza nome')}
                  {questo && <span className="device-item-this"> ({t('account.devices_this_device', 'questo dispositivo')})</span>}
                </span>
                <span className="device-item-dates">
                  {t('account.devices_last_seen', 'Ultimo utilizzo')}: {formatDate(d.last_seen_at)}
                </span>
                {d.revoked_at && (
                  <span className="device-item-revoked-badge">
                    {t('account.devices_revoked', 'Revocato')} — {formatDate(d.revoked_at)}
                  </span>
                )}
                {!d.revoked_at && firmato === true && (
                  <span className="device-item-signed-badge text-xs text-emerald-700 dark:text-emerald-400">
                    {t('account.devices_signed_badge', 'Firmato dalla tua chiave principale')}
                  </span>
                )}
                {daApprovare && (
                  <span className="device-item-pending text-xs text-amber-800 dark:text-amber-300">
                    {t('account.devices_pending_badge', 'Da approvare: approvalo solo se sul dispositivo nuovo vedi lo stesso codice')}
                    {' '}<span data-testid={`codice-${d.device_id}`} className="font-mono font-semibold">{codici[d.id]}</span>
                  </span>
                )}
              </div>

              {daApprovare && (
                <button
                  type="button"
                  className="device-item-approve-btn"
                  disabled={approvingId === d.id}
                  onClick={() => handleApprove(d)}
                >
                  {approvingId === d.id
                    ? t('account.devices_approving', 'Approvazione...')
                    : t('account.devices_approve_action', 'Il codice è uguale: approva')}
                </button>
              )}

              {!d.revoked_at && (
                <button
                  type="button"
                  className="device-item-revoke-btn"
                  disabled={revokingId === d.id}
                  onClick={() => handleRevoke(d.id)}
                >
                  {revokingId === d.id
                    ? t('account.devices_revoking', 'Revoca in corso...')
                    : t('account.devices_revoke_action', 'Revoca')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
