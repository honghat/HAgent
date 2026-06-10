#!/bin/bash
cd /Users/nguyenhat/HAgent/backend
nohup .venv/bin/python -m uvicorn api.main:app --host 0.0.0.0 --port 8011 > /tmp/hagent_server.log 2>&1 &
sleep 3
echo "Server PID: $!"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8011/
