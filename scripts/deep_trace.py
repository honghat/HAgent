#!/usr/bin/env python3
"""Deep trace resolve_runtime_provider to find exact error origin."""
import sys, os, json, traceback
os.environ['HAGENT_HOME'] = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, os.path.dirname(os.environ['HAGENT_HOME']))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.environ['HAGENT_HOME'], '.env'), override=True, encoding='utf-8')

# Monkey-patch to trace
import hagent_cli.runtime_provider as rp
_orig_resolve = rp.resolve_runtime_provider

def _traced_resolve(**kwargs):
    print(f"resolve_runtime_provider called with: {json.dumps({k:str(v)[:60] for k,v in kwargs.items()})}", flush=True)
    try:
        result = _orig_resolve(**kwargs)
        print(f"  Result: {json.dumps({k:str(v)[:80] for k,v in result.items()})}", flush=True)
        return result
    except Exception as e:
        print(f"  ERROR: {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        raise

rp.resolve_runtime_provider = _traced_resolve

# Now call through run_job
from cron.scheduler import run_job

jobs_path = os.path.join(os.environ['HAGENT_HOME'], 'cron', 'jobs.json')
with open(jobs_path) as f:
    data = json.load(f)

job = next((j for j in data['jobs'] if j['id'] == 'ec092ec78907'), None)
if not job:
    print("Job not found!", flush=True)
    sys.exit(1)

print("\n--- Calling run_job ---", flush=True)
success, output, final_response, error = run_job(job)

print(f"\n=== RESULT ===", flush=True)
print(f"Success: {success}", flush=True)
print(f"Error: {str(error)[:500]}", flush=True)
