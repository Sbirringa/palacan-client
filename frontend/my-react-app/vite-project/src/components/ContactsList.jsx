import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserPlus, Lock, Shield, Plus, X, Loader2, ChevronRight } from 'lucide-react';
import * as apiService from '../apiService';
import { creaStanzaSenzaNome } from '../utils/gruppiPrivati';  // [palacan-metadati-a3.2a]
import { invitaConNome, apriNomiInviti } from '../utils/nomiInviti';  // [palacan-metadati-a3.2b2]

export default function ContactsList({ token, refreshTrigger, onCreateRoom, workspaceId }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // ✅ TOAST SYSTEM
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

  useEffect(() => {
    if (!token) return;

    const loadContacts = async () => {
      setLoading(true);
      try {
        let realContacts = [];
        
        // Logica Differenziata: Se siamo in un workspace, carica i colleghi
        if (workspaceId) {
           realContacts = await apiService.getWorkspaceColleagues(token);
        } else {
           // Se siamo consumer, carica la lista contatti (amici)
           // NOTA: Devi assicurarti di avere questo endpoint nel backend/apiService
           // Per ora usiamo getWorkspaceColleagues come placeholder o implementiamo getContacts
           // Se non esiste, ritorna array vuoto per evitare crash
           if (apiService.getContacts) {
             realContacts = await apiService.getContacts(token);
           }
        }

        setContacts(Array.isArray(realContacts) ? realContacts : []);
      } catch (error) {
        console.error("❌ Errore caricamento contatti:", error);
        setContacts([]);
      } finally {
        setLoading(false);
      }
    };

    loadContacts();
  }, [token, refreshTrigger, workspaceId]);

  const handleContactClick = (contact) => {
    setSelectedContact(contact);
    setNewRoomName(`Chat privata con ${contact.username}`);
    setNewRoomPassword(''); // Reset password
    setShowCreateModal(true);
  };

  const createChatWithContact = async (e) => {
    e.preventDefault();
    if (!selectedContact || !newRoomName || !newRoomPassword) return;
    
    setCreating(true);
    try {
      // 1. Crea la stanza
      const newRoom = await creaStanzaSenzaNome(newRoomName, newRoomPassword, token);  // [palacan-metadati-a3.2a] nome solo sul dispositivo
      
      // 2. Invita automaticamente il contatto (NUOVO STEP)
      // Se non lo fai, crei la stanza ma lui non può entrare se non ha ID e PWD
      if (newRoom && newRoom.id) {
         try {
           await invitaConNome(newRoom.id, selectedContact.username, token);  // [palacan-metadati-a3.2b2]
         } catch(inviteError) {
           console.warn("Impossibile inviare invito automatico:", inviteError);
           showToast("Stanza creata, ma errore nell'invio invito automatico.", "error");
         }
      }

      showToast(`✅ Stanza creata e invito inviato a ${selectedContact.username}!`);
      
      // 3. Reset e callback
      setShowCreateModal(false);
      setSelectedContact(null);
      setNewRoomName('');
      setNewRoomPassword('');
      onCreateRoom?.(newRoom);
      
    } catch (error) {
      showToast(`❌ Errore creazione: ${error.message}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  if (loading && contacts.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-indigo-500 h-6 w-6 mr-3" />
        <span className="text-sm text-zinc-500">Caricamento contatti...</span>
      </div>
    );
  }

  return (
    <>
      {/* LISTA CONTATTI */}
      <div className="space-y-3 mb-6">
        <h3 className="text-zinc-400 text-xs font-black uppercase tracking-widest mb-4 px-2 flex items-center gap-2">
          <Users size={16} />
          I tuoi Contatti ({contacts.length})
        </h3>

        {contacts.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12 text-zinc-600 bg-zinc-900/50 rounded-2xl border-2 border-dashed border-zinc-700 p-8"
          >
            <Users className="mx-auto h-16 w-16 mb-4 opacity-40" />
            <p className="text-sm font-medium mb-2">Nessun contatto</p>
            <p className="text-xs">
              {workspaceId 
                ? "Chiedi all'admin di aggiungere colleghi al team." 
                : "Usa la ricerca in alto per trovare amici."}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
            {contacts.map((contact) => (
              <motion.div
                key={contact.id}
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleContactClick(contact)}
                className="group flex items-center gap-4 p-4 rounded-2xl hover:bg-zinc-800/70 cursor-pointer transition-all border border-transparent hover:border-indigo-500/40 backdrop-blur-sm shadow-sm hover:shadow-lg"
              >
                {/* AVATAR */}
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border-2 border-white/20 flex items-center justify-center shadow-xl group-hover:shadow-2xl transition-all group-hover:scale-105">
                    <span className="text-xl font-black text-white drop-shadow-sm">
                      {contact.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  {/* STATUS */}
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-3 border-zinc-900 shadow-lg ${contact.is_active ? 'bg-emerald-500' : 'bg-zinc-600'}`}></div>
                </div>

                {/* INFO */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-lg truncate group-hover:text-indigo-300 transition-colors">
                    {contact.username}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-zinc-500 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${contact.is_active ? 'bg-emerald-500' : 'bg-zinc-600'}`}></span>
                    <span>{contact.is_active ? 'Online' : 'Offline'}</span>
                  </div>
                </div>

                {/* ACTION */}
                <div className="flex items-center gap-2 ml-auto">
                  <ChevronRight size={18} className="text-zinc-500 group-hover:text-indigo-400 ml-2 flex-shrink-0 transition-all group-hover:translate-x-1" />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* MODALE CREAZIONE CHAT */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            onClick={(e) => e.target === e.currentTarget && setShowCreateModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-zinc-900/95 backdrop-blur-2xl border border-zinc-800/50 p-8 rounded-3xl w-full max-w-md shadow-2xl shadow-zinc-950/50 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-black text-white flex items-center gap-3">
                  <Shield size={28} className="text-indigo-400" />
                  Nuova Chat Privata
                </h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="mb-6 p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                <p className="text-zinc-300 text-sm">
                  Con: <span className="font-bold text-indigo-400">{selectedContact?.username}</span>
                </p>
              </div>

              <form onSubmit={createChatWithContact} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                    Nome Stanza Privata
                  </label>
                  <input 
                    value={newRoomName} 
                    onChange={(e) => setNewRoomName(e.target.value)}
                    required 
                    placeholder="es. Chat con Mario Rossi"
                    className="w-full bg-zinc-950/50 border border-zinc-700 rounded-2xl px-5 py-4 text-white placeholder-zinc-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-lg font-medium tracking-wide"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
                    Password Sicura (Obbligatoria)
                  </label>
                  <input 
                    type="password"
                    value={newRoomPassword} 
                    onChange={(e) => setNewRoomPassword(e.target.value)}
                    required 
                    placeholder="Password molto forte (min 8)"
                    className="w-full bg-zinc-950/50 border-2 border-amber-500/30 rounded-2xl px-5 py-4 text-white placeholder-zinc-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all text-lg font-medium tracking-wide"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700 text-zinc-300 hover:text-zinc-200 font-bold py-4 px-6 rounded-2xl transition-all text-sm uppercase tracking-wider"
                  >
                    Annulla
                  </button>
                  
                  <button
                    type="submit"
                    disabled={creating || !newRoomName || !newRoomPassword || newRoomPassword.length < 8}
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:from-zinc-800/50 disabled:to-zinc-700/50 disabled:cursor-not-allowed text-white font-black py-4 px-6 rounded-2xl shadow-2xl shadow-emerald-900/30 hover:shadow-3xl hover:shadow-emerald-900/50 transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="animate-spin h-5 w-5" />
                        Creazione...
                      </>
                    ) : (
                      <>
                        <Shield size={18} />
                        Crea Chat
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
