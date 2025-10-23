#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Frontend ---
echo "Building frontend..."
cd packages/us-frontend
npm install
npm run build
cd ../..
echo "Frontend built successfully."

# --- Backend ---
echo "Installing backend dependencies..."
cd packages/us-backend
npm install
cd ../..
echo "Backend dependencies installed."

# --- Verification ---
echo "Installing verification dependencies..."
cd packages/jp-verify
npm install
cd ../..
echo "Verification dependencies installed."

echo "Deployment preparation complete."
echo "To run the application:"
echo "1. Start the backend: cd packages/us-backend && npm start"
echo "2. Start the verification service: cd packages/jp-verify && npm start"
echo "3. Serve the frontend assets from 'packages/us-frontend/dist' with a static server."
