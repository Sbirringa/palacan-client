import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, UserPlus, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import * as apiService from '../apiService';

export default function ContactSearch({ token, onContactAdded }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });

  // ✅ TOAST SYSTEM
  const showToast = (text, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-[1000] px-6 py-3 rounded-2xl text-sm font-bold shadow-2xl backdrop-blur-xl animate-in slide-in-from-right fade-in duration-200 ${
      type === 'error' 
        ? 'bg-red-500/20 border border-red-500/40 text-red-300' 
        : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
    }`;
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim() || query.length < 3) {
      setMessage({ text: 'Inserisci almeno 3 caratteri per cercare.', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });
    setResults([]);

    try {
      const data = await apiService.searchUsers(query, token);
      setResults(data || []);
      
      if (!data || data.length === 0) {
        setMessage({ text: 'Nessun utente trovato.', type: 'info' });
      }
    } catch (err) {
      console.error('❌ Search error:', err);
      setMessage({ text: 'Errore durante la ricerca.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (username, userId) => {
    setProcessingId(userId);
    setMessage({ text: '', type: '' });
    
    try {
      // ✅ CHIAMATA API REALE (Nessuna simulazione!)
      await apiService.sendContactRequest(username, token);
      
      // Rimuovi dalla lista dei risultati per feedback visivo immediato
      setResults(prev => prev.filter(u => u.username !== username));
      
      showToast(`✅ Richiesta di contatto inviata a ${username}!`);
      onContactAdded?.(username);
      
    } catch (err) {
      console.error(err);
      // Se l'errore è "Già amici" o "Richiesta pendente", lo mostriamo
      const errMsg = err.message || "Errore invio richiesta";
      showToast(`❌ ${errMsg}`, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const clearMessage = () => {
    setMessage({ text: '', type: '' });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="space-y-4 w-full"
    >
      {/* BARRA RICERCA */}
      <form onSubmit={handleSearch} className="relative">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              clearMessage();
            }}
            placeholder="Cerca username (min 3 caratteri)..."
            className="w-full pl-12 pr-5 py-4 bg-zinc-950/50 border border-zinc-700 rounded-2xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:ring-inset transition-all text-base font-medium tracking-wide shadow-inner"
            disabled={loading}
          />
          <motion.button
            type="submit"
            disabled={loading || query.length < 3}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <Loader2 className="animate-spin h-5 w-5" />
            ) : (
              <Search className="h-5 w-5" />
            )}
          </motion.button>
        </div>
      </form>

      {/* MESSAGGIO FEEDBACK */}
      <AnimatePresence>
        {message.text && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-2xl shadow-lg flex items-center gap-3 text-sm backdrop-blur-sm border ${
              message.type === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            }`}
          >
            {message.type === 'error' && <ShieldAlert size={18} />}
            {message.type === 'success' && <ShieldCheck size={18} />}
            {message.type === 'info' && <Search size={18} />}
            <span>{message.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RISULTATI RICERCA */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar"
            layout
          >
            <h4 className="text-zinc-400 text-xs font-black uppercase tracking-widest px-2 mb-3 flex items-center gap-2">
              <UserPlus size={14} />
              Risultati ({results.length})
            </h4>
            
            {results.map((user, index) => (
              <motion.div
                key={user.id}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: index * 0.05 }}
                className="group bg-zinc-900/50 backdrop-blur-sm border border-zinc-700/50 rounded-2xl p-4 hover:bg-zinc-800/70 hover:border-indigo-500/40 transition-all shadow-lg hover:shadow-xl"
                layout
              >
                <div className="flex items-center justify-between">
                  {/* INFO UTENTE */}
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="relative flex-shrink-0">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border-2 border-white/20 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all">
                        <span className="text-lg font-black text-white drop-shadow-sm">
                          {user.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-semibold text-sm truncate group-hover:text-indigo-300 transition-colors">
                        @{user.username}
                      </p>
                      <p className="text-xs text-zinc-500 font-mono mt-0.5">
                        ID: {user.id?.substring(0, 8)}...
                      </p>
                    </div>
                  </div>

                  {/* BOTTONE AGGIUNGI */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleConnect(user.username, user.id)}
                    disabled={processingId === user.id}
                    className="ml-4 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-zinc-800/50 disabled:to-zinc-700/50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-xl shadow-indigo-900/30 hover:shadow-2xl hover:shadow-indigo-900/50 transition-all text-sm uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
                  >
                    {processingId === user.id ? (
                      <>
                        <Loader2 className="animate-spin h-4 w-4" />
                        Invio...
                      </>
                    ) : (
                      <>
                        <UserPlus size={16} />
                        Aggiungi
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* EMPTY STATE */}
      {query.length >= 3 && !loading && results.length === 0 && !message.text && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-12 text-zinc-600 bg-zinc-900/30 rounded-2xl border-2 border-dashed border-zinc-700 p-8"
        >
          <Search className="mx-auto h-16 w-16 mb-4 opacity-40" />
          <p className="text-sm font-medium mb-2">Nessun risultato</p>
          <p className="text-xs">Prova con un altro username</p>
        </motion.div>
      )}
    </motion.div>
  );
}
