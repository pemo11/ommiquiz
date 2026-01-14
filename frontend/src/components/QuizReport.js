import React, { useState, useEffect } from 'react';
import './QuizReport.css';

// API URL helper (same as AdminPanel)
const getApiUrl = () => {
  if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  const hostname = window.location.hostname;
  const baseUrl = hostname === 'localhost' ? 'localhost' : hostname;
  const protocol = hostname === 'localhost' ? 'http' : window.location.protocol.replace(':', '');
  const port = hostname === 'localhost' ? ':8080' : '';
  return `${protocol}://${baseUrl}${port}/api`;
};

const API_URL = getApiUrl();

function QuizReport({ onBack }) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchReportData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_URL}/users/me/learning-report?days=${days}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch report: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      setReportData(data);
    } catch (err) {
      console.error('Error fetching report:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_URL}/users/me/quiz-history-pdf?days=${days}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to generate PDF: ${response.status} - ${errorText}`);
      }

      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz-history-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading PDF:', err);
      setError(err.message);
    }
  };

  const handleDownloadJSON = () => {
    try {
      if (!reportData) {
        throw new Error('No report data available');
      }

      // Create a formatted JSON string
      const jsonString = JSON.stringify(reportData, null, 2);

      // Create blob and download
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz-statistics-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading JSON:', err);
      setError(err.message);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}m ${secs}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString();
    } catch {
      return 'N/A';
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'N/A';
    }
  };

  const calculateScore = (box1, box2, box3) => {
    const total = box1 + box2 + box3;
    if (total === 0) return '0%';
    const percentage = Math.round((box1 / total) * 100);
    return `${box1}/${total} (${percentage}%)`;
  };

  return (
    <div className="quiz-report">
      <div className="report-header">
        <button onClick={onBack} className="back-button">Back to Quiz</button>
        <h2>📊 Quiz History Report</h2>
        <div className="report-actions">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="days-filter"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
          <button
            onClick={handleDownloadPDF}
            className="download-pdf-button"
            disabled={loading || !reportData}
          >
            📥 Download PDF
          </button>
          <button
            onClick={handleDownloadJSON}
            className="download-json-button"
            disabled={loading || !reportData}
          >
            💾 Download JSON
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>Error: {error}</p>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading report...</div>
      ) : reportData ? (
        <div className="report-content">
          {/* Summary Statistics */}
          <div className="summary-section">
            <h3>Summary Statistics</h3>
            <div className="summary-cards">
              <div className="summary-card">
                <span className="summary-label">Total Sessions</span>
                <span className="summary-value">{reportData.summary.total_sessions}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Cards Reviewed</span>
                <span className="summary-value">{reportData.summary.total_cards_reviewed}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Cards Learned</span>
                <span className="summary-value">
                  {reportData.summary.total_learned}
                  <span className="summary-percentage">
                    ({reportData.summary.total_cards_reviewed > 0
                      ? Math.round((reportData.summary.total_learned / reportData.summary.total_cards_reviewed) * 100)
                      : 0}%)
                  </span>
                </span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Total Study Time</span>
                <span className="summary-value">
                  {formatDuration(reportData.summary.total_duration_seconds)}
                </span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Avg. Session</span>
                <span className="summary-value">
                  {formatDuration(Math.round(reportData.summary.average_session_duration))}
                </span>
              </div>
              {reportData.summary.average_time_to_flip_seconds && (
                <div className="summary-card">
                  <span className="summary-label">Avg. Think Time</span>
                  <span className="summary-value">
                    {reportData.summary.average_time_to_flip_seconds.toFixed(1)}s
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Session History */}
          <div className="sessions-section">
            <h3>Session History ({reportData.sessions.length} sessions)</h3>

            {reportData.sessions.length === 0 ? (
              <div className="no-sessions">
                <p>No quiz sessions found in this period.</p>
                <p>Complete some quizzes to see your history here!</p>
              </div>
            ) : (
              <div className="sessions-table-wrapper">
                <table className="sessions-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Flashcard Set</th>
                      <th>Cards Reviewed</th>
                      <th>Box Distribution</th>
                      <th>Score</th>
                      <th>Duration</th>
                      <th>Avg. Think</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.sessions.map((session, index) => (
                      <tr key={session.id || index}>
                        <td>{formatDate(session.completed_at)}</td>
                        <td>{formatTime(session.completed_at)}</td>
                        <td className="session-title">{session.flashcard_title || 'Unknown'}</td>
                        <td className="centered">{session.cards_reviewed}</td>
                        <td className="box-distribution">
                          <span className="box-badge box1" title="Learned">
                            {session.box1_count}
                          </span>
                          <span className="box-badge box2" title="Uncertain">
                            {session.box2_count}
                          </span>
                          <span className="box-badge box3" title="Not Learned">
                            {session.box3_count}
                          </span>
                        </td>
                        <td className="centered">
                          {calculateScore(session.box1_count, session.box2_count, session.box3_count)}
                        </td>
                        <td className="centered">
                          {formatDuration(session.duration_seconds)}
                        </td>
                        <td className="centered">
                          {session.average_time_to_flip_seconds
                            ? `${session.average_time_to_flip_seconds.toFixed(1)}s`
                            : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="no-data">
          <p>No report data available</p>
        </div>
      )}
    </div>
  );
}

export default QuizReport;
