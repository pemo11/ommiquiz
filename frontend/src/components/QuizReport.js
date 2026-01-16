import React, { useState, useEffect } from 'react';
import './QuizReport.css';

// Use the environment variable first, with proper fallback for development
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
  const [selectedDays, setSelectedDays] = useState(30);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [selectedDays]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_URL}/users/me/learning-report?days=${selectedDays}`, {
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
      setDownloading(true);
      setError(null);

      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_URL}/users/me/quiz-history-pdf?days=${selectedDays}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to download PDF: ${response.status} - ${errorText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().split('T')[0];
      a.download = `quiz-history-${today}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading PDF:', err);
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '—';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const getBoxBadgeClass = (boxNumber) => {
    if (boxNumber === 1) return 'box-badge box-green';
    if (boxNumber === 2) return 'box-badge box-yellow';
    if (boxNumber === 3) return 'box-badge box-red';
    return 'box-badge';
  };

  // Process timeline data: group sessions by day
  const processTimelineData = () => {
    if (!reportData || !reportData.sessions) return [];

    // Group sessions by date
    const dailyData = {};

    reportData.sessions.forEach(session => {
      const date = new Date(session.completed_at);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!dailyData[dateKey]) {
        dailyData[dateKey] = {
          date: dateKey,
          sessions: 0,
          cardsReviewed: 0,
          box1: 0,
          box2: 0,
          box3: 0,
          totalDuration: 0
        };
      }

      dailyData[dateKey].sessions += 1;
      dailyData[dateKey].cardsReviewed += session.cards_reviewed;
      dailyData[dateKey].box1 += session.box1_count;
      dailyData[dateKey].box2 += session.box2_count;
      dailyData[dateKey].box3 += session.box3_count;
      dailyData[dateKey].totalDuration += session.duration_seconds || 0;
    });

    // Fill in missing days with zeros
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - selectedDays + 1);
    const timelineData = [];

    for (let i = 0; i < selectedDays; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];

      timelineData.push(
        dailyData[dateKey] || {
          date: dateKey,
          sessions: 0,
          cardsReviewed: 0,
          box1: 0,
          box2: 0,
          box3: 0,
          totalDuration: 0
        }
      );
    }

    return timelineData;
  };

  const timelineData = processTimelineData();
  const maxCardsInDay = Math.max(...timelineData.map(d => d.cardsReviewed), 1);

  const formatTimelineDate = (dateString) => {
    const date = new Date(dateString);
    if (selectedDays <= 7) {
      // Show full date for week view
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else if (selectedDays <= 31) {
      // Show day of month for month view
      return date.getDate();
    } else {
      // Show month for longer periods
      const day = date.getDate();
      if (day === 1 || day === 15) {
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
      return '';
    }
  };

  return (
    <div className="quiz-report">
      <div className="report-header">
        <button onClick={onBack} className="back-button">Back to Quiz</button>
        <h2>📊 Quiz History Report</h2>
      </div>

      <div className="report-controls">
        <div className="period-selector">
          <label>Time Period:</label>
          <div className="period-buttons">
            <button
              className={selectedDays === 7 ? 'active' : ''}
              onClick={() => setSelectedDays(7)}
            >
              Last 7 Days
            </button>
            <button
              className={selectedDays === 30 ? 'active' : ''}
              onClick={() => setSelectedDays(30)}
            >
              Last 30 Days
            </button>
            <button
              className={selectedDays === 90 ? 'active' : ''}
              onClick={() => setSelectedDays(90)}
            >
              Last 90 Days
            </button>
            <button
              className={selectedDays === 365 ? 'active' : ''}
              onClick={() => setSelectedDays(365)}
            >
              Last Year
            </button>
          </div>
        </div>

        <button
          onClick={handleDownloadPDF}
          disabled={downloading || !reportData}
          className="download-pdf-button"
        >
          {downloading ? '⏳ Generating PDF...' : '📥 Download PDF'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          <p>Error: {error}</p>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading report...</div>
      ) : reportData ? (
        <>
          <div className="summary-cards">
            <div className="summary-card">
              <div className="card-label">Total Sessions</div>
              <div className="card-value">{reportData.summary.total_sessions}</div>
              <div className="card-helper">Quiz sessions completed</div>
            </div>

            <div className="summary-card">
              <div className="card-label">Cards Reviewed</div>
              <div className="card-value">{reportData.summary.total_cards_reviewed}</div>
              <div className="card-helper">Total flashcards studied</div>
            </div>

            <div className="summary-card">
              <div className="card-label">Total Time</div>
              <div className="card-value">{formatDuration(reportData.summary.total_duration_seconds)}</div>
              <div className="card-helper">Time spent learning</div>
            </div>

            <div className="summary-card">
              <div className="card-label">Mastered Cards</div>
              <div className="card-value">{reportData.summary.total_learned}</div>
              <div className="card-helper">Box 1 - Well learned</div>
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="activity-timeline">
            <h3>Activity Timeline</h3>
            <div className="timeline-subtitle">
              Cards reviewed over the past {selectedDays} days
            </div>
            <div className="timeline-chart">
              <div className="timeline-bars">
                {timelineData.map((day, index) => {
                  const heightPercent = maxCardsInDay > 0 ? (day.cardsReviewed / maxCardsInDay) * 100 : 0;
                  const hasActivity = day.sessions > 0;

                  return (
                    <div key={index} className="timeline-bar-container">
                      <div
                        className={`timeline-bar ${hasActivity ? 'has-activity' : ''}`}
                        style={{ height: `${Math.max(heightPercent, hasActivity ? 5 : 0)}%` }}
                        title={`${day.date}\n${day.sessions} session(s)\n${day.cardsReviewed} card(s)\nBox 1: ${day.box1} | Box 2: ${day.box2} | Box 3: ${day.box3}`}
                      >
                        {hasActivity && day.cardsReviewed > 0 && (
                          <span className="bar-value">{day.cardsReviewed}</span>
                        )}
                      </div>
                      <div className="timeline-date">
                        {formatTimelineDate(day.date)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="timeline-legend">
                <div className="legend-item">
                  <div className="legend-color timeline-active"></div>
                  <span>Active days</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color timeline-inactive"></div>
                  <span>Inactive days</span>
                </div>
              </div>
            </div>
          </div>

          <div className="box-distribution">
            <h3>Learning Progress Distribution</h3>
            <div className="box-stats">
              <div className="box-stat box-stat-red">
                <span className="box-label">Box 3 - Needs Review</span>
                <span className="box-count">{reportData.summary.total_not_learned}</span>
              </div>
              <div className="box-stat box-stat-yellow">
                <span className="box-label">Box 2 - Learning</span>
                <span className="box-count">{reportData.summary.total_uncertain}</span>
              </div>
              <div className="box-stat box-stat-green">
                <span className="box-label">Box 1 - Mastered</span>
                <span className="box-count">{reportData.summary.total_learned}</span>
              </div>
            </div>
          </div>

          {reportData.sessions && reportData.sessions.length > 0 ? (
            <div className="sessions-section">
              <h3>Session History</h3>
              <div className="sessions-table-wrapper">
                <table className="sessions-table">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Flashcard Set</th>
                      <th>Cards</th>
                      <th>Box 1</th>
                      <th>Box 2</th>
                      <th>Box 3</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.sessions.map((session) => (
                      <tr key={session.id}>
                        <td>{formatDate(session.completed_at)}</td>
                        <td className="session-title">{session.flashcard_title || session.flashcard_id}</td>
                        <td>{session.cards_reviewed}</td>
                        <td>
                          <span className={getBoxBadgeClass(1)}>{session.box1_count}</span>
                        </td>
                        <td>
                          <span className={getBoxBadgeClass(2)}>{session.box2_count}</span>
                        </td>
                        <td>
                          <span className={getBoxBadgeClass(3)}>{session.box3_count}</span>
                        </td>
                        <td>{formatDuration(session.duration_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="no-sessions">
              <p>No quiz sessions found for the selected period.</p>
              <p>Start learning to see your progress here!</p>
            </div>
          )}
        </>
      ) : (
        <div className="no-data">No report data available.</div>
      )}
    </div>
  );
}

export default QuizReport;
