#!/usr/bin/env python3
"""Run cron job - with proper HAGENT_HOME."""
import sys, os, json

# Set HAGENT_HOME BEFORE any imports
os.environ['HAGENT_HOME'] = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))

# Now import
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

# Verify
from hagent_constants import get_hagent_home
print(f"HAGENT_HOME from env: {os.environ.get('HAGENT_HOME')}", flush=True)
print(f"get_hagent_home(): {get_hagent_home()}", flush=True)

# Load .env and verify
from dotenv import load_dotenv
env_path = os.path.join(str(get_hagent_home()), '.env')
print(f"Loading .env: {env_path}", flush=True)
load_dotenv(env_path, override=True, encoding='utf-8')
pekpik_key = os.environ.get('PEKPIK_API_KEY', 'NOT SET')
print(f"PEKPIK_API_KEY={pekpik_key[:10]}...{pekpik_key[-5:] if pekpik_key != 'NOT SET' else pekpik_key}", flush=True)

# Now import and run
from cron.scheduler import run_job

jobs_path = os.path.join(str(get_hagent_home()), 'cron', 'jobs.json')
with open(jobs_path) as f:
    data = json.load(f)

job = next((j for j in data['jobs'] if j['id'] == 'ec092ec78907'), None)
if not job:
    print("Job not found!", flush=True)
    sys.exit(1)

print(f"\nRunning job: {job['name']}", flush=True)
print(f"Provider pinned: {job.get('provider')}", flush=True)
print(f"Model pinned: {job.get('model')}", flush=True)

success, output, final_response, error = run_job(job)

print(f"\n=== RESULT ===", flush=True)
print(f"Success: {success}", flush=True)
if error:
    print(f"Error: {error[:500]}", flush=True)
if final_response:
    print(f"Final response: {final_response[:500]}", flush=True)
print(f"Output size: {len(str(output))}", flush=True)
