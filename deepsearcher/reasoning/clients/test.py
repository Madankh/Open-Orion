#!/usr/bin/env python3
import requests
import os
from openai import OpenAI

from dotenv import load_dotenv
load_dotenv()  # this loads environment variables from a .env file in current directory

def test_basic_connectivity():
    """Test basic connectivity to OpenRouter"""
    print("=== Testing Basic Connectivity ===")
    try:
        response = requests.get("https://openrouter.ai", timeout=10)
        print(f"✅ Can reach OpenRouter.ai - Status: {response.status_code}")
    except Exception as e:
        print(f"❌ Cannot reach OpenRouter.ai: {e}")
        return False
    return True

def test_api_endpoint():
    """Test the API endpoint specifically"""
    print("\n=== Testing API Endpoint ===")
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        print("❌ OPENAI_API_KEY not set")
        return False
    
    try:
        response = requests.get(
            "https://openrouter.ai/api/v1/models",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            timeout=10
        )
        print(f"✅ API endpoint reachable - Status: {response.status_code}")
        if response.status_code != 200:
            print(f"Response: {response.text}")
    except Exception as e:
        print(f"❌ Cannot reach API endpoint: {e}")
        return False
    return True

def test_openai_client():
    """Test using OpenAI client directly"""
    print("\n=== Testing OpenAI Client ===")
    api_key = os.getenv('OPENAI_API_KEY')
    base_url = os.getenv('OPENAI_BASE_URL')
    
    if not api_key or not base_url:
        print("❌ Environment variables not set")
        return False
    
    try:
        client = OpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=10.0  # Add timeout
        )
        
        # Try to list models
        models = client.models.list()
        print(f"✅ OpenAI client works - Found {len(models.data)} models")
        return True
    except Exception as e:
        print(f"❌ OpenAI client failed: {e}")
        return False

if __name__ == "__main__":
    print("Testing OpenRouter connectivity...\n")
    
    # Test in order
    if test_basic_connectivity():
        if test_api_endpoint():
            test_openai_client()
    
    print("\n=== Network Debug Info ===")
    try:
        import socket
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        print(f"Local hostname: {hostname}")
        print(f"Local IP: {local_ip}")
    except Exception as e:
        print(f"Network info error: {e}")