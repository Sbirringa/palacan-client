// frontend/src/admin/UsersTable.jsx
//
// Fase G RBAC (piano v2): rubrica utenti del workspace, con
// blocca/sblocca e reset password (Fase G-bis backend, appena
// costruita). Stesso layout a due colonne di RoomDetailPanel.jsx e
// SessionsPanel.jsx (lista a sinistra, dettaglio/azioni a destra).
//
// ASSUNZIONE DA VERIFICARE: la lista utenti arriva da
// getWorkspaceColleagues(token) in apiService.js (nome citato in una
// conversazione precedente, mai visto il file per intero) — chiama
// GET /auth/colleagues, che risponde già con {id, username, role,
// is_me, is_active}. Se il nome reale della funzione è diverso, va
// corretto solo l'import qui sotto, nient'altro cambia.
//
// Collegamento a SessionsPanel ("vedi sessioni di questo utente"):
// esposto come prop opzionale onViewSessions(userId) — se AdminApp non
// la passa, il bottone semplicemente non appare. Il ponte vero e
// proprio (stato condiviso in AdminApp.jsx + SessionsPanel.jsx che
// accetta un utente preselezionato) richiede di vedere quei due file
// per un diff preciso, non ancora fatto.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, ShieldCheck, ShieldOff, KeyRound, Loader2, Copy, Check,
  AlertCircle, Users as UsersIcon, ExternalLink,
} from 'lucide-react';

import { T } from './theme';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { getWorkspaceColleagues } from '../apiService';
import { blockUser, unblockUser, resetUserPassword } from './adminApiService';

function roleLabel(role) {
  const map = {
    admin: i18n.t('admin.users_table.role_admin'),
    owner: i18n.t('admin.users_table.role_admin'),
    employee: i18n.t('admin.users_table.role_employee'),
    consumer: i18n.t('admin.users_table.role_consumer'),
  };
  return map[role] || role || '—';
}

export default function UsersTable({ authToken, showToast, onViewSessions }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  // La password temporanea va mostrata UNA SOLA VOLTA: non è mai
  // rileggibile dopo, né dal backend né riaprendo questo pannello.
  const [revealedPassword, setRevealedPassword] = useState(null);
  const [copied, setCopied] = useState(false);

  const notify = (message, kind = 'info') => {
    if (typeof showToast === 'function') {
      showToast(message, kind);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWorkspaceColleagues(authToken);
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || t('admin.users_table.error_loading'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.username || '').toLowerCase().includes(q));
  }, [users, search]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const handleSelectUser = (user) => {
    setSelectedUserId(user.id);
    setActionError(null);
    setRevealedPassword(null);
    setCopied(false);
  };

  const handleToggleBlock = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const isCurrentlyActive = selectedUser.is_active;
      const result = isCurrentlyActive
        ? await blockUser(selectedUser.id, authToken)
        : await unblockUser(selectedUser.id, authToken);

      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, is_active: result.is_active } : u))
      );
      notify(
        result.is_active ? `${selectedUser.username} ${t('admin.users_table.unblocked_suffix')}` : `${selectedUser.username} ${t('admin.users_table.blocked_suffix')}`,
        'success'
      );
    } catch (e) {
      setActionError(e?.message || t('admin.users_table.error_toggle_block'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    setActionError(null);
    setRevealedPassword(null);
    setCopied(false);
    try {
      const result = await resetUserPassword(selectedUser.id, authToken);
      setRevealedPassword(result.temporary_password);
      notify(`${t('admin.users_table.password_reset_prefix')} ${selectedUser.username}`, 'success');
    } catch (e) {
      setActionError(e?.message || t('admin.users_table.error_reset_password'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!revealedPassword) return;
    try {
      await navigator.clipboard.writeText(revealedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API non disponibile (es. contesto non sicuro): la
      // password resta comunque visibile a schermo per copia manuale.
    }
  };

  return (
    <div className={`flex h-full ${T.bg}`}>
      {/* Colonna sinistra: lista utenti */}
      <div className={`w-80 flex-shrink-0 border-r ${T.border} flex flex-col`}>
        <div className={`p-4 border-b ${T.borderSoft}`}>
          <div className="flex items-center gap-2 mb-3">
            <UsersIcon size={16} className={T.textMuted} />
            <span className={`text-sm font-medium ${T.text}`}>{t('admin.users_table.title')}</span>
          </div>
          <div className="relative">
            <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${T.textFaint}`} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('admin.users_table.search_placeholder')}
              className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg ${T.surface} ${T.text} border ${T.borderSoft} outline-none focus:border-[#14B8A6]/40 placeholder:${T.textFaint}`}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className={`flex items-center justify-center py-10 ${T.textMuted}`}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}

          {!loading && error && (
            <div className={`flex items-start gap-2 p-4 text-sm ${T.danger}`}>
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && filteredUsers.length === 0 && (
            <div className={`p-4 text-sm ${T.textFaint}`}>{t('admin.users_table.no_users_found')}</div>
          )}

          {!loading &&
            !error &&
            filteredUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelectUser(user)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-left border-b ${T.borderSoft} transition-colors duration-150 ${
                  selectedUserId === user.id ? T.elevated : T.surfaceHover
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      user.is_active ? 'bg-[#14B8A6]' : 'bg-[#E2685C]'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className={`text-sm truncate ${T.text}`}>
                      {user.username}
                      {user.is_me && <span className={`ml-1 text-xs ${T.textFaint}`}>{t('admin.users_table.you_suffix')}</span>}
                    </div>
                    <div className={`text-xs ${T.textFaint}`}>{roleLabel(user.role)}</div>
                  </div>
                </div>
                {!user.is_active && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${T.dangerSoftBg} ${T.danger} flex-shrink-0`}>
                    {t('admin.users_table.status_blocked_badge')}
                  </span>
                )}
              </button>
            ))}
        </div>
      </div>

      {/* Colonna destra: dettaglio + azioni */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedUser && (
          <div className={`flex items-center justify-center h-full text-sm ${T.textFaint}`}>
            {t('admin.users_table.select_user_prompt')}
          </div>
        )}

        {selectedUser && (
          <div className="max-w-lg">
            <div className="flex items-center gap-3 mb-1">
              <h2 className={`text-lg font-medium ${T.text}`}>{selectedUser.username}</h2>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  selectedUser.is_active ? `${T.accentSoftBg} ${T.accentText}` : `${T.dangerSoftBg} ${T.danger}`
                }`}
              >
                {selectedUser.is_active ? t('admin.users_table.status_active') : t('admin.users_table.status_blocked')}
              </span>
            </div>
            <p className={`text-sm ${T.textMuted} mb-6`}>{roleLabel(selectedUser.role)}</p>

            {actionError && (
              <div className={`flex items-start gap-2 p-3 mb-4 rounded-lg text-sm ${T.dangerSoftBg} ${T.danger}`}>
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}

            {revealedPassword && (
              <div className={`p-4 mb-4 rounded-lg ${T.warnSoftBg} border ${T.border}`}>
                <div className={`text-xs mb-2 ${T.warn}`}>
                  {t('admin.users_table.temp_password_warning')}
                </div>
                <div className="flex items-center gap-2">
                  <code className={`flex-1 px-3 py-2 rounded-md text-sm font-mono ${T.elevated} ${T.text}`}>
                    {revealedPassword}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyPassword}
                    className={`p-2 rounded-md ${T.surfaceHover} ${T.textMuted}`}
                    title={t('admin.users_table.copy_title')}
                  >
                    {copied ? <Check size={14} className={T.accentText} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={actionLoading || selectedUser.is_me}
                onClick={handleToggleBlock}
                title={selectedUser.is_me ? t('admin.users_table.cannot_block_self') : undefined}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${T.text} border ${T.border} ${T.surfaceHover} disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150`}
              >
                {selectedUser.is_active ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
                {selectedUser.is_active ? t('admin.users_table.block_user_button') : t('admin.users_table.unblock_user_button')}
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={handleResetPassword}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${T.text} border ${T.border} ${T.surfaceHover} disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150`}
              >
                <KeyRound size={15} />
                {t('admin.users_table.reset_password_button')}
              </button>

              {typeof onViewSessions === 'function' && (
                <button
                  type="button"
                  onClick={() => onViewSessions(selectedUser.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${T.textMuted} ${T.surfaceHover} transition-colors duration-150`}
                >
                  <ExternalLink size={15} />
                  {t('admin.users_table.view_sessions_button')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
