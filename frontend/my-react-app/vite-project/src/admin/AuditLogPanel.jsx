import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { T } from './theme';
import { useTranslation } from 'react-i18next';
import { getAuditLog } from './adminApiService';

export default function AuditLogPanel({ authToken, showToast }) {
  const { t } = useTranslation();
  const actionLabel = (action) => {
    const map = {
      'room.status.update': t('admin.audit_log.action_room_status_update'),
      'member.local_role.assign': t('admin.audit_log.action_role_assign'),
      'member.mute': t('admin.audit_log.action_member_mute'),
      'member.unmute': t('admin.audit_log.action_member_unmute'),
      'session.terminate': t('admin.audit_log.action_session_terminate'),
      'session.terminate_all': t('admin.audit_log.action_session_terminate_all'),
      'user.force_reauth': t('admin.audit_log.action_force_reauth'),
      'role.create': t('admin.audit_log.action_role_create'),
      'role.update': t('admin.audit_log.action_role_update'),
      'role.delete': t('admin.audit_log.action_role_delete'),
      'user.block': t('admin.audit_log.action_user_block'),
      'user.unblock': t('admin.audit_log.action_user_unblock'),
      'user.reset_password': t('admin.audit_log.action_user_reset_password'),
      'member.local_role.remove': t('admin.audit_log.action_role_remove'),
    };
    return map[action] || action;
  };
  const metadataFieldLabel = (key) => {
    const map = {
      room_name: t('admin.audit_log.field_room_name'),
      old_status: t('admin.audit_log.field_old_status'),
      new_status: t('admin.audit_log.field_new_status'),
      target_username: t('admin.audit_log.field_target_username'),
      role_name: t('admin.audit_log.field_role_name'),
      scope: t('admin.audit_log.field_scope'),
      session_id: t('admin.audit_log.field_session_id'),
      terminated_count: t('admin.audit_log.field_terminated_count'),
    };
    return map[key] || key;
  };
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (targetPage) => {
    if (!authToken) return;
    setLoading(true);
    try {
      const data = await getAuditLog(authToken, { page: targetPage, page_size: pageSize });
      setEntries(Array.isArray(data?.entries) ? data.entries : []);
      setTotal(data?.total || 0);
      setPage(data?.page || targetPage);
    } catch (e) {
      showToast?.(e.message || t('admin.audit_log.error_loading'), 'error');
    } finally {
      setLoading(false);
    }
  }, [authToken, pageSize, showToast]);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-medium ${T.text}`}>{t('admin.audit_log.title')}</h3>
        <button
          type="button"
          onClick={() => load(page)}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs ${T.textMuted} transition-colors duration-150 hover:bg-white/5`}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {t('admin.audit_log.refresh_button')}
        </button>
      </div>

      <div className={`rounded-2xl border ${T.border} ${T.surface} overflow-hidden`}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10">
            <Loader2 size={18} className={`${T.textFaint} animate-spin`} />
            <span className={`text-sm ${T.textFaint}`}>{t('admin.audit_log.loading')}</span>
          </div>
        ) : entries.length === 0 ? (
          <p className={`p-6 text-center text-sm ${T.textFaint}`}>{t('admin.audit_log.no_actions_found')}</p>
        ) : (
          <div className="divide-y" style={{ borderColor: '#E3ECEC' }}>
            {entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className={`text-sm ${T.text}`}>
                    <span className={T.accentText}>{e.actor_username || '—'}</span>
                    {' · '}
                    {actionLabel(e.action)}
                  </p>
                  {e.metadata && (
                    <p className={`mt-0.5 truncate text-xs ${T.textFaint}`}>
                      {Object.entries(e.metadata)
                        .map(([k, v]) => `${metadataFieldLabel(k)}: ${v}`)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <span className={`shrink-0 text-xs ${T.textFaint}`}>
                  {e.created_at ? new Date(e.created_at).toLocaleString('it-IT') : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1)}
            className={`rounded-xl border ${T.border} ${T.elevated} p-2 ${T.textMuted} disabled:opacity-40 transition-colors duration-150 hover:bg-white/5`}
          >
            <ChevronLeft size={14} />
          </button>
          <span className={`text-xs ${T.textFaint}`}>{t('admin.audit_log.page_prefix')} {page} {t('admin.audit_log.page_of_separator')} {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1)}
            className={`rounded-xl border ${T.border} ${T.elevated} p-2 ${T.textMuted} disabled:opacity-40 transition-colors duration-150 hover:bg-white/5`}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}