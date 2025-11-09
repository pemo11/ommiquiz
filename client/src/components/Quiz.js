import React, { useState, useEffect } from 'react';
import './Quiz.css';

function Quiz({ quizName, onBack }) {
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const loadQuiz = async () => {
      try {
        const response = await fetch(`/api/quiz/${quizName}`);
        if (!response.ok) {
          throw new Error('Failed to fetch quiz');
        }
        const data = await response.json();
        setQuiz(data);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };
    
    loadQuiz();
  }, [quizName]);

  const handleAnswerSubmit = async () => {
    if (selectedAnswer === null) return;

    const question = quiz.questions[currentQuestion];
    
    try {
      const response = await fetch('/api/quiz/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quiz_name: quizName,
          question_id: question.id,
          answer: selectedAnswer,
        }),
      });

      const result = await response.json();
      
      if (result.is_correct) {
        setScore(score + 1);
        setFeedback({ type: 'correct', message: 'Correct!' });
      } else {
        setFeedback({ 
          type: 'incorrect', 
          message: `Incorrect. The correct answer was: ${question.options[result.correct_answer]}`
        });
      }

      // Move to next question after 2 seconds
      setTimeout(() => {
        if (currentQuestion < quiz.questions.length - 1) {
          setCurrentQuestion(currentQuestion + 1);
          setSelectedAnswer(null);
          setFeedback(null);
        } else {
          setShowResult(true);
        }
      }, 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  const restartQuiz = () => {
    setCurrentQuestion(0);
    setSelectedAnswer(null);
    setScore(0);
    setShowResult(false);
    setFeedback(null);
  };

  if (loading) {
    return <div className="quiz-container"><p>Loading quiz...</p></div>;
  }

  if (error) {
    return (
      <div className="quiz-container">
        <p className="error">Error: {error}</p>
        <button onClick={onBack}>Back to Quiz List</button>
      </div>
    );
  }

  if (showResult) {
    return (
      <div className="quiz-container">
        <div className="result-container">
          <h2>Quiz Complete!</h2>
          <p className="score">Your score: {score} / {quiz.questions.length}</p>
          <p className="percentage">
            {Math.round((score / quiz.questions.length) * 100)}%
          </p>
          <div className="result-buttons">
            <button onClick={restartQuiz}>Restart Quiz</button>
            <button onClick={onBack}>Back to Quiz List</button>
          </div>
        </div>
      </div>
    );
  }

  const question = quiz.questions[currentQuestion];

  return (
    <div className="quiz-container">
      <div className="quiz-header">
        <h2>{quiz.title}</h2>
        <p className="quiz-description">{quiz.description}</p>
        <button className="back-button" onClick={onBack}>← Back</button>
      </div>
      
      <div className="progress">
        Question {currentQuestion + 1} of {quiz.questions.length}
      </div>

      <div className="question-container">
        <h3>{question.text}</h3>
        
        <div className="options">
          {question.options.map((option, index) => (
            <div
              key={index}
              className={`option ${selectedAnswer === index ? 'selected' : ''} ${
                feedback && index === selectedAnswer 
                  ? feedback.type === 'correct' ? 'correct' : 'incorrect'
                  : ''
              }`}
              onClick={() => !feedback && setSelectedAnswer(index)}
            >
              {option}
            </div>
          ))}
        </div>

        {feedback && (
          <div className={`feedback ${feedback.type}`}>
            {feedback.message}
          </div>
        )}

        {!feedback && (
          <button 
            className="submit-button"
            onClick={handleAnswerSubmit}
            disabled={selectedAnswer === null}
          >
            Submit Answer
          </button>
        )}
      </div>
    </div>
  );
}

export default Quiz;
