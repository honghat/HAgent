#!/bin/bash
set -e

echo "Cleaning up existing processes on ports 8004, 8010 and 3004..."
lsof -ti:8004,8010,3004 | xargs kill -9 2>/dev/null || true

echo "Starting backend..."
(cd backend && npm run dev) &

echo "Starting frontend..."
(cd frontend && npm run dev) &

wait
