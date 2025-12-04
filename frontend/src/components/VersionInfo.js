import React, { useState, useEffect } from 'react';
import './VersionInfo.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

function VersionInfo() {
  const [backendVersion, setBackendVersion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBackendVersion();
  }, []);

  const fetchBackendVersion = async () => {
    try {
      const response = await fetch(`${API_URL}/version`);
      if (!response.ok) {
        throw new Error('Failed to fetch backend version');
      }
      const data = await response.json();
      setBackendVersion(data.api_version);
      setError(null);
    } catch (err) {
      setError('Unable to fetch backend version');
    } finally {
      setLoading(false);
    }
  };

  // Get frontend version from package.json
  const frontendVersion = process.env.REACT_APP_VERSION || '1.0.2';

  return (
    <div className="version-info">
      <div className="version-item">
        <span className="version-label">Frontend:</span>
        <span className="version-value">v{frontendVersion}</span>
      </div>
      <div className="version-item">
        <span className="version-label">Backend:</span>
        {loading ? (
          <span className="version-value loading">...</span>
        ) : error ? (
          <span className="version-value error">Error</span>
        ) : (
          <span className="version-value">v{backendVersion}</span>
        )}
      </div>
    </div>
  );
}

export default VersionInfo;