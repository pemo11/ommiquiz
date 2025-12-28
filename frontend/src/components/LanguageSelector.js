// /frontend/src/components/LanguageSelector.js
import React, { useContext } from 'react';
import { TranslationContext } from '../context/TranslationContext';

const LanguageSelector = () => {
  const context = useContext(TranslationContext);
  
  if (!context) {
    console.error('TranslationContext not found. Make sure TranslationProvider is set up correctly.');
    return null; // or a fallback UI
  }

  const { t, language, changeLanguage } = context;

  return (
    <div className="language-selector">
      <select 
        value={language} 
        onChange={(e) => changeLanguage(e.target.value)}
        className="language-dropdown"
      >
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
    </div>
  );
};

export default LanguageSelector;