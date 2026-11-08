import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { configurazionePubblica } from './sicurezza/configurazione.mjs'  // [palacan-l1b] build da valori pubblici
import { impronteBuild } from './sicurezza/impronte.mjs'  // [palacan-l1b] elenco delle impronte di ogni file
import { intestazioniNginx } from './sicurezza/intestazioni.mjs'  // [palacan-l1a] CSP e intestazioni per nginx, a ogni build
import { nessunPannello } from './sicurezza/nessunPannello.mjs'  // [palacan-v1b] pannello personale mai nel sito

// https://vitejs.dev/config/
// [palacan-vodozemac] Il motore crittografico (src/crypto/pkg/palacan_crypto_bg.wasm) lo include Vite da solo nel
// build, perche' il modulo lo carica con new URL(..., import.meta.url): non serve piu' copiare olm.wasm a mano.
export default defineConfig({
  plugins: [
    react(),
    configurazionePubblica(),  // [palacan-l1b] per la build valgono sicurezza/configurazione-pubblica.json, non i .env
    impronteBuild(),  // [palacan-l1b] scrive dist/palacan-impronte.json
    intestazioniNginx(),  // [palacan-l1a] scrive dist/palacan-intestazioni.conf e dist/palacan-csp.conf
    nessunPannello(),  // [palacan-v1b] la build si ferma se il pannello personale finisce nel sito
  ],
  // --- FIX DEFINITIVO PER I PERCORSI DEI FILE ---
  base: '/',
  // ✅ FIX PER COMPATIBILITÀ: Alcune librerie crittografiche cercano 'global'
  define: {
    global: 'window',
  },
  build: {
    // Ottimizzazione: assicura che i file grandi non vengano spezzati male
    chunkSizeWarningLimit: 1000,
  }
})
