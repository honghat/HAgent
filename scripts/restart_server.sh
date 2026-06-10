#!/bin/bash
pkill -f "uvicorn.*8011" 2>/dev/null
sleep 1
cd /Users/nguyenhat/HAgent/backend
.venv/bin/python -m uvicorn api.main:app --host 0.0.0.0 --port 8011 &
sleep 3
curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost:8011/
