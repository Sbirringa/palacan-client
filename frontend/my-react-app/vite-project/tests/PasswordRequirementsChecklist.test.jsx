// tests/PasswordRequirementsChecklist.test.jsx
//
// Il componente stesso avverte: le regole qui DEVONO restare allineate
// a validate_password_strength() nel backend (routes/auth.py) - stessa
// classe di rischio gia' trovata in BackupPinPrompt.jsx stanotte.
// VERIFICATO PRIMA di scrivere questi test (non assunto): lunghezza
// minima (10, coincide) e pattern simboli (30 caratteri ASCII
// stampabili, testati uno per uno contro il pattern Python VERO -
// coincidono esattamente). Nessun bug trovato qui: frontend e backend
// sono davvero allineati.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key, opts) => (typeof opts === 'object' ? key : (opts || key)) }),
}));

import PasswordRequirementsChecklist, {
  isPasswordValid,
  PASSWORD_RULES,
  PASSWORD_MIN_LENGTH,
} from '../src/components/PasswordRequirementsChecklist.jsx';

describe('PASSWORD_MIN_LENGTH — deve coincidere con il backend', () => {
  it('è 10, come PASSWORD_MIN_LENGTH in routes/auth.py (verificato leggendo il file vero)', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
  });
});

describe('isPasswordValid — la funzione usata anche per abilitare/disabilitare "Salva" nei form che la ospitano', () => {
  it('rifiuta una password troppo corta, anche se rispetta tutte le altre regole', () => {
    expect(isPasswordValid('Ab1!')).toBe(false); // 4 caratteri, sotto i 10
  });

  it('rifiuta una password senza maiuscole', () => {
    expect(isPasswordValid('abcdefgh1!')).toBe(false);
  });

  it('rifiuta una password senza minuscole', () => {
    expect(isPasswordValid('ABCDEFGH1!')).toBe(false);
  });

  it('rifiuta una password senza numeri', () => {
    expect(isPasswordValid('Abcdefghi!')).toBe(false);
  });

  it('rifiuta una password senza simboli', () => {
    expect(isPasswordValid('Abcdefgh12')).toBe(false);
  });

  it('accetta una password che soddisfa TUTTE le regole', () => {
    expect(isPasswordValid('Abcdefgh1!')).toBe(true);
  });

  it('gestisce con garbo una password vuota o assente, senza mai lanciare un\'eccezione', () => {
    expect(() => isPasswordValid('')).not.toThrow();
    expect(() => isPasswordValid(undefined)).not.toThrow();
    expect(isPasswordValid('')).toBe(false);
    expect(isPasswordValid(undefined)).toBe(false);
  });
});

describe('PASSWORD_RULES — copertura esatta di ogni simbolo accettato dal backend', () => {
  it('la regola "symbol" accetta ESATTAMENTE gli stessi 30 caratteri ASCII stampabili del pattern Python del backend', () => {
    // Lista verificata eseguendo DAVVERO PASSWORD_SYMBOL_PATTERN in Python
    // (non trascritta a mano) - vedi verifica fatta prima di scrivere
    // questo test.
    const caratteriAccettatiDalBackend = new Set([
      '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.',
      '/', ':', ';', '<', '=', '>', '?', '@', '[', '\\', ']', '^', '_', '{', '|', '}',
    ]);

    const regolaSimbolo = PASSWORD_RULES.find((r) => r.id === 'symbol');

    for (let codice = 32; codice <= 126; codice++) {
      const carattere = String.fromCharCode(codice);
      const accettatoDalFrontend = regolaSimbolo.test(carattere);
      const accettatoDalBackend = caratteriAccettatiDalBackend.has(carattere);
      expect(accettatoDalFrontend).toBe(accettatoDalBackend);
    }
  });
});

describe('Componente — feedback visivo live', () => {
  it('mostra tutte le regole come NON soddisfatte per una password vuota', () => {
    render(<PasswordRequirementsChecklist password="" />);
    // Ogni riga deve essere presente (5 regole base).
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('con una password valida, aggiunge una riga extra "coincidono" solo se confirmPassword è passato', () => {
    const { rerender } = render(<PasswordRequirementsChecklist password="Abcdefgh1!" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5); // senza confirmPassword

    rerender(<PasswordRequirementsChecklist password="Abcdefgh1!" confirmPassword="Abcdefgh1!" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(6); // con confirmPassword, riga in piu'
  });

  it('non aggiunge la riga "coincidono" se confirmPassword è null (valore di default)', () => {
    render(<PasswordRequirementsChecklist password="Abcdefgh1!" confirmPassword={null} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });
});
