import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Loader2, RefreshCw, Building2, Lock, Archive, CheckCircle2,
  VolumeX, Volume2, Circle, UserCog,
} from 'lucide-react';
import { T } from './theme';
import { useTranslation } from 'react-i18next';
import * as apiService from '../apiService';
import {
  getRoomAdminDetail,
  updateRoomAdminDetail,
  getRoomAdminMembersDetail,
  muteMember,
  unmuteMember,
  getRoles,
  assignLocalRole,
} from './adminApiService';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Attiva', icon: CheckCircle2 },
  { value: 'archived', label: 'Archiviata', icon: Archive },
  { value: 'locked', label: 'Bloccata', icon: Lock },
];

const STATUS_BADGE = {
  active: `${T.accentSoftBorder} ${T.accentSoftBg} ${T.accentText}`,
  archived: `${T.borderSoft} ${T.elevated} ${T.textFaint}`,
  locked: `${T.dangerSoftBorder} ${T.dangerSoftBg} ${T.danger}`,
};

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('it-IT');
  } catch {
    return '—';
  }
};

/* ── v1.12-C (fix "refresh dentro Amministrazione → Stanze perde il
   dettaglio aperto"): chiave localStorage per la stanza selezionata,
   per utente — stesso stile di getCurrentRoomKey in App.jsx e
   getAdminActiveTabKey in AdminApp.jsx. Richiede currentUsername come
   prop (nuova, passata da AdminApp.jsx). ────────────────────────────── */
const getSelectedRoomKey = (username) => `admin_selected_room_${username}`;

export default function RoomDetailPanel({ authToken, currentUsername, showToast }) {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  /* ── v1.12-C: lazy-init da localStorage. A questo punto non abbiamo
     ancora la lista stanze dal server, quindi il valore letto qui è
     "ottimista" — non sappiamo ancora se quella stanza esiste/è ancora
     visibile in questo workspace. La validazione vera avviene sotto,
     dentro il .then() del fetch di getRooms, l'unico posto in cui
     abbiamo la lista aggiornata per confrontarla. */
  const [selectedRoomId, setSelectedRoomId] = useState(() => {
    try {
      if (!currentUsername) return null;
      return localStorage.getItem(getSelectedRoomKey(currentUsername)) || null;
    } catch (_) {
      return null;
    }
  });

  const [detail, setDetail] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busyStatus, setBusyStatus] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState(null);

  // Fase G-bis: catalogo ruoli locali (scope='room') per il selettore
  // di assegnazione sotto ogni membro, e stato dropdown pendente prima
  // di premere "Assegna" (non scriviamo ad ogni onChange, solo alla conferma).
  const [roomScopedRoles, setRoomScopedRoles] = useState([]);
  const [pendingRoleByUser, setPendingRoleByUser] = useState({});
  const [busyAssignUserId, setBusyAssignUserId] = useState(null);

  useEffect(() => {
    if (!authToken) return;
    setLoadingRooms(true);
    apiService.getRooms(authToken)
      .then((data) => {
        const list = Array.isArray(data)
          ? data.filter((r) => r?.is_corporate === true && r?.room_kind !== 'direct')
          : [];
        setRooms(list);

        /* ── v1.12-C: validazione della stanza ripristinata da
           localStorage contro la lista reale appena arrivata dal
           server. Se non c'è più (eliminata, o non più corporate/
           visibile in questo workspace), puliamo sia lo state sia la
           chiave — meglio tornare alla lista vuota che mostrare un
           pannello agganciato a un room_id fantasma. Se il fetch
           fallisce (vedi .catch sotto) NON tocchiamo la selezione:
           un errore di rete non è prova che la stanza non esista più. */
        setSelectedRoomId((prev) => {
          if (!prev) return prev;
          const stillExists = list.some((r) => String(r.id) === String(prev));
          if (!stillExists) {
            try {
              if (currentUsername) localStorage.removeItem(getSelectedRoomKey(currentUsername));
            } catch (_) {}
            return null;
          }
          return prev;
        });
      })
      .catch(() => setRooms([]))
      .finally(() => setLoadingRooms(false));
  }, [authToken, currentUsername]);

  const loadRoomDetail = useCallback(async (roomId) => {
    if (!roomId || !authToken) return;
    setLoadingDetail(true);
    try {
      const [detailRes, membersRes, rolesRes] = await Promise.all([
        getRoomAdminDetail(roomId, authToken),
        getRoomAdminMembersDetail(roomId, authToken),
        getRoles(authToken),
      ]);
      setDetail(detailRes || null);
      setMembers(Array.isArray(membersRes) ? membersRes : []);
      const allRoles = Array.isArray(rolesRes) ? rolesRes : [];
      setRoomScopedRoles(allRoles.filter((r) => r?.scope === 'room'));
    } catch (e) {
      showToast?.(e.message || t('admin.room_detail.error_loading_detail'), 'error');
      setDetail(null);
      setMembers([]);
      setRoomScopedRoles([]);
    } finally {
      setLoadingDetail(false);
    }
  }, [authToken, showToast]);

  /* ── v1.12-C: persistenza della stanza selezionata ad ogni cambio
     (scrittura se selezionata, rimozione se deselezionata/azzerata dalla
     validazione sopra). ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!currentUsername) return;
    try {
      if (selectedRoomId) {
        localStorage.setItem(getSelectedRoomKey(currentUsername), selectedRoomId);
      } else {
        localStorage.removeItem(getSelectedRoomKey(currentUsername));
      }
    } catch (_) {}
  }, [selectedRoomId, currentUsername]);

  /* ── v1.12-C: il caricamento del dettaglio ora è centralizzato qui,
     agganciato a selectedRoomId invece che chiamato a mano dentro
     handleSelectRoom. Così sia il click dell'utente sia il ripristino
     da localStorage al mount passano dallo stesso identico percorso —
     nessuna logica duplicata, nessun rischio che i due casi si
     disallineino in futuro. */
  useEffect(() => {
    if (!selectedRoomId) {
      setDetail(null);
      setMembers([]);
      setRoomScopedRoles([]);
      return;
    }
    loadRoomDetail(selectedRoomId);
  }, [selectedRoomId, loadRoomDetail]);

  const handleSelectRoom = (roomId) => {
    setPendingRoleByUser({});
    setSelectedRoomId(roomId);
  };

  const handleChangeStatus = async (newStatus) => {
    if (!selectedRoomId || !detail || detail.status === newStatus) return;
    setBusyStatus(true);
    try {
      await updateRoomAdminDetail(selectedRoomId, { status: newStatus }, authToken);
      showToast?.(t('admin.room_detail.status_updated'));
      await loadRoomDetail(selectedRoomId);
    } catch (e) {
      showToast?.(e.message || t('admin.room_detail.error_updating_status'), 'error');
    } finally {
      setBusyStatus(false);
    }
  };

  const handleToggleMute = async (member) => {
    const userId = member.user_id || member.userId;
    if (!userId || !selectedRoomId) return;
    setBusyMemberId(userId);
    try {
      if (member.muted) {
        await unmuteMember(selectedRoomId, userId, authToken);
        showToast?.(`${member.username} ${t('admin.room_detail.unmuted_suffix')}`);
      } else {
        await muteMember(selectedRoomId, userId, authToken);
        showToast?.(`${member.username} ${t('admin.room_detail.muted_suffix')}`);
      }
      const membersRes = await getRoomAdminMembersDetail(selectedRoomId, authToken);
      setMembers(Array.isArray(membersRes) ? membersRes : []);
    } catch (e) {
      showToast?.(e.message || t('admin.room_detail.error_updating_mute'), 'error');
    } finally {
      setBusyMemberId(null);
    }
  };

  // Fase G-bis: assegna (o rimuove, se selezionato "Nessuno" → roleId null)
  // il ruolo locale al membro, poi ricarica solo i membri — stesso pattern
  // già collaudato di handleToggleMute, nessuna nuova strategia introdotta.
  const handleAssignLocalRole = async (member) => {
    const userId = member.user_id || member.userId;
    if (!userId || !selectedRoomId) return;
    const selectedValue = pendingRoleByUser[userId];
    const roleId = selectedValue ? selectedValue : null;
    setBusyAssignUserId(userId);
    try {
      await assignLocalRole(selectedRoomId, userId, roleId, authToken);
      showToast?.(
        roleId
          ? `${t('admin.room_detail.role_assigned_prefix')} ${member.username}`
          : `${t('admin.room_detail.role_removed_prefix')} ${member.username}`
      );
      const membersRes = await getRoomAdminMembersDetail(selectedRoomId, authToken);
      setMembers(Array.isArray(membersRes) ? membersRes : []);
    } catch (e) {
      showToast?.(e.message || t('admin.room_detail.error_assigning_role'), 'error');
    } finally {
      setBusyAssignUserId(null);
    }
  };

  const selectedRoomName = useMemo(
    () => rooms.find((r) => String(r?.id) === String(selectedRoomId))?.name,
    [rooms, selectedRoomId]
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      <div className={`rounded-2xl border ${T.border} ${T.surface} p-3 max-h-[600px] overflow-y-auto`}>
        <p className={`mb-2 px-1 text-xs font-medium uppercase tracking-wider ${T.textFaint}`}>{t('admin.room_detail.rooms_title')}</p>
        {loadingRooms ? (
          <div className="flex items-center gap-2 px-1 py-3">
            <Loader2 size={14} className={`${T.textFaint} animate-spin`} />
            <span className={`text-xs ${T.textFaint}`}>{t('admin.room_detail.loading')}</span>
          </div>
        ) : rooms.length === 0 ? (
          <p className={`px-1 text-xs ${T.textFaint}`}>{t('admin.room_detail.no_workspace_rooms')}</p>
        ) : (
          <div className="space-y-1">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => handleSelectRoom(room.id)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors duration-150 ${
                  String(selectedRoomId) === String(room.id)
                    ? `${T.accentSoftBg} ${T.accentText}`
                    : `${T.text} hover:bg-white/5`
                }`}
              >
                <Building2 size={13} className="shrink-0" />
                <span className="truncate">{room.name || t('admin.room_detail.default_room_name')}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`rounded-2xl border ${T.border} ${T.surface} p-4`}>
        {!selectedRoomId ? (
          <p className={`text-sm ${T.textFaint}`}>{t('admin.room_detail.select_room_prompt')}</p>
        ) : loadingDetail ? (
          <div className="flex items-center gap-2 py-6">
            <Loader2 size={16} className={`${T.textFaint} animate-spin`} />
            <span className={`text-sm ${T.textFaint}`}>{t('admin.room_detail.loading_detail')}</span>
          </div>
        ) : !detail ? (
          <p className={`text-sm ${T.textFaint}`}>{t('admin.room_detail.detail_unavailable')}</p>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className={`truncate text-sm font-medium ${T.text}`}>{detail.name || selectedRoomName}</h4>
                <p className={`text-xs ${T.textFaint}`}>
                  {t('admin.room_detail.created_by_prefix')} {detail.creator_username || '—'} · {formatDateTime(detail.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadRoomDetail(selectedRoomId)}
                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs ${T.textMuted} transition-colors duration-150 hover:bg-white/5`}
              >
                <RefreshCw size={13} />
                {t('admin.room_detail.refresh_button')}
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className={`rounded-xl border ${T.borderSoft} ${T.elevated} px-3 py-2`}>
                <p className={`text-[11px] ${T.textFaint}`}>{t('admin.room_detail.stat_members')}</p>
                <p className={`text-sm font-medium ${T.text}`}>{detail.member_count ?? 0}</p>
              </div>
              <div className={`rounded-xl border ${T.borderSoft} ${T.elevated} px-3 py-2`}>
                <p className={`text-[11px] ${T.textFaint}`}>{t('admin.room_detail.stat_messages')}</p>
                <p className={`text-sm font-medium ${T.text}`}>{detail.message_count ?? 0}</p>
              </div>
              <div className={`rounded-xl border ${T.borderSoft} ${T.elevated} px-3 py-2`}>
                <p className={`text-[11px] ${T.textFaint}`}>{t('admin.room_detail.stat_admin_mod_local')}</p>
                <p className={`text-sm font-medium ${T.text}`}>{detail.admin_count ?? 0} / {detail.mod_count ?? 0}</p>
              </div>
              <div className={`rounded-xl border ${T.borderSoft} ${T.elevated} px-3 py-2`}>
                <p className={`text-[11px] ${T.textFaint}`}>{t('admin.room_detail.stat_last_activity')}</p>
                <p className={`text-sm font-medium ${T.text}`}>{formatDateTime(detail.last_message_at)}</p>
              </div>
            </div>

            <div className="mb-5">
              <p className={`mb-2 text-[11px] font-medium uppercase tracking-wider ${T.textFaint}`}>{t('admin.room_detail.room_status_label')}</p>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((opt) => {
                  const active = detail.status === opt.value;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={busyStatus || active}
                      onClick={() => handleChangeStatus(opt.value)}
                      className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors duration-150 disabled:cursor-default ${
                        active
                          ? `${STATUS_BADGE[opt.value]} border`
                          : `${T.borderSoft} ${T.elevated} ${T.textMuted} hover:bg-white/5`
                      }`}
                    >
                      <Icon size={12} />
                      {t(`admin.room_detail.status_${opt.value}`)}
                      {active && <span className="ml-0.5">· {t('admin.room_detail.current_suffix')}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className={`mb-2 text-[11px] font-medium uppercase tracking-wider ${T.textFaint}`}>
                {t('admin.room_detail.members_count_prefix')} ({members.length})
              </p>
              {members.length === 0 ? (
                <p className={`text-sm ${T.textFaint}`}>{t('admin.room_detail.no_members_found')}</p>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => {
                    const userId = m.user_id || m.userId;
                    const busy = busyMemberId === userId;
                    const assigning = busyAssignUserId === userId;
                    const currentLocalRoleId = m.local_role?.id ? String(m.local_role.id) : '';
                    const pendingValue = pendingRoleByUser[userId] ?? currentLocalRoleId;
                    return (
                      <div
                        key={userId}
                        className={`flex flex-col gap-3 rounded-xl border ${T.borderSoft} ${T.elevated} p-3 sm:flex-row sm:items-center sm:justify-between`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Circle
                            size={8}
                            className="shrink-0"
                            fill={m.is_online ? T.accent : '#8CA0A2'}
                            color={m.is_online ? T.accent : '#8CA0A2'}
                          />
                          <div className="min-w-0">
                            <p className={`truncate text-sm ${T.text}`}>
                              {m.username}
                              {m.muted && (
                                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${T.dangerSoftBg} ${T.danger}`}>
                                  {t('admin.room_detail.muted_badge')}
                                </span>
                              )}
                            </p>
                            <p className={`text-[11px] ${T.textFaint}`}>
                              {m.global_role?.name || t('admin.room_detail.no_global_role')}
                              {m.local_role?.name ? ` · ${m.local_role.name}` : ''}
                              {' · '}{t('admin.room_detail.since_prefix')} {formatDateTime(m.joined_at)}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {/* Fase G-bis: selettore ruolo locale (scope='room') */}
                          <div className="flex items-center gap-1.5">
                            <UserCog size={13} className={T.textFaint} />
                            <select
                              value={pendingValue}
                              disabled={assigning}
                              onChange={(e) =>
                                setPendingRoleByUser((prev) => ({ ...prev, [userId]: e.target.value }))
                              }
                              className={`rounded-lg border ${T.border} ${T.elevated} px-2 py-1.5 text-xs ${T.text} outline-none disabled:opacity-50`}
                            >
                              <option value="">{t('admin.room_detail.none_option')}</option>
                              {roomScopedRoles.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={assigning || pendingValue === currentLocalRoleId}
                              onClick={() => handleAssignLocalRole(m)}
                              className={`rounded-lg border ${T.accentSoftBorder} ${T.accentSoftBg} ${T.accentText} px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 hover:opacity-90 disabled:opacity-50`}
                            >
                              {assigning ? <Loader2 size={12} className="animate-spin" /> : t('admin.room_detail.assign_button')}
                            </button>
                          </div>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleToggleMute(m)}
                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors duration-150 disabled:opacity-50 ${
                              m.muted
                                ? `${T.accentSoftBorder} ${T.accentSoftBg} ${T.accentText} hover:opacity-90`
                                : `${T.dangerSoftBorder} ${T.dangerSoftBg} ${T.danger} hover:opacity-90`
                            }`}
                          >
                            {m.muted ? <Volume2 size={13} /> : <VolumeX size={13} />}
                            {m.muted ? t('admin.room_detail.unmute_button') : t('admin.room_detail.mute_button')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}