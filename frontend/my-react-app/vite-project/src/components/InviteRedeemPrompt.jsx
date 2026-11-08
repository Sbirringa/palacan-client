/**
 * InviteRedeemPrompt.jsx — v1.10 (NEW)
 *
 * Modal mostrato da App.jsx (stato inviteRedeemPrompt) quando il redeem di
 * un invito (POST /invite-links/:token/redeem) risponde che serve una
 * password stanza (422 { code: 'password_required' }, vedi
 * routes/invite_links.py) oppure che la password inserita era sbagliata
 * (403). Stesso pattern strutturale di BackupPinPrompt: onSubmit risolve
 * la Promise in attesa dentro redeemPendingInvite() con la password
 * digitata, onCancel la risolve con null (l'invito resta pendente in
 * localStorage, l'utente può riprovare riaprendo lo stesso link più
 * avanti).
 *
 * NOTA STILE: come InviteLandingPage, classNames generiche
 * (invite-redeem-prompt*) da riallineare al design system reale del
 * progetto — non ho visibilità sui CSS/Tailwind/tema esistenti.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function InviteRedeemPrompt({ error, loading, onSubmit, onCancel }) {
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!password || loading) return;
    onSubmit(password);
  };

  return (
    <motion.div
      className="invite-redeem-prompt-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="invite-redeem-prompt"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
      >
        <h3>Password della stanza</h3>
        <p>
          Chi ti ha invitato ti ha comunicato una password separata dal link (a voce, o su un
          altro canale): inseriscila per entrare.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password stanza"
            autoFocus
            disabled={loading}
          />

          {error && <p className="invite-redeem-prompt__error">{error}</p>}

          <div className="invite-redeem-prompt__actions">
            <button type="button" onClick={onCancel} disabled={loading}>
              Annulla
            </button>
            <button type="submit" disabled={loading || !password}>
              Entra
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
