import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import it from './locales/it.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import de from './locales/de.json';

// Regola richiesta: l'app parte SEMPRE in inglese di default.
// Se l'utente ha gia' scelto una lingua in precedenza (salvata nel
// browser), quella scelta viene ricordata e usata. Nessun
// rilevamento automatico dalla lingua del browser: solo scelta
// esplicita dell'utente o inglese.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      it: { translation: it },
      fr: { translation: fr },
      es: { translation: es },
      de: { translation: de },
    },
    fallbackLng: 'en',
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'palacan_lang',
    },
    interpolation: {
      escapeValue: false,
    },
  });

// [palacan-lingua-pagina] la pagina dichiara la lingua che sta mostrando: i browser non propongono traduzioni sbagliate
// (che rompono React) e i lettori di schermo pronunciano nella lingua giusta.
const impostaLinguaPagina = (lingua) => {
  try {
    if (typeof document !== 'undefined' && lingua) document.documentElement.lang = String(lingua).split('-')[0];
  } catch (_) {
    /* ambiente senza pagina */
  }
};
i18n.on('languageChanged', impostaLinguaPagina);
i18n.on('initialized', () => impostaLinguaPagina(i18n.resolvedLanguage || i18n.language));
impostaLinguaPagina(i18n.resolvedLanguage || i18n.language || 'en');

export default i18n;