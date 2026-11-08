import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Check, X, Loader2, Hash, Clock } from 'lucide-react';
import * as apiService from '../apiService';
import { invitaConNome, apriNomiInviti } from '../utils/nomiInviti';  // [palacan-metadati-a3.2b2]

export default function PendingInvites({ token, onUpdate }) {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  // Toast system interno
  const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-[1000] px-6 py-3 rounded-2xl text-sm font-bold shadow-2xl backdrop-blur-xl animate-in slide-in-from-right fade-in duration-200 ${
      type === 'error' 
        ? 'bg-red-500/20 border border-red-500/40 text-red-300' 
        : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  };

  // 1. FETCH REALE
  const fetchInvites = async () => {
    if (!token) return;
    try {
      // Chiama l'API vera (definita sotto)
      const realData = await apiService.getRoomInvites(token);
      setInvites(await apriNomiInviti(Array.isArray(realData) ? realData : []));  // [palacan-metadati-a3.2b2]
    } catch (error) {
      console.error("Errore silent update inviti:", error);
    }
  };

  useEffect(() => {
    fetchInvites();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') fetchInvites(); }, 120000);  // [palacan-metadati-a3.2b2] come A1: non piu' ogni 15 secondi
    return () => clearInterval(interval);
  }, [token]);

  // 2. ACCETTAZIONE REALE
  const handleAccept = async (inviteId, roomName) => {
    setProcessingId(inviteId);
    try {
      await apiService.acceptRoomInvite(inviteId, token);
      
      setInvites(prev => prev.filter(invite => invite.id !== inviteId));
      showToast(`✅ Entrato in ${roomName}`);
      onUpdate?.(); // Ricarica la lista stanze nella Dashboard
    } catch (error) {
      showToast(error.message || 'Errore accettazione invite', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // 3. RIFIUTO REALE
  const handleReject = async (inviteId) => {
    setProcessingId(inviteId);
    try {
      await apiService.rejectRoomInvite(inviteId, token);
      
      setInvites(prev => prev.filter(invite => invite.id !== inviteId));
      showToast('❌ Invito rifiutato');
    } catch (error) {
      showToast('Errore rifiuto invite', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  if (invites.length === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="mb-6 bg-zinc-900/80 border border-blue-500/30 rounded-2xl p-4 shadow-lg overflow-hidden relative"
    >
      {/* Sfondo decorativo */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500 opacity-50" />

      {/* HEADER */}
      <div className="flex items-center justify-between mb-4 px-1">
        <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
          <Mail size={14} />
          Inviti ai Gruppi
        </h4>
        <span className="bg-blue-500/20 text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/30">
          {invites.length}
        </span>
      </div>

      {/* LISTA INVITI */}
      <div className="space-y-2">
        <AnimatePresence>
          {invites.map((invite) => (
            <motion.div
              key={invite.id}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0, height: 0 }}
              className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 hover:border-blue-500/30 transition-colors group"
            >
              <div className="flex items-center justify-between gap-3">
                {/* INFO INVITO */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Hash size={14} />
                  </div>
                  
                  <div className="min-w-0">
                    <p className="text-zinc-200 text-xs font-bold truncate">
                      {invite.room_name}
                    </p>
                    <p className="text-[10px] text-zinc-500 flex items-center gap-1 truncate">
                      Da: <span className="text-blue-400 font-semibold">{invite.sender_username}</span>
                    </p>
                  </div>
                </div>

                {/* AZIONI */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(invite.id, invite.room_name)}
                    disabled={processingId === invite.id}
                    className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all border border-emerald-500/20 disabled:opacity-50"
                  >
                    {processingId === invite.id ? <Loader2 size={14} className="animate-spin"/> : <Check size={14} strokeWidth={3} />}
                  </button>
                  
                  <button
                    onClick={() => handleReject(invite.id)}
                    disabled={processingId === invite.id}
                    className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all border border-red-500/20 disabled:opacity-50"
                  >
                    <X size={14} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
