// /frontend/src/components/LanguageSelector.js
import React from 'react';
import { useTranslation } from '../context/TranslationContext';

const LanguageSelector = () => {
  const { t, language, changeLanguage } = useTranslation();

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