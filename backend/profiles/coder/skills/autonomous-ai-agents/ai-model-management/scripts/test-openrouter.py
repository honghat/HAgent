#!/usr/bin/env python3
"""Batch model testing script for OpenRouter models.

Usage:
    python test_openrouter.py "api_key" ["model1" "model2" ...]
    
Or use default free models:
    python test_openrouter.py "api_key" --free --test "test message"
"""

import json, sys, argparse
from urllib import request


API_KEY = ""
TEST_MESSAGE = "Hello! Please respond briefly to confirm the model is working."
REQUEST_TIMEOUT = 30


def test_model(model_id, messages=None):
    """Test a single OpenRouter model."""
    
    if not messages:
        messages = [{"role": "user", "content": TEST_MESSAGE}]
    
    url = "https://openrouter.ai/api/v1/chat/completions"
    
    data = {
        "model": model_id,
        "messages": messages,
        "stream": False
    }
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "test.hagent.ai"
    }
    
    try:
        req = request.Request(
            url,
            data=json.dumps(data).encode('utf-8'),
            headers=headers,
            timeout=REQUEST_TIMEOUT
        )
        
        with request.urlopen(req) as response:
            result = json.loads(response.read().decode())
            
            if "error" in result:
                print(f"\n❌ {model_id}")
                print(f"   Error: {result['error'].get('message', 'Unknown error')}")
                return False
            
            else:
                usage = result["usage"]
                model_name = result.get("model", model_id)
                provider = result.get("provider", "unknown")
                
                print(f"\n✅ {model_id}")
                print(f"   Model: {model_name}")
                print(f"   Provider: {provider}")
                print(f"   Prompt tokens: {usage['prompt_tokens']}")
                print(f"   Completion tokens: {usage['completion_tokens']}")
                print(f"   Total cost: \${usage['cost']:.6f}")
                print(f"   Response preview: {result['choices'][0]['message']['content'][:100]}...")
                return True
                
    except Exception as e:
        print(f"\n❌ {model_id} - Error: {str(e)}")
        return False


def list_free_models():
    """List available free-tier models from OpenRouter."""
    
    url = "https://openrouter.ai/api/v1/models"
    
    try:
        req = request.Request(
            url,
            data=b"",
            headers={"Accept": "application/json"},
            timeout=REQUEST_TIMEOUT
        )
        
        with request.urlopen(req) as response:
            models = json.loads(response.read().decode())
            
            free_models = [
                m for m in models.get("data", [])
                if (float(m.get("pricing", {}).get("prompt", "1")) < 0.000001 
                    or "free" in m.get("name", "").lower())
            ]
            
            print(f"\n{'='*60}")
            print(f"Free Tier Models ({len(free_models)}):")
            print('='*60)
            
            for i, model in enumerate(free_models[:10], 1):
                print(f"\n{i}. {model['id']}")
                print(f"   Name: {model.get('name', 'N/A')}")
                print(f"   Pricing: {model.get('pricing', {})}")
                
            print(f"\n{'='*60}")
            return free_models[:10]
            
    except Exception as e:
        print(f"Error listing models: {str(e)}")
        return []


def main():
    parser = argparse.ArgumentParser(description="OpenRouter Model Test Tool")
    parser.add_argument("api_key", help="OpenRouter API key")
    parser.add_argument("--free", action="store_true", help="Test free-tier models only")
    parser.add_argument("--list", action="store_true", help="List available free models")
    
    args = parser.parse_args()
    API_KEY = args.api_key
    
    if args.list:
        list_free_models()
        return
    
    # Default models to test (free tier)
    default_models = [
        "meta-llama/llama-3.1-8b-instruct",
        "inclusionai/ring-2.6-1t:free",
        "openrouter/owl-alpha",
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    ]
    
    print(f"Testing {len(default_models)} free models...")
    print("-"*40)
    
    success_count = 0
    for model_id in default_models:
        if test_model(model_id):
            success_count += 1
    
    print("-"*40)
    print(f"\n✅ {success_count}/{len(default_models)} models tested successfully!")


if __name__ == "__main__":
    main()