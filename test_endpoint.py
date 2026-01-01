#!/usr/bin/env python3
import boto3
from botocore.exceptions import ClientError

print("Testing endpoint formats...\n")

# Format 1: Without bucket in endpoint (standard S3 format)
print("1. Testing: https://fra1.digitaloceanspaces.com")
try:
    client1 = boto3.client(
        's3',
        endpoint_url='https://fra1.digitaloceanspaces.com',
        aws_access_key_id='DO8018JJ3KWGYMH3HPFQ',
        aws_secret_access_key='hJHvRaUAWNcimlK9ZUXAfOMoO6MhDYc49ZzTmS8KWbM',
        region_name='fra1'
    )
    response1 = client1.list_objects_v2(Bucket='ommiquiz-flashcards', MaxKeys=1)
    print("   ✅ SUCCESS - Can list objects")
    print(f"   Found {len(response1.get('Contents', []))} objects\n")
except Exception as e:
    print(f"   ❌ FAILED: {e}\n")

# Format 2: With bucket in endpoint
print("2. Testing: https://ommiquiz-flashcards.fra1.digitaloceanspaces.com")
try:
    client2 = boto3.client(
        's3',
        endpoint_url='https://ommiquiz-flashcards.fra1.digitaloceanspaces.com',
        aws_access_key_id='DO8018JJ3KWGYMH3HPFQ',
        aws_secret_access_key='hJHvRaUAWNcimlK9ZUXAfOMoO6MhDYc49ZzTmS8KWbM',
        region_name='fra1'
    )
    response2 = client2.list_objects_v2(Bucket='ommiquiz-flashcards', MaxKeys=1)
    print("   ✅ SUCCESS - Can list objects")
    print(f"   Found {len(response2.get('Contents', []))} objects")
except Exception as e:
    print(f"   ❌ FAILED: {e}")
