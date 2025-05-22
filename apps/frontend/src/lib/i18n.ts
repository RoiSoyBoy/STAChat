import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend'; // To load translations from /public/locales
import LanguageDetector from 'i18next-browser-languagedetector'; // To detect user language

i18n
  .use(HttpBackend) // Loads translations from backend (e.g., /public/locales)
  .use(LanguageDetector) // Detects user language
  .use(initReactI18next) // Passes i18n down to react-i18next
  .init({
    fallbackLng: 'he', // Default language if detection fails
    debug: process.env.NODE_ENV === 'development', // Logs i18n activity in development
    ns: ['common'], // Default namespace
    defaultNS: 'common',
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json', // Path to translation files
    },
    interpolation: {
      escapeValue: false, // React already safes from xss
    },
    react: {
      useSuspense: true, // Recommended for App Router to leverage Suspense
    },
  });

export default i18n;
