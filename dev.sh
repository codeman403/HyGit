#!/usr/bin/env bash
# HyGit Development Start Script
# Starts both backend and frontend concurrently

set -e

echo "🚀 Starting HyGit development servers..."

# Check .env exists
if [ ! -f "backend/.env" ]; then
  echo "⚠️  No backend/.env found. Copying from .env.example..."
  cp .env.example backend/.env
  echo "📝 Edit backend/.env with your API keys before starting!"
fi

if [ ! -f "frontend/.env.local" ]; then
  echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > frontend/.env.local
fi

# Install backend deps if needed
if [ ! -d "backend/.venv" ]; then
  echo "📦 Setting up Python virtual environment..."
  cd backend
  python3 -m venv .venv
  .venv/bin/pip install -e ".[dev]" --quiet
  cd ..
fi

# Start backend in background
echo "🐍 Starting FastAPI backend on :8000..."
cd backend
source .venv/bin/activate 2>/dev/null || true
PYTHONPATH=. uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Start frontend
echo "⚛️  Starting Next.js frontend on :3000..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ HyGit is running!"
echo "   Frontend → http://localhost:3000"
echo "   Backend  → http://localhost:8000"
echo "   API Docs → http://localhost:8000/api/docs"
echo ""
echo "Press Ctrl+C to stop all servers"

# Wait and handle cleanup
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT
wait
