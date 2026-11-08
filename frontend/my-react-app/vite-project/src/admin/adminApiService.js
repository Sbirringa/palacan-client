// frontend/src/admin/adminApiService.js
//
// Fase G RBAC (piano v2): client API per gli endpoint amministrativi
// scritti nelle Fasi B-F e Fase G-bis (routes/admin.py). Riusa
// fetchWithAuth da apiService.js — stessa gestione 401 centralizzata
// via onAuthExpired, stessi header — invece di duplicare la logica
// fetch qui: se la sessione scade mentre l'admin sta usando questo
// pannello, il logout automatico registrato in App.jsx scatta comunque.
import { fetchWithAuth } from '../apiService';

const encode = (v) => encodeURIComponent(String(v));

/* ── Fase B: dettaglio stanza ────────────────────────────────────────── */
export const getRoomAdminDetail = async (roomId, token) =>
  fetchWithAuth(`/rooms/${encode(roomId)}/admin/detail`, token, { method: 'GET' });

export const updateRoomAdminDetail = async (roomId, payload, token) =>
  fetchWithAuth(`/rooms/${encode(roomId)}/admin/detail`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload || {}),
  });

export const getRoomAdminMembersDetail = async (roomId, token) =>
  fetchWithAuth(`/rooms/${encode(roomId)}/admin/members-detail`, token, { method: 'GET' });

/* ── Fase C: ruolo locale + mute/unmute ──────────────────────────────── */
export const assignLocalRole = async (roomId, userId, roleId, token) =>
  fetchWithAuth(`/rooms/${encode(roomId)}/admin/members/${encode(userId)}/local-role`, token, {
    method: 'POST',
    body: JSON.stringify({ role_id: roleId ?? null }),
  });

export const muteMember = async (roomId, userId, token) =>
  fetchWithAuth(`/rooms/${encode(roomId)}/admin/members/${encode(userId)}/mute`, token, {
    method: 'POST',
  });

export const unmuteMember = async (roomId, userId, token) =>
  fetchWithAuth(`/rooms/${encode(roomId)}/admin/members/${encode(userId)}/unmute`, token, {
    method: 'POST',
  });

/* ── Fase D: audit log ───────────────────────────────────────────────── */
export const getAuditLog = async (token, filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
  });
  const qs = params.toString();
  return fetchWithAuth(`/rooms/admin/audit-log${qs ? `?${qs}` : ''}`, token, { method: 'GET' });
};

/* ── Fase E: dashboard statistiche ───────────────────────────────────── */
export const getDashboardStats = async (token) =>
  fetchWithAuth('/rooms/admin/dashboard/stats', token, { method: 'GET' });

/* ── Fase F: sessioni/dispositivi ────────────────────────────────────── */
export const getUserSessions = async (userId, token) =>
  fetchWithAuth(`/rooms/admin/users/${encode(userId)}/sessions`, token, { method: 'GET' });

export const terminateSession = async (sessionId, token) =>
  fetchWithAuth(`/rooms/admin/sessions/${encode(sessionId)}/terminate`, token, { method: 'POST' });

export const terminateAllSessions = async (userId, token) =>
  fetchWithAuth(`/rooms/admin/users/${encode(userId)}/sessions/terminate-all`, token, {
    method: 'POST',
  });

export const forceReauth = async (userId, token) =>
  fetchWithAuth(`/rooms/admin/users/${encode(userId)}/force-reauth`, token, { method: 'POST' });

/* ── Fase G-bis: block / unblock / reset password utente ────────────── */
export const blockUser = async (userId, token) =>
  fetchWithAuth(`/rooms/admin/users/${encode(userId)}/block`, token, { method: 'PATCH' });

export const unblockUser = async (userId, token) =>
  fetchWithAuth(`/rooms/admin/users/${encode(userId)}/unblock`, token, { method: 'PATCH' });

export const resetUserPassword = async (userId, token) =>
  fetchWithAuth(`/rooms/admin/users/${encode(userId)}/reset-password`, token, { method: 'POST' });

/* ── Fase G-bis: ruoli custom + catalogo permessi ────────────────────── */
export const getRoles = async (token) =>
  fetchWithAuth('/rooms/admin/roles', token, { method: 'GET' });

export const createRole = async (payload, token) =>
  fetchWithAuth('/rooms/admin/roles', token, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });

export const updateRole = async (roleId, payload, token) =>
  fetchWithAuth(`/rooms/admin/roles/${encode(roleId)}`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload || {}),
  });

export const deleteRole = async (roleId, token) =>
  fetchWithAuth(`/rooms/admin/roles/${encode(roleId)}`, token, { method: 'DELETE' });

export const getPermissions = async (token) =>
  fetchWithAuth('/rooms/admin/permissions', token, { method: 'GET' });