import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldAlert, X, QrCode, ScanLine } from 'lucide-react';
import {
  computeSafetyNumber,
  loadPeerIdentityKey,
  saveSafetyNumberVerified,
  isSafetyNumberVerified,
  chiaviNoteDelContatto,
  getPeerIdentityChangeWarning,
  acknowledgePeerIdentityChange,
} from '../olmService';
import { creaContenutoQr, creaContenutoQrV2, confrontaQr, matriceQr, percorsoSvgQr, ESITI_QR } from '../utils/verificaQr';
import { chiavePrincipalePerBackup } from '../utils/chiavePrincipale';
import { principaleDelContatto, numeroSicurezzaV2, principaleVerificata, segnaPrincipaleVerificata } from '../utils/fiduciaContatti';
import LettoreQr from './LettoreQr';

/**
 * Pannello "Verifica identità" (numero di sicurezza, stile Signal).
 *
 * Perché esiste: TOFU (vedi IdentityChangeWarningBanner) rileva un
 * cambio di identity key SOLO dopo il primo contatto - se un backend
 * compromesso sostituisse identity key/OTK al PRIMISSIMO scambio,
 * nessun meccanismo esistente se ne accorgerebbe. Questo pannello
 * risolve il problema: calcola un numero derivato dalle identity key
 * di ENTRAMBI gli utenti (interamente lato client, mai il server), che
 * i due possono confrontare fuori banda (di persona, per telefono) per
 * avere la certezza matematica che nessuno si sia messo in mezzo - se
 * anche una sola delle due chiavi fosse stata sostituita, il numero
 * calcolato dai due lati non coinciderebbe.
 *
 * [palacan-l4b] Di persona basta il codice QR: uno mostra il suo, l'altro lo inquadra, e il confronto lo fa il
 * dispositivo (vedi utils/verificaQr.js) - niente 30 cifre lette a occhio. Poi si fa al contrario.
 *
 * [palacan-l4c3] Se entrambi avete una CHIAVE PRINCIPALE (firma incrociata ibrida, ed25519 + ML-DSA-65) il numero e'
 * quello v2: 60 cifre dalle chiavi principali, SHA-512 ripetuto 5200 volte. Si verifica la PERSONA una volta e
 * valgono tutti i suoi dispositivi firmati: aggiungere un telefono non cambia il numero. Anche il QR passa alla v2.
 * Senza chiavi principali resta tutto come prima (v1).
 *
 * Componente AUTONOMO - riceve solo i due username e la propria
 * identity key, calcola tutto il resto da solo.
 */
const TESTI_ESITO = {
  [ESITI_QR.OK]: ['safety_number.qr_ok', 'Codice corretto: il dispositivo inquadrato è verificato. Ora fate il contrario: il tuo contatto inquadra il tuo codice.'],
  [ESITI_QR.NON_VALIDO]: ['safety_number.qr_not_valid', 'Questo non è un codice di verifica di Palacan.'],
  [ESITI_QR.ALTRO_CONTATTO]: ['safety_number.qr_other_contact', 'Questo codice è di un\'altra persona, non del contatto di questa chat.'],
  [ESITI_QR.NON_PER_TE]: ['safety_number.qr_not_for_you', 'Questo codice è stato creato per una chat con un\'altra persona, non con te.'],
  [ESITI_QR.TUA_CHIAVE_DIVERSA]: ['safety_number.qr_your_key_differs', 'ATTENZIONE: il dispositivo del tuo contatto non vede la tua chiave vera. Qualcuno può essersi messo in mezzo. Non scrivere cose riservate e avvisa il contatto.'],
  [ESITI_QR.CHIAVE_MAI_VISTA]: ['safety_number.qr_never_seen_key', 'ATTENZIONE: la chiave del dispositivo che hai inquadrato non è nessuna di quelle con cui stai parlando. Se il contatto non ha appena aggiunto un dispositivo, qualcuno può essersi messo in mezzo. Scrivetevi un messaggio da quel dispositivo e riprova.'],
  [ESITI_QR.SENZA_PRINCIPALE]: ['safety_number.qr_needs_master', 'Il tuo contatto usa la verifica nuova (chiave principale), ma qui non è ancora pronta. Scrivetevi un messaggio e riprova tra un minuto.'],
};

export default function SafetyNumberPanel({ username, peerUsername, myIdentityKey, onClose }) {
  const { t } = useTranslation();
  const [numeroSicurezza, setNumeroSicurezza] = useState(null);
  const [verificato, setVerificato] = useState(false);
  const [errore, setErrore] = useState(null);
  const [chiaveContatto, setChiaveContatto] = useState(null);
  const [principali, setPrincipali] = useState(null); // [palacan-l4c3] { mia, contatto } se entrambe ci sono
  const [modoQr, setModoQr] = useState(null); // null | 'mostra' | 'inquadra'
  const [esitoQr, setEsitoQr] = useState(null);

  const calcola = useCallback(async () => {
    setErrore(null);

    // [palacan-l4c3] chiavi principali: la mia (pronta su questo dispositivo) e quella ricordata del contatto
    const mia = chiavePrincipalePerBackup(username);
    const suaPrincipale = principaleDelContatto(username, peerUsername);
    if (mia && suaPrincipale) {
      try {
        const numero = await numeroSicurezzaV2(username, mia, peerUsername, suaPrincipale);
        setPrincipali({ mia, contatto: suaPrincipale });
        setNumeroSicurezza(numero);
        setVerificato(principaleVerificata(username, peerUsername) === suaPrincipale.impronta);
        return;
      } catch (e) {
        console.error('❌ Calcolo numero di sicurezza v2 fallito:', e);
      }
    }
    setPrincipali(null);

    const peerIdentityKey = loadPeerIdentityKey(username, peerUsername);
    setChiaveContatto(peerIdentityKey || null);
    if (!peerIdentityKey || !myIdentityKey) {
      setErrore(
        t(
          'safety_number.missing_key',
          'Chiave di identità non ancora disponibile per questo contatto - riprova dopo aver scambiato almeno un messaggio.'
        )
      );
      return;
    }

    try {
      const numero = await computeSafetyNumber(username, myIdentityKey, peerUsername, peerIdentityKey);
      setNumeroSicurezza(numero);
      setVerificato(isSafetyNumberVerified(username, peerUsername, numero));
    } catch (e) {
      console.error('❌ Calcolo numero di sicurezza fallito:', e);
      setErrore(t('safety_number.compute_error', 'Impossibile calcolare il numero di sicurezza.'));
    }
  }, [username, peerUsername, myIdentityKey, t]);

  useEffect(() => {
    calcola();
  }, [calcola]);

  // [palacan-l4c3] la verifica v2 vale per la persona: chiude anche l'avviso se riguardava proprio questa chiave
  const segnaVerificataV2 = useCallback((improntaContatto, numero) => {
    segnaPrincipaleVerificata(username, peerUsername, improntaContatto);
    if (numero) saveSafetyNumberVerified(username, peerUsername, numero);
    const avviso = getPeerIdentityChangeWarning(username, peerUsername);
    if (avviso && avviso.newKey === improntaContatto) {
      acknowledgePeerIdentityChange(username, peerUsername);
      if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('palacan:identita-cambiata', { detail: { peer: peerUsername } }));
      }
    }
  }, [username, peerUsername]);

  const handleConfermaVerifica = () => {
    if (!numeroSicurezza) return;
    if (principali) segnaVerificataV2(principali.contatto.impronta, numeroSicurezza);
    else saveSafetyNumberVerified(username, peerUsername, numeroSicurezza);
    setVerificato(true);
  };

  // il mio codice: v2 (chiavi principali) se ci sono, altrimenti v1 (io, la mia chiave, la chiave che IO vedo per lui)
  const percorsoQr = useMemo(() => {
    const contenuto = principali
      ? creaContenutoQrV2({ io: username, improntaIo: principali.mia.impronta, contatto: peerUsername, improntaContatto: principali.contatto.impronta })
      : creaContenutoQr({ io: username, chiaveIo: myIdentityKey, contatto: peerUsername, chiaveContatto });
    if (!contenuto) return null;
    const matrice = matriceQr(contenuto);
    return { d: percorsoSvgQr(matrice), lato: matrice.length };
  }, [username, myIdentityKey, peerUsername, chiaveContatto, principali]);

  const handleLetto = useCallback(async (testo) => {
    setModoQr(null);
    const risultato = confrontaQr(testo, {
      io: username,
      chiaveIo: myIdentityKey,
      contatto: peerUsername,
      chiaviNoteContatto: chiaviNoteDelContatto(username, peerUsername),
      improntaMia: principali ? principali.mia.impronta : null,
      improntaContatto: principali ? principali.contatto.impronta : null,
    });
    if (risultato.esito === ESITI_QR.OK) {
      try {
        if (risultato.versione === 2) {
          segnaVerificataV2(risultato.improntaContatto, principali ? numeroSicurezza : null);
          setVerificato(true);
        } else {
          const numero = await computeSafetyNumber(username, myIdentityKey, peerUsername, risultato.chiaveContatto);
          if (numero) saveSafetyNumberVerified(username, peerUsername, numero);
          // l'avviso di chiave cambiata riguardava proprio questo dispositivo: la verifica di persona lo risolve
          const avviso = getPeerIdentityChangeWarning(username, peerUsername);
          if (avviso && avviso.newKey === risultato.chiaveContatto) {
            acknowledgePeerIdentityChange(username, peerUsername);
            if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
              window.dispatchEvent(new CustomEvent('palacan:identita-cambiata', { detail: { peer: peerUsername } }));
            }
          }
          if (numeroSicurezza && !principali) setVerificato(isSafetyNumberVerified(username, peerUsername, numeroSicurezza));
        }
      } catch (e) {
        console.error('❌ Salvataggio verifica con QR fallito:', e);
      }
    }
    setEsitoQr(risultato.esito);
  }, [username, peerUsername, myIdentityKey, numeroSicurezza, principali, segnaVerificataV2]);

  const esitoBuono = esitoQr === ESITI_QR.OK;
  const esitoGrave = esitoQr === ESITI_QR.TUA_CHIAVE_DIVERSA || esitoQr === ESITI_QR.CHIAVE_MAI_VISTA;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {verificato ? (
              <ShieldCheck size={20} className="shrink-0 text-emerald-600" />
            ) : (
              <ShieldAlert size={20} className="shrink-0 text-amber-500" />
            )}
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t('safety_number.title', { peer: peerUsername, defaultValue: `Verifica identità di ${peerUsername}` })}
            </h3>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
              aria-label={t('safety_number.close', 'Chiudi')}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <p className="mb-4 text-xs text-zinc-600 dark:text-zinc-400">
          {t(
            'safety_number.explanation',
            'Confronta questo numero con quello che vede il tuo contatto, di persona o per telefono. Se coincide, sei certo che nessuno si sia messo in mezzo alla vostra conversazione.'
          )}
        </p>

        {errore && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {errore}
          </div>
        )}

        {numeroSicurezza && !principali && (
          <div className="mb-4 rounded-xl bg-zinc-100 p-4 text-center font-mono text-lg tracking-wider text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
            {numeroSicurezza}
          </div>
        )}

        {numeroSicurezza && principali && (
          <div className="mb-4">
            <div data-testid="numero-v2" className="grid grid-cols-4 gap-x-3 gap-y-1 rounded-xl bg-zinc-100 p-4 text-center font-mono text-base tracking-wider text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
              {numeroSicurezza.split(' ').map((gruppo, i) => (
                <span key={i}>{gruppo}</span>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {t('safety_number.v2_note', 'Calcolato dalle chiavi principali: vale per tutti i dispositivi firmati del contatto, anche quelli che aggiungerà.')}
            </p>
          </div>
        )}

        {esitoQr && (
          <div
            role="status"
            className={`mb-4 rounded-xl border px-3 py-2 text-xs ${
              esitoBuono
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                : esitoGrave
                  ? 'border-red-400 bg-red-50 font-medium text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
                  : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
            }`}
          >
            {t(TESTI_ESITO[esitoQr][0], TESTI_ESITO[esitoQr][1])}
          </div>
        )}

        {modoQr === 'mostra' && percorsoQr && (
          <div className="mb-4 flex flex-col items-center gap-2">
            <svg
              data-testid="qr-verifica"
              viewBox={`-4 -4 ${percorsoQr.lato + 8} ${percorsoQr.lato + 8}`}
              className="h-56 w-56 rounded-xl bg-white"
              shapeRendering="crispEdges"
              role="img"
              aria-label={t('safety_number.qr_show', 'Mostra il mio codice QR')}
            >
              <rect x="-4" y="-4" width={percorsoQr.lato + 8} height={percorsoQr.lato + 8} fill="#ffffff" />
              <path d={percorsoQr.d} fill="#000000" />
            </svg>
            <p className="text-center text-xs text-zinc-600 dark:text-zinc-400">
              {t('safety_number.qr_show_help', 'Fai inquadrare questo codice al tuo contatto, dal suo telefono, nella chat con te.')}
            </p>
          </div>
        )}

        {modoQr === 'inquadra' && (
          <LettoreQr onLetto={handleLetto} onAnnulla={() => setModoQr(null)} />
        )}

        {numeroSicurezza && modoQr !== 'inquadra' && (
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => { setEsitoQr(null); setModoQr(modoQr === 'mostra' ? null : 'mostra'); }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <QrCode size={14} />
              {modoQr === 'mostra'
                ? t('safety_number.qr_hide', 'Nascondi il codice')
                : t('safety_number.qr_show', 'Mostra il mio codice QR')}
            </button>
            <button
              type="button"
              onClick={() => { setEsitoQr(null); setModoQr('inquadra'); }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <ScanLine size={14} />
              {t('safety_number.qr_scan', 'Inquadra il suo codice')}
            </button>
          </div>
        )}

        {verificato && (
          <p className="mb-4 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <ShieldCheck size={14} />
            {t('safety_number.verified_badge', 'Identità verificata')}
          </p>
        )}

        {numeroSicurezza && !verificato && (
          <button
            type="button"
            onClick={handleConfermaVerifica}
            className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            {t('safety_number.confirm_match', 'I numeri coincidono, segna come verificato')}
          </button>
        )}
      </div>
    </div>
  );
}
