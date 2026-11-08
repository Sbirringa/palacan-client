import React from 'react';
import { Check } from 'lucide-react';
import { T } from './theme';
import { useTranslation } from 'react-i18next';

export default function PermissionsMatrix({
  permissions,
  selectedKeys,
  onToggle,
  disabled = false,
}) {
  const { t } = useTranslation();
  const categoryLabel = (cat) => {
    const map = {
      users: t('admin.permissions_matrix.category_users'),
      rooms: t('admin.permissions_matrix.category_rooms'),
      moderation: t('admin.permissions_matrix.category_moderation'),
      security: t('admin.permissions_matrix.category_security'),
      reports: t('admin.permissions_matrix.category_reports'),
      config: t('admin.permissions_matrix.category_config'),
    };
    return map[cat] || cat;
  };
  const permissionDescription = (key) => {
    const map = {
      'users.create': t('admin.permissions_matrix.desc_users_create'),
      'users.invite': t('admin.permissions_matrix.desc_users_invite'),
      'users.delete': t('admin.permissions_matrix.desc_users_delete'),
      'users.edit': t('admin.permissions_matrix.desc_users_edit'),
      'users.block': t('admin.permissions_matrix.desc_users_block'),
      'users.reactivate': t('admin.permissions_matrix.desc_users_reactivate'),
      'users.reset_password': t('admin.permissions_matrix.desc_users_reset_password'),
      'users.change_role': t('admin.permissions_matrix.desc_users_change_role'),
      'rooms.create': t('admin.permissions_matrix.desc_rooms_create'),
      'rooms.delete': t('admin.permissions_matrix.desc_rooms_delete'),
      'rooms.rename': t('admin.permissions_matrix.desc_rooms_rename'),
      'rooms.archive': t('admin.permissions_matrix.desc_rooms_archive'),
      'rooms.lock': t('admin.permissions_matrix.desc_rooms_lock'),
      'rooms.manage_members': t('admin.permissions_matrix.desc_rooms_manage_members'),
      'rooms.manage_local_roles': t('admin.permissions_matrix.desc_rooms_manage_local_roles'),
      'messages.delete': t('admin.permissions_matrix.desc_messages_delete'),
      'messages.pin': t('admin.permissions_matrix.desc_messages_pin'),
      'messages.unpin': t('admin.permissions_matrix.desc_messages_unpin'),
      'members.mute': t('admin.permissions_matrix.desc_members_mute'),
      'members.unmute': t('admin.permissions_matrix.desc_members_unmute'),
      'security.view_logs': t('admin.permissions_matrix.desc_security_view_logs'),
      'security.export_logs': t('admin.permissions_matrix.desc_security_export_logs'),
      'security.terminate_sessions': t('admin.permissions_matrix.desc_security_terminate_sessions'),
      'security.manage_password_policy': t('admin.permissions_matrix.desc_security_manage_password_policy'),
      'reports.view_stats': t('admin.permissions_matrix.desc_reports_view_stats'),
      'reports.export': t('admin.permissions_matrix.desc_reports_export'),
      'reports.view_audit_log': t('admin.permissions_matrix.desc_reports_view_audit_log'),
      'config.manage_departments': t('admin.permissions_matrix.desc_config_manage_departments'),
      'config.manage_roles': t('admin.permissions_matrix.desc_config_manage_roles'),
      'config.manage_notifications': t('admin.permissions_matrix.desc_config_manage_notifications'),
      'config.manage_workspace_settings': t('admin.permissions_matrix.desc_config_manage_workspace_settings'),
    };
    return map[key] || null;
  };
  const byCategory = React.useMemo(() => {
    const map = {};

    (permissions || []).forEach((p) => {
      const cat = p.category || t('admin.permissions_matrix.other_category');
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    });

    return map;
  }, [permissions]);

  const categories = Object.keys(byCategory).sort();

  if (!permissions || permissions.length === 0) {
    return (
      <p className={`text-sm ${T.textFaint}`}>
        {t('admin.permissions_matrix.no_permissions')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {categories.map((cat) => (
        <div key={cat}>
          <p className={`mb-1.5 text-xs font-medium uppercase tracking-wider ${T.textFaint}`}>
            {categoryLabel(cat)}
          </p>

          <div className={`grid grid-cols-1 gap-1.5 rounded-xl border ${T.borderSoft} ${T.elevated} p-2 sm:grid-cols-2`}>
            {byCategory[cat].map((perm) => {
              const checked = selectedKeys?.has(perm.key);

              return (
                <button
                  key={perm.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggle?.(perm.key)}
                  className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ${
                    disabled
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-pointer hover:bg-white/5'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? `${T.accentBg} border-transparent`
                        : `${T.border} bg-transparent`
                    }`}
                  >
                    {checked && (
                      <Check
                        size={11}
                        className="text-[#0B0C11]"
                        strokeWidth={3}
                      />
                    )}
                  </span>

                  <span className="min-w-0">
                    <span className={`block text-sm ${T.text}`}>
                      {perm.key}
                    </span>

                    {(permissionDescription(perm.key) || perm.description) && (
                      <span className={`block text-[11px] ${T.textFaint}`}>
                        {permissionDescription(perm.key) || perm.description}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}