import React, { useState, useEffect } from 'react';
import './MyFlashcards.css';
import FlashcardEditor from './FlashcardEditor';

function MyFlashcards({ apiUrl, accessToken, onBack }) {
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingFlashcard, setEditingFlashcard] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Fetch user's flashcards
  const fetchFlashcards = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/users/me/flashcards`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch flashcards: ${response.status}`);
      }

      const data = await response.json();
      setFlashcards(data.flashcards || []);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching user flashcards:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlashcards();
  }, [apiUrl, accessToken]);

  // Handle create new flashcard
  const handleCreateNew = () => {
    setEditingFlashcard(null);
    setShowEditor(true);
  };

  // Handle edit flashcard
  const handleEdit = async (flashcard) => {
    try {
      // Fetch full flashcard content
      const response = await fetch(`${apiUrl}/flashcards/${flashcard.flashcard_id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch flashcard content');
      }

      const data = await response.json();
      setEditingFlashcard({ ...flashcard, content: data });
      setShowEditor(true);
    } catch (err) {
      alert(`Error loading flashcard: ${err.message}`);
    }
  };

  // Handle delete flashcard
  const handleDelete = async (flashcardId) => {
    try {
      const response = await fetch(`${apiUrl}/users/me/flashcards/${flashcardId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete flashcard');
      }

      // Refresh list
      await fetchFlashcards();
      setDeleteConfirmId(null);
    } catch (err) {
      alert(`Error deleting flashcard: ${err.message}`);
    }
  };

  // Handle toggle visibility
  const handleToggleVisibility = async (flashcardId, currentVisibility) => {
    const newVisibility = currentVisibility === 'global' ? 'private' : 'global';

    try {
      const response = await fetch(`${apiUrl}/users/me/flashcards/${flashcardId}/visibility`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ visibility: newVisibility })
      });

      if (!response.ok) {
        throw new Error('Failed to update visibility');
      }

      // Refresh list
      await fetchFlashcards();
    } catch (err) {
      alert(`Error updating visibility: ${err.message}`);
    }
  };

  // Handle save from editor
  const handleSaveFlashcard = async () => {
    await fetchFlashcards();
    setShowEditor(false);
    setEditingFlashcard(null);
  };

  if (showEditor) {
    return (
      <FlashcardEditor
        apiUrl={apiUrl}
        accessToken={accessToken}
        flashcard={editingFlashcard}
        onSave={handleSaveFlashcard}
        onCancel={() => {
          setShowEditor(false);
          setEditingFlashcard(null);
        }}
      />
    );
  }

  return (
    <div className="my-flashcards-container">
      <div className="my-flashcards-header">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <h2>My Flashcards</h2>
        <button className="create-button" onClick={handleCreateNew}>
          + Create New
        </button>
      </div>

      {loading && <div className="loading">Loading your flashcards...</div>}
      {error && <div className="error-message">Error: {error}</div>}

      {!loading && !error && flashcards.length === 0 && (
        <div className="empty-state">
          <p>You haven't created any flashcards yet.</p>
          <p>Click "Create New" to get started!</p>
        </div>
      )}

      {!loading && !error && flashcards.length > 0 && (
        <div className="flashcards-grid">
          {flashcards.map((flashcard) => (
            <div key={flashcard.flashcard_id} className="flashcard-card">
              <div className="flashcard-card-header">
                <h3>{flashcard.title}</h3>
                <div className="visibility-badge" title={`Visibility: ${flashcard.visibility}`}>
                  {flashcard.visibility === 'global' ? '🌐 Public' : '🔒 Private'}
                </div>
              </div>

              {flashcard.description && (
                <p className="flashcard-description">{flashcard.description}</p>
              )}

              <div className="flashcard-metadata">
                <span className="card-count">{flashcard.card_count || 0} cards</span>
                {flashcard.module && <span className="module-badge">{flashcard.module}</span>}
                {flashcard.language && <span className="language-badge">{flashcard.language}</span>}
              </div>

              {flashcard.topics && flashcard.topics.length > 0 && (
                <div className="flashcard-topics">
                  {flashcard.topics.map((topic, idx) => (
                    <span key={idx} className="topic-tag">{topic}</span>
                  ))}
                </div>
              )}

              <div className="flashcard-dates">
                <small>
                  Created: {new Date(flashcard.created_at).toLocaleDateString()}
                </small>
                {flashcard.updated_at && flashcard.updated_at !== flashcard.created_at && (
                  <small>
                    Updated: {new Date(flashcard.updated_at).toLocaleDateString()}
                  </small>
                )}
              </div>

              <div className="flashcard-actions">
                <button
                  className="action-button edit-button"
                  onClick={() => handleEdit(flashcard)}
                >
                  ✏️ Edit
                </button>
                <button
                  className="action-button visibility-button"
                  onClick={() => handleToggleVisibility(flashcard.flashcard_id, flashcard.visibility)}
                  title={`Make ${flashcard.visibility === 'global' ? 'private' : 'public'}`}
                >
                  {flashcard.visibility === 'global' ? '🔒 Make Private' : '🌐 Make Public'}
                </button>
                {deleteConfirmId === flashcard.flashcard_id ? (
                  <div className="delete-confirm">
                    <button
                      className="action-button confirm-button"
                      onClick={() => handleDelete(flashcard.flashcard_id)}
                    >
                      ✓ Confirm
                    </button>
                    <button
                      className="action-button cancel-button"
                      onClick={() => setDeleteConfirmId(null)}
                    >
                      ✗ Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="action-button delete-button"
                    onClick={() => setDeleteConfirmId(flashcard.flashcard_id)}
                  >
                    🗑️ Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyFlashcards;
