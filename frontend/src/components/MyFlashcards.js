import React, { useState, useEffect } from 'react';
import './MyFlashcards.css';
import FlashcardEditor from './FlashcardEditor';

function MyFlashcards({ apiUrl, accessToken, onBack, onSelectFavorite = () => {} }) {
  const [flashcards, setFlashcards] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favoriteDetails, setFavoriteDetails] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingFlashcard, setEditingFlashcard] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Fetch user's created flashcards
  const fetchFlashcards = async () => {
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
      throw new Error(`Error fetching created flashcards: ${err.message}`);
    }
  };

  // Fetch user's favorites
  const fetchFavorites = async () => {
    try {
      const response = await fetch(`${apiUrl}/users/me/favorites`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch favorites: ${response.status}`);
      }

      const data = await response.json();
      const favoritesList = data.favorites || [];
      setFavorites(favoritesList);

      // Fetch details for each favorite flashcard
      await fetchFavoriteDetails(favoritesList);
    } catch (err) {
      throw new Error(`Error fetching favorites: ${err.message}`);
    }
  };

  // Fetch detailed information for favorite flashcards
  const fetchFavoriteDetails = async (favoritesList) => {
    const detailsMap = new Map();

    try {
      // First, get the list of all available flashcards to get metadata
      const catalogResponse = await fetch(`${apiUrl}/flashcards`, {
        headers: accessToken ? {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        } : {}
      });

      if (catalogResponse.ok) {
        const catalogData = await catalogResponse.json();
        const allFlashcards = catalogData.flashcards || [];

        // Map favorite IDs to their metadata
        favoritesList.forEach(favorite => {
          const flashcardInfo = allFlashcards.find(fc => fc.id === favorite.flashcard_id);
          if (flashcardInfo) {
            detailsMap.set(favorite.flashcard_id, {
              ...flashcardInfo,
              favorited_at: favorite.created_at,
              isFavorite: true
            });
          } else {
            // Fallback for flashcards not found in catalog
            detailsMap.set(favorite.flashcard_id, {
              id: favorite.flashcard_id,
              title: favorite.flashcard_id,
              description: 'Flashcard details not available',
              favorited_at: favorite.created_at,
              isFavorite: true
            });
          }
        });
      }
    } catch (err) {
      console.error('Error fetching favorite details:', err);
    }

    // Ensure all favorites have at least basic entries, even if details fail
    favoritesList.forEach(favorite => {
      if (!detailsMap.has(favorite.flashcard_id)) {
        detailsMap.set(favorite.flashcard_id, {
          id: favorite.flashcard_id,
          title: favorite.flashcard_id,
          description: 'Details unavailable',
          favorited_at: favorite.created_at,
          isFavorite: true
        });
      }
    });

    setFavoriteDetails(detailsMap);
  };

  // Fetch all data
  const fetchAllData = async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([fetchFlashcards(), fetchFavorites()]);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [apiUrl, accessToken]);

  // Handle remove favorite
  const handleRemoveFavorite = async (flashcardId) => {
    try {
      const response = await fetch(`${apiUrl}/users/me/favorites/${flashcardId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to remove favorite');
      }

      // Update local state
      setFavorites(prev => prev.filter(fav => fav.flashcard_id !== flashcardId));
      setFavoriteDetails(prev => {
        const newMap = new Map(prev);
        newMap.delete(flashcardId);
        return newMap;
      });
    } catch (err) {
      alert(`Error removing favorite: ${err.message}`);
    }
  };

  // Handle create new flashcard
  const handleCreateNew = () => {
    setEditingFlashcard(null);
    setShowEditor(true);
  };

  // Handle edit flashcard
  const handleEdit = async (flashcard) => {
    try {
      // Fetch full flashcard content using the user-specific endpoint
      const response = await fetch(`${apiUrl}/users/me/flashcards/${flashcard.flashcard_id}`, {
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

  // Render flashcard card for created flashcards
  const renderCreatedFlashcard = (flashcard) => (
    <div key={flashcard.flashcard_id} className="flashcard-card">
      <div className="flashcard-card-header">
        <h3>{flashcard.title}</h3>
        <div className="flashcard-badges">
          <div className="visibility-badge" title={`Visibility: ${flashcard.visibility}`}>
            {flashcard.visibility === 'global' ? '🌐 Public' : '🔒 Private'}
          </div>
          <div className="card-type-badge created-badge">Created</div>
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
  );

  // Render flashcard card for favorites
  const renderFavoriteFlashcard = (flashcardId, details) => (
    <div key={flashcardId} className="flashcard-card favorite-card">
      <div className="flashcard-card-header">
        <h3>{details.title || flashcardId}</h3>
        <div className="flashcard-badges">
          <div className="card-type-badge favorite-badge">★ Favorite</div>
        </div>
      </div>

      {details.description && (
        <p className="flashcard-description">{details.description}</p>
      )}

      <div className="flashcard-metadata">
        {details.cardcount !== undefined && (
          <span className="card-count">{details.cardcount} cards</span>
        )}
        {details.module && <span className="module-badge">{details.module}</span>}
        {details.language && <span className="language-badge">{details.language}</span>}
        {details.author && <span className="author-info">by {details.author}</span>}
      </div>

      {details.topics && details.topics.length > 0 && (
        <div className="flashcard-topics">
          {details.topics.map((topic, idx) => (
            <span key={idx} className="topic-tag">{topic}</span>
          ))}
        </div>
      )}

      <div className="flashcard-dates">
        <small>
          Favorited: {new Date(details.favorited_at).toLocaleDateString()}
        </small>
      </div>

      <div className="flashcard-actions">
        <button
          className="action-button play-button"
          onClick={() => onSelectFavorite(flashcardId)}
          title="Start learning this flashcard set"
        >
          ▶️ Start
        </button>
        <button
          className="action-button remove-favorite-button"
          onClick={() => handleRemoveFavorite(flashcardId)}
          title="Remove from favorites"
        >
          ★ Remove Favorite
        </button>
      </div>
    </div>
  );

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

      {!loading && !error && (
        <>
          {/* Created Flashcards Section */}
          <div className="flashcards-section">
            <h3 className="section-title">Created</h3>
            {flashcards.length === 0 ? (
              <div className="empty-state">
                <p>You haven't created any flashcards yet.</p>
                <p>Click "Create New" to get started!</p>
              </div>
            ) : (
              <div className="flashcards-grid">
                {flashcards.map(renderCreatedFlashcard)}
              </div>
            )}
          </div>

          {/* Favorites Section */}
          <div className="flashcards-section">
            <h3 className="section-title">Favorites</h3>
            {favorites.length === 0 ? (
              <div className="empty-state">
                <p>You haven't favorited any flashcards yet.</p>
                <p>Browse the flashcard catalog and star your favorites!</p>
              </div>
            ) : (
              <div className="flashcards-grid">
                {favorites.map(favorite => {
                  const details = favoriteDetails.get(favorite.flashcard_id) || {
                    id: favorite.flashcard_id,
                    title: favorite.flashcard_id,
                    description: 'Loading details...',
                    favorited_at: favorite.created_at,
                    isFavorite: true
                  };
                  return renderFavoriteFlashcard(favorite.flashcard_id, details);
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default MyFlashcards;
