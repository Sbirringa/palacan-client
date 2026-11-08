/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // v2.5: font display per titoli (usato via font-['Space_Grotesk',_sans-serif]
        // in Dashboard.jsx) e mono per ID/orari/codici (già usato come font-mono
        // in Dashboard.jsx: AccountMenu, ConversationInfoPanel, InvitePanel, ChatBubble)
        display: ['"Space Grotesk"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        bg: '#09090b',         // Zinc 950
        panel: '#18181b',      // Zinc 900
        border: '#27272a',     // Zinc 800
        primary: '#6366f1',    // Indigo 500
        primaryHover: '#4f46e5',
        textMain: '#f4f4f5',   // Zinc 100
        textMuted: '#a1a1aa',  // Zinc 400
        danger: '#ef4444',
        success: '#10b981',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        }
      }
    },
  },
  plugins: [require('@tailwindcss/typography')],
}