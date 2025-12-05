import React, { useEffect, useState, useCallback } from 'react';
import './AboutModal.css';

const formatInlineMarkdown = (text) => {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
};

const renderMarkdown = (markdown) => {
  const lines = markdown.split('\n');
  let html = '';
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  };

  lines.forEach((line) => {
    if (line.startsWith('### ')) {
      closeList();
      html += `<h3>${formatInlineMarkdown(line.slice(4))}</h3>`;
      return;
    }

    if (line.startsWith('## ')) {
      closeList();
      html += `<h2>${formatInlineMarkdown(line.slice(3))}</h2>`;
      return;
    }

    if (line.startsWith('# ')) {
      closeList();
      html += `<h1>${formatInlineMarkdown(line.slice(2))}</h1>`;
      return;
    }

    if (line.trim().match(/^[-*]\s+/)) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${formatInlineMarkdown(line.trim().slice(2))}</li>`;
      return;
    }

    if (line.trim() === '') {
      closeList();
      html += '<div class="md-break"></div>';
      return;
    }

    closeList();
    html += `<p>${formatInlineMarkdown(line)}</p>`;
  });

  closeList();
  return html;
};

function AboutModal({ isOpen, onClose }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const closeOnEscape = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen || content || loading) {
      return;
    }

    const fetchContent = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/about.md');

        if (!response.ok) {
          throw new Error('Unable to load about information.');
        }

        const markdown = await response.text();
        setContent(markdown);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [isOpen, content, loading]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, closeOnEscape]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="about-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="About OMMI Quiz"
      onClick={handleOverlayClick}
    >
      <div className="about-modal" onClick={(event) => event.stopPropagation()}>
        <div className="about-modal__header">
          <div>
            <p className="about-modal__eyebrow">About</p>
            <h2 className="about-modal__title">Das OMMI Quiz</h2>
          </div>
          <button className="about-modal__close" onClick={onClose} aria-label="Close about dialog">
            ✕
          </button>
        </div>

        <div className="about-modal__body">
          {loading && <p className="about-modal__status">Loading...</p>}
          {error && <p className="about-modal__error">{error}</p>}
          {!loading && !error && content && (
            <div className="about-modal__content" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
          )}
        </div>
      </div>
    </div>
  );
}

export default AboutModal;
