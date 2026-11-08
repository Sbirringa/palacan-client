// src/components/PasswordRequirementsChecklist.jsx
//
// Checklist requisiti password con feedback LIVE (stile Stripe/GitHub/
// Google): ogni regola si "spunta" in verde non appena il testo digitato
// la soddisfa, senza bisogno di inviare il form. Componente puro e
// riutilizzabile: non fa fetch, non ha stato proprio, riceve solo
// `password` (e opzionalmente `confirmPassword`) come prop e calcola i
// risultati ad ogni render.
//
// IMPORTANTE: le regole qui sotto (PASSWORD_RULES) devono restare
// allineate a validate_password_strength() in routes/auth.py — stessa
// lunghezza minima, stesso set di simboli. Se cambi una delle due liste,
// cambia anche l'altra, altrimenti frontend e backend giudicheranno una
// stessa password in modo diverso (es. il checklist tutto verde ma il
// server la rifiuta comunque, o viceversa).

import React from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Stesso pattern usato da validate_password_strength() lato backend
// (re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?]", password)).
const SYMBOL_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_RULES = [
  {
    id: 'length',
    labelKey: 'account.password_rule_length',
    test: (pwd) => (pwd || '').length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'uppercase',
    labelKey: 'account.password_rule_uppercase',
    test: (pwd) => /[A-Z]/.test(pwd || ''),
  },
  {
    id: 'lowercase',
    labelKey: 'account.password_rule_lowercase',
    test: (pwd) => /[a-z]/.test(pwd || ''),
  },
  {
    id: 'number',
    labelKey: 'account.password_rule_number',
    test: (pwd) => /[0-9]/.test(pwd || ''),
  },
  {
    id: 'symbol',
    labelKey: 'account.password_rule_symbol',
    test: (pwd) => SYMBOL_REGEX.test(pwd || ''),
  },
];

// Helper esportato: usato sia da questo componente sia dal form che lo
// ospita (es. per disabilitare il pulsante "Salva" finché non tutte le
// regole sono soddisfatte), così la logica "la password è valida?" vive
// in un unico punto.
export function isPasswordValid(password) {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

const styles = {
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    margin: '8px 0 0',
    padding: 0,
    listStyle: 'none',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    lineHeight: 1.3,
    transition: 'color 150ms ease',
  },
  iconWrapBase: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background-color 150ms ease, transform 150ms ease',
  },
};

/**
 * PasswordRequirementsChecklist
 *
 * Props:
 * - password: string — la password che l'utente sta digitando ora.
 * - confirmPassword: string opzionale — se passato, aggiunge in fondo
 *   una riga "Le password coincidono" che si spunta quando
 *   password === confirmPassword (e password non è vuota).
 * - className / style: opzionali, per integrarlo nello stile del form
 *   che lo ospita senza dover toccare questo file.
 */
export default function PasswordRequirementsChecklist({
  password = '',
  confirmPassword = null,
  className = '',
  style = {},
}) {
  const { t } = useTranslation();
  const showMatchRule = confirmPassword !== null && confirmPassword !== undefined;
  const passwordsMatch = showMatchRule && password.length > 0 && password === confirmPassword;

  return (
    <ul className={className} style={{ ...styles.list, ...style }}>
      {PASSWORD_RULES.map((rule) => {
        const satisfied = rule.test(password);
        const label =
          rule.id === 'length'
            ? t(rule.labelKey, { count: PASSWORD_MIN_LENGTH })
            : t(rule.labelKey);
        return (
          <PasswordRuleRow key={rule.id} satisfied={satisfied} label={label} />
        );
      })}

      {showMatchRule && (
        <PasswordRuleRow satisfied={passwordsMatch} label={t('account.passwords_match_rule')} />
      )}
    </ul>
  );
}

function PasswordRuleRow({ satisfied, label }) {
  return (
    <li
      style={{
        ...styles.item,
        color: satisfied ? '#16a34a' : '#6b7280',
      }}
    >
      <span
        style={{
          ...styles.iconWrapBase,
          backgroundColor: satisfied ? 'rgba(22, 163, 74, 0.12)' : 'rgba(107, 114, 128, 0.12)',
        }}
      >
        {satisfied ? (
          <Check size={12} strokeWidth={3} color="#16a34a" />
        ) : (
          <X size={12} strokeWidth={2.5} color="#9ca3af" />
        )}
      </span>
      <span>{label}</span>
    </li>
  );
}
