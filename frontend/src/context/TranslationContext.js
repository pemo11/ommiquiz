// /frontend/src/context/TranslationContext.js
import React, { createContext, useContext, useState, useEffect, useMemo} from 'react';
import en from '../translations/en';
import de from '../translations/de';

// Create the context
const TranslationContext = createContext();

// Export the context and provider
export { TranslationContext };

export const useTranslation = () => {
  return useContext(TranslationContext);
};

export const TranslationProvider = ({ children }) => {
  const [language, setLanguage] = useState('en');
  const [translations, setTranslations] = useState(en);
  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => {
    const changeLanguage = (lang) => {
      localStorage.setItem('preferredLanguage', lang);
      setLanguage(lang);
      setTranslations(lang === 'de' ? de : en);
    };
    const t = (key, params = {}) => {
      const keys = key.split('.');
      let value = keys.reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : key), translations);
      
      if (params) {
        Object.keys(params).forEach(param => {
          value = value.replace(`{${param}}`, params[param]);
        });
      }
      return value;
    };
    return { t, language, changeLanguage };
  }, [language, translations]); // Only recreate when these change
  // Load saved language on mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem('preferredLanguage') || 'en';
    if (savedLanguage !== language) {
      setLanguage(savedLanguage);
      setTranslations(savedLanguage === 'de' ? de : en);
    }
  }, []);
  return (
    <TranslationContext.Provider value={contextValue}>
      {children}
    </TranslationContext.Provider>
  );
};