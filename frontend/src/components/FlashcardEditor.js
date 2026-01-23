import React, { useState, useEffect } from 'react';
import './FlashcardEditor.css';
import yaml from 'js-yaml';

function FlashcardEditor({ apiUrl, accessToken, flashcard, onSave, onCancel }) {
  const [yamlContent, setYamlContent] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [preview, setPreview] = useState(null);

  // Initialize editor with existing flashcard or template
  useEffect(() => {
    if (flashcard && flashcard.content) {
      // Editing existing flashcard
      const yamlStr = yaml.dump(flashcard.content, { lineWidth: -1, noRefs: true });
      setYamlContent(yamlStr);
      setVisibility(flashcard.visibility || 'private');
    } else {
      // Creating new flashcard - provide template
      const template = {
        id: 'my_flashcard_set',
        title: 'My Flashcard Set',
        description: 'Description of my flashcard set',
        author: 'Your Name',
        language: 'de',
        module: 'My Module',
        topics: ['Topic 1', 'Topic 2'],
        keywords: ['keyword1', 'keyword2'],
        flashcards: [
          {
            question: 'What is the question?',
            answer: 'This is the answer.',
            explanation: 'Additional explanation (optional)',
            difficulty: 'medium',
            tags: ['tag1', 'tag2']
          }
        ]
      };
      const yamlStr = yaml.dump(template, { lineWidth: -1, noRefs: true });
      setYamlContent(yamlStr);
      setVisibility('private');
    }
  }, [flashcard]);

  // Validate and preview YAML
  useEffect(() => {
    if (!yamlContent.trim()) {
      setValidationError('YAML content cannot be empty');
      setPreview(null);
      return;
    }

    try {
      const parsed = yaml.load(yamlContent);

      // Basic validation
      if (!parsed || typeof parsed !== 'object') {
        setValidationError('Invalid YAML: Must be an object');
        setPreview(null);
        return;
      }

      if (!parsed.title) {
        setValidationError('Missing required field: title');
        setPreview(null);
        return;
      }

      if (!parsed.flashcards || !Array.isArray(parsed.flashcards)) {
        setValidationError('Missing or invalid field: flashcards (must be an array)');
        setPreview(null);
        return;
      }

      if (parsed.flashcards.length === 0) {
        setValidationError('Flashcards array cannot be empty');
        setPreview(null);
        return;
      }

      // Validation passed
      setValidationError(null);
      setPreview({
        title: parsed.title,
        description: parsed.description || '',
        cardCount: parsed.flashcards.length,
        module: parsed.module || '',
        topics: parsed.topics || [],
        keywords: parsed.keywords || []
      });
    } catch (err) {
      setValidationError(`YAML Parse Error: ${err.message}`);
      setPreview(null);
    }
  }, [yamlContent]);

  // Handle save
  const handleSave = async () => {
    if (validationError) {
      alert('Please fix validation errors before saving');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = flashcard
        ? `${apiUrl}/users/me/flashcards/${flashcard.flashcard_id}`
        : `${apiUrl}/users/me/flashcards`;

      const method = flashcard ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          yaml_content: yamlContent,
          visibility: visibility
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save flashcard');
      }

      // Success!
      onSave();
    } catch (err) {
      setError(err.message);
      console.error('Error saving flashcard:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flashcard-editor-container">
      <div className="editor-header">
        <h2>{flashcard ? 'Edit Flashcard' : 'Create New Flashcard'}</h2>
        <div className="editor-actions">
          <button className="cancel-button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className="save-button"
            onClick={handleSave}
            disabled={saving || !!validationError}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {error && <div className="error-message">Error: {error}</div>}

      <div className="editor-content">
        <div className="editor-panel">
          <div className="editor-controls">
            <label htmlFor="visibility-select">Visibility:</label>
            <select
              id="visibility-select"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              disabled={saving}
            >
              <option value="private">🔒 Private (only you can see)</option>
              <option value="global">🌐 Public (everyone can see)</option>
            </select>
          </div>

          <label htmlFor="yaml-editor" className="editor-label">
            YAML Content:
          </label>
          <textarea
            id="yaml-editor"
            className="yaml-editor"
            value={yamlContent}
            onChange={(e) => setYamlContent(e.target.value)}
            placeholder="Enter YAML content..."
            disabled={saving}
            spellCheck={false}
          />

          {validationError && (
            <div className="validation-error">
              ⚠️ {validationError}
            </div>
          )}
        </div>

        <div className="preview-panel">
          <h3>Preview</h3>
          {preview ? (
            <div className="preview-content">
              <div className="preview-field">
                <strong>Title:</strong> {preview.title}
              </div>
              {preview.description && (
                <div className="preview-field">
                  <strong>Description:</strong> {preview.description}
                </div>
              )}
              <div className="preview-field">
                <strong>Card Count:</strong> {preview.cardCount}
              </div>
              {preview.module && (
                <div className="preview-field">
                  <strong>Module:</strong> {preview.module}
                </div>
              )}
              {preview.topics.length > 0 && (
                <div className="preview-field">
                  <strong>Topics:</strong> {preview.topics.join(', ')}
                </div>
              )}
              {preview.keywords.length > 0 && (
                <div className="preview-field">
                  <strong>Keywords:</strong> {preview.keywords.join(', ')}
                </div>
              )}
            </div>
          ) : (
            <div className="preview-empty">
              {validationError ? (
                <p>Fix validation errors to see preview</p>
              ) : (
                <p>Enter valid YAML to see preview</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="editor-help">
        <details>
          <summary>📖 YAML Format Help</summary>
          <div className="help-content">
            <h4>Required Fields:</h4>
            <ul>
              <li><code>title</code>: Name of your flashcard set</li>
              <li><code>flashcards</code>: Array of flashcard objects</li>
            </ul>

            <h4>Optional Fields:</h4>
            <ul>
              <li><code>id</code>: Unique identifier (auto-generated if not provided)</li>
              <li><code>description</code>: Description of the set</li>
              <li><code>author</code>: Your name</li>
              <li><code>language</code>: Language code (e.g., 'de', 'en')</li>
              <li><code>module</code>: Module or category name</li>
              <li><code>topics</code>: Array of topic strings</li>
              <li><code>keywords</code>: Array of keyword strings</li>
            </ul>

            <h4>Flashcard Object Fields:</h4>
            <ul>
              <li><code>question</code>: The question text (required)</li>
              <li><code>answer</code>: The answer text (required)</li>
              <li><code>explanation</code>: Additional explanation (optional)</li>
              <li><code>difficulty</code>: easy, medium, hard (optional)</li>
              <li><code>tags</code>: Array of tags (optional)</li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  );
}

export default FlashcardEditor;
