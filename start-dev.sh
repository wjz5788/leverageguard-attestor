#!/bin/bash

# LiqPass Development Startup Script
# This script starts both the frontend and backend services

echo "Starting LiqPass development environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js to continue."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install npm to continue."
    exit 1
fi

# Install dependencies if needed
echo "Installing dependencies..."
cd packages/us-frontend && npm install
cd ../us-backend && npm install
cd ../..

# Create backend .env file if it doesn't exist
if [ ! -f packages/us-backend/.env.us ]; then
    echo "Creating backend environment file..."
    cp packages/us-backend/.env.us.example packages/us-backend/.env.us
    echo "Please edit packages/us-backend/.env.us with your configuration before running the application."
fi

# Start backend server in background
echo "Starting backend server..."
cd packages/us-backend
npm run dev &
BACKEND_PID=$!
cd ../..

# Wait a moment for backend to start
sleep 3

# Start frontend server in background
echo "Starting frontend server..."
cd packages/us-frontend
npm run dev &
FRONTEND_PID=$!
cd ../..

echo "LiqPass development environment is now running!"
echo "Frontend: http://localhost:5173"
echo "Backend: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both servers"

# Function to clean up background processes
cleanup() {
    echo "Stopping servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit
}

# Set up trap to clean up on exit
trap cleanup INT TERM

# Wait for both processes
wait