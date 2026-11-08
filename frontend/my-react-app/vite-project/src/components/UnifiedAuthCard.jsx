import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, KeyRound, Loader2, ArrowRight, CheckCircle2, AlertCircle, ShieldQuestion } from 'lucide-react';
import * as apiService from '../apiService';
import { useTranslation } from 'react-i18next';
import PasswordRequirementsChecklist, { isPasswordValid } from './PasswordRequirementsChecklist';
import { BRAND, SPETTRO, FONT, FONT_MONO, FONT_IMPORT, Wordmark } from './palacanBrand';

// ============================================================
// PANNELLO DI ACCESSO / REGISTRAZIONE / RECUPERO — identita' PALACAN.
// SOLO ASPETTO: props, logica, controlli, chiavi di traduzione, id e
// autoComplete dei campi sono identici alla versione precedente.
// Unica aggiunta: se la home ha salvato lo username scelto dal
// visitatore ("Prendi questo nome"), la registrazione lo propone gia'
// scritto, solo se il campo e' vuoto.
// ============================================================

export const CHIAVE_NOME_SCELTO = 'palacan:nome-scelto';

const EASE = [0.16, 1, 0.3, 1];

// stile unico di tutti i campi: capsula scura, profilo sottile, bagliore ghiaccio al focus
const CLASSE_CAMPO =
  'pa-campo w-full rounded-2xl px-4 py-3.5 text-[15px] transition-[box-shadow,background] duration-200 disabled:cursor-not-allowed disabled:opacity-60';

function StiliPannello() {
  return (
    <style>{`
      ${FONT_IMPORT}
      .pa-campo {
        background: rgba(243,241,236,0.04);
        color: ${BRAND.luce};
        border: 0;
        outline: none !important;
        box-shadow: inset 0 0 0 1px rgba(243,241,236,0.1);
        font-family: ${FONT};
        caret-color: ${BRAND.ghiaccio};
      }
      .pa-campo::placeholder { color: rgba(141,143,160,0.6); }
      .pa-campo:hover:not(:disabled) { box-shadow: inset 0 0 0 1px rgba(243,241,236,0.18); }
      .pa-campo:focus, .pa-campo:focus-visible {
        outline: none !important;
        background: rgba(157,180,255,0.05);
        box-shadow: inset 0 0 0 1px rgba(157,180,255,0.55), 0 0 28px rgba(157,180,255,0.12);
      }
      .pa-campo:-webkit-autofill {
        -webkit-text-fill-color: ${BRAND.luce};
        -webkit-box-shadow: 0 0 0 1000px #11131d inset, inset 0 0 0 1px rgba(157,180,255,0.35);
        transition: background-color 9999s;
      }
      /* requisiti della password: i colori sono allineati dal tema (palacan-tema.css) */
      .pa-pannello::-webkit-scrollbar { width: 8px; }
      .pa-pannello::-webkit-scrollbar-thumb { background: rgba(243,241,236,0.08); border-radius: 8px; }
      .pa-focus:focus-visible { outline: none; box-shadow: 0 0 0 2px ${BRAND.abisso}, 0 0 0 3px rgba(157,180,255,0.7); }
    `}</style>
  );
}

function Etichetta({ htmlFor, icona: Icona, children }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 flex items-center gap-2 text-[11px] uppercase" style={{ color: BRAND.nebbia, letterSpacing: '0.14em', fontFamily: FONT }}>
      <Icona className="h-3.5 w-3.5" style={{ color: 'rgba(157,180,255,0.75)' }} />
      {children}
    </label>
  );
}

function PulsantePrimario({ children, ...props }) {
  return (
    <button
      {...props}
      className="pa-focus group relative inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-medium transition-transform duration-150 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
      style={{ background: BRAND.luce, color: BRAND.abisso, fontFamily: FONT }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute -inset-[2px] -z-10 rounded-full opacity-0 blur-[10px] transition-opacity duration-500 group-hover:opacity-60 group-disabled:opacity-0" style={{ background: SPETTRO }} />
      {children}
    </button>
  );
}

function PulsanteSecondario({ children, ...props }) {
  return (
    <button
      {...props}
      className="pa-focus inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[14.5px] transition-colors duration-150 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
      style={{ color: BRAND.luce, boxShadow: `inset 0 0 0 1px ${BRAND.lineaForte}`, fontFamily: FONT }}
    >
      {children}
    </button>
  );
}

function FeedbackLine({ message }) {
  if (!message) return null;
  const isSuccess = message.trim().startsWith('\u2705');

  return (
    <div
      className="flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm"
      style={
        isSuccess
          ? { background: 'rgba(157,180,255,0.08)', color: '#C9D5FF', boxShadow: 'inset 0 0 0 1px rgba(157,180,255,0.25)', fontFamily: FONT }
          : { background: 'rgba(255,120,120,0.07)', color: '#F4B3B3', boxShadow: 'inset 0 0 0 1px rgba(255,120,120,0.22)', fontFamily: FONT }
      }
    >
      {isSuccess ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span>{message}</span>
    </div>
  );
}

export default function UnifiedAuthCard({
  view,
  onViewChange,
  loginUser,
  setLoginUser,
  loginPass,
  setLoginPass,
  onLogin,
  onRegister,
  authError,
  loading,
  isOlmReady,
  onClose,
  dimmed = false,
}) {
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = React.useState('');
  React.useEffect(() => {
    setRegisterPasswordConfirm('');
  }, [view]);

  // Username scelto nella home ("Prendi questo nome"): proposto nella
  // registrazione solo se il campo e' ancora vuoto, poi dimenticato.
  React.useEffect(() => {
    if (view !== 'register' || loginUser) return;
    try {
      const scelto = sessionStorage.getItem(CHIAVE_NOME_SCELTO);
      if (scelto) {
        setLoginUser(scelto);
        sessionStorage.removeItem(CHIAVE_NOME_SCELTO);
      }
    } catch {
      /* sessionStorage non disponibile: nessun precompilato */
    }
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const { t } = useTranslation();
  const isLoginView = view === 'login';
  const isRecoverView = view === 'recover';

  const [recoverUsername, setRecoverUsername] = React.useState('');
  const [recoverCode, setRecoverCode] = React.useState('');
  const [recoverNewPassword, setRecoverNewPassword] = React.useState('');
  const [recoverLoading, setRecoverLoading] = React.useState(false);
  const [recoverError, setRecoverError] = React.useState('');
  const [recoverSuccess, setRecoverSuccess] = React.useState(false);

  const handleRecoverSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (recoverLoading) return;
    if (!recoverUsername || !recoverCode || !recoverNewPassword) {
      setRecoverError(t('account.error_fill_all_fields'));
      return;
    }
    if (recoverNewPassword.length < 8) {
      setRecoverError(t('account.error_password_min_length'));
      return;
    }
    setRecoverLoading(true);
    setRecoverError('');
    try {
      await apiService.resetPasswordWithRecoveryCode(
        recoverUsername.trim(),
        recoverCode.trim(),
        recoverNewPassword
      );
      setRecoverSuccess(true);
    } catch (err) {
      setRecoverError(err?.message || t('account.error_invalid_code'));
    } finally {
      setRecoverLoading(false);
    }
  };

  const handleBackToLoginAfterRecover = () => {
    setRecoverUsername('');
    setRecoverCode('');
    setRecoverNewPassword('');
    setRecoverError('');
    setRecoverSuccess(false);
    onViewChange('login');
  };

  const submitLabel = loading
    ? isLoginView ? t('account.submitting_login') : t('account.submitting_register')
    : isLoginView ? t('account.title_login') : t('account.title_register');

  const title = isLoginView ? t('account.title_login') : t('account.title_register');

  const handleSubmit = (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (isLoginView) { onLogin(e); return; }
    onRegister(e);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading && isOlmReady) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: EASE }}
      data-lenis-prevent
      className={`fixed inset-0 z-[100] flex justify-start ${dimmed ? 'pointer-events-none' : ''}`}
      style={dimmed ? undefined : { background: 'rgba(5,6,11,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <StiliPannello />
      <motion.div
        initial={{ x: -32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -32, opacity: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        data-lenis-prevent
        className="pa-pannello relative h-full w-full max-w-md overflow-y-auto overscroll-contain"
        style={{
          background: 'linear-gradient(180deg, #0F111B 0%, #080910 100%)',
          boxShadow: '30px 0 90px rgba(0,0,0,0.55)',
          fontFamily: FONT,
          color: BRAND.luce,
        }}
      >
        {/* profilo spettrale sul bordo destro e luce fredda dall'alto */}
        <span aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 top-0 w-px" style={{ background: 'linear-gradient(180deg, rgba(157,180,255,0.45), rgba(243,241,236,0.06) 45%, rgba(255,197,138,0.35))' }} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-64" style={{ background: 'radial-gradient(80% 100% at 30% 0%, rgba(157,180,255,0.1), transparent)' }} />

        <div className="relative flex items-center justify-between px-7 pt-7">
          <Wordmark size={14} />
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="pa-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: BRAND.nebbia, boxShadow: `inset 0 0 0 1px ${BRAND.linea}` }}
            aria-label={t('account.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative px-7 pb-6 pt-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={isRecoverView ? 'recover' : view}
              initial={{ opacity: 0, filter: 'blur(6px)', y: 6 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              exit={{ opacity: 0, filter: 'blur(6px)' }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <h2 className="text-[30px] leading-[1.08]" style={{ fontWeight: 300, letterSpacing: '-0.035em' }}>
                {isRecoverView ? t('account.title_recover') : title}
              </h2>
              <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: BRAND.nebbia, fontWeight: 300 }}>
                {isRecoverView ? t('account.subtitle_recover') : t('account.subtitle_default')}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {isRecoverView && (
          <div className="relative px-7 pb-8">
            {!recoverSuccess ? (
              <form onSubmit={handleRecoverSubmit} className="space-y-5">
                <div>
                  <Etichetta htmlFor="recover-username" icona={User}>{t('account.username_label')}</Etichetta>
                  <input
                    id="recover-username"
                    type="text"
                    value={recoverUsername}
                    onChange={(e) => setRecoverUsername(e.target.value)}
                    placeholder={t('account.username_placeholder_login')}
                    autoComplete="username"
                    disabled={recoverLoading}
                    className={CLASSE_CAMPO}
                  />
                </div>

                <div>
                  <Etichetta htmlFor="recover-code" icona={KeyRound}>{t('account.recover_code_label')}</Etichetta>
                  <input
                    id="recover-code"
                    type="text"
                    value={recoverCode}
                    onChange={(e) => setRecoverCode(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    autoComplete="off"
                    disabled={recoverLoading}
                    className={CLASSE_CAMPO}
                    style={{ fontFamily: FONT_MONO, letterSpacing: '0.08em' }}
                  />
                </div>

                <div>
                  <Etichetta htmlFor="recover-new-password" icona={KeyRound}>{t('account.new_password_label')}</Etichetta>
                  <input
                    id="recover-new-password"
                    type="password"
                    value={recoverNewPassword}
                    onChange={(e) => setRecoverNewPassword(e.target.value)}
                    placeholder={t('account.password_min_chars_placeholder')}
                    autoComplete="new-password"
                    disabled={recoverLoading}
                    className={CLASSE_CAMPO}
                  />
                </div>

                <FeedbackLine message={recoverError} />

                <div className="flex flex-col gap-2.5 pt-1">
                  <PulsantePrimario type="submit" disabled={recoverLoading}>
                    {recoverLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    <span>{recoverLoading ? t('account.recover_verifying') : t('account.recover_submit')}</span>
                  </PulsantePrimario>

                  <PulsanteSecondario type="button" onClick={handleBackToLoginAfterRecover} disabled={recoverLoading}>
                    {t('account.back_to_login')}
                  </PulsanteSecondario>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(157,180,255,0.08)', color: '#C9D5FF', boxShadow: 'inset 0 0 0 1px rgba(157,180,255,0.25)' }}>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t('account.recover_success_message')}</span>
                </div>
                <PulsantePrimario type="button" onClick={handleBackToLoginAfterRecover}>
                  <span>{t('account.go_to_login')}</span>
                </PulsantePrimario>
              </div>
            )}
          </div>
        )}

        {!isRecoverView && (
        <>
        <div className="relative px-7">
          <div className="grid grid-cols-2 rounded-full p-1" style={{ background: 'rgba(243,241,236,0.03)', boxShadow: `inset 0 0 0 1px ${BRAND.linea}` }}>
            <button
              type="button"
              onClick={() => onViewChange('login')}
              disabled={loading}
              className="pa-focus relative rounded-full px-4 py-2.5 text-[14px] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ color: isLoginView ? BRAND.abisso : BRAND.nebbia }}
            >
              {isLoginView && <motion.span layoutId="pa-scheda" className="absolute inset-0 rounded-full" style={{ background: BRAND.luce }} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
              <span className="relative">{t('account.tab_login')}</span>
            </button>
            <button
              type="button"
              onClick={() => onViewChange('register')}
              disabled={loading}
              className="pa-focus relative rounded-full px-4 py-2.5 text-[14px] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ color: !isLoginView ? BRAND.abisso : BRAND.nebbia }}
            >
              {!isLoginView && <motion.span layoutId="pa-scheda" className="absolute inset-0 rounded-full" style={{ background: BRAND.luce }} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
              <span className="relative">{t('account.tab_register')}</span>
            </button>
          </div>
        </div>

        <div className="relative px-7 pb-8 pt-7">
          <div className="space-y-5">
            <div>
              <Etichetta htmlFor="consumer-username" icona={User}>{t('account.username_label')}</Etichetta>
              <input
                id="consumer-username"
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isLoginView ? t('account.username_placeholder_login') : t('account.username_placeholder_register')}
                autoComplete="username"
                disabled={loading}
                className={CLASSE_CAMPO}
              />
            </div>

            <div>
              <Etichetta htmlFor="consumer-password" icona={KeyRound}>{t('account.password_label')}</Etichetta>
              <input
                id="consumer-password"
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isLoginView ? t('account.password_placeholder_login') : t('account.password_placeholder_register')}
                autoComplete={isLoginView ? 'current-password' : 'new-password'}
                disabled={loading}
                className={CLASSE_CAMPO}
              />
            </div>

            {!isLoginView && (
              <div>
                <Etichetta htmlFor="consumer-password-confirm" icona={KeyRound}>{t('account.confirm_password_label')}</Etichetta>
                <input
                  id="consumer-password-confirm"
                  type="password"
                  value={registerPasswordConfirm}
                  onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('account.confirm_password_placeholder')}
                  autoComplete="new-password"
                  disabled={loading}
                  className={CLASSE_CAMPO}
                />
                {/* requisiti + "le password coincidono": componente esistente, invariato */}
                <div className="pa-requisiti mt-3">
                  <PasswordRequirementsChecklist
                    password={loginPass}
                    confirmPassword={registerPasswordConfirm}
                  />
                </div>
              </div>
            )}

            <FeedbackLine message={authError} />

            {!isOlmReady && (
              <div className="flex items-center gap-2 text-xs" style={{ color: BRAND.nebbia }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: BRAND.ghiaccio }} />
                <span>{t('account.preparing')}…</span>
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-2.5">
            <PulsantePrimario
              type="button"
              onClick={handleSubmit}
              disabled={
                loading ||
                !isOlmReady ||
                (!isLoginView && (!isPasswordValid(loginPass) || loginPass !== registerPasswordConfirm))
              }
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              <span>{submitLabel}</span>
            </PulsantePrimario>

            <PulsanteSecondario type="button" onClick={() => onViewChange(isLoginView ? 'register' : 'login')} disabled={loading}>
              {isLoginView ? t('account.switch_to_register') : t('account.switch_to_login')}
            </PulsanteSecondario>

            {isLoginView && (
              <button
                type="button"
                onClick={() => onViewChange('recover')}
                disabled={loading}
                className="pa-focus inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs transition-colors duration-150 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ color: BRAND.nebbia }}
              >
                <ShieldQuestion className="h-3.5 w-3.5" />
                <span>{t('account.forgot_password')}</span>
              </button>
            )}
          </div>
        </div>
        </>
        )}
      </motion.div>
    </motion.div>
  );
}
