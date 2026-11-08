// src/contexts/ThemeContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

const defaultTheme = {
  primary: '#4F46E5',
  secondary: '#818CF8',
  background: '#F3F4F6',
  text: '#111827',
  logoUrl: null,
  name: 'Chat Crypto'
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('workspace_theme');
      return saved ? JSON.parse(saved) : defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--secondary', theme.secondary);
    root.style.setProperty('--background', theme.background);
    root.style.setProperty('--text', theme.text);
  }, [theme]);

  const setEnterpriseTheme = (config) => {
    if (!config) {
      setTheme(defaultTheme);
      localStorage.removeItem('workspace_theme');
      return;
    }
    const newTheme = {
      primary: config.primary_color || defaultTheme.primary,
      secondary: config.secondary_color || defaultTheme.secondary,
      background: config.bg_color || defaultTheme.background,
      text: config.text_color || defaultTheme.text,
      logoUrl: config.logo_url || null,
      name: config.app_name || 'Chat Enterprise'
    };
    setTheme(newTheme);
    localStorage.setItem('workspace_theme', JSON.stringify(newTheme));
  };

  const resetTheme = () => {
    setTheme(defaultTheme);
    localStorage.removeItem('workspace_theme');
  };

  return (
    <ThemeContext.Provider value={{ theme, setEnterpriseTheme, resetTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
