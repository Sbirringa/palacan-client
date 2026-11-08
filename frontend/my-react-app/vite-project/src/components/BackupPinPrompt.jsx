// src/components/BackupPinPrompt.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BRAND, SPETTRO, FONT, FONT_IMPORT, PalacanIcon } from './palacanBrand';

// ============================================================
// FINESTRA DELLA PASSPHRASE DEL BACKUP — identita' PALACAN.
// SOLO ASPETTO: props, controlli (min. 12 caratteri, non solo numeri,
// non un solo carattere ripetuto, conferma in creazione), chiavi di
// traduzione e comportamento di Invio sono identici a prima.
// ============================================================

export default function BackupPinPrompt({
  mode = 'recover',
  onSubmit,
  onSkip,
  loading = false,
  error = '',
}) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [localError, setLocalError] = useState('');
  const isCreate = mode === 'create';
  const isUnlock = mode === 'unlock';  // [palacan-n4b] riattivare il backup sullo stesso dispositivo (nessun recupero)

  const handleSubmit = (e) => {
    if (e?.preventDefault) e.preventDefault();
    setLocalError('');
    // FIX (incoerenza scoperta scrivendo i test): questo controllo era
    // "almeno 8 caratteri", ma la cifratura vera (olmService.js::
    // encryptBackupBundle) richiede almeno 12, e rifiuta anche
    // passphrase puramente numeriche o fatte di un solo carattere
    // ripetuto. Ora le stesse regole sono applicate SUBITO, qui, cosi'
    // l'utente ha un riscontro immediato e coerente.
    if (passphrase.length < 12) {
      setLocalError(t('account.backup_min_chars_error'));
      return;
    }
    if (/^[0-9]+$/.test(passphrase)) {
      setLocalError(t('account.backup_only_numbers_error'));
      return;
    }
    if (/^(.)\1+$/.test(passphrase)) {
      setLocalError(t('account.backup_repeated_char_error'));
      return;
    }
    if (isCreate && passphrase !== confirmPassphrase) {
      setLocalError(t('account.backup_mismatch_error'));
      return;
    }
    onSubmit(passphrase);
  };

  /* Niente <form>/type="submit": evita il trigger nativo "Salvare la
     password?" di Chrome. Invio da tastiera resta funzionante. */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const errore = localError || error;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-lenis-prevent
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto overscroll-contain p-4"
      style={{ background: 'rgba(5,6,11,0.72)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', fontFamily: FONT }}
    >
      <style>{`
        ${FONT_IMPORT}
        .pb-campo {
          background: rgba(243,241,236,0.04);
          color: ${BRAND.luce};
          border: 0;
          outline: none !important;
          box-shadow: inset 0 0 0 1px rgba(243,241,236,0.1);
          caret-color: ${BRAND.ghiaccio};
          font-family: ${FONT};
        }
        .pb-campo::placeholder { color: rgba(141,143,160,0.6); }
        .pb-campo:focus, .pb-campo:focus-visible {
          outline: none !important;
          background: rgba(157,180,255,0.05);
          box-shadow: inset 0 0 0 1px rgba(157,180,255,0.55), 0 0 28px rgba(157,180,255,0.12);
        }
        .pb-focus:focus-visible { outline: none; box-shadow: 0 0 0 2px ${BRAND.abisso}, 0 0 0 3px rgba(157,180,255,0.7); }
      `}</style>

      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 10, filter: 'blur(8px)' }}
        animate={{ scale: 1, opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md rounded-[28px] p-px"
        style={{ background: 'linear-gradient(135deg, rgba(157,180,255,0.45), rgba(243,241,236,0.07) 40%, rgba(243,241,236,0.04) 62%, rgba(255,197,138,0.4))', boxShadow: '0 60px 140px rgba(0,0,0,0.65)' }}
      >
        <div className="relative overflow-hidden rounded-[27px] p-7" style={{ background: 'linear-gradient(180deg, #11131D, #08090F)', color: BRAND.luce }}>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40" style={{ background: 'radial-gradient(70% 100% at 50% 0%, rgba(157,180,255,0.1), transparent)' }} />

          <div className="relative">
            <div className="mb-6 flex justify-center">
              <PalacanIcon size={52} />
            </div>

            {isCreate ? (
              <>
                <h2 className="mb-3 text-center text-[24px] leading-tight" style={{ fontWeight: 300, letterSpacing: '-0.03em' }}>{t('account.backup_protect_title')}</h2>
                <p className="mb-6 text-center text-[14px] leading-relaxed" style={{ color: BRAND.nebbia, fontWeight: 300 }}>
                  {t('account.backup_protect_description_pre')}{' '}
                  <strong style={{ color: BRAND.luce, fontWeight: 500 }}>{t('account.backup_protect_description_bold')}</strong>{' '}
                  {t('account.backup_protect_description_post')}
                </p>
              </>
            ) : (
              <>
                <h2 className="mb-3 text-center text-[24px] leading-tight" style={{ fontWeight: 300, letterSpacing: '-0.03em' }}>{t(isUnlock ? 'account.backup_unlock_title' : 'account.backup_recover_title')}</h2>
                <p className="mb-6 text-center text-[14px] leading-relaxed" style={{ color: BRAND.nebbia, fontWeight: 300 }}>
                  {t(isUnlock ? 'account.backup_unlock_description' : 'account.backup_recover_description')}
                </p>
              </>
            )}

            {/* Niente <form> reale: vedi handleSubmit/handleKeyDown sopra */}
            <div className="space-y-3">
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('account.backup_passphrase_placeholder')}
                className="pb-campo w-full rounded-2xl px-4 py-3.5 text-[15px] transition-[box-shadow,background] duration-200"
                autoFocus
              />
              {isCreate && (
                <input
                  type="password"
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('account.backup_confirm_passphrase_placeholder')}
                  className="pb-campo w-full rounded-2xl px-4 py-3.5 text-[15px] transition-[box-shadow,background] duration-200"
                />
              )}
              {errore && (
                <p className="rounded-2xl px-4 py-2.5 text-sm" style={{ background: 'rgba(255,120,120,0.07)', color: '#F4B3B3', boxShadow: 'inset 0 0 0 1px rgba(255,120,120,0.22)' }}>
                  {errore}
                </p>
              )}
              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="pb-focus group relative flex-1 rounded-full py-3.5 text-[15px] font-medium transition-transform duration-150 active:scale-[0.99] disabled:opacity-50"
                  style={{ background: BRAND.luce, color: BRAND.abisso }}
                >
                  <span aria-hidden="true" className="pointer-events-none absolute -inset-[2px] -z-10 rounded-full opacity-0 blur-[10px] transition-opacity duration-500 group-hover:opacity-60" style={{ background: SPETTRO }} />
                  {loading ? t('account.backup_waiting') : isCreate ? t('account.backup_save_button') : isUnlock ? t('account.backup_unlock_button') : t('account.backup_recover_button')}
                </button>
                {!isCreate && onSkip && (
                  <button
                    type="button"
                    onClick={onSkip}
                    disabled={loading}
                    className="pb-focus rounded-full px-5 py-3.5 text-[14.5px] transition-colors hover:bg-white/[0.05] disabled:opacity-50"
                    style={{ color: BRAND.luce, boxShadow: `inset 0 0 0 1px ${BRAND.lineaForte}` }}
                  >
                    {t(isUnlock ? 'account.backup_unlock_skip_button' : 'account.backup_skip_button')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
