#!/usr/bin/env pwsh
# PowerShell script to delete all flashcard files from DigitalOcean Spaces
# This uses AWS CLI (which is S3-compatible) to interact with Spaces

# Configuration
$ENDPOINT_URL = "https://fra1.digitaloceanspaces.com"
$BUCKET = "ommiquiz-flashcards"
$PREFIX = "flashcards/"
$REGION = "fra1"
$ACCESS_KEY = "DO8018JJ3KWGYMH3HPFQ"
$SECRET_KEY = "hJHvRaUAWNcimlK9ZUXAfOMoO6MhDYc49ZzTmS8KWbM"

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Red
Write-Host "║          WARNING: DELETE ALL FLASHCARDS FROM SPACES           ║" -ForegroundColor Red
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Red
Write-Host ""
Write-Host "This script will delete ALL files in:" -ForegroundColor Yellow
Write-Host "  Bucket: $BUCKET" -ForegroundColor Cyan
Write-Host "  Prefix: $PREFIX" -ForegroundColor Cyan
Write-Host "  Endpoint: $ENDPOINT_URL" -ForegroundColor Cyan
Write-Host ""
Write-Host "This action CANNOT be undone!" -ForegroundColor Red
Write-Host ""

# Confirmation prompt
$confirmation = Read-Host "Type 'DELETE ALL' to confirm"

if ($confirmation -ne "DELETE ALL") {
    Write-Host ""
    Write-Host "Operation cancelled." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "Connecting to DigitalOcean Spaces..." -ForegroundColor Cyan

# Set AWS credentials as environment variables for this session
$env:AWS_ACCESS_KEY_ID = $ACCESS_KEY
$env:AWS_SECRET_ACCESS_KEY = $SECRET_KEY

# Check if AWS CLI is installed
try {
    $null = Get-Command aws -ErrorAction Stop
} catch {
    Write-Host ""
    Write-Host "ERROR: AWS CLI is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install AWS CLI:" -ForegroundColor Yellow
    Write-Host "  Windows: https://aws.amazon.com/cli/" -ForegroundColor Cyan
    Write-Host "  Or via: winget install Amazon.AWSCLI" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# List all files
Write-Host ""
Write-Host "Listing files to delete..." -ForegroundColor Cyan
$listOutput = aws s3 ls "s3://$BUCKET/$PREFIX" --endpoint-url=$ENDPOINT_URL --region=$REGION 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Failed to list files" -ForegroundColor Red
    Write-Host $listOutput -ForegroundColor Red
    exit 1
}

# Parse the output to count files
$fileCount = ($listOutput | Measure-Object).Count

if ($fileCount -eq 0) {
    Write-Host ""
    Write-Host "No files found in $PREFIX" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Found $fileCount files:" -ForegroundColor Yellow
Write-Host $listOutput
Write-Host ""

# Second confirmation
$finalConfirmation = Read-Host "Type 'YES' to proceed with deletion"

if ($finalConfirmation -ne "YES") {
    Write-Host ""
    Write-Host "Operation cancelled." -ForegroundColor Green
    exit 0
}

# Delete all files
Write-Host ""
Write-Host "Deleting all files from $PREFIX..." -ForegroundColor Cyan

$deleteOutput = aws s3 rm "s3://$BUCKET/$PREFIX" --recursive --endpoint-url=$ENDPOINT_URL --region=$REGION 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Failed to delete files" -ForegroundColor Red
    Write-Host $deleteOutput -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "SUCCESS: All files deleted from $PREFIX" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""

# Clean up environment variables
$env:AWS_ACCESS_KEY_ID = $null
$env:AWS_SECRET_ACCESS_KEY = $null
