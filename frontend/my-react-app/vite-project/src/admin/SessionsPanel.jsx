import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, ShieldOff, LogOut, Smartphone } from 'lucide-react';
import { T } from './theme';
import { useTranslation } from 'react-i18next';
import * as apiService from '../apiService';
import { getUserSessions, terminateSession, terminateAllSessions, forceReauth } from './adminApiService';

export default function SessionsPanel({ authToken, showToast, preselectedUserId }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [busyAction, setBusyAction] = useState(null);

  useEffect(() => {
    if (!authToken) return;
    apiService.getWorkspaceColleagues(authToken)
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [authToken]);

  const loadSessions = useCallback(async (userId) => {
    if (!userId || !authToken) return;
    setLoadingSessions(true);
    try {
      const data = await getUserSessions(userId, authToken);
      setSessions(Array.isArray(data) ? data : []);
    } catch (e) {
      showToast?.(e.message || t('admin.sessions_panel.error_loading'), 'error');
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, [authToken, showToast]);

  const handleSelectUser = useCallback((userId) => {
    setSelectedUserId(userId);
    loadSessions(userId);
  }, [loadSessions]);

  // Ponte da UsersTable ("Vedi sessioni attive"): se arriva un utente
  // preselezionato dall'esterno, lo selezioniamo automaticamente qui.
  // Confronto con selectedUserId per evitare un loop se il tab Sessioni
  // viene rimontato con lo stesso preselectedUserId più volte.
  useEffect(() => {
    if (preselectedUserId && preselectedUserId !== selectedUserId) {
      handleSelectUser(preselectedUserId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedUserId]);

  const handleTerminate = async (sessionId) => {
    setBusyAction(sessionId);
    try {
      await terminateSession(sessionId, authToken);
      showToast?.(t('admin.sessions_panel.session_terminated'));
      await loadSessions(selectedUserId);
    } catch (e) {
      showToast?.(e.message || t('admin.sessions_panel.error_terminating'), 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTerminateAll = async () => {
    if (!selectedUserId) return;
    setBusyAction('all');
    try {
      const res = await terminateAllSessions(selectedUserId, authToken);
      showToast?.(`${res?.terminated_count ?? 0} ${t('admin.sessions_panel.sessions_terminated_suffix')}`);
      await loadSessions(selectedUserId);
    } catch (e) {
      showToast?.(e.message || t('admin.sessions_panel.error_terminating_all'), 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleForceReauth = async () => {
    if (!selectedUserId) return;
    setBusyAction('reauth');
    try {
      await forceReauth(selectedUserId, authToken);
      showToast?.(t('admin.sessions_panel.reauth_notification_sent'));
    } catch (e) {
      showToast?.(e.message || t('admin.sessions_panel.error_sending_notification'), 'error');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      <div className={`rounded-2xl border ${T.border} ${T.surface} p-3 max-h-[520px] overflow-y-auto`}>
        <p className={`mb-2 px-1 text-xs font-medium uppercase tracking-wider ${T.textFaint}`}>{t('admin.sessions_panel.title_people')}</p>
        {loadingUsers ? (
          <div className="flex items-center gap-2 px-1 py-3">
            <Loader2 size={14} className={`${T.textFaint} animate-spin`} />
            <span className={`text-xs ${T.textFaint}`}>{t('admin.sessions_panel.loading')}</span>
          </div>
        ) : users.length === 0 ? (
          <p className={`px-1 text-xs ${T.textFaint}`}>{t('admin.sessions_panel.no_users_found')}</p>
        ) : (
          <div className="space-y-1">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => handleSelectUser(u.id)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors duration-150 ${
                  selectedUserId === u.id ? `${T.accentSoftBg} ${T.accentText}` : `${T.text} hover:bg-white/5`
                }`}
              >
                {u.username}
                {!u.is_active && <span className={`ml-2 text-[10px] ${T.textFaint}`}>{t('admin.sessions_panel.inactive_suffix')}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`rounded-2xl border ${T.border} ${T.surface} p-4`}>
        {!selectedUserId ? (
          <p className={`text-sm ${T.textFaint}`}>{t('admin.sessions_panel.select_person_prompt')}</p>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h4 className={`text-sm font-medium ${T.text}`}>{t('admin.sessions_panel.active_sessions_title')}</h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyAction === 'reauth'}
                  onClick={handleForceReauth}
                  className={`flex items-center gap-1.5 rounded-xl border ${T.border} ${T.elevated} px-3 py-1.5 text-xs ${T.textMuted} transition-colors duration-150 hover:bg-white/5 disabled:opacity-50`}
                >
                  <Smartphone size={13} /> {t('admin.sessions_panel.force_relogin_button')}
                </button>
                <button
                  type="button"
                  disabled={busyAction === 'all' || sessions.every((s) => !s.is_active)}
                  onClick={handleTerminateAll}
                  className={`flex items-center gap-1.5 rounded-xl border ${T.dangerSoftBorder} ${T.dangerSoftBg} px-3 py-1.5 text-xs ${T.danger} transition-colors duration-150 hover:opacity-90 disabled:opacity-50`}
                >
                  <ShieldOff size={13} /> {t('admin.sessions_panel.terminate_all_button')}
                </button>
              </div>
            </div>

            {loadingSessions ? (
              <div className="flex items-center gap-2 py-6">
                <Loader2 size={16} className={`${T.textFaint} animate-spin`} />
                <span className={`text-sm ${T.textFaint}`}>{t('admin.sessions_panel.loading_sessions')}</span>
              </div>
            ) : sessions.length === 0 ? (
              <p className={`text-sm ${T.textFaint}`}>{t('admin.sessions_panel.no_sessions_found')}</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border ${T.borderSoft} ${T.elevated} p-3`}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm ${T.text}`}>
                        {s.ip || t('admin.sessions_panel.unknown_ip')}{' '}
                        <span className={`text-xs ${T.textFaint}`}>· {s.user_agent || t('admin.sessions_panel.unknown_device')}</span>
                      </p>
                      <p className={`text-[11px] ${T.textFaint}`}>
                        {t('admin.sessions_panel.access_prefix')} {s.issued_at ? new Date(s.issued_at).toLocaleString('it-IT') : '—'}
                        {' · '}
                        {t('admin.sessions_panel.last_activity_prefix')} {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString('it-IT') : '—'}
                      </p>
                    </div>
                    {s.is_active ? (
                      <button
                        type="button"
                        disabled={busyAction === s.id}
                        onClick={() => handleTerminate(s.id)}
                        className={`shrink-0 flex items-center gap-1.5 rounded-xl border ${T.dangerSoftBorder} ${T.dangerSoftBg} px-3 py-1.5 text-xs font-medium ${T.danger} transition-colors duration-150 hover:opacity-90 disabled:opacity-50`}
                      >
                        <LogOut size={13} /> {t('admin.sessions_panel.terminate_button')}
                      </button>
                    ) : (
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] ${T.borderSoft} ${T.elevated} ${T.textFaint} border`}>
                        {t('admin.sessions_panel.terminated_badge')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}