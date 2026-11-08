import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// vitest.config.js — configurazione separata da vite.config.js apposta,
// cosi' i test non dipendono dal plugin viteStaticCopy (pensato per il
// build vero, copia il file .wasm nella cartella dist di un server web
// reale - inutile e fuorviante per i test, dove il file WASM viene
// caricato direttamente dal disco tramite tests/setup.js).
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
  },
  test: {
    environment: 'jsdom', // serve per window/localStorage, usati da olmService.js
    setupFiles: ['./tests/setup.js'],
    globals: true,
  },
})