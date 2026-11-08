import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Trash2, Save, Lock } from 'lucide-react';
import { T } from './theme';
import { useTranslation } from 'react-i18next';
import PermissionsMatrix from './PermissionsMatrix';
import { getRoles, createRole, updateRole, deleteRole, getPermissions } from './adminApiService';

const EMPTY_DRAFT = {
  name: '',
  description: '',
  color: '#14B8A6',
  priority: 10,
  scope: 'room', // 'global' | 'room' — i ruoli custom locali sono il caso d'uso più comune (Sezione 2.2)
  permission_keys: [],
};

export default function RolesPanel({ authToken, showToast }) {
  const { t } = useTranslation();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [draft, setDraft] = useState(null); // null = nessun editing attivo
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const [rolesData, permsData] = await Promise.all([
        getRoles(authToken),
        getPermissions(authToken),
      ]);
      setRoles(Array.isArray(rolesData) ? rolesData : []);
      setPermissions(Array.isArray(permsData) ? permsData : []);
    } catch (e) {
      showToast?.(e.message || t('admin.roles_panel.error_loading'), 'error');
    } finally {
      setLoading(false);
    }
  }, [authToken, showToast]);

  useEffect(() => { load(); }, [load]);

  const selectRole = (role) => {
    setSelectedRoleId(role.id);
    setIsNew(false);
    setDraft({
      name: role.name || '',
      description: role.description || '',
      color: role.color || '#14B8A6',
      priority: role.priority ?? 10,
      scope: role.scope || 'room',
      permission_keys: Array.isArray(role.permission_keys) ? [...role.permission_keys] : [],
    });
  };

  const startNew = () => {
    setSelectedRoleId(null);
    setIsNew(true);
    setDraft({ ...EMPTY_DRAFT });
  };

  const cancelEdit = () => {
    setSelectedRoleId(null);
    setIsNew(false);
    setDraft(null);
  };

  const togglePermission = (key) => {
    setDraft((d) => {
      const has = d.permission_keys.includes(key);
      return {
        ...d,
        permission_keys: has
          ? d.permission_keys.filter((k) => k !== key)
          : [...d.permission_keys, key],
      };
    });
  };

  const handleSave = async () => {
    if (!draft?.name?.trim()) {
      showToast?.(t('admin.roles_panel.name_required'), 'error');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
        color: draft.color,
        priority: Number(draft.priority) || 0,
        scope: draft.scope,
        permission_keys: draft.permission_keys,
      };
      if (isNew) {
        await createRole(payload, authToken);
        showToast?.(t('admin.roles_panel.role_created'));
      } else {
        await updateRole(selectedRoleId, payload, authToken);
        showToast?.(t('admin.roles_panel.role_updated'));
      }
      cancelEdit();
      await load();
    } catch (e) {
      showToast?.(e.message || t('admin.roles_panel.error_saving'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRoleId) return;
    if (!window.confirm(t('admin.roles_panel.confirm_delete'))) return;
    setBusy(true);
    try {
      await deleteRole(selectedRoleId, authToken);
      showToast?.(t('admin.roles_panel.role_deleted'));
      cancelEdit();
      await load();
    } catch (e) {
      showToast?.(e.message || t('admin.roles_panel.error_deleting'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const readOnly = !!selectedRole?.is_system;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6">
        <Loader2 size={16} className={`${T.textFaint} animate-spin`} />
        <span className={`text-sm ${T.textFaint}`}>{t('admin.roles_panel.loading')}</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      <div className={`rounded-2xl border ${T.border} ${T.surface} p-3 max-h-[600px] overflow-y-auto`}>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className={`text-xs font-medium uppercase tracking-wider ${T.textFaint}`}>{t('admin.roles_panel.title')}</p>
          <button
            type="button"
            onClick={startNew}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${T.accentText} hover:bg-white/5`}
          >
            <Plus size={13} /> {t('admin.roles_panel.new_button')}
          </button>
        </div>
        {roles.length === 0 ? (
          <p className={`px-1 text-xs ${T.textFaint}`}>{t('admin.roles_panel.no_roles_found')}</p>
        ) : (
          <div className="space-y-1">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => selectRole(r)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors duration-150 ${
                  selectedRoleId === r.id ? `${T.accentSoftBg} ${T.accentText}` : `${T.text} hover:bg-white/5`
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color || '#14B8A6' }}
                />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {r.is_system && <Lock size={11} className={T.textFaint} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`rounded-2xl border ${T.border} ${T.surface} p-4`}>
        {!draft ? (
          <p className={`text-sm ${T.textFaint}`}>{t('admin.roles_panel.select_role_prompt')}</p>
        ) : (
          <div className="space-y-4">
            {readOnly && (
              <div className={`flex items-center gap-2 rounded-xl border ${T.borderSoft} ${T.elevated} px-3 py-2 text-xs ${T.textMuted}`}>
                <Lock size={13} /> {t('admin.roles_panel.system_role_warning')}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={`mb-1 block text-xs ${T.textFaint}`}>{t('admin.roles_panel.name_label')}</span>
                <input
                  type="text"
                  disabled={readOnly}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className={`w-full rounded-xl border ${T.border} ${T.elevated} px-3 py-2 text-sm ${T.text} outline-none disabled:opacity-60`}
                />
              </label>
              <label className="block">
                <span className={`mb-1 block text-xs ${T.textFaint}`}>{t('admin.roles_panel.color_label')}</span>
                <input
                  type="color"
                  disabled={readOnly}
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  className={`h-9 w-full rounded-xl border ${T.border} ${T.elevated} disabled:opacity-60`}
                />
              </label>
              <label className="block">
                <span className={`mb-1 block text-xs ${T.textFaint}`}>{t('admin.roles_panel.priority_label')}</span>
                <input
                  type="number"
                  disabled={readOnly}
                  value={draft.priority}
                  onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
                  className={`w-full rounded-xl border ${T.border} ${T.elevated} px-3 py-2 text-sm ${T.text} outline-none disabled:opacity-60`}
                />
              </label>
              <label className="block">
                <span className={`mb-1 block text-xs ${T.textFaint}`}>{t('admin.roles_panel.scope_label')}</span>
                <select
                  disabled={readOnly || !isNew}
                  value={draft.scope}
                  onChange={(e) => setDraft((d) => ({ ...d, scope: e.target.value }))}
                  className={`w-full rounded-xl border ${T.border} ${T.elevated} px-3 py-2 text-sm ${T.text} outline-none disabled:opacity-60`}
                >
                  <option value="room">{t('admin.roles_panel.scope_room')}</option>
                  <option value="global">{t('admin.roles_panel.scope_global')}</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className={`mb-1 block text-xs ${T.textFaint}`}>{t('admin.roles_panel.description_label')}</span>
              <textarea
                disabled={readOnly}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={2}
                className={`w-full rounded-xl border ${T.border} ${T.elevated} px-3 py-2 text-sm ${T.text} outline-none disabled:opacity-60`}
              />
            </label>

            <div>
              <p className={`mb-2 text-xs font-medium uppercase tracking-wider ${T.textFaint}`}>{t('admin.roles_panel.permissions_label')}</p>
              <PermissionsMatrix
                permissions={permissions}
                selectedKeys={new Set(draft.permission_keys)}
                onToggle={togglePermission}
                disabled={readOnly}
              />
            </div>

            {!readOnly && (
              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className={`rounded-xl px-3 py-2 text-xs ${T.textMuted} hover:bg-white/5`}
                >
                  {t('admin.roles_panel.cancel_button')}
                </button>
                <div className="flex gap-2">
                  {!isNew && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleDelete}
                      className={`flex items-center gap-1.5 rounded-xl border ${T.dangerSoftBorder} ${T.dangerSoftBg} px-3 py-2 text-xs font-medium ${T.danger} disabled:opacity-50`}
                    >
                      <Trash2 size={13} /> {t('admin.roles_panel.delete_button')}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleSave}
                    className={`flex items-center gap-1.5 rounded-xl ${T.accentBg} px-3 py-2 text-xs font-medium text-[#0B0C11] disabled:opacity-50`}
                  >
                    <Save size={13} /> {t('admin.roles_panel.save_button')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}