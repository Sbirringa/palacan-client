import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Hash, Lock, ChevronRight, X } from 'lucide-react';
import * as apiService from '../apiService';

// Formatta un timestamp in "ora", "2 minuti fa", "4 ore fa", "5 giorni fa"
// Export nominato aggiunto per permettere test unitari diretti sulla
// logica delle soglie, senza dover renderizzare l'intero Sidebar -
// l'export di default (Sidebar) resta invariato per chi lo importa gia'.
export function formatRelativeTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 30) return 'ora';
  if (diffSec < 60) return `${diffSec} sec fa`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minuto' : 'minuti'} fa`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'ora' : 'ore'} fa`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'giorno' : 'giorni'} fa`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks} ${diffWeeks === 1 ? 'settimana' : 'settimane'} fa`;

  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function RoomRow({ room, onClick, variant = 'public' }) {
  const isProtected = variant === 'protected';
  const unreadCount = room.unread_count ?? room.unreadCount ?? 0;
  const lastMessagePreview =
    room.last_message_preview ?? room.lastMessagePreview ?? room.last_message ?? null;
  const lastMessageAt =
    room.last_message_at ?? room.lastMessageAt ?? room.updated_at ?? room.updatedAt ?? null;
  const relativeTime = formatRelativeTime(lastMessageAt);
  const safeId = room.id != null ? String(room.id) : '';

  return (
    <motion.div
      key={room.id}
      whileHover={{ scale: 1.02, x: 2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`group flex items-center gap-3 p-4 rounded-2xl cursor-pointer transition-all border backdrop-blur-sm shadow-sm hover:shadow-md ${
        isProtected
          ? 'bg-zinc-800/50 border-amber-500/30 hover:bg-amber-500/10'
          : 'border-transparent hover:bg-zinc-800/70 hover:border-indigo-500/40'
      }`}
    >
      <div
        className={`relative flex-shrink-0 w-10 h-10 rounded-xl border-2 flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all ${
          isProtected
            ? 'bg-gradient-to-br from-amber-500/30 to-orange-500/30 border-amber-500/50'
            : 'bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border-indigo-500/30'
        }`}
      >
        {isProtected ? (
          <Lock size={18} className="text-amber-400" />
        ) : (
          <Hash size={18} className="text-indigo-400" />
        )}

        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md border border-zinc-900">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p
            className={`font-semibold text-sm truncate transition-colors ${
              isProtected
                ? 'text-zinc-200 group-hover:text-amber-300'
                : 'text-white group-hover:text-indigo-300'
            }`}
          >
            {isProtected ? '🔒 ' : '# '}
            {room.name}
          </p>
          {relativeTime && (
            <span className="text-[10px] text-zinc-500 font-mono whitespace-nowrap flex-shrink-0">
              {relativeTime}
            </span>
          )}
        </div>

        {lastMessagePreview ? (
          <p className="text-xs text-zinc-500 mt-0.5 truncate">{lastMessagePreview}</p>
        ) : (
          <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">
            ID: {safeId.substring(0, 8)}...{isProtected ? ' (protetta)' : ''}
          </p>
        )}
      </div>

      <ChevronRight
        size={16}
        className={`ml-auto flex-shrink-0 transition-all group-hover:translate-x-1 ${
          isProtected
            ? 'text-zinc-500 group-hover:text-amber-400'
            : 'text-zinc-500 group-hover:text-indigo-400'
        }`}
      />
    </motion.div>
  );
}

export default function Sidebar({ recentRooms, token, onSelectRoom, onCreateRoom }) {
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingRoom, setPendingRoom] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');

  const rooms = recentRooms || [];
  const hasPasswordRooms = rooms.filter((room) => room.has_password);
  const publicRooms = rooms.filter((room) => !room.has_password);

  const showToast = (message, isError = false) => {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.className = `fixed top-4 right-4 ${isError ? 'bg-red-500/90' : 'bg-emerald-500/90'} text-white px-4 py-2 rounded-xl text-sm z-[1000] backdrop-blur shadow-2xl animate-in slide-in-from-top-2 fade-in duration-200`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3000);
  };

  const handleRoomClick = (room) => {
    if (room.has_password) {
      setPendingRoom(room);
      setPasswordInput('');
      setShowPasswordModal(true);
    } else {
      onSelectRoom(room);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!pendingRoom || !passwordInput) return;

    try {
      const verified = await apiService.verifyRoomPassword(pendingRoom.id, passwordInput, token);
      if (verified) {
        onSelectRoom(pendingRoom, passwordInput);
        showToast(`✅ Accesso a ${pendingRoom.name}`);
        setShowPasswordModal(false);
        setPendingRoom(null);
        setPasswordInput('');
      } else {
        showToast('❌ Password errata', true);
      }
    } catch (err) {
      showToast('❌ Errore verifica password', true);
    }
  };

  return (
    <div className="flex flex-col h-full w-[320px] bg-zinc-900 border-r border-zinc-800 shadow-2xl relative">
      {/* HEADER */}
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-black text-xl tracking-tight flex items-center gap-2">
            <Hash className="text-indigo-400" size={24} />
            Le tue Chat
          </h2>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onCreateRoom?.()}
            className="p-2.5 bg-indigo-600/20 hover:bg-indigo-500/30 text-indigo-300 rounded-xl border border-indigo-500/30 transition-all shadow-md hover:shadow-lg flex items-center gap-1 text-sm font-bold"
            title="Nuova chat"
          >
            <Plus size={16} />
          </motion.button>
        </div>
        <p className="text-zinc-500 text-xs mt-1 font-mono tracking-wider uppercase">
          {rooms.length} conversazioni attive
        </p>
      </div>

      {/* LISTA STANZE */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
        {publicRooms.length > 0 && (
          <>
            <h3 className="text-zinc-500 text-xs font-black uppercase tracking-widest px-2 mb-3 flex items-center gap-2">
              📢 Stanze Pubbliche ({publicRooms.length})
            </h3>
            {publicRooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                variant="public"
                onClick={() => onSelectRoom(room)}
              />
            ))}
          </>
        )}

        {hasPasswordRooms.length > 0 && (
          <>
            <h3 className="text-zinc-500 text-xs font-black uppercase tracking-widest px-2 mb-3 flex items-center gap-2">
              🔒 Stanze Protette ({hasPasswordRooms.length})
            </h3>
            {hasPasswordRooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                variant="protected"
                onClick={() => handleRoomClick(room)}
              />
            ))}
          </>
        )}

        {rooms.length === 0 && !loading && (
          <div className="text-center py-12 text-zinc-500">
            <Hash className="mx-auto h-16 w-16 text-zinc-700 mb-4 opacity-40" />
            <p className="text-sm font-medium mb-2">Nessuna chat attiva</p>
            <p className="text-xs text-zinc-600">Crea la prima conversazione o unisciti con un ID</p>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 text-center">
        <div className="text-xs text-zinc-500 space-y-1">
          <p>🔐 SecureChat E2EE</p>
          <p className="text-[10px] font-mono tracking-wider">v2.0 • Matrix Protocol</p>
        </div>
      </div>

      {/* MODALE PASSWORD */}
      <AnimatePresence>
        {showPasswordModal && pendingRoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-amber-500/50 p-6 rounded-2xl w-full max-w-xs shadow-2xl relative"
            >
              <button
                onClick={() => setShowPasswordModal(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white"
              >
                <X size={20} />
              </button>

              <div className="flex flex-col items-center mb-6">
                <div className="w-14 h-14 bg-amber-500/20 rounded-full flex items-center justify-center mb-3">
                  <Lock size={24} className="text-amber-500" />
                </div>
                <h3 className="text-lg font-bold text-white text-center">Accesso Riservato</h3>
                <p className="text-xs text-zinc-400 text-center mt-1">
                  Inserisci la password per entrare in <b>{pendingRoom.name}</b>
                </p>
              </div>

              <form onSubmit={handlePasswordSubmit}>
                <input
                  type="password"
                  autoFocus
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-black/50 border border-zinc-700 rounded-xl px-4 py-3 text-white text-center tracking-widest outline-none focus:border-amber-500 transition-all mb-4"
                />
                <button
                  type="submit"
                  className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-amber-900/20"
                >
                  Sblocca
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}