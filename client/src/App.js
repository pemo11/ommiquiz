import React, { useState } from 'react';
import './App.css';
import QuizList from './components/QuizList';
import Quiz from './components/Quiz';

function App() {
  const [selectedQuiz, setSelectedQuiz] = useState(null);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Ommiquiz</h1>
        <p>A simple quiz application</p>
      </header>
      <main className="App-main">
        {!selectedQuiz ? (
          <QuizList onSelectQuiz={setSelectedQuiz} />
        ) : (
          <Quiz quizName={selectedQuiz} onBack={() => setSelectedQuiz(null)} />
        )}
      </main>
    </div>
  );
}

export default App;
