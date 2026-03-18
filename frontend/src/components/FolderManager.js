import React, { useState, useEffect } from 'react';
import './FolderManager.css';

function FolderManager({ onFolderSelect, selectedFolderId, onDragOver, onDrop }) {
  const [folders, setFolders] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [loading, setLoading] = useState(false);

  // Mock folder data for now - in a real app, this would come from an API
  useEffect(() => {
    // For now, we'll use some sample folders
    setFolders([
      { id: 'folder1', name: 'Study Materials', count: 5 },
      { id: 'folder2', name: 'Work Projects', count: 3 },
      { id: 'folder3', name: 'Language Learning', count: 8 }
    ]);
  }, []);

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setLoading(true);
    try {
      // TODO: Implement actual API call to create folder
      const newFolder = {
        id: `folder${Date.now()}`,
        name: newFolderName.trim(),
        count: 0
      };
      
      setFolders(prev => [...prev, newFolder]);
      setNewFolderName('');
      setShowCreateForm(false);
    } catch (err) {
      alert(`Error creating folder: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFolder = async (folderId) => {
    if (!window.confirm('Are you sure you want to delete this folder? Flashcards will not be deleted, just moved out of the folder.')) {
      return;
    }

    try {
      // TODO: Implement actual API call to delete folder
      setFolders(prev => prev.filter(f => f.id !== folderId));
      
      // If the deleted folder was selected, clear selection
      if (selectedFolderId === folderId) {
        onFolderSelect(null);
      }
    } catch (err) {
      alert(`Error deleting folder: ${err.message}`);
    }
  };

  return (
    <div className="folder-manager">
      <div className="folder-header">
        <h3>📁 Folders</h3>
        <button 
          className="create-folder-button"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          +
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreateFolder} className="create-folder-form">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="folder-name-input"
            disabled={loading}
            autoFocus
          />
          <div className="form-actions">
            <button type="submit" disabled={loading || !newFolderName.trim()}>
              Create
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="folders-list">
        {/* All Flashcards option */}
        <div 
          className={`folder-item ${selectedFolderId === null ? 'selected' : ''}`}
          onClick={() => onFolderSelect(null)}
        >
          <span className="folder-icon">📄</span>
          <span className="folder-name">All Flashcards</span>
        </div>

        {/* Individual folders */}
        {folders.map(folder => (
          <div 
            key={folder.id}
            className={`folder-item ${selectedFolderId === folder.id ? 'selected' : ''}`}
            onClick={() => onFolderSelect(folder.id)}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, folder.id)}
          >
            <span className="folder-icon">📁</span>
            <span className="folder-name">{folder.name}</span>
            <span className="folder-count">({folder.count})</span>
            <button 
              className="delete-folder-button"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(folder.id);
              }}
              title="Delete folder"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {folders.length === 0 && !showCreateForm && (
        <div className="empty-folders">
          <p>No folders yet</p>
          <p>Create one to organize your flashcards!</p>
        </div>
      )}
    </div>
  );
}

export default FolderManager;