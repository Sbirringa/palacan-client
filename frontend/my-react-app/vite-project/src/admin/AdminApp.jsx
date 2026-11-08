import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LayoutDashboard, Building2, ShieldOff, ScrollText, Users, KeyRound } from 'lucide-react';
import { T, EASE } from './theme';
import DashboardStats from './DashboardStats';
import RoomDetailPanel from './RoomDetailPanel';
import SessionsPanel from './SessionsPanel';
import AuditLogPanel from './AuditLogPanel';
import UsersTable from './UsersTable';
import RolesPanel from './RolesPanel';
import { useTranslation } from 'react-i18next';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'rooms', label: 'Stanze', icon: Building2 },
  { key: 'users', label: 'Persone', icon: Users },
  { key: 'roles', label: 'Ruoli', icon: KeyRound },
  { key: 'sessions', label: 'Sessioni', icon: ShieldOff },
  { key: 'audit', label: 'Audit', icon: ScrollText },
];

/* ── v1.12-B (fix "refresh dentro Amministrazione torna sempre alla tab
   Dashboard"): chiave localStorage per la tab attiva, per utente — stesso
   stile di getCurrentRoomKey/getLastReadKey in App.jsx. Richiede
   currentUsername come prop (passata da Dashboard.jsx). ────────────────── */
const getAdminActiveTabKey = (username) => `admin_active_tab_${username}`;

const isValidTabKey = (key) => TABS.some((t) => t.key === key);

export default function AdminApp({ authToken, currentUsername, onClose }) {
  const { t } = useTranslation();
  /* ── v1.12-B: lazy-init da localStorage invece del solito 'dashboard'
     fisso. Se non c'è username (non dovrebbe succedere: AdminApp viene
     montata solo da Dashboard.jsx quando l'utente è già autenticato) o il
     valore salvato non è più una tab valida (es. una futura rimozione di
     un tab), si ricade sul default 'dashboard' — nessun crash possibile. */
  const [activeTab, setActiveTab] = useState(() => {
    try {
      if (!currentUsername) return 'dashboard';
      const stored = localStorage.getItem(getAdminActiveTabKey(currentUsername));
      return stored && isValidTabKey(stored) ? stored : 'dashboard';
    } catch (_) {
      return 'dashboard';
    }
  });
  const [toast, setToast] = useState(null);
  // Ponte "Vedi sessioni attive" da UsersTable → tab Sessioni, preselezionato
  const [sessionsPreselectUserId, setSessionsPreselectUserId] = useState(null);

  /* ── v1.12-B: persistenza della tab attiva ad ogni cambio. Non
     persistiamo sessionsPreselectUserId di proposito: è un ponte
     transitorio (da un click su "Vedi sessioni" in UsersTable), non uno
     stato di navigazione stabile — dopo un refresh è corretto che riparta
     vuoto anche se si riapre sulla tab Sessioni. ─────────────────────── */
  useEffect(() => {
    if (!currentUsername) return;
    try {
      localStorage.setItem(getAdminActiveTabKey(currentUsername), activeTab);
    } catch (_) {}
  }, [activeTab, currentUsername]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const handleViewSessions = (userId) => {
    setSessionsPreselectUserId(userId);
    setActiveTab('sessions');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: EASE }}
      className={`fixed inset-0 z-[200] flex ${T.bg} ${T.text}`}
    >
      <aside className={`hidden w-56 shrink-0 border-r ${T.border} ${T.surface} sm:flex sm:flex-col`}>
        <div className={`border-b ${T.borderSoft} px-4 py-4`}>
          <p className={`text-sm font-semibold ${T.text}`}>{t('admin.app.title')}</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150 ${
                activeTab === tab.key ? `${T.accentSoftBg} ${T.accentText}` : `${T.textMuted} hover:bg-white/5`
              }`}
            >
              <tab.icon size={15} />
              {t(`admin.app.tabs.${tab.key}`)}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={`flex h-14 shrink-0 items-center justify-between border-b ${T.borderSoft} px-4 sm:px-6`}>
          <p className={`text-sm font-medium ${T.text} sm:hidden`}>
            {t(`admin.app.tabs.${activeTab}`)}
          </p>
          <div className="hidden gap-1 sm:flex" />
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl p-2 ${T.textFaint} transition-colors duration-150 hover:bg-white/5 hover:${T.text}`}
            aria-label={t('admin.app.close_aria')}
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex gap-1 overflow-x-auto border-b px-3 py-2 sm:hidden" style={{ borderColor: '#E3ECEC' }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs transition-colors duration-150 ${
                activeTab === tab.key ? `${T.accentBg} text-[#0B0C11]` : `${T.surface} ${T.textMuted}`
              }`}
            >
              {t(`admin.app.tabs.${tab.key}`)}
            </button>
          ))}
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'dashboard' && <DashboardStats authToken={authToken} />}
          {activeTab === 'rooms' && (
            /* v1.12-C: currentUsername passato a RoomDetailPanel per
               permettere la persistenza della stanza selezionata al refresh. */
            <RoomDetailPanel authToken={authToken} currentUsername={currentUsername} showToast={showToast} />
          )}
          {activeTab === 'users' && (
            <UsersTable authToken={authToken} showToast={showToast} onViewSessions={handleViewSessions} />
          )}
          {activeTab === 'roles' && <RolesPanel authToken={authToken} showToast={showToast} />}
          {activeTab === 'sessions' && (
            <SessionsPanel
              authToken={authToken}
              showToast={showToast}
              preselectedUserId={sessionsPreselectUserId}
            />
          )}
          {activeTab === 'audit' && <AuditLogPanel authToken={authToken} showToast={showToast} />}
        </main>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            className={`fixed left-1/2 top-6 z-[220] -translate-x-1/2 rounded-2xl border px-4 py-2.5 shadow-xl backdrop-blur-xl ${
              toast.type === 'error'
                ? `${T.dangerSoftBorder} ${T.dangerSoftBg} ${T.danger}`
                : `${T.accentSoftBorder} ${T.accentSoftBg} ${T.accentText}`
            }`}
          >
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}