// src/debugLogOverlay.jsx
//
// ⚠️ PANNELLO DIAGNOSTICO TEMPORANEO ⚠️ - da rimuovere dopo aver trovato
// il bug della riconnessione mobile (sessione corrente). Mostra a schermo
// gli ultimi log della console, per poterli leggere direttamente sul
// telefono senza bisogno di debug USB. Attivo SOLO se l'URL contiene
// ?debug=1, quindi invisibile agli utenti normali. Intercetta
// console.log/warn/error aggiungendo (non sostituendo) il comportamento
// originale - la console del browser continua a funzionare normalmente.

import React, { useEffect, useState, useRef } from 'react';

const MAX_LINES = 80;

export default function DebugLogOverlay() {
  const [enabled] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('debug') === '1';
    } catch (_) {
      return false;
    }
  });
  const [lines, setLines] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const pushLine = (level, args) => {
      const text = args
        .map((a) => {
          try {
            return typeof a === 'string' ? a : JSON.stringify(a);
          } catch (_) {
            return String(a);
          }
        })
        .join(' ');
      const time = new Date().toLocaleTimeString();
      setLines((prev) => {
        const next = [...prev, `[${time}] ${level}: ${text}`];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    };

    console.log = (...args) => {
      pushLine('LOG', args);
      originalLog.apply(console, args);
    };
    console.warn = (...args) => {
      pushLine('WARN', args);
      originalWarn.apply(console, args);
    };
    console.error = (...args) => {
      pushLine('ERR', args);
      originalError.apply(console, args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, [enabled]);

  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [lines]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.92)',
        color: '#0F0',
        fontFamily: 'monospace',
        fontSize: '10px',
        maxHeight: collapsed ? '32px' : '40vh',
        overflow: 'hidden',
        transition: 'max-height 0.2s',
      }}
    >
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          background: '#222',
          color: '#fff',
          padding: '6px 10px',
          cursor: 'pointer',
          fontFamily: 'sans-serif',
          fontSize: '12px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>🐛 Debug log ({lines.length}) - tocca per {collapsed ? 'espandere' : 'ridurre'}</span>
        <span
          onClick={(e) => {
            e.stopPropagation();
            setLines([]);
          }}
        >
          🗑️ pulisci
        </span>
      </div>
      {!collapsed && (
        <div
          ref={boxRef}
          style={{
            padding: '6px 10px',
            overflowY: 'auto',
            maxHeight: 'calc(40vh - 32px)',
          }}
        >
          {lines.map((line, i) => (
            <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: '2px' }}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
