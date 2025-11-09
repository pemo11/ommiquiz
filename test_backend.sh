#!/bin/bash

# Ommiquiz Test Script
# This script tests the FastAPI backend locally

echo "Testing Ommiquiz Backend..."
echo "=========================================="

# Check Python version
echo -e "\n1. Checking Python version..."
python3 --version

# Install dependencies
echo -e "\n2. Installing dependencies..."
cd backend
pip install -r requirements.txt --quiet
cd ..

# Start backend server in background
echo -e "\n3. Starting backend server..."
cd backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
SERVER_PID=$!
cd ..

# Wait for server to start
echo "Waiting for server to start..."
sleep 5

# Test endpoints
echo -e "\n4. Testing API endpoints..."

echo -e "\nTesting root endpoint..."
curl -s http://localhost:8000/ | python3 -m json.tool

echo -e "\nTesting flashcards list..."
curl -s http://localhost:8000/flashcards | python3 -m json.tool

echo -e "\nTesting python-basics flashcard..."
curl -s http://localhost:8000/flashcards/python-basics | python3 -m json.tool | head -20

echo -e "\nTesting javascript-basics flashcard..."
curl -s http://localhost:8000/flashcards/javascript-basics | python3 -m json.tool | head -20

echo -e "\nTesting health endpoint..."
curl -s http://localhost:8000/health | python3 -m json.tool

# Test path traversal protection
echo -e "\nTesting path traversal protection..."
curl -s "http://localhost:8000/flashcards/../../../etc/passwd"

# Cleanup
echo -e "\n\n5. Stopping server..."
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null

echo -e "\n=========================================="
echo "Tests completed!"
