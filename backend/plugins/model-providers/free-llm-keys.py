import os
import requests

def get_free_keys():
    """Lấy danh sách key từ repo github alistaitsacle/free-llm-api-keys"""
    url = "https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md"
    try:
        response = requests.get(url, timeout=10)
        content = response.text
        # Logic parse key thô (ví dụ lấy sk-...)
        import re
        keys = re.findall(r'sk-[a-zA-Z0-9]{3}\.\.\.[a-zA-Z0-9]{4}', content)
        return keys
    except:
        return []

def register_provider(registry):
    # Provider này sẽ fake OpenAI compatible
    # Base URL: https://aiapiv2.pekpik.com/v1
    pass

if __name__ == "__main__":
    print(get_free_keys())
