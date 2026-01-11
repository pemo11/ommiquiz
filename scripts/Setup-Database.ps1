# Setup-Database.ps1
# Runs the Python database setup script to create Supabase schema

param(
    [switch]$DropExisting,
    [string]$DatabaseUrl = $env:DATABASE_URL
)

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Supabase Database Setup" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check if DATABASE_URL is set
if (-not $DatabaseUrl) {
    Write-Host "Error: DATABASE_URL is not set" -ForegroundColor Red
    Write-Host "`nPlease set DATABASE_URL in one of these ways:" -ForegroundColor Yellow
    Write-Host "  1. In your .env file" -ForegroundColor White
    Write-Host "  2. As environment variable: `$env:DATABASE_URL = 'your-connection-string'" -ForegroundColor White
    Write-Host "  3. Pass as parameter: .\Setup-Database.ps1 -DatabaseUrl 'your-connection-string'" -ForegroundColor White
    Write-Host "`nExample DATABASE_URL format:" -ForegroundColor Yellow
    Write-Host "  postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres`n" -ForegroundColor White
    exit 1
}

# Check if Python is available
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue

if (-not $pythonCommand) {
    Write-Host "Error: Python not found in PATH" -ForegroundColor Red
    Write-Host "Please ensure Python is installed and accessible.`n" -ForegroundColor Red
    exit 1
}

# Check if asyncpg is installed
Write-Host "Checking dependencies..." -ForegroundColor Cyan
$checkDeps = python -c "import asyncpg" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: asyncpg package not installed" -ForegroundColor Red
    Write-Host "`nPlease install dependencies first:" -ForegroundColor Yellow
    Write-Host "  .\scripts\Install-BackendDependencies.ps1" -ForegroundColor White
    Write-Host "  OR" -ForegroundColor Yellow
    Write-Host "  pip install asyncpg`n" -ForegroundColor White
    exit 1
}

Write-Host "✓ Dependencies found`n" -ForegroundColor Green

# Determine script path
$scriptDir = Split-Path -Parent $PSScriptRoot
$setupScript = Join-Path -Path $scriptDir -ChildPath "backend" | Join-Path -ChildPath "scripts" | Join-Path -ChildPath "setup_database.py"

if (-not (Test-Path $setupScript)) {
    Write-Host "Error: setup_database.py not found at $setupScript" -ForegroundColor Red
    exit 1
}

# Build command
$pythonArgs = @($setupScript)

if ($DropExisting) {
    Write-Host "WARNING: This will DROP all existing tables and data!" -ForegroundColor Red
    Write-Host "Are you sure you want to continue? (yes/no): " -ForegroundColor Yellow -NoNewline
    $confirmation = Read-Host

    if ($confirmation -ne "yes") {
        Write-Host "`nSetup cancelled.`n" -ForegroundColor Yellow
        exit 0
    }

    $pythonArgs += "--drop-existing"
    Write-Host "`nProceeding with fresh database install...`n" -ForegroundColor Yellow
}

# Set environment variable for Python script
$env:DATABASE_URL = $DatabaseUrl

# Run the Python setup script
Write-Host "Running database setup script...`n" -ForegroundColor Cyan

python @pythonArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nDatabase setup completed successfully!" -ForegroundColor Green
    Write-Host "`nYou can now start your application.`n" -ForegroundColor White
} else {
    Write-Host "`nDatabase setup failed. Please check the errors above.`n" -ForegroundColor Red
    exit 1
}
