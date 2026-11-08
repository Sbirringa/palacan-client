// src/components/ForcedPasswordChangeScreen.jsx
//
// Schermata BLOCCANTE mostrata subito dopo un login/attivazione riuscita
// quando res.user.force_password_change === true (vedi routes/auth.py,
// build_user_payload — ora include sempre questo campo nella risposta di
// login, non serve più un giro separato su /auth/me). Chi la vede non
// può accedere alla Dashboard finché non sceglie una password propria
// che soddisfi tutte le regole (vedi PasswordRequirementsChecklist.jsx).
//
// Integrazione prevista in App.jsx (NON ancora applicata in questo file
// — va aggiunta a parte, vedi nota in fondo):
//   1. Nuovo state: const [forcePasswordChange, setForcePasswordChange] = useState(false);
//   2. In handleLogin/handleEnterpriseSubmit, dopo aver ricevuto `res`:
//        if (res.user.force_password_change) setForcePasswordChange(true);
//   3. Nel render, PRIMA delle Routes principali (quando authToken esiste
//      ma forcePasswordChange è true), mostrare SOLO questo componente:
//        if (authToken && forcePasswordChange) {
//          return (
//            <ForcedPasswordChangeScreen
//              apiService={apiService}
//              token={authToken}
//              username={currentUsername}
//              onSuccess={() => setForcePasswordChange(false)}
//              onLogout={() => performLogout(false)}
//            />
//          );
//        }
//      Questo va inserito DOPO il blocco "if (!authToken) {...}" esistente
//      e PRIMA del render normale della Dashboard, così l'utente non può
//      in nessun modo raggiungere la Dashboard prima di aver cambiato
//      password (niente Routes montate, niente navigate() possibile).

import React, { useState } from 'react';
import { Loader2, Lock, LogOut, Eye, EyeOff } from 'lucide-react';
import PasswordRequirementsChecklist, {
  isPasswordValid,
} from './PasswordRequirementsChecklist.jsx';

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    zIndex: 1000,
    padding: '16px',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  },
  iconBadge: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    margin: '0 0 6px',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: '14px',
    color: '#64748b',
    margin: '0 0 24px',
    lineHeight: 1.5,
  },
  fieldWrap: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#334155',
    marginBottom: '6px',
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 40px 10px 12px',
    fontSize: '14px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    outline: 'none',
  },
  inputError: {
    borderColor: '#dc2626',
  },
  eyeButton: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    display: 'flex',
    padding: 0,
  },
  errorText: {
    color: '#dc2626',
    fontSize: '13px',
    margin: '10px 0 0',
  },
  submitButton: {
    width: '100%',
    padding: '12px',
    marginTop: '20px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 600,
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    cursor: 'pointer',
  },
  logoutLink: {
    marginTop: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontSize: '13px',
    color: '#94a3b8',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
  },
};

export default function ForcedPasswordChangeScreen({
  apiService,
  token,
  username,
  onSuccess,
  onLogout,
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const rulesOk = isPasswordValid(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isSameAsCurrent =
    currentPassword.length > 0 && newPassword.length > 0 && currentPassword === newPassword;

  const canSubmit =
    currentPassword.trim().length > 0 && rulesOk && passwordsMatch && !isSameAsCurrent && !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');

    try {
      await apiService.changePassword(currentPassword, newPassword, token);
      onSuccess?.();
    } catch (err) {
      setError(err?.message || 'Errore durante il cambio password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.iconBadge}>
          <Lock size={22} color="#2563eb" />
        </div>

        <h2 style={styles.title}>Imposta una nuova password</h2>
        <p style={styles.subtitle}>
          {username ? `Ciao ${username}, ` : ''}
          per motivi di sicurezza devi scegliere una password personale prima di continuare.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={styles.fieldWrap}>
            <label style={styles.label} htmlFor="fpc-current">
              Password temporanea (fornita dalla tua azienda)
            </label>
            <div style={styles.inputWrap}>
              <input
                id="fpc-current"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={styles.input}
                autoComplete="current-password"
                autoFocus
              />
              <button
                type="button"
                style={styles.eyeButton}
                onClick={() => setShowCurrent((v) => !v)}
                tabIndex={-1}
                aria-label={showCurrent ? 'Nascondi password' : 'Mostra password'}
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={styles.fieldWrap}>
            <label style={styles.label} htmlFor="fpc-new">
              Nuova password
            </label>
            <div style={styles.inputWrap}>
              <input
                id="fpc-new"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{
                  ...styles.input,
                  ...(isSameAsCurrent ? styles.inputError : {}),
                }}
                autoComplete="new-password"
              />
              <button
                type="button"
                style={styles.eyeButton}
                onClick={() => setShowNew((v) => !v)}
                tabIndex={-1}
                aria-label={showNew ? 'Nascondi password' : 'Mostra password'}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* ── Checklist LIVE: ogni regola si spunta in verde man mano
               che la password digitata la soddisfa, stesso pattern delle
               app note (GitHub, Google, Stripe...). Include anche la riga
               "Le password coincidono" passando confirmPassword. ──────── */}
            <PasswordRequirementsChecklist
              password={newPassword}
              confirmPassword={confirmPassword.length > 0 ? confirmPassword : null}
            />
          </div>

          <div style={styles.fieldWrap}>
            <label style={styles.label} htmlFor="fpc-confirm">
              Conferma nuova password
            </label>
            <div style={styles.inputWrap}>
              <input
                id="fpc-confirm"
                type={showNew ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  ...styles.input,
                  ...(confirmPassword.length > 0 && !passwordsMatch ? styles.inputError : {}),
                }}
                autoComplete="new-password"
              />
            </div>
          </div>

          {isSameAsCurrent && (
            <p style={styles.errorText}>La nuova password deve essere diversa da quella attuale.</p>
          )}

          {error && <p style={styles.errorText}>{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              ...styles.submitButton,
              backgroundColor: canSubmit ? '#2563eb' : '#93c5fd',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Aggiornamento...
              </>
            ) : (
              'Conferma nuova password'
            )}
          </button>
        </form>

        {onLogout && (
          <button type="button" style={styles.logoutLink} onClick={onLogout}>
            <LogOut size={14} />
            Esci e riprova più tardi
          </button>
        )}
      </div>
    </div>
  );
}
