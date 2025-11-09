from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
import yaml
import os
from pathlib import Path

router = APIRouter()

# Directory for storing quiz YAML files
QUIZ_DIR = Path(__file__).parent.parent.parent / "quizzes"

@router.get("/list")
async def list_quizzes() -> List[str]:
    """List all available quizzes"""
    if not QUIZ_DIR.exists():
        return []
    
    quizzes = [f.stem for f in QUIZ_DIR.glob("*.yaml")]
    return quizzes

@router.get("/{quiz_name}")
async def get_quiz(quiz_name: str) -> Dict[str, Any]:
    """Get a specific quiz by name"""
    quiz_path = QUIZ_DIR / f"{quiz_name}.yaml"
    
    if not quiz_path.exists():
        raise HTTPException(status_code=404, detail=f"Quiz '{quiz_name}' not found")
    
    try:
        with open(quiz_path, 'r') as f:
            quiz_data = yaml.safe_load(f)
        return quiz_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading quiz: {str(e)}")

@router.post("/validate")
async def validate_answer(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate an answer for a quiz question"""
    quiz_name = data.get("quiz_name")
    question_id = data.get("question_id")
    answer = data.get("answer")
    
    if not all([quiz_name, question_id, answer is not None]):
        raise HTTPException(status_code=400, detail="Missing required fields")
    
    # Load the quiz
    quiz_path = QUIZ_DIR / f"{quiz_name}.yaml"
    if not quiz_path.exists():
        raise HTTPException(status_code=404, detail=f"Quiz '{quiz_name}' not found")
    
    try:
        with open(quiz_path, 'r') as f:
            quiz_data = yaml.safe_load(f)
        
        # Find the question
        questions = quiz_data.get("questions", [])
        question = next((q for q in questions if q.get("id") == question_id), None)
        
        if not question:
            raise HTTPException(status_code=404, detail=f"Question '{question_id}' not found")
        
        correct_answer = question.get("correct_answer")
        is_correct = answer == correct_answer
        
        return {
            "is_correct": is_correct,
            "correct_answer": correct_answer if not is_correct else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error validating answer: {str(e)}")
