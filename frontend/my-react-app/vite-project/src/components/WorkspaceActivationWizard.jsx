import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  X,
  Building2,
  KeyRound,
  User,
  BadgeCheck,
  Loader2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Shield,
} from 'lucide-react';

const T = {
  surface: 'bg-[#F2F2F3]',
  elevated: 'bg-white',
  border: 'border-[#E4E4E7]',
  borderSoft: 'border-[#ECECEE]',
  text: 'text-[#1A1A1A]',
  textMuted: 'text-[#6B7280]',
  textFaint: 'text-[#9CA3AF]',
  accentBg: 'bg-[#155E75]',
  accentBgHover: 'hover:bg-[#0E4A5C]',
  onAccentText: 'text-white',
  danger: 'text-[#B85C4A]',
  dangerSoftBg: 'bg-[#B85C4A]/10',
  dangerSoftBorder: 'border-[#B85C4A]/25',
};

const EASE = [0.4, 0, 0.2, 1];

function FeedbackLine({ message }) {
  if (!message) return null;
  const isSuccess = message.trim().startsWith('\u2705');

  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
        isSuccess
          ? 'border-[#7A8F73]/25 bg-[#7A8F73]/10 text-[#5C7156]'
          : `${T.dangerSoftBorder} ${T.dangerSoftBg} ${T.danger}`
      }`}
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

export default function WorkspaceActivationWizard({
  isActivationMode,
  onSwitchToActivation,
  companyName,
  setCompanyName,
  enterpriseUsername,
  setEnterpriseUsername,
  enterprisePassword,
  setEnterprisePassword,
  licenseToken,
  setLicenseToken,
  onSubmit,
  onClose,
  enterpriseError,
  loading,
  isOlmReady,
}) {
  const { t } = useTranslation();
  const title = isActivationMode ? t('workspace.title_activate') : t('workspace.title_login');

  const subtitle = isActivationMode
    ? t('workspace.subtitle_activate')
    : t('workspace.subtitle_login');

  const submitLabel = loading
    ? isActivationMode ? t('workspace.submit_activating') : t('workspace.submit_logging_in')
    : isActivationMode ? t('workspace.title_activate') : t('workspace.title_login');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: EASE }}
      className="fixed inset-0 z-[100] flex justify-start bg-black/20 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <motion.div
        initial={{ x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -24, opacity: 0 }}
        transition={{ duration: 0.18, ease: EASE }}
        className={`relative h-full w-full max-w-md ${T.surface} border-r ${T.border} shadow-[0_0_60px_rgba(0,0,0,0.18)] overflow-y-auto`}
      >
        <div className="flex items-center gap-2.5 px-6 pt-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#155E75]">
            <Shield className="text-white" size={16} strokeWidth={2} />
          </span>
          <span
            className="text-lg font-bold tracking-tight text-[#1A1A1A]"
            style={{ fontFamily: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif" }}
          >
            Palacan
          </span>
        </div>
        <div className={`flex items-start justify-between border-b ${T.borderSoft} px-6 py-5`}>
          <div className="pr-4">
            <h2 className={`text-lg font-semibold tracking-tight ${T.text}`}>{title}</h2>
            <p className={`mt-1 text-sm ${T.textMuted}`}>{subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${T.textFaint} transition-colors duration-150 hover:bg-black/5 hover:${T.text} disabled:cursor-not-allowed disabled:opacity-50`}
            aria-label={t('workspace.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-6 py-6">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="workspace-company"
                className={`mb-2 flex items-center gap-2 text-sm font-medium ${T.text}`}
              >
                <Building2 className={`h-4 w-4 ${T.textFaint}`} />
                {t('workspace.company_label')}
              </label>
              <input
                id="workspace-company"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={t('workspace.company_placeholder')}
                autoComplete="organization"
                disabled={loading}
                className={`w-full rounded-xl border ${T.border} ${T.elevated} px-4 py-3 text-sm ${T.text} outline-none transition-colors duration-150 placeholder:${T.textFaint} focus:border-[#155E75]/60 disabled:cursor-not-allowed disabled:opacity-60`}
              />
            </div>

            {isActivationMode && (
              <div>
                <label
                  htmlFor="workspace-license"
                  className={`mb-2 flex items-center gap-2 text-sm font-medium ${T.text}`}
                >
                  <BadgeCheck className={`h-4 w-4 ${T.textFaint}`} />
                  {t('workspace.license_label')}
                </label>
                <input
                  id="workspace-license"
                  type="text"
                  value={licenseToken}
                  onChange={(e) => setLicenseToken(e.target.value)}
                  placeholder={t('workspace.license_placeholder')}
                  autoComplete="off"
                  disabled={loading}
                  className={`w-full rounded-xl border ${T.border} ${T.elevated} px-4 py-3 text-sm ${T.text} outline-none transition-colors duration-150 placeholder:${T.textFaint} focus:border-[#155E75]/60 disabled:cursor-not-allowed disabled:opacity-60`}
                />
              </div>
            )}

            <div>
              <label
                htmlFor="workspace-username"
                className={`mb-2 flex items-center gap-2 text-sm font-medium ${T.text}`}
              >
                <User className={`h-4 w-4 ${T.textFaint}`} />
                {t('workspace.username_label')}
              </label>
              <input
                id="workspace-username"
                type="text"
                value={enterpriseUsername}
                onChange={(e) => setEnterpriseUsername(e.target.value)}
                placeholder={isActivationMode ? t('workspace.username_placeholder_activation') : t('workspace.username_placeholder_login')}
                autoComplete="username"
                disabled={loading}
                className={`w-full rounded-xl border ${T.border} ${T.elevated} px-4 py-3 text-sm ${T.text} outline-none transition-colors duration-150 placeholder:${T.textFaint} focus:border-[#155E75]/60 disabled:cursor-not-allowed disabled:opacity-60`}
              />
            </div>

            <div>
              <label
                htmlFor="workspace-password"
                className={`mb-2 flex items-center gap-2 text-sm font-medium ${T.text}`}
              >
                <KeyRound className={`h-4 w-4 ${T.textFaint}`} />
                {t('workspace.password_label')}
              </label>
              <input
                id="workspace-password"
                type="password"
                value={enterprisePassword}
                onChange={(e) => setEnterprisePassword(e.target.value)}
                placeholder={isActivationMode ? t('workspace.password_placeholder_activation') : t('workspace.password_placeholder_login')}
                autoComplete={isActivationMode ? 'new-password' : 'current-password'}
                disabled={loading}
                className={`w-full rounded-xl border ${T.border} ${T.elevated} px-4 py-3 text-sm ${T.text} outline-none transition-colors duration-150 placeholder:${T.textFaint} focus:border-[#155E75]/60 disabled:cursor-not-allowed disabled:opacity-60`}
              />
            </div>

            <FeedbackLine message={enterpriseError} />

            {!isOlmReady && (
              <div className={`flex items-center gap-2 text-xs ${T.textFaint}`}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{t('workspace.preparing')}…</span>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="submit"
              disabled={loading || !isOlmReady}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl ${T.accentBg} ${T.accentBgHover} px-4 py-3 text-sm font-semibold ${T.onAccentText} transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              <span>{submitLabel}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={`inline-flex w-full items-center justify-center rounded-xl border-2 border-[#155E75] px-4 py-3 text-sm font-medium text-[#155E75] transition-colors duration-150 hover:bg-[#155E75] hover:text-white disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {t('workspace.cancel')}
            </button>

            {!isActivationMode && onSwitchToActivation && (
              <>
                <div className={`my-1 border-t ${T.borderSoft}`} />
                <button
                  type="button"
                  onClick={onSwitchToActivation}
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-[#155E75]/25 bg-[#155E75]/[0.06] px-4 py-3 text-sm font-medium text-[#155E75]/80 transition-colors duration-150 hover:bg-[#155E75]/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('workspace.title_activate')}
                </button>
              </>
            )}
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
