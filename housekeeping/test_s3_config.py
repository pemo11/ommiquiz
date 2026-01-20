#!/usr/bin/env python3
"""Test different boto3 configurations for DigitalOcean Spaces"""
import sys
sys.path.insert(0, '/Users/pemo22/2025/Projekte/ommiquiz/backend')

import boto3
from botocore.config import Config

print("Testing DigitalOcean Spaces configurations with boto3\n")
print("=" * 70)

# Configuration
ACCESS_KEY = 'DO8018JJ3KWGYMH3HPFQ'
SECRET_KEY = 'hJHvRaUAWNcimlK9ZUXAfOMoO6MhDYc49ZzTmS8KWbM'
BUCKET = 'ommiquiz-flashcards'
REGION = 'fra1'
PREFIX = 'flashcards/'

# Test 1: Virtual-hosted style (bucket in URL)
print("\n1. Testing virtual-hosted style endpoint (WITH bucket in URL)")
print(f"   Endpoint: https://{BUCKET}.{REGION}.digitaloceanspaces.com")
try:
    client1 = boto3.client(
        's3',
        endpoint_url=f'https://{BUCKET}.{REGION}.digitaloceanspaces.com',
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        region_name=REGION
    )
    response1 = client1.list_objects_v2(Bucket=BUCKET, Prefix=PREFIX, MaxKeys=5)
    print(f"   ✅ SUCCESS - Found {len(response1.get('Contents', []))} objects")
    if 'Contents' in response1:
        for obj in response1['Contents'][:3]:
            print(f"      - {obj['Key']}")
except Exception as e:
    print(f"   ❌ FAILED: {e}")

# Test 2: Path-style (no bucket in URL)
print(f"\n2. Testing path-style endpoint (WITHOUT bucket in URL)")
print(f"   Endpoint: https://{REGION}.digitaloceanspaces.com")
try:
    client2 = boto3.client(
        's3',
        endpoint_url=f'https://{REGION}.digitaloceanspaces.com',
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        region_name=REGION
    )
    response2 = client2.list_objects_v2(Bucket=BUCKET, Prefix=PREFIX, MaxKeys=5)
    print(f"   ✅ SUCCESS - Found {len(response2.get('Contents', []))} objects")
    if 'Contents' in response2:
        for obj in response2['Contents'][:3]:
            print(f"      - {obj['Key']}")
except Exception as e:
    print(f"   ❌ FAILED: {e}")

# Test 3: With explicit path-style config
print(f"\n3. Testing with explicit path-style addressing")
print(f"   Endpoint: https://{REGION}.digitaloceanspaces.com")
print(f"   Config: addressing_style='path'")
try:
    config = Config(s3={'addressing_style': 'path'})
    client3 = boto3.client(
        's3',
        endpoint_url=f'https://{REGION}.digitaloceanspaces.com',
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        region_name=REGION,
        config=config
    )
    response3 = client3.list_objects_v2(Bucket=BUCKET, Prefix=PREFIX, MaxKeys=5)
    print(f"   ✅ SUCCESS - Found {len(response3.get('Contents', []))} objects")
    if 'Contents' in response3:
        for obj in response3['Contents'][:3]:
            print(f"      - {obj['Key']}")
except Exception as e:
    print(f"   ❌ FAILED: {e}")

print("\n" + "=" * 70)
print("\nConclusion: The working configuration should be used in storage.py")
