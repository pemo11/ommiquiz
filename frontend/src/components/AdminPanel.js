import React, { useState, useEffect } from 'react';
import './AdminPanel.css';

// Use the environment variable first, with proper fallback for development
const getApiUrl = () => {
  // In production, always use the environment variable
  if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  // In development, use environment variable if set, otherwise construct local URL
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // Development fallback - use current hostname for local development
  const hostname = window.location.hostname;
  const baseUrl = hostname === 'localhost' ? 'localhost' : hostname;
  // Use HTTPS if the current page is served over HTTPS, HTTP for localhost
  const protocol = hostname === 'localhost' ? 'http' : window.location.protocol.replace(':', '');
  const port = hostname === 'localhost' ? ':8080' : '';
  return `${protocol}://${baseUrl}${port}/api`;
};

const API_URL = getApiUrl();

// Add debug logging to help identify connection issues
console.log('AdminPanel - Environment:', process.env.NODE_ENV);
console.log('AdminPanel - OMMIQUIZ_APP_API_URL:', process.env.REACT_APP_API_URL);
console.log('AdminPanel - Constructed API_URL:', API_URL);

function AdminPanel({ onBack }) {
  const [flashcards, setFlashcards] = useState([]);
  const [selectedFlashcard, setSelectedFlashcard] = useState(null);
  const [editingFlashcard, setEditingFlashcard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showYamlImport, setShowYamlImport] = useState(false);
  const [yamlInput, setYamlInput] = useState('');
  const [yamlParseError, setYamlParseError] = useState(null);
  const [topicsInput, setTopicsInput] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState('form'); // 'form' or 'yaml'
  const [yamlEditText, setYamlEditText] = useState('');
  const [showStatistics, setShowStatistics] = useState(false);
  const [catalogData, setCatalogData] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(null);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);
  const [showLoginHistory, setShowLoginHistory] = useState(false);
  const [loginHistory, setLoginHistory] = useState([]);
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(false);
  const [loginHistoryError, setLoginHistoryError] = useState(null);
  const [loginHistoryDays, setLoginHistoryDays] = useState(30);
  const [showUserActivity, setShowUserActivity] = useState(false);
  const [userActivityStats, setUserActivityStats] = useState(null);
  const [userActivityLoading, setUserActivityLoading] = useState(false);
  const [userActivityError, setUserActivityError] = useState(null);
  const [userActivityDays, setUserActivityDays] = useState(30);
  const [ratingStats, setRatingStats] = useState(null);
  const [ratingStatsLoading, setRatingStatsLoading] = useState(false);
  const [ratingStatsError, setRatingStatsError] = useState(null);
  const [editingDisplayName, setEditingDisplayName] = useState(null); // userId of the display name being edited
  const [editedDisplayNameValue, setEditedDisplayNameValue] = useState(''); // temporary value while editing

  const formatCatalogTimestamp = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) {
        console.error('Invalid date:', dateString);
        return '—';
      }
      return date.toLocaleDateString();
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return '—';
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) {
        console.error('Invalid datetime:', dateString);
        return '—';
      }
      return date.toLocaleString();
    } catch (error) {
      console.error('Error formatting datetime:', dateString, error);
      return '—';
    }
  };

  const isRecentlyUpdated = (modifiedTime) => {
    if (!modifiedTime) return false;
    try {
      const modifiedDate = new Date(modifiedTime);
      const now = new Date();
      const daysDiff = (now - modifiedDate) / (1000 * 60 * 60 * 24);
      return daysDiff <= 7;
    } catch (error) {
      console.error('Error checking if recently updated:', modifiedTime, error);
      return false;
    }
  };

  useEffect(() => {
    fetchFlashcardList();
  }, []);

  const loadCatalogData = async () => {
    try {
      setCatalogLoading(true);
      setCatalogError(null);
      const response = await fetch(`${API_URL}/flashcards/catalog/data`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load catalog data: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      setCatalogData(data);
    } catch (err) {
      setCatalogError(err.message);
    } finally {
      setCatalogLoading(false);
    }
  };

  const loadRatingStats = async () => {
    try {
      setRatingStatsLoading(true);
      setRatingStatsError(null);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/admin/flashcard-ratings-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load rating stats: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      setRatingStats(data);
    } catch (err) {
      setRatingStatsError(err.message);
    } finally {
      setRatingStatsLoading(false);
    }
  };

  const handleShowStatistics = () => {
    setShowStatistics(true);
    setSelectedFlashcard(null);
    setEditingFlashcard(null);
    setShowYamlImport(false);
    if (!catalogData) {
      loadCatalogData();
    }
    if (!ratingStats) {
      loadRatingStats();
    }
  };

  const handleHideStatistics = () => {
    setShowStatistics(false);
    setCatalogError(null);
  };

  const exportStatisticsToCSV = () => {
    if (!catalogData || !catalogData['flashcard-sets']) {
      return;
    }

    // Prepare CSV content
    const csvRows = [];

    // Add header section
    csvRows.push('Flashcard Statistics Report');
    csvRows.push(`Generated: ${new Date().toLocaleString()}`);
    csvRows.push(`Catalog Generated: ${formatCatalogTimestamp(catalogData.generatedAt)}`);
    csvRows.push(`Total Flashcard Sets: ${catalogData.total ?? catalogData['flashcard-sets'].length}`);
    csvRows.push('');

    // Add flashcard details header
    csvRows.push('Flashcard Sets');
    csvRows.push('Title,ID,Author,Language,Card Count,Module,Topics,Description');

    // Add flashcard data
    catalogData['flashcard-sets'].forEach(flashcard => {
      const row = [
        flashcard.title || flashcard.id || '',
        flashcard.id || '',
        flashcard.author || 'Unknown',
        flashcard.language || 'n/a',
        typeof flashcard.cardcount === 'number' ? flashcard.cardcount : (typeof flashcard.cardCount === 'number' ? flashcard.cardCount : 'n/a'),
        flashcard.module || 'n/a',
        Array.isArray(flashcard.topics) && flashcard.topics.length > 0 ? flashcard.topics.join('; ') : '',
        flashcard.description || ''
      ];

      // Escape cells containing commas, quotes, or newlines
      const escapedRow = row.map(cell => {
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      });

      csvRows.push(escapedRow.join(','));
    });

    // Add rating statistics section if available
    if (ratingStats && ratingStats.flashcard_stats && ratingStats.flashcard_stats.length > 0) {
      csvRows.push('');
      csvRows.push('');
      csvRows.push('Card Rating Statistics');
      csvRows.push(`Total Ratings: ${ratingStats.total_ratings || 0}`);
      csvRows.push(`Average Rating: ${ratingStats.average_rating ? ratingStats.average_rating.toFixed(2) : 'N/A'}`);
      csvRows.push(`Rated Flashcard Sets: ${ratingStats.flashcard_stats.length}`);
      csvRows.push('');
      csvRows.push('Flashcard Set,Flashcard ID,Total Ratings,Average Rating,5 Stars,4 Stars,3 Stars,2 Stars,1 Star');

      ratingStats.flashcard_stats.forEach(stat => {
        const row = [
          stat.flashcard_title || stat.flashcard_id || '',
          stat.flashcard_id || '',
          stat.total_ratings || 0,
          stat.average_rating ? stat.average_rating.toFixed(2) : 'N/A',
          stat.rating_5_count || 0,
          stat.rating_4_count || 0,
          stat.rating_3_count || 0,
          stat.rating_2_count || 0,
          stat.rating_1_count || 0
        ];

        const escapedRow = row.map(cell => {
          const cellStr = String(cell);
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        });

        csvRows.push(escapedRow.join(','));
      });
    }

    // Create blob and download
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `flashcard-statistics-${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleEditFromStatistics = async (flashcardId) => {
    // Hide statistics view and open edit view
    setShowStatistics(false);
    // Fetch and open the flashcard for editing
    await fetchFlashcard(flashcardId);
  };

  // User Management Functions
  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      setUsersError(null);

      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_URL}/admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch users: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      setUsers(data.users);
    } catch (err) {
      console.error('Error fetching users:', err);
      setUsersError(err.message);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleToggleAdminStatus = async (userId, currentStatus) => {
    const newStatus = !currentStatus;
    const action = newStatus ? 'grant' : 'revoke';

    if (!window.confirm(`Are you sure you want to ${action} admin privileges for this user?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_URL}/admin/users/${userId}/admin-status?is_admin=${newStatus}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to update admin status: ${response.status}`);
      }

      const data = await response.json();
      setMessage(data.message);

      // Refresh user list
      await fetchUsers();
    } catch (err) {
      console.error('Error updating admin status:', err);
      setError(err.message);
    }
  };

  const handleStartEditDisplayName = (userId, currentDisplayName) => {
    setEditingDisplayName(userId);
    setEditedDisplayNameValue(currentDisplayName || '');
  };

  const handleCancelEditDisplayName = () => {
    setEditingDisplayName(null);
    setEditedDisplayNameValue('');
  };

  const handleSaveDisplayName = async (userId) => {
    if (!editedDisplayNameValue.trim()) {
      setError('Display name cannot be empty');
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_URL}/admin/users/${userId}/display-name?display_name=${encodeURIComponent(editedDisplayNameValue.trim())}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to update display name: ${response.status}`);
      }

      const data = await response.json();
      setMessage(data.message);

      // Reset editing state
      setEditingDisplayName(null);
      setEditedDisplayNameValue('');

      // Refresh user list
      await fetchUsers();
    } catch (err) {
      console.error('Error updating display name:', err);
      setError(err.message);
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Are you sure you want to delete user "${userEmail}"? This will permanently delete all their data including learning progress and quiz sessions. This action cannot be undone.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_URL}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to delete user: ${response.status}`);
      }

      const data = await response.json();
      setMessage(data.message);

      // Refresh user list
      await fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      setError(err.message);
    }
  };

  const handleShowUserManagement = () => {
    setShowUserManagement(true);
    setShowStatistics(false);
    setSelectedFlashcard(null);
    setEditingFlashcard(null);
    setShowYamlImport(false);
    if (users.length === 0) {
      fetchUsers();
    }
  };

  const handleHideUserManagement = () => {
    setShowUserManagement(false);
    setUsersError(null);
  };

  // Login History Functions
  const fetchLoginHistory = async () => {
    try {
      setLoginHistoryLoading(true);
      setLoginHistoryError(null);

      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_URL}/admin/login-history?days=${loginHistoryDays}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch login history: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      setLoginHistory(data.history);
    } catch (err) {
      console.error('Error fetching login history:', err);
      setLoginHistoryError(err.message);
    } finally {
      setLoginHistoryLoading(false);
    }
  };

  const exportLoginHistoryToCSV = () => {
    if (!loginHistory || loginHistory.length === 0) {
      return;
    }

    // Prepare CSV header
    const headers = ['Timestamp', 'Email', 'Display Name', 'Role', 'Status', 'IP Address', 'Error Message'];

    // Prepare CSV rows
    const rows = loginHistory.map(record => {
      return [
        record.timestamp ? new Date(record.timestamp).toLocaleString() : '',
        record.email || '',
        record.display_name || '',
        record.is_admin ? 'Admin' : 'User',
        record.login_type === 'success' ? 'Success' : 'Failed',
        record.ip_address || '',
        record.error_message || ''
      ];
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape cells containing commas, quotes, or newlines
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `login-history-${loginHistoryDays}days-${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShowLoginHistory = () => {
    setShowLoginHistory(true);
    setShowStatistics(false);
    setShowUserManagement(false);
    setSelectedFlashcard(null);
    setEditingFlashcard(null);
    setShowYamlImport(false);
    fetchLoginHistory();
  };

  const handleHideLoginHistory = () => {
    setShowLoginHistory(false);
    setLoginHistoryError(null);
  };

  const fetchUserActivityStats = async () => {
    try {
      setUserActivityLoading(true);
      setUserActivityError(null);

      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_URL}/admin/user-activity-stats?days=${userActivityDays}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch user activity stats: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      setUserActivityStats(data);
    } catch (err) {
      console.error('Error fetching user activity stats:', err);
      setUserActivityError(err.message);
    } finally {
      setUserActivityLoading(false);
    }
  };

  const handleShowUserActivity = () => {
    setShowUserActivity(true);
    setShowStatistics(false);
    setShowUserManagement(false);
    setShowLoginHistory(false);
    setSelectedFlashcard(null);
    setEditingFlashcard(null);
    setShowYamlImport(false);
    fetchUserActivityStats();
  };

  const handleHideUserActivity = () => {
    setShowUserActivity(false);
    setUserActivityError(null);
  };

  const exportUserActivityToCSV = () => {
    if (!userActivityStats || !userActivityStats.daily_stats) {
      return;
    }

    // Prepare CSV content
    const csvRows = [];

    // Add header section
    csvRows.push('User Activity Statistics Report');
    csvRows.push(`Period: Last ${userActivityDays} Days`);
    csvRows.push(`Generated: ${new Date().toLocaleString()}`);
    csvRows.push('');

    // Add summary statistics
    csvRows.push('Summary Statistics');
    csvRows.push(`Average Daily Active Users,${userActivityStats.summary.avg_active_users}`);
    csvRows.push(`Peak Active Users,${userActivityStats.summary.max_active_users}`);
    csvRows.push(`Days with Activity,${userActivityStats.summary.days_with_activity}`);
    csvRows.push(`Total Days in Period,${userActivityStats.period_days}`);
    csvRows.push('');

    // Add daily activity header
    csvRows.push('Daily Activity');
    csvRows.push('Date,Active Users');

    // Add daily data
    userActivityStats.daily_stats.forEach(day => {
      csvRows.push(`${day.date},${day.active_users}`);
    });

    // Create blob and download
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `user-activity-${userActivityDays}days-${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fetchFlashcardList = async () => {
    try {
      setLoading(true);
      console.log('AdminPanel - Fetching from URL:', `${API_URL}/flashcards`);
      const response = await fetch(`${API_URL}/flashcards`);
      
      // Log response details for debugging
      console.log('AdminPanel - Response status:', response.status);
      console.log('AdminPanel - Response headers:', Object.fromEntries(response.headers.entries()));
      console.log('AdminPanel - Response URL:', response.url);
      
      if (!response.ok) {
        // Try to get the error text instead of JSON
        const errorText = await response.text();
        console.error('AdminPanel - Error response text:', errorText);
        throw new Error(`Failed to fetch flashcard list: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      console.log('AdminPanel - Content-Type:', contentType);
      
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        console.error('AdminPanel - Non-JSON response received:', responseText.substring(0, 500) + '...');
        throw new Error(`Server returned non-JSON response. Content-Type: ${contentType}. Response: ${responseText.substring(0, 200)}...`);
      }
      
      const data = await response.json();
      setFlashcards(data.flashcards);
      setError(null);
    } catch (err) {
      console.error('AdminPanel - Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchFlashcard = async (flashcardId) => {
    try {
      setLoading(true);
      console.log('AdminPanel - Fetching flashcard:', flashcardId);
      const response = await fetch(`${API_URL}/flashcards/${flashcardId}`);
      
      console.log('AdminPanel - Fetch response status:', response.status);
      
      if (!response.ok) {
        // Get more detailed error information
        let errorMessage = `Failed to fetch flashcard: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch (parseError) {
          // If we can't parse the error response, use the status text
          console.error('AdminPanel - Error parsing error response:', parseError);
        }
        console.error('AdminPanel - Fetch flashcard error:', errorMessage);
        throw new Error(errorMessage);
      }
      
      const data = await response.json();

      // Normalize flashcard data: ensure each card has a type field
      if (data.flashcards && Array.isArray(data.flashcards)) {
        data.flashcards = data.flashcards.map(card => {
          // If type is missing or undefined, infer it from the card structure
          if (!card.type) {
            if (card.answers && Array.isArray(card.answers)) {
              card.type = 'multiple';
            } else if (card.answer !== undefined) {
              card.type = 'single';
            } else {
              // Default to single if we can't infer
              card.type = 'single';
            }
          }
          return card;
        });
      }

      setSelectedFlashcard(data);
      setEditingFlashcard({ ...data });
      setError(null);
      console.log('AdminPanel - Flashcard fetched successfully:', flashcardId);
    } catch (err) {
      console.error('AdminPanel - Fetch flashcard failed:', err);
      setError(`Unable to load flashcard '${flashcardId}': ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const createNewFlashcard = () => {
    const newFlashcard = {
      id: '',
      author: '',
      title: '',
      description: '',
      createDate: new Date().toISOString().split('T')[0],
      language: 'en',
      module: '',
      semester: '',
      institution: '',
      studycourse: '',
      topics: [],
      keywords: [],
      flashcards: [
        {
          question: '',
          answer: '',
          type: 'single'
        }
      ]
    };
    
    setSelectedFlashcard(newFlashcard);
    setEditingFlashcard({ ...newFlashcard });
    setIsCreatingNew(true);
    setError(null);
  };

  const createFromYaml = () => {
    setShowYamlImport(true);
    setYamlInput('');
    setYamlParseError(null);
    setError(null);
  };

  const parseYamlInput = () => {
    if (!yamlInput.trim()) {
      setYamlParseError('Please paste your YAML content');
      return;
    }

    try {
      const lines = yamlInput.split('\n');
      const flashcardData = {
        id: '',
        author: '',
        title: '',
        description: '',
        createDate: '',
        language: 'en',
        module: '',
        semester: '',
        institution: '',
        studycourse: '',
        topics: [],
        keywords: [],
        flashcards: []
      };

      let currentSection = 'metadata';
      let currentCard = null;
      let currentAnswers = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        if (!trimmedLine || trimmedLine.startsWith('#')) continue;

        if (trimmedLine === 'flashcards:') {
          currentSection = 'flashcards';
          continue;
        }

        if (currentSection === 'metadata') {
          const colonIndex = trimmedLine.indexOf(':');
          if (colonIndex > -1) {
            const key = trimmedLine.substring(0, colonIndex).trim();
            const value = trimmedLine.substring(colonIndex + 1).trim();
            
            if (key === 'topics' || key === 'keywords') {
              if (value === '[]') {
                flashcardData[key] = [];
              } else {
                const items = [];
                for (let j = i + 1; j < lines.length; j++) {
                  const nextLine = lines[j];
                  if (nextLine.trim().startsWith('- ')) {
                    items.push(nextLine.trim().substring(2).replace(/^"(.*)"$/, '$1'));
                    i = j;
                  } else if (nextLine.trim() && !nextLine.trim().startsWith(' ')) {
                    break;
                  }
                }
                flashcardData[key] = items;
              }
            } else {
              flashcardData[key] = value.replace(/^"(.*)"$/, '$1');
            }
          }
        }

        if (currentSection === 'flashcards') {
          if (trimmedLine.startsWith('- id:') || trimmedLine.startsWith('- question:')) {
            // Start of a new flashcard (can begin with either id or question)
            if (currentCard) {
              if (currentAnswers.length > 0) {
                currentCard.answers = currentAnswers;
                currentCard.type = 'multiple';
              }
              flashcardData.flashcards.push(currentCard);
            }

            currentCard = {
              type: 'single'
            };

            // Parse the first field
            if (trimmedLine.startsWith('- id:')) {
              currentCard.id = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1');
            } else {
              currentCard.question = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1');
            }
            currentAnswers = [];
          } else if (trimmedLine.startsWith('id:') && currentCard && !currentCard.id) {
            currentCard.id = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1');
          } else if (trimmedLine.startsWith('question:') && currentCard && !currentCard.question) {
            currentCard.question = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1');
          } else if (trimmedLine.startsWith('bitmap:') && currentCard) {
            const bitmapValue = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1');
            currentCard.bitmap = bitmapValue;
          } else if (trimmedLine.startsWith('answer:') && currentCard) {
            currentCard.answer = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1');
            currentCard.type = 'single';
          } else if (trimmedLine === 'answers:' && currentCard) {
            currentCard.type = 'multiple';
            currentAnswers = [];
          } else if (trimmedLine === 'correctAnswers:' && currentCard) {
            currentCard.correctAnswers = [];
          } else if (trimmedLine.startsWith('- ') && !trimmedLine.includes(':') && currentCard) {
            // List item without a colon (answer item or boolean, not a field definition like '- question:')
            const itemValue = trimmedLine.substring(2).trim();
            if (currentCard.type === 'multiple' && currentCard.correctAnswers !== undefined) {
              // We're in the correctAnswers section
              currentCard.correctAnswers.push(itemValue === 'true');
            } else if (currentCard.type === 'multiple') {
              // We're in the answers section
              currentAnswers.push(itemValue.replace(/^"(.*)"$/, '$1'));
            }
          } else if (trimmedLine.startsWith('type:') && currentCard) {
            currentCard.type = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1');
          }
        }
      }

      if (currentCard) {
        if (currentAnswers.length > 0) {
          currentCard.answers = currentAnswers;
        }
        flashcardData.flashcards.push(currentCard);
      }

      if (!flashcardData.id) {
        throw new Error('Missing required field: id');
      }
      if (!flashcardData.title) {
        throw new Error('Missing required field: title');
      }
      if (!flashcardData.author) {
        throw new Error('Missing required field: author');
      }
      if (flashcardData.flashcards.length === 0) {
        throw new Error('No flashcards found in YAML');
      }

      if (!flashcardData.createDate) {
        flashcardData.createDate = new Date().toISOString().split('T')[0];
      }

      setSelectedFlashcard(flashcardData);
      setEditingFlashcard({ ...flashcardData });
      setIsCreatingNew(true);
      setShowYamlImport(false);
      setYamlParseError(null);
      setError(null);

    } catch (err) {
      setYamlParseError(`Failed to parse YAML: ${err.message}`);
    }
  };

  const cancelYamlImport = () => {
    setShowYamlImport(false);
    setYamlInput('');
    setYamlParseError(null);
  };

  const saveFlashcard = async (forceOverwrite = false) => {
    // If in YAML mode, parse the YAML first to get editingFlashcard data
    if (editMode === 'yaml') {
      try {
        switchToFormMode(); // This will parse yamlEditText and update editingFlashcard
        // Wait a tick for state to update
        await new Promise(resolve => setTimeout(resolve, 0));
      } catch (err) {
        setError(`Invalid YAML: ${err.message}`);
        return;
      }
    }

    if (!editingFlashcard) return;

    if (!editingFlashcard.id.trim()) {
      setError('Flashcard ID is required');
      return;
    }
    if (!editingFlashcard.title.trim()) {
      setError('Flashcard title is required');
      return;
    }
    if (!editingFlashcard.author.trim()) {
      setError('Flashcard author is required');
      return;
    }
    if (editingFlashcard.flashcards.length === 0) {
      setError('At least one flashcard is required');
      return;
    }

    for (let i = 0; i < editingFlashcard.flashcards.length; i++) {
      const card = editingFlashcard.flashcards[i];
      if (!card.question.trim()) {
        setError(`Question for card ${i + 1} is required`);
        return;
      }
      if (card.type === 'single' && !card.answer?.trim()) {
        setError(`Answer for card ${i + 1} is required`);
        return;
      }
      if (card.type === 'multiple' && (!card.answers || card.answers.length === 0 || card.answers.every(a => !a.trim()))) {
        setError(`At least one answer for card ${i + 1} is required`);
        return;
      }
    }

    const isUpdatingExisting = !isCreatingNew &&
      selectedFlashcard &&
      selectedFlashcard.id === editingFlashcard.id;
    const isRenaming = !isCreatingNew &&
      selectedFlashcard &&
      selectedFlashcard.id !== editingFlashcard.id;
    const isNewButExists = isCreatingNew && flashcards.some(fc => fc.id === editingFlashcard.id);

    if (isNewButExists && !forceOverwrite) {
      setPendingSaveData({ ...editingFlashcard });
      setShowConfirmDialog(true);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const yamlData = convertToYAML(editingFlashcard);

      let response;
      if (isUpdatingExisting || isRenaming) {
        // Determine the filename to use
        let filename;
        if (isUpdatingExisting) {
          // Preserve original filename when just updating content
          filename = selectedFlashcard.filename || `${editingFlashcard.id}.yml`;
        } else if (isRenaming) {
          // When renaming, preserve the file extension from the original file
          const originalExtension = selectedFlashcard.filename
            ? selectedFlashcard.filename.slice(selectedFlashcard.filename.lastIndexOf('.'))
            : '.yml';
          filename = `${editingFlashcard.id}${originalExtension}`;
        }

        const requestBody = {
          content: yamlData,
          filename: filename
        };

        // If renaming, include the old ID
        if (isRenaming) {
          requestBody.old_id = selectedFlashcard.id;
        }

        const token = localStorage.getItem('authToken');
        if (!token) {
          throw new Error('No authentication token found');
        }

        response = await fetch(`${API_URL}/flashcards/${editingFlashcard.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });
      } else {
        const token = localStorage.getItem('authToken');
        if (!token) {
          throw new Error('No authentication token found');
        }

        const blob = new Blob([yamlData], { type: 'text/yaml' });
        const formData = new FormData();
        formData.append('file', blob, `${editingFlashcard.id}.yml`);

        if (forceOverwrite) {
          formData.append('overwrite', 'true');
        }

        response = await fetch(`${API_URL}/flashcards/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData
        });
      }

      if (!response.ok) {
        let errorMessage = 'Failed to save flashcard';

        try {
          const errorData = await response.json();
          errorMessage = errorData?.message || errorData?.detail || errorMessage;

          if (errorData?.errors?.length) {
            errorMessage += `: ${errorData.errors.join('; ')}`;
          }
        } catch (parseError) {
          try {
            const errorText = await response.text();
            if (errorText) {
              errorMessage += `: ${errorText}`;
            }
          } catch {
            // Ignore secondary parsing errors
          }
          // Surface the original parse failure to the console for debugging while
          // keeping a user-friendly message in the UI.
          // eslint-disable-next-line no-console
          console.error('Failed to parse error response from flashcard save', parseError);
        }

        throw new Error(errorMessage);
      }

      await response.json();
      const actionText = isRenaming ? 'renamed' : (isUpdatingExisting ? 'updated' : (isNewButExists ? 'overwritten' : 'created'));
      setMessage(`Flashcard ${actionText} successfully!`);
      setSelectedFlashcard({ ...editingFlashcard });
      setIsCreatingNew(false);
      
      await fetchFlashcardList();
      
      setTimeout(() => setMessage(null), 3000);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmOverwrite = async () => {
    setShowConfirmDialog(false);
    if (pendingSaveData) {
      await saveFlashcard(true);
      setPendingSaveData(null);
    }
  };

  const handleCancelOverwrite = () => {
    setShowConfirmDialog(false);
    setPendingSaveData(null);
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
    setDeleteConfirmation('');
    setDeleteError(null);
  };

  const handleCancelDelete = () => {
    setShowDeleteDialog(false);
    setDeleteConfirmation('');
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!selectedFlashcard || isCreatingNew) {
      setDeleteError('Cannot delete an unsaved flashcard.');
      return;
    }

    // Use ID consistently for deletion confirmation
    const expectedId = selectedFlashcard.id;

    if (!deleteConfirmation.trim()) {
      setDeleteError('Please enter the flashcard ID to confirm deletion.');
      return;
    }

    if (deleteConfirmation.trim() !== expectedId) {
      setDeleteError('Entered ID does not match the flashcard ID.');
      return;
    }

    try {
      setDeleting(true);
      setDeleteError(null);
      setError(null);

      const response = await fetch(`${API_URL}/flashcards/${selectedFlashcard.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        let errorMessage = 'Failed to delete flashcard';
        try {
          const errorData = await response.json();
          errorMessage = errorData?.detail || errorData?.message || errorMessage;
        } catch (err) {
          // Ignore JSON parsing errors
        }
        throw new Error(errorMessage);
      }

      await response.json();
      setMessage(`Flashcard "${selectedFlashcard.id}" deleted successfully!`);
      setShowDeleteDialog(false);
      setSelectedFlashcard(null);
      setEditingFlashcard(null);
      setIsCreatingNew(false);
      setDeleteConfirmation('');

      await fetchFlashcardList();

      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const exportFlashcard = (flashcardData = null) => {
    try {
      const dataToExport = flashcardData || editingFlashcard;
      
      if (!dataToExport) {
        setError('No flashcard data to export');
        return;
      }

      const yamlContent = convertToYAML(dataToExport);
      
      const blob = new Blob([yamlContent], { type: 'text/yaml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${dataToExport.id || 'flashcard'}.yml`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setMessage(`Flashcard "${dataToExport.title || dataToExport.id}" exported successfully!`);
      setTimeout(() => setMessage(null), 3000);
      
    } catch (err) {
      setError(`Failed to export flashcard: ${err.message}`);
    }
  };

  const convertToYAML = (data) => {
    const toArray = (value) => (Array.isArray(value) ? value : []);
    const escapeQuotes = (value = '') => value.replace(/"/g, '\\"');

    const yamlLines = [];
    yamlLines.push(`id: "${escapeQuotes(data.id || '')}"`);
    yamlLines.push(`author: "${escapeQuotes(data.author || '')}"`);
    yamlLines.push(`title: "${escapeQuotes(data.title || '')}"`);
    yamlLines.push(`description: "${escapeQuotes(data.description || '')}"`);
    yamlLines.push(`createDate: "${escapeQuotes(data.createDate || '')}"`);
    yamlLines.push(`language: "${escapeQuotes(data.language || '')}"`);
    yamlLines.push(`module: "${escapeQuotes(data.module || '')}"`);
    yamlLines.push(`semester: "${escapeQuotes(data.semester || '')}"`);
    yamlLines.push(`institution: "${escapeQuotes(data.institution || '')}"`);
    yamlLines.push(`studycourse: "${escapeQuotes(data.studycourse || '')}"`);

    const topics = toArray(data.topics);
    if (topics.length > 0) {
      yamlLines.push('topics:');
      topics.forEach(topic => {
        yamlLines.push(`  - "${escapeQuotes(topic || '')}"`);
      });
    } else {
      yamlLines.push('topics: []');
    }

    const keywords = toArray(data.keywords);
    if (keywords.length > 0) {
      yamlLines.push('keywords:');
      keywords.forEach(keyword => {
        yamlLines.push(`  - "${escapeQuotes(keyword || '')}"`);
      });
    } else {
      yamlLines.push('keywords: []');
    }

    yamlLines.push('');
    yamlLines.push('flashcards:');

    data.flashcards.forEach(card => {
      yamlLines.push(`  - question: "${escapeQuotes(card.question || '')}"`);

      if (card.bitmap) {
        yamlLines.push(`    bitmap: "${escapeQuotes(card.bitmap)}"`);
      }

      // Infer type if not present
      let cardType = card.type;
      if (!cardType) {
        cardType = (card.answers && Array.isArray(card.answers)) ? 'multiple' : 'single';
      }

      if (cardType === 'single') {
        yamlLines.push(`    answer: "${escapeQuotes(card.answer || '')}"`);
      } else {
        const answers = toArray(card.answers);
        yamlLines.push('    answers:');
        answers.forEach(answer => {
          yamlLines.push(`      - "${escapeQuotes(answer || '')}"`);
        });

        const correctAnswers = toArray(card.correctAnswers);
        if (correctAnswers.some(isCorrect => isCorrect)) {
          yamlLines.push('    correctAnswers:');
          correctAnswers.forEach(isCorrect => {
            yamlLines.push(`      - ${Boolean(isCorrect)}`);
          });
        }
      }

      yamlLines.push(`    type: "${cardType}"`);

      yamlLines.push('');
    });

    return yamlLines.join('\n');
  };

  const updateFlashcardField = (field, value) => {
    setEditingFlashcard(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const stringToArray = (str) => {
    return str ? str.split(',').map(item => item.trim()).filter(item => item) : [];
  };

  const arrayToString = (arr) => {
    return arr ? arr.join(', ') : '';
  };

  const handleTopicsChange = (e) => {
    setTopicsInput(e.target.value);
  };

  const handleTopicsBlur = () => {
    const topicsArray = stringToArray(topicsInput);
    updateFlashcardField('topics', topicsArray);
  };

  const handleKeywordsChange = (e) => {
    setKeywordsInput(e.target.value);
  };

  const handleKeywordsBlur = () => {
    const keywordsArray = stringToArray(keywordsInput);
    updateFlashcardField('keywords', keywordsArray);
  };

  useEffect(() => {
    if (editingFlashcard) {
      setTopicsInput(arrayToString(editingFlashcard.topics));
      setKeywordsInput(arrayToString(editingFlashcard.keywords));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFlashcard?.id, editingFlashcard?.topics, editingFlashcard?.keywords]);

  const updateCardField = (cardIndex, field, value) => {
    setEditingFlashcard(prev => {
      const newFlashcards = [...prev.flashcards];
      newFlashcards[cardIndex] = {
        ...newFlashcards[cardIndex],
        [field]: value
      };
      return {
        ...prev,
        flashcards: newFlashcards
      };
    });
  };

  const addNewCard = () => {
    setEditingFlashcard(prev => {
      // Generate card ID: first 3 letters of cardset ID + zero-padded number
      const cardsetId = prev.id || 'new';
      const prefix = cardsetId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toLowerCase().padEnd(3, 'x');
      const cardNumber = (prev.flashcards.length + 1).toString().padStart(3, '0');
      const newCardId = `${prefix}${cardNumber}`;

      return {
        ...prev,
        flashcards: [
          ...prev.flashcards,
          {
            id: newCardId,
            question: '',
            answer: '',
            bitmap: '',
            type: 'single'
          }
        ]
      };
    });
  };

  const deleteCard = (cardIndex) => {
    setEditingFlashcard(prev => ({
      ...prev,
      flashcards: prev.flashcards.filter((_, index) => index !== cardIndex)
    }));
  };

  const moveCardUp = (cardIndex) => {
    if (cardIndex === 0) return; // Already at top

    setEditingFlashcard(prev => {
      const newFlashcards = [...prev.flashcards];
      // Swap with previous card
      [newFlashcards[cardIndex - 1], newFlashcards[cardIndex]] =
      [newFlashcards[cardIndex], newFlashcards[cardIndex - 1]];

      return { ...prev, flashcards: newFlashcards };
    });
  };

  const moveCardDown = (cardIndex) => {
    setEditingFlashcard(prev => {
      if (cardIndex === prev.flashcards.length - 1) return prev; // Already at bottom

      const newFlashcards = [...prev.flashcards];
      // Swap with next card
      [newFlashcards[cardIndex], newFlashcards[cardIndex + 1]] =
      [newFlashcards[cardIndex + 1], newFlashcards[cardIndex]];

      return { ...prev, flashcards: newFlashcards };
    });
  };

  const addAnswer = (cardIndex) => {
    setEditingFlashcard(prev => {
      const newFlashcards = [...prev.flashcards];
      if (!newFlashcards[cardIndex].answers) {
        newFlashcards[cardIndex].answers = [];
      }
      if (!newFlashcards[cardIndex].correctAnswers) {
        newFlashcards[cardIndex].correctAnswers = [];
      }
      newFlashcards[cardIndex].answers.push('');
      newFlashcards[cardIndex].correctAnswers.push(false);
      return {
        ...prev,
        flashcards: newFlashcards
      };
    });
  };

  const updateAnswer = (cardIndex, answerIndex, value) => {
    setEditingFlashcard(prev => {
      const newFlashcards = [...prev.flashcards];
      newFlashcards[cardIndex].answers[answerIndex] = value;
      return {
        ...prev,
        flashcards: newFlashcards
      };
    });
  };

  const updateCorrectAnswer = (cardIndex, answerIndex, isCorrect) => {
    setEditingFlashcard(prev => {
      const newFlashcards = [...prev.flashcards];
      if (!newFlashcards[cardIndex].correctAnswers) {
        newFlashcards[cardIndex].correctAnswers = new Array(newFlashcards[cardIndex].answers.length).fill(false);
      }
      newFlashcards[cardIndex].correctAnswers[answerIndex] = isCorrect;
      return {
        ...prev,
        flashcards: newFlashcards
      };
    });
  };

  const deleteAnswer = (cardIndex, answerIndex) => {
    setEditingFlashcard(prev => {
      const newFlashcards = [...prev.flashcards];
      newFlashcards[cardIndex].answers = newFlashcards[cardIndex].answers.filter((_, index) => index !== answerIndex);
      if (newFlashcards[cardIndex].correctAnswers) {
        newFlashcards[cardIndex].correctAnswers = newFlashcards[cardIndex].correctAnswers.filter((_, index) => index !== answerIndex);
      }
      return {
        ...prev,
        flashcards: newFlashcards
      };
    });
  };

  const cancelEdit = () => {
    setSelectedFlashcard(null);
    setEditingFlashcard(null);
    setIsCreatingNew(false);
    setError(null);
    setEditMode('form');
    setYamlEditText('');
  };

  const switchToYamlMode = () => {
    if (editingFlashcard) {
      const yamlText = convertToYAML(editingFlashcard);
      setYamlEditText(yamlText);
      setEditMode('yaml');
      setError(null);
    }
  };

  const switchToFormMode = () => {
    try {
      // Parse the YAML text and update editingFlashcard
      const lines = yamlEditText.split('\n');
      const flashcardData = {
        id: '',
        author: '',
        title: '',
        description: '',
        createDate: '',
        language: 'en',
        module: '',
        semester: '',
        institution: '',
        studycourse: '',
        topics: [],
        keywords: [],
        flashcards: []
      };

      let currentSection = 'metadata';
      let currentCard = null;
      let currentAnswers = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (!trimmedLine || trimmedLine.startsWith('#')) continue;

        if (trimmedLine === 'flashcards:') {
          currentSection = 'flashcards';
          continue;
        }

        if (currentSection === 'metadata') {
          const colonIndex = trimmedLine.indexOf(':');
          if (colonIndex > -1) {
            const key = trimmedLine.substring(0, colonIndex).trim();
            const value = trimmedLine.substring(colonIndex + 1).trim();

            if (key === 'topics' || key === 'keywords') {
              if (value === '[]') {
                flashcardData[key] = [];
              } else {
                const items = [];
                for (let j = i + 1; j < lines.length; j++) {
                  const nextLine = lines[j];
                  if (nextLine.trim().startsWith('- ')) {
                    items.push(nextLine.trim().substring(2).replace(/^"(.*)"$/, '$1'));
                    i = j;
                  } else if (nextLine.trim() && !nextLine.trim().startsWith(' ')) {
                    break;
                  }
                }
                flashcardData[key] = items;
              }
            } else {
              flashcardData[key] = value.replace(/^"(.*)"$/, '$1');
            }
          }
        }

        if (currentSection === 'flashcards') {
          if (trimmedLine.startsWith('- question:')) {
            if (currentCard) {
              if (currentAnswers.length > 0) {
                currentCard.answers = currentAnswers;
                currentCard.type = 'multiple';
              }
              flashcardData.flashcards.push(currentCard);
            }

            currentCard = {
              question: trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1'),
              type: 'single'
            };
            currentAnswers = [];
          } else if (trimmedLine.startsWith('bitmap:') && currentCard) {
            const bitmapValue = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1');
            currentCard.bitmap = bitmapValue;
          } else if (trimmedLine.startsWith('answer:') && currentCard) {
            currentCard.answer = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1');
            currentCard.type = 'single';
          } else if (trimmedLine === 'answers:' && currentCard) {
            currentCard.type = 'multiple';
            currentAnswers = [];
          } else if (trimmedLine === 'correctAnswers:' && currentCard) {
            currentCard.correctAnswers = [];
          } else if (trimmedLine.startsWith('- ') && !trimmedLine.includes(':') && currentCard) {
            const itemValue = trimmedLine.substring(2).trim();
            if (currentCard.type === 'multiple' && currentCard.correctAnswers !== undefined) {
              currentCard.correctAnswers.push(itemValue === 'true');
            } else if (currentCard.type === 'multiple') {
              currentAnswers.push(itemValue.replace(/^"(.*)"$/, '$1'));
            }
          } else if (trimmedLine.startsWith('type:') && currentCard) {
            currentCard.type = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1');
          }
        }
      }

      if (currentCard) {
        if (currentAnswers.length > 0) {
          currentCard.answers = currentAnswers;
        }
        flashcardData.flashcards.push(currentCard);
      }

      setEditingFlashcard(flashcardData);
      setEditMode('form');
      setError(null);
    } catch (err) {
      setError(`Failed to parse YAML: ${err.message}`);
    }
  };

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <button onClick={onBack} className="back-button">Back to Quiz</button>
        <h2>🔧 Admin Panel</h2>
      </div>

      {/* Navigation Tabs */}
      <div className="admin-navigation">
        <button
          onClick={() => {
            setShowStatistics(false);
            setShowUserManagement(false);
            setShowLoginHistory(false);
            setSelectedFlashcard(null);
            setEditingFlashcard(null);
          }}
          className={!showStatistics && !showUserManagement && !showLoginHistory && !showUserActivity ? "nav-tab active" : "nav-tab"}
        >
          📋 Manage Flashcards
        </button>
        <button
          onClick={handleShowStatistics}
          className={showStatistics ? "nav-tab active" : "nav-tab"}
        >
          📊 Statistics
        </button>
        <button
          onClick={handleShowUserManagement}
          className={showUserManagement ? "nav-tab active" : "nav-tab"}
        >
          👥 User Management
        </button>
        <button
          onClick={handleShowLoginHistory}
          className={showLoginHistory ? "nav-tab active" : "nav-tab"}
        >
          📅 Login History
        </button>
        <button
          onClick={handleShowUserActivity}
          className={showUserActivity ? "nav-tab active" : "nav-tab"}
        >
          📊 User Activity
        </button>
      </div>

      {message && (
        <div className="success-message">
          {message}
        </div>
      )}

      {error && (
        <div className="error-message">
          <p>Error: {error}</p>
        </div>
      )}

      {showStatistics ? (
        <div className="statistics-section">
          <div className="statistics-header">
            <button onClick={handleHideStatistics} className="back-to-list-button">
              Back to List
            </button>
            <h3>Flashcard Statistics</h3>
            <div className="statistics-controls">
              <button
                onClick={loadCatalogData}
                className="refresh-stats-button"
                disabled={catalogLoading}
              >
                {catalogLoading ? 'Refreshing...' : '↻ Refresh'}
              </button>
              <button
                onClick={exportStatisticsToCSV}
                className="export-csv-button"
                disabled={!catalogData || !catalogData['flashcard-sets'] || catalogData['flashcard-sets'].length === 0}
                title="Export to CSV"
              >
                📥 Export CSV
              </button>
            </div>
          </div>

          {catalogError && (
            <div className="error-message">
              <p>Error: {catalogError}</p>
            </div>
          )}

          {catalogLoading && !catalogData ? (
            <div className="loading">Loading statistics...</div>
          ) : catalogData ? (
            <>
              <div className="statistics-summary">
                <div className="stat-card">
                  <span className="stat-label">Catalog Generated</span>
                  <span className="stat-value">{formatCatalogTimestamp(catalogData.generatedAt)}</span>
                  <span className="stat-helper">Timestamp (local time)</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Flashcard Sets</span>
                  <span className="stat-value">
                    {catalogData.total ?? (catalogData['flashcard-sets'] ? catalogData['flashcard-sets'].length : 0)}
                  </span>
                  <span className="stat-helper">Available in catalog</span>
                </div>
              </div>

              <div className="statistics-table-wrapper">
                <table className="statistics-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>ID</th>
                      <th>Author</th>
                      <th>Language</th>
                      <th>Card Count</th>
                      <th>Module</th>
                      <th>Topics</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogData['flashcard-sets'] && catalogData['flashcard-sets'].length > 0 ? (
                      catalogData['flashcard-sets'].map((flashcard) => (
                        <tr key={flashcard.id || flashcard.filename}>
                          <td>
                            <div className="stat-title">{flashcard.title || flashcard.id}</div>
                            {flashcard.description && (
                              <div className="stat-description">{flashcard.description}</div>
                            )}
                          </td>
                          <td>{flashcard.id || '—'}</td>
                          <td>{flashcard.author || 'Unknown'}</td>
                          <td>{flashcard.language || 'n/a'}</td>
                          <td>{typeof flashcard.cardcount === 'number'
                            ? flashcard.cardcount
                            : (typeof flashcard.cardCount === 'number' ? flashcard.cardCount : 'n/a')}
                          </td>
                          <td>{flashcard.module || 'n/a'}</td>
                          <td>
                            {Array.isArray(flashcard.topics) && flashcard.topics.length > 0
                              ? flashcard.topics.join(', ')
                              : '—'}
                          </td>
                          <td>
                            <button
                              onClick={() => handleEditFromStatistics(flashcard.id)}
                              className="edit-button"
                              title="Edit this flashcard set"
                            >
                              ✏️ Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" className="no-data">
                          No flashcards found in catalog.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Card Ratings Statistics Section */}
              <div className="rating-stats-section">
                <h4>Card Rating Statistics</h4>
                {ratingStatsError && (
                  <div className="error-message">
                    <p>Error loading rating stats: {ratingStatsError}</p>
                  </div>
                )}
                {ratingStatsLoading ? (
                  <div className="loading">Loading rating statistics...</div>
                ) : ratingStats && ratingStats.flashcard_stats && ratingStats.flashcard_stats.length > 0 ? (
                  <>
                    <div className="statistics-summary">
                      <div className="stat-card">
                        <span className="stat-label">Total Ratings</span>
                        <span className="stat-value">{ratingStats.total_ratings || 0}</span>
                        <span className="stat-helper">All ratings given by users</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-label">Average Rating</span>
                        <span className="stat-value">
                          {ratingStats.average_rating ? `${ratingStats.average_rating.toFixed(2)} ⭐` : '—'}
                        </span>
                        <span className="stat-helper">Across all rated cards</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-label">Rated Flashcard Sets</span>
                        <span className="stat-value">{ratingStats.flashcard_stats.length}</span>
                        <span className="stat-helper">Sets with at least one rating</span>
                      </div>
                    </div>

                    <div className="statistics-table-wrapper">
                      <table className="statistics-table">
                        <thead>
                          <tr>
                            <th>Flashcard Set</th>
                            <th>Total Ratings</th>
                            <th>Average Rating</th>
                            <th>Rating Distribution</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ratingStats.flashcard_stats.map((stat) => (
                            <tr key={stat.flashcard_id}>
                              <td>
                                <div className="stat-title">{stat.flashcard_title || stat.flashcard_id}</div>
                                <div className="stat-description">{stat.flashcard_id}</div>
                              </td>
                              <td>{stat.total_ratings}</td>
                              <td>{stat.average_rating ? `${stat.average_rating.toFixed(2)} ⭐` : '—'}</td>
                              <td>
                                <div className="rating-distribution">
                                  {[5, 4, 3, 2, 1].map(star => {
                                    const count = stat[`rating_${star}_count`] || 0;
                                    const percentage = stat.total_ratings > 0
                                      ? ((count / stat.total_ratings) * 100).toFixed(0)
                                      : 0;
                                    return (
                                      <div key={star} className="rating-bar-item">
                                        <span className="rating-star">{star}⭐</span>
                                        <div className="rating-bar-container">
                                          <div
                                            className="rating-bar-fill"
                                            style={{ width: `${percentage}%` }}
                                          />
                                        </div>
                                        <span className="rating-count">{count}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="no-data">No rating data available yet.</div>
                )}
              </div>
            </>
          ) : (
            <div className="loading">No catalog data available.</div>
          )}
        </div>
      ) : showUserManagement ? (
        <div className="user-management-view">
          <div className="user-management-header">
            <button onClick={handleHideUserManagement} className="back-to-list-button">
              Back to List
            </button>
            <h3>User Management</h3>
            <button onClick={fetchUsers} className="refresh-users-button" disabled={usersLoading}>
              {usersLoading ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>

          {usersError && (
            <div className="error-message">
              <p>Error: {usersError}</p>
            </div>
          )}

          {usersLoading && users.length === 0 ? (
            <div className="loading">Loading users...</div>
          ) : users.length > 0 ? (
            <>
              <div className="users-table-container">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Display Name</th>
                      <th>Admin Status</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user.id} className={user.is_admin ? 'admin-user' : ''}>
                        <td>{user.email}</td>
                        <td>
                          {editingDisplayName === user.id ? (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <input
                                type="text"
                                value={editedDisplayNameValue}
                                onChange={(e) => setEditedDisplayNameValue(e.target.value)}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  border: '1px solid #ccc',
                                  borderRadius: '4px',
                                  fontSize: '0.9rem'
                                }}
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveDisplayName(user.id)}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  backgroundColor: '#28a745',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem'
                                }}
                              >
                                Save
                              </button>
                              <button
                                onClick={handleCancelEditDisplayName}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  backgroundColor: '#6c757d',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem'
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <span>{user.display_name || '—'}</span>
                              <button
                                onClick={() => handleStartEditDisplayName(user.id, user.display_name)}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  backgroundColor: '#007bff',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem'
                                }}
                                title="Edit display name"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`admin-badge ${user.is_admin ? 'admin' : 'regular'}`}>
                            {user.is_admin ? 'Admin' : 'Regular'}
                          </span>
                        </td>
                        <td>{formatDate(user.created_at)}</td>
                        <td>
                          <div className="user-action-buttons">
                            <button
                              onClick={() => handleToggleAdminStatus(user.id, user.is_admin)}
                              className={`toggle-admin-btn ${user.is_admin ? 'revoke' : 'grant'}`}
                            >
                              {user.is_admin ? 'Revoke Admin' : 'Grant Admin'}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id, user.email)}
                              className="delete-user-btn"
                              disabled={user.email === 'ommiadmin@example.com' || user.email === 'ommiadmin@ommiquiz.de'}
                              title={(user.email === 'ommiadmin@example.com' || user.email === 'ommiadmin@ommiquiz.de') ? 'Cannot delete built-in admin user' : 'Delete this user'}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="user-stats">
                <p><strong>Total Users:</strong> {users.length}</p>
                <p><strong>Admins:</strong> {users.filter(u => u.is_admin).length}</p>
                <p><strong>Regular Users:</strong> {users.filter(u => !u.is_admin).length}</p>
              </div>
            </>
          ) : (
            <div className="no-users-message">
              <p>No users found</p>
            </div>
          )}
        </div>
      ) : showLoginHistory ? (
        <div className="login-history-view">
          <div className="login-history-header">
            <button onClick={handleHideLoginHistory} className="back-to-list-button">
              Back to List
            </button>
            <h3>Login History & User Activity</h3>
            <p style={{ fontSize: '0.9rem', color: '#6c757d', marginTop: '0.5rem' }}>
              Shows all login attempts (successful and failed)
            </p>
            <div className="history-controls">
              <select
                value={loginHistoryDays}
                onChange={(e) => {
                  setLoginHistoryDays(Number(e.target.value));
                }}
                className="history-period-select"
              >
                <option value={7}>Last 7 Days</option>
                <option value={30}>Last 30 Days</option>
                <option value={90}>Last 90 Days</option>
                <option value={365}>Last Year</option>
              </select>
              <button
                onClick={fetchLoginHistory}
                className="refresh-history-button"
                disabled={loginHistoryLoading}
              >
                {loginHistoryLoading ? 'Refreshing...' : '↻ Refresh'}
              </button>
              <button
                onClick={exportLoginHistoryToCSV}
                className="export-csv-button"
                disabled={!loginHistory || loginHistory.length === 0}
                title="Export to CSV"
              >
                📥 Export CSV
              </button>
            </div>
          </div>

          {loginHistoryError && (
            <div className="error-message">
              <p>Error: {loginHistoryError}</p>
            </div>
          )}

          {loginHistoryLoading && loginHistory.length === 0 ? (
            <div className="loading">Loading login history...</div>
          ) : loginHistory.length > 0 ? (
            <>
              <div className="login-history-table-container">
                <table className="login-history-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Email</th>
                      <th>Display Name</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>IP Address</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loginHistory.map(record => (
                      <tr key={record.log_id} className={`login-attempt ${record.login_type}`}>
                        <td>{formatDateTime(record.timestamp)}</td>
                        <td>{record.email}</td>
                        <td>{record.display_name || '—'}</td>
                        <td>
                          <span className={`admin-badge ${record.is_admin ? 'admin' : 'regular'}`}>
                            {record.is_admin ? 'Admin' : 'User'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${record.login_type}`}>
                            {record.login_type === 'success' && '✓ Success'}
                            {record.login_type === 'failed' && '✗ Failed'}
                          </span>
                        </td>
                        <td className="ip-address">{record.ip_address || '—'}</td>
                        <td className="error-details">
                          {record.error_message ? (
                            <span className="error-text" title={record.error_message}>
                              {record.error_message.length > 50
                                ? record.error_message.substring(0, 50) + '...'
                                : record.error_message}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="history-stats">
                <p><strong>Total Attempts:</strong> {loginHistory.length}</p>
                <p><strong>Successful:</strong> {loginHistory.filter(r => r.login_type === 'success').length}</p>
                <p><strong>Failed:</strong> {loginHistory.filter(r => r.login_type === 'failed').length}</p>
              </div>
            </>
          ) : (
            <div className="no-history-message">
              <p>No login history found for the selected period</p>
            </div>
          )}
        </div>
      ) : showUserActivity ? (
        <div className="user-activity-view">
          <div className="user-activity-header">
            <button onClick={handleHideUserActivity} className="back-to-list-button">
              Back to List
            </button>
            <h3>User Activity Statistics</h3>
            <div className="activity-controls">
              <select
                value={userActivityDays}
                onChange={(e) => {
                  setUserActivityDays(Number(e.target.value));
                }}
                className="activity-period-select"
              >
                <option value={7}>Last 7 Days</option>
                <option value={30}>Last 30 Days</option>
                <option value={90}>Last 90 Days</option>
                <option value={365}>Last Year</option>
              </select>
              <button
                onClick={fetchUserActivityStats}
                className="refresh-activity-button"
                disabled={userActivityLoading}
              >
                {userActivityLoading ? 'Refreshing...' : '↻ Refresh'}
              </button>
              <button
                onClick={exportUserActivityToCSV}
                className="export-csv-button"
                disabled={!userActivityStats || !userActivityStats.daily_stats}
                title="Export to CSV"
              >
                📥 Export CSV
              </button>
            </div>
          </div>

          {userActivityError && (
            <div className="error-message">
              <p>Error: {userActivityError}</p>
            </div>
          )}

          {userActivityLoading && !userActivityStats ? (
            <div className="loading">Loading activity data...</div>
          ) : userActivityStats ? (
            <>
              <div className="activity-summary">
                <div className="summary-stat">
                  <div className="stat-label">Average Daily Active Users</div>
                  <div className="stat-value">{userActivityStats.summary.avg_active_users}</div>
                </div>
                <div className="summary-stat">
                  <div className="stat-label">Peak Active Users</div>
                  <div className="stat-value">{userActivityStats.summary.max_active_users}</div>
                </div>
                <div className="summary-stat">
                  <div className="stat-label">Days with Activity</div>
                  <div className="stat-value">{userActivityStats.summary.days_with_activity} / {userActivityStats.period_days}</div>
                </div>
              </div>

              <div className="activity-chart-container">
                <h4>Daily Active Users</h4>
                <div className="activity-chart">
                  {userActivityStats.daily_stats.map((day, index) => {
                    const maxUsers = userActivityStats.summary.max_active_users || 1;
                    const height = (day.active_users / maxUsers) * 100;
                    const date = new Date(day.date);
                    const showLabel = userActivityDays <= 7 ||
                      (userActivityDays <= 30 && (date.getDate() === 1 || date.getDate() % 5 === 0)) ||
                      (userActivityDays > 30 && (date.getDate() === 1 || date.getDate() === 15));

                    return (
                      <div key={index} className="activity-bar-container">
                        <div
                          className="activity-bar"
                          style={{ height: `${height}%` }}
                          title={`${day.date}: ${day.active_users} active users`}
                        >
                          {day.active_users > 0 && (
                            <span className="bar-value">{day.active_users}</span>
                          )}
                        </div>
                        {showLabel && (
                          <div className="bar-label">
                            {userActivityDays <= 7
                              ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                              : date.getDate()
                            }
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="chart-y-label">Number of Users</div>
                <div className="chart-x-label">Days (from {userActivityStats.daily_stats[0]?.date} to {userActivityStats.daily_stats[userActivityStats.daily_stats.length - 1]?.date})</div>
              </div>
            </>
          ) : (
            <div className="no-activity-message">
              <p>No activity data found for the selected period</p>
            </div>
          )}
        </div>
      ) : !selectedFlashcard && !showYamlImport ? (
        <div className="flashcard-list-section">
          <div className="flashcard-list-header">
            <h3>Manage Flashcards</h3>
            <div className="action-buttons">
              <button onClick={createNewFlashcard} className="create-new-button">
                ➕ Create New Flashcard
              </button>
              <button onClick={createFromYaml} className="import-yaml-button">
                📋 Import from YAML
              </button>
            </div>
          </div>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <>
              <h4>Edit Existing Flashcards</h4>
              <div className="admin-flashcard-list">
                {flashcards.map((flashcard) => {
                  const recentlyUpdated = isRecentlyUpdated(flashcard.modified_time);
                  return (
                    <div
                      key={flashcard.id}
                      className={`admin-flashcard-item ${recentlyUpdated ? 'recently-updated' : ''}`}
                      onClick={() => fetchFlashcard(flashcard.id)}
                    >
                      <span className="flashcard-icon">📝</span>
                      <div className="flashcard-details">
                        <span className="flashcard-title">
                          {flashcard.title || flashcard.id}
                          {recentlyUpdated && <span className="new-badge">NEW</span>}
                        </span>
                        {flashcard.description && (
                          <span className="flashcard-description">{flashcard.description}</span>
                        )}
                        <span className="flashcard-meta">
                          ID: {flashcard.id} | Author: {flashcard.author || 'Unknown'}
                          {flashcard.modified_time && (
                            <> | Last Updated: {formatDate(flashcard.modified_time)}</>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : showYamlImport ? (
        <div className="yaml-import-section">
          <div className="yaml-import-header">
            <button onClick={cancelYamlImport} className="back-to-list-button">
              Back to List
            </button>
            <h3>Import Flashcard from YAML</h3>
            <button onClick={parseYamlInput} className="parse-yaml-button">
              Parse YAML
            </button>
          </div>

          <div className="yaml-import-content">
            <div className="yaml-instructions">
              <h4>Instructions:</h4>
              <p>Paste your complete YAML flashcard content below. The YAML should include:</p>
              <ul>
                <li><strong>id:</strong> Unique identifier for the flashcard set</li>
                <li><strong>title:</strong> Display name for the flashcard set</li>
                <li><strong>author:</strong> Author name</li>
                <li><strong>description:</strong> Brief description (optional)</li>
                <li><strong>flashcards:</strong> Array of question/answer pairs</li>
              </ul>
            </div>

            {yamlParseError && (
              <div className="error-message">
                <p>Parse Error: {yamlParseError}</p>
              </div>
            )}

            <div className="yaml-input-section">
              <label>YAML Content:</label>
              <textarea
                value={yamlInput}
                onChange={(e) => setYamlInput(e.target.value)}
                placeholder={`Example:
id: my-flashcard-set
author: Your Name
title: My Flashcard Set
description: A collection of learning cards
createDate: 2025-11-12
language: en
level: beginner
topics:
  - topic1
  - topic2
keywords: []

flashcards:
  - question: "What is the capital of France?"
    answer: "Paris"
    type: single
    
  - question: "Name three primary colors"
    answers:
      - "Red"
      - "Blue"
      - "Yellow"
    type: multiple`}
                rows="20"
                className="yaml-textarea"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="editor-section">
          <div className="editor-header">
            <button
              onClick={cancelEdit}
              className="back-to-list-button"
            >
              Back to List
            </button>
            <h3>
              {isCreatingNew ? 'Creating New Flashcard' : `Editing: ${selectedFlashcard.id}`}
            </h3>
            <div className="header-buttons">
              <button
                onClick={editMode === 'form' ? switchToYamlMode : switchToFormMode}
                className="toggle-edit-mode-button"
                title={editMode === 'form' ? 'Switch to YAML editor' : 'Switch to form editor'}
              >
                {editMode === 'form' ? '📝 Edit YAML text' : '📋 Edit Flashcardset'}
              </button>
              <button
                onClick={saveFlashcard}
                disabled={saving}
                className="update-yaml-button"
              >
                {saving ? '🔄 Updating...' : (isCreatingNew ? '📝 Create Flashcard' : (editMode === 'yaml' ? '📝 Update YAML text' : '📝 Update Flashcardset'))}
              </button>
              {!isCreatingNew && (
                <button
                  onClick={handleDeleteClick}
                  className="delete-flashcard-button"
                >
                  🗑️ Delete Flashcardset
                </button>
              )}
              <button
                onClick={() => exportFlashcard()}
                className="export-button"
              >
                📤 Export YAML text
              </button>
            </div>
          </div>

          {editingFlashcard && editMode === 'yaml' && (
            <div className="yaml-editor">
              <div className="yaml-editor-header">
                <h4>YAML Editor</h4>
                <small>Edit the raw YAML content directly. Click "Edit Flashcardset" to return to the form view.</small>
              </div>
              <textarea
                value={yamlEditText}
                onChange={(e) => setYamlEditText(e.target.value)}
                className="yaml-editor-textarea"
                spellCheck="false"
                placeholder="Paste your YAML content here..."
              />
            </div>
          )}

          {editingFlashcard && editMode === 'form' && (
            <div className="editor-form">
              <div className="metadata-section">
                <h4>Metadata</h4>
                <div className="form-row">
                  <label>ID: <span className="required">*</span></label>
                  <input
                    type="text"
                    value={editingFlashcard.id}
                    onChange={(e) => updateFlashcardField('id', e.target.value)}
                    pattern="^[a-zA-Z0-9_\-]+$"
                    placeholder="e.g. my-flashcard-set"
                    disabled={!isCreatingNew}
                  />
                  {isCreatingNew && (
                    <small>ID cannot be changed after creation. Use only letters, numbers, hyphens, and underscores.</small>
                  )}
                </div>
                <div className="form-row">
                  <label>Title: <span className="required">*</span></label>
                  <input
                    type="text"
                    value={editingFlashcard.title}
                    onChange={(e) => updateFlashcardField('title', e.target.value)}
                    placeholder="e.g. My Awesome Flashcards"
                  />
                </div>
                <div className="form-row">
                  <label>Author: <span className="required">*</span></label>
                  <input
                    type="text"
                    value={editingFlashcard.author}
                    onChange={(e) => updateFlashcardField('author', e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="form-row">
                  <label>Description:</label>
                  <textarea
                    value={editingFlashcard.description}
                    onChange={(e) => updateFlashcardField('description', e.target.value)}
                    rows="3"
                  />
                </div>
                <div className="form-row">
                  <label>Language:</label>
                  <select
                    value={editingFlashcard.language}
                    onChange={(e) => updateFlashcardField('language', e.target.value)}
                  >
                    <option value="en">English</option>
                    <option value="de">German</option>
                    <option value="fr">French</option>
                    <option value="es">Spanish</option>
                    <option value="it">Italian</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>Module:</label>
                  <input
                    type="text"
                    value={editingFlashcard.module || ''}
                    onChange={(e) => updateFlashcardField('module', e.target.value)}
                    placeholder="e.g. Databases, Frontend Development"
                  />
                </div>
                <div className="form-row">
                  <label>Semester:</label>
                  <input
                    type="text"
                    value={editingFlashcard.semester || ''}
                    onChange={(e) => updateFlashcardField('semester', e.target.value)}
                    placeholder="e.g. WS 2025/26"
                  />
                </div>
                <div className="form-row">
                  <label>Institution:</label>
                  <input
                    type="text"
                    value={editingFlashcard.institution || ''}
                    onChange={(e) => updateFlashcardField('institution', e.target.value)}
                    placeholder="e.g. HS Emden Leer"
                  />
                </div>
                <div className="form-row">
                  <label>Study Course:</label>
                  <input
                    type="text"
                    value={editingFlashcard.studycourse || ''}
                    onChange={(e) => updateFlashcardField('studycourse', e.target.value)}
                    placeholder="e.g. Medieninformatik Master"
                  />
                </div>
                <div className="form-row">
                  <label>Topics (comma-separated):</label>
                  <input
                    type="text"
                    value={topicsInput}
                    onChange={handleTopicsChange}
                    onBlur={handleTopicsBlur}
                    placeholder="e.g. programming, web development, javascript"
                  />
                  <small>Separate multiple topics with commas. Example: programming, web development, javascript</small>
                </div>
                <div className="form-row">
                  <label>Keywords (comma-separated):</label>
                  <input
                    type="text"
                    value={keywordsInput}
                    onChange={handleKeywordsChange}
                    onBlur={handleKeywordsBlur}
                    placeholder="e.g. html, css, react, frontend"
                  />
                  <small>Separate multiple keywords with commas. Example: html, css, react, frontend</small>
                </div>
              </div>

              <div className="cards-section">
                <div className="cards-header">
                  <h4>Flashcards ({editingFlashcard.flashcards.length})</h4>
                  <button onClick={addNewCard} className="add-card-button">
                    + Add Card
                  </button>
                </div>

                {editingFlashcard.flashcards.map((card, cardIndex) => (
                  <div key={cardIndex} className="card-editor">
                    <div className="card-header">
                      <span>Card {cardIndex + 1}</span>
                      <div className="card-controls">
                        <button
                          onClick={() => moveCardUp(cardIndex)}
                          disabled={cardIndex === 0}
                          className="move-card-button"
                          title="Move card up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveCardDown(cardIndex)}
                          disabled={cardIndex === editingFlashcard.flashcards.length - 1}
                          className="move-card-button"
                          title="Move card down"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => deleteCard(cardIndex)}
                          className="delete-card-button"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>

                    <div className="form-row">
                      <label>Card ID:</label>
                      <input
                        type="text"
                        value={card.id || ''}
                        onChange={(e) => updateCardField(cardIndex, 'id', e.target.value)}
                        placeholder="e.g., abc001"
                      />
                      <small>Unique identifier for this card (auto-generated if empty)</small>
                    </div>

                    <div className="form-row">
                      <label>Question:</label>
                      <textarea
                        value={card.question}
                        onChange={(e) => updateCardField(cardIndex, 'question', e.target.value)}
                        rows="2"
                      />
                    </div>

                    <div className="form-row">
                      <label>Image (optional):</label>

                      {card.type === 'single' ? (
                        <>
                          <input
                            type="url"
                            value={card.bitmap || ''}
                            onChange={(e) => updateCardField(cardIndex, 'bitmap', e.target.value)}
                            placeholder="https://your-bucket.s3.amazonaws.com/image.png"
                            style={{ padding: '0.5rem', fontSize: '1rem', width: '100%' }}
                          />
                          <small>
                            Paste an HTTPS URL to an image from S3 or other source.
                            Alternatively, use base64 data or data URI.
                          </small>
                        </>
                      ) : (
                        <>
                          <textarea
                            value={card.bitmap || ''}
                            onChange={(e) => updateCardField(cardIndex, 'bitmap', e.target.value)}
                            rows="3"
                            placeholder="Paste base64-encoded image data or a data URI"
                          />
                          <small>
                            Attach an image to the question. Provide base64 data (optionally prefixed with a data URI).
                          </small>
                        </>
                      )}
                    </div>

                    <div className="form-row">
                      <label>Type:</label>
                      <select
                        value={card.type}
                        onChange={(e) => {
                          const newType = e.target.value;
                          if (newType === 'single') {
                            updateCardField(cardIndex, 'type', newType);
                            updateCardField(cardIndex, 'answer', card.answers ? card.answers[0] || '' : '');
                            updateCardField(cardIndex, 'answers', undefined);
                          } else {
                            updateCardField(cardIndex, 'type', newType);
                            updateCardField(cardIndex, 'answers', card.answer ? [card.answer] : ['']);
                            updateCardField(cardIndex, 'correctAnswers', card.answer ? [false] : [false]);
                            updateCardField(cardIndex, 'answer', undefined);
                          }
                        }}
                      >
                        <option value="single">Single Answer</option>
                        <option value="multiple">Multiple Answers</option>
                      </select>
                    </div>

                    {card.type === 'single' ? (
                      <div className="form-row">
                        <label>Answer:</label>
                        <textarea
                          value={card.answer || ''}
                          onChange={(e) => updateCardField(cardIndex, 'answer', e.target.value)}
                          rows="2"
                        />
                      </div>
                    ) : (
                      <div className="answers-section">
                        <div className="answers-header">
                          <label>Answers:</label>
                          <button
                            onClick={() => addAnswer(cardIndex)}
                            className="add-answer-button"
                          >
                            + Add Answer
                          </button>
                        </div>
                        {card.answers && card.answers.map((answer, answerIndex) => (
                          <div key={answerIndex} className="answer-row">
                            <input
                              type="text"
                              value={answer}
                              onChange={(e) => updateAnswer(cardIndex, answerIndex, e.target.value)}
                              placeholder={`Answer ${answerIndex + 1}`}
                              className="answer-input"
                            />
                            <label className="correct-answer-checkbox">
                              <input
                                type="checkbox"
                                checked={card.correctAnswers && card.correctAnswers[answerIndex]}
                                onChange={(e) => updateCorrectAnswer(cardIndex, answerIndex, e.target.checked)}
                              />
                              <span>Correct</span>
                            </label>
                            <button
                              onClick={() => deleteAnswer(cardIndex, answerIndex)}
                              className="delete-answer-button"
                            >
                              🗑️
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Add Card button at the end */}
                <div className="add-card-footer">
                  <button onClick={addNewCard} className="add-card-button">
                    + Add Card
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {showConfirmDialog && (
        <div className="confirm-dialog">
          <div className="confirm-dialog-content">
            <h4>Confirm Overwrite</h4>
            <p>A flashcard with the same ID already exists. Do you want to overwrite it?</p>
            <div className="confirm-dialog-buttons">
              <button onClick={handleConfirmOverwrite} className="confirm-button">Yes, Overwrite</button>
              <button onClick={handleCancelOverwrite} className="cancel-button">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {showDeleteDialog && (
        <div className="confirm-dialog">
          <div className="confirm-dialog-content">
            <h4>Delete Flashcardset</h4>
            <div className="delete-id-display">
              <span className="delete-id-label">Flashcard ID:</span>
              <code className="delete-id-value">{selectedFlashcard?.id || 'Unknown'}</code>
            </div>
            <p>
              Deleting flashcards requires confirming their ID. To continue,
              type <strong>{selectedFlashcard?.id}</strong> exactly as shown below.
              This action cannot be undone.
            </p>
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => {
                setDeleteConfirmation(e.target.value);
                setDeleteError(null);
              }}
              className="delete-confirmation-input"
              placeholder="Enter flashcard ID to confirm"
            />
            {deleteError && (
              <div className="delete-error">{deleteError}</div>
            )}
            <div className="confirm-dialog-buttons">
              <button
                onClick={handleConfirmDelete}
                className="confirm-button"
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button
                onClick={handleCancelDelete}
                className="cancel-button"
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;