// frontend/src/admin/theme.js
//
// Stessi token colore di pages/Dashboard.jsx (oggetto T), duplicati qui
// per tenere il pannello admin come modulo autonomo, senza introdurre
// una dipendenza di export aggiuntiva su Dashboard.jsx.

export const T = {
  bg: 'bg-[#EEF4F4]',
  surface: 'bg-[#F7FBFB]',
  surfaceHover: 'hover:bg-[#E4EEEE]',
  elevated: 'bg-[#FFFFFF]',
  border: 'border-[#DCE6E6]',
  borderSoft: 'border-[#E3ECEC]',
  text: 'text-[#122023]',
  textMuted: 'text-[#5C6D6F]',
  textFaint: 'text-[#8CA0A2]',
  accent: '#14B8A6',
  accentText: 'text-[#14B8A6]',
  accentBg: 'bg-[linear-gradient(135deg,#14B8A6_0%,#7F77DD_100%)]',
  accentBgHover: 'hover:opacity-90',
  accentSoftBg: 'bg-[#14B8A6]/10',
  accentSoftBorder: 'border-[#14B8A6]/25',
  warn: 'text-[#B45309]',
  warnSoftBg: 'bg-[#FDF1E0]',
  danger: 'text-[#C2410C]',
  dangerSoftBg: 'bg-[#FCE9E0]',
  dangerSoftBorder: 'border-[#C2410C]/25',
};

export const EASE = [0.4, 0, 0.2, 1];