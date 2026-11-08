import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { BrowserRouter } from 'react-router-dom';
import './App.css';
// FONT GEIST (Fontsource)
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
// FIX (privacy): Space Grotesk/Inter/IBM Plex Mono scaricati anche loro
// in locale (Fontsource), stessi pesi richiesti prima a Google Fonts
// via <link> in index.html (vedi tailwind.config.js: font-sans=Inter,
// font-display=Space Grotesk, font-mono=IBM Plex Mono) - stesso
// aspetto grafico, zero richieste esterne a Google.
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
// TRADUZIONI (i18next) - va inizializzato prima di renderizzare l'app
import './i18n';
import './styles/ct-animations.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
