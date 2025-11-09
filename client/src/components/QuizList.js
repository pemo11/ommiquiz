import React, { useState, useEffect } from 'react';
import './QuizList.css';

function QuizList({ onSelectQuiz }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const response = await fetch('/api/quiz/list');
      if (!response.ok) {
        throw new Error('Failed to fetch quizzes');
      }
      const data = await response.json();
      setQuizzes(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="quiz-list-container"><p>Loading quizzes...</p></div>;
  }

  if (error) {
    return <div className="quiz-list-container"><p className="error">Error: {error}</p></div>;
  }

  return (
    <div className="quiz-list-container">
      <h2>Available Quizzes</h2>
      {quizzes.length === 0 ? (
        <p>No quizzes available yet.</p>
      ) : (
        <div className="quiz-grid">
          {quizzes.map((quiz) => (
            <div key={quiz} className="quiz-card" onClick={() => onSelectQuiz(quiz)}>
              <h3>{quiz}</h3>
              <button>Start Quiz</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default QuizList;
