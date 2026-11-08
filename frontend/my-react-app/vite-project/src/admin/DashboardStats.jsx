import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Users, MessageSquare, Building2, Activity, Loader2 } from 'lucide-react';
import { T, EASE } from './theme';
import { getDashboardStats } from './adminApiService';
import { useTranslation } from 'react-i18next';

const StatCard = ({ icon: Icon, label, value }) => (
  <div className={`rounded-2xl border ${T.border} ${T.surface} p-4`}>
    <div className="flex items-center gap-2 mb-2">
      <Icon size={15} className={T.textMuted} />
      <span className={`text-[11px] font-medium uppercase tracking-wider ${T.textFaint}`}>{label}</span>
    </div>
    <p className={`text-2xl font-semibold ${T.text}`}>{value}</p>
  </div>
);

const BreakdownRow = ({ label, value, total }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs ${T.textMuted}`}>{label}</span>
        <span className={`text-xs ${T.textFaint}`}>{value}</span>
      </div>
      <div className={`h-1.5 rounded-full ${T.elevated} overflow-hidden`}>
        <div className={`h-full ${T.accentBg}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export default function DashboardStats({ authToken }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    setError('');
    try {
      const data = await getDashboardStats(authToken);
      setStats(data);
    } catch (e) {
      setError(e.message || t('admin.dashboard_stats.error_loading'));
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => { load(); }, [load]);

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 size={22} className={`${T.textFaint} animate-spin`} />
        <p className={`text-sm ${T.textFaint}`}>{t('admin.dashboard_stats.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-2xl border ${T.dangerSoftBorder} ${T.dangerSoftBg} p-4 text-sm ${T.danger}`}>
        {error}
      </div>
    );
  }

  if (!stats) return null;

  const totalRoomsByStatus = Object.values(stats.rooms_by_status || {}).reduce((a, b) => a + b, 0);
  const totalRoomsByKind = Object.values(stats.rooms_by_kind || {}).reduce((a, b) => a + b, 0);
  const totalUsersByRole = Object.values(stats.users_by_role || {}).reduce((a, b) => a + b, 0);

  const statusLabels = { active: t('admin.dashboard_stats.status_active'), archived: t('admin.dashboard_stats.status_archived'), locked: t('admin.dashboard_stats.status_locked') };
  const roleLabels = { admin: t('admin.dashboard_stats.role_admin'), employee: t('admin.dashboard_stats.role_employee'), owner: t('admin.dashboard_stats.role_owner'), consumer: t('admin.dashboard_stats.role_consumer') };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: EASE }}
      className="space-y-5"
    >
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-medium ${T.text}`}>{t('admin.dashboard_stats.overview_title')}</h3>
        <button
          type="button"
          onClick={load}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs ${T.textMuted} transition-colors duration-150 hover:bg-white/5`}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {t('admin.dashboard_stats.refresh_button')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Building2} label={t('admin.dashboard_stats.stat_rooms')} value={stats.total_rooms} />
        <StatCard icon={Users} label={t('admin.dashboard_stats.stat_users')} value={stats.total_users} />
        <StatCard icon={MessageSquare} label={t('admin.dashboard_stats.stat_messages')} value={stats.total_messages} />
        <StatCard icon={Activity} label={t('admin.dashboard_stats.stat_online_now')} value={stats.online_users} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={`rounded-2xl border ${T.border} ${T.surface} p-4`}>
          <p className={`mb-3 text-xs font-medium uppercase tracking-wider ${T.textFaint}`}>{t('admin.dashboard_stats.rooms_by_status_title')}</p>
          {Object.entries(stats.rooms_by_status || {}).map(([k, v]) => (
            <BreakdownRow key={k} label={statusLabels[k] || k} value={v} total={totalRoomsByStatus} />
          ))}
        </div>

        <div className={`rounded-2xl border ${T.border} ${T.surface} p-4`}>
          <p className={`mb-3 text-xs font-medium uppercase tracking-wider ${T.textFaint}`}>{t('admin.dashboard_stats.rooms_by_kind_title')}</p>
          {Object.entries(stats.rooms_by_kind || {}).map(([k, v]) => (
            <BreakdownRow key={k} label={k === 'department' ? t('admin.dashboard_stats.room_kind_department') : t('admin.dashboard_stats.room_kind_consumer')} value={v} total={totalRoomsByKind} />
          ))}
        </div>

        <div className={`rounded-2xl border ${T.border} ${T.surface} p-4`}>
          <p className={`mb-3 text-xs font-medium uppercase tracking-wider ${T.textFaint}`}>{t('admin.dashboard_stats.users_by_role_title')}</p>
          {Object.entries(stats.users_by_role || {}).map(([k, v]) => (
            <BreakdownRow key={k} label={roleLabels[k] || k} value={v} total={totalUsersByRole} />
          ))}
        </div>
      </div>

      <div className={`rounded-2xl border ${T.border} ${T.surface} p-4`}>
        <p className={`mb-3 text-xs font-medium uppercase tracking-wider ${T.textFaint}`}>{t('admin.dashboard_stats.recent_activity_title')}</p>
        {Array.isArray(stats.recent_activity) && stats.recent_activity.length > 0 ? (
          <div className="space-y-2.5">
            {stats.recent_activity.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-xs">
                <span className={T.text}>
                  <span className={T.accentText}>{a.actor_username || '—'}</span>
                  {' → '}
                  {a.action}
                </span>
                <span className={T.textFaint}>
                  {a.created_at ? new Date(a.created_at).toLocaleString('it-IT') : ''}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className={`text-xs ${T.textFaint}`}>{t('admin.dashboard_stats.no_activity')}</p>
        )}
      </div>
    </motion.div>
  );
}