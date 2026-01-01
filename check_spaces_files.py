#!/usr/bin/env python3
import boto3

client = boto3.client(
    's3',
    endpoint_url='https://fra1.digitaloceanspaces.com',
    aws_access_key_id='DO8018JJ3KWGYMH3HPFQ',
    aws_secret_access_key='hJHvRaUAWNcimlK9ZUXAfOMoO6MhDYc49ZzTmS8KWbM',
    region_name='fra1'
)

print("Files in Spaces bucket:\n")
response = client.list_objects_v2(Bucket='ommiquiz-flashcards', Prefix='flashcards/')

if 'Contents' in response:
    for obj in response['Contents']:
        key = obj['Key']
        if 'vfhdbte' in key.lower() or 'kapitel5' in key.lower():
            print(f"  ⭐ {key} ({obj['Size']} bytes)")
        else:
            print(f"     {key}")
else:
    print("  No files found!")
