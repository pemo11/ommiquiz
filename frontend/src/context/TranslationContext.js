// /frontend/src/context/TranslationContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import en from '../translations/en';
import de from '../translations/de';

const TranslationContext = createContext();

export const useTranslation = () => {
  return useContext(TranslationContext);
};

export const TranslationProvider = ({ children }) => {
  const [language, setLanguage] = useState('en');
  const [translations, setTranslations] = useState(en);

  useEffect(() => {
    // Load language preference from localStorage if available
    const savedLanguage = localStorage.getItem('preferredLanguage') || 'en';
    setLanguage(savedLanguage);
    setTranslations(savedLanguage === 'de' ? de : en);
  }, []);

  const changeLanguage = (lang) => {
    localStorage.setItem('preferredLanguage', lang);
    setLanguage(lang);
    setTranslations(lang === 'de' ? de : en);
  };

  const t = (key, params = {}) => {
    // Handle nested keys like 'common.back'
    const keys = key.split('.');
    let value = keys.reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : key), translations);
    
    // Replace placeholders with actual values
    if (params) {
      Object.keys(params).forEach(param => {
        value = value.replace(`{${param}}`, params[param]);
      });
    }

    return value;
  };

  return (
    <TranslationContext.Provider value={{ t, language, changeLanguage }}>
      {children}
    </TranslationContext.Provider>
  );
};