#!/usr/bin/env python3
"""
Python script to delete all flashcard files from DigitalOcean Spaces
Requires: pip install boto3
"""

import sys
import boto3
from botocore.exceptions import ClientError

# Configuration
ENDPOINT_URL = "https://fra1.digitaloceanspaces.com"
BUCKET = "ommiquiz-flashcards"
PREFIX = "flashcards/"
REGION = "fra1"
ACCESS_KEY = "DO8018JJ3KWGYMH3HPFQ"
SECRET_KEY = "hJHvRaUAWNcimlK9ZUXAfOMoO6MhDYc49ZzTmS8KWbM"


def main():
    print("╔════════════════════════════════════════════════════════════════╗")
    print("║          WARNING: DELETE ALL FLASHCARDS FROM SPACES           ║")
    print("╚════════════════════════════════════════════════════════════════╝")
    print()
    print("\033[93mThis script will delete ALL files in:\033[0m")
    print(f"  \033[96mBucket: {BUCKET}\033[0m")
    print(f"  \033[96mPrefix: {PREFIX}\033[0m")
    print(f"  \033[96mEndpoint: {ENDPOINT_URL}\033[0m")
    print()
    print("\033[91mThis action CANNOT be undone!\033[0m")
    print()

    # First confirmation
    confirmation = input("Type 'DELETE ALL' to confirm: ")
    if confirmation != "DELETE ALL":
        print("\n\033[92mOperation cancelled.\033[0m")
        return

    print("\n\033[96mConnecting to DigitalOcean Spaces...\033[0m")

    # Create S3 client
    try:
        client = boto3.client(
            's3',
            endpoint_url=ENDPOINT_URL,
            aws_access_key_id=ACCESS_KEY,
            aws_secret_access_key=SECRET_KEY,
            region_name=REGION
        )
    except Exception as e:
        print(f"\n\033[91mERROR: Failed to create S3 client: {e}\033[0m")
        sys.exit(1)

    # List all files
    print(f"\n\033[96mListing files to delete...\033[0m")
    try:
        paginator = client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=BUCKET, Prefix=PREFIX)

        files_to_delete = []
        for page in pages:
            if 'Contents' in page:
                for obj in page['Contents']:
                    files_to_delete.append(obj['Key'])

        if not files_to_delete:
            print("\n\033[93mNo files found in " + PREFIX + "\033[0m")
            return

        print(f"\n\033[93mFound {len(files_to_delete)} files:\033[0m")
        for key in files_to_delete:
            print(f"  - {key}")
        print()

    except ClientError as e:
        print(f"\n\033[91mERROR: Failed to list files: {e}\033[0m")
        sys.exit(1)

    # Second confirmation
    final_confirmation = input("Type 'YES' to proceed with deletion: ")
    if final_confirmation != "YES":
        print("\n\033[92mOperation cancelled.\033[0m")
        return

    # Delete all files
    print(f"\n\033[96mDeleting all files from {PREFIX}...\033[0m")
    deleted_count = 0
    failed_count = 0

    for key in files_to_delete:
        try:
            client.delete_object(Bucket=BUCKET, Key=key)
            print(f"  ✓ Deleted: {key}")
            deleted_count += 1
        except ClientError as e:
            print(f"  ✗ Failed: {key} - {e}")
            failed_count += 1

    print()
    print("═══════════════════════════════════════════════════════════════")
    if failed_count == 0:
        print(f"\033[92mSUCCESS: All {deleted_count} files deleted from {PREFIX}\033[0m")
    else:
        print(f"\033[93mPARTIAL: {deleted_count} deleted, {failed_count} failed\033[0m")
    print("═══════════════════════════════════════════════════════════════")
    print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n\033[92mOperation cancelled by user.\033[0m")
        sys.exit(0)
