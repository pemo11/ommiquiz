# Install-BackendDependencies.ps1
# Installs Python dependencies for Supabase integration

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Backend Dependencies Installer" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "This script will install Supabase dependencies for the backend.`n" -ForegroundColor White

# Dependencies to add
$newDependencies = @"

# PostgreSQL dependencies (asyncpg only - no supabase client needed)
asyncpg==0.29.0
"@

# Path to requirements.txt
$scriptDir = Split-Path -Parent $PSScriptRoot
$requirementsFile = Join-Path -Path $scriptDir -ChildPath "backend" | Join-Path -ChildPath "requirements.txt"

Write-Host "Checking requirements.txt at: $requirementsFile`n" -ForegroundColor Cyan

if (-not (Test-Path $requirementsFile)) {
    Write-Host "Error: requirements.txt not found at $requirementsFile" -ForegroundColor Red
    Write-Host "Please run this script from the project root directory." -ForegroundColor Red
    exit 1
}

# Check if dependencies already exist
$content = Get-Content $requirementsFile -Raw

if ($content -match "supabase") {
    Write-Host "Supabase dependencies already exist in requirements.txt" -ForegroundColor Yellow
    Write-Host "Skipping dependency addition.`n" -ForegroundColor Yellow
} else {
    Write-Host "Adding Supabase dependencies to requirements.txt..." -ForegroundColor Cyan
    Add-Content -Path $requirementsFile -Value $newDependencies
    Write-Host "Dependencies added successfully!`n" -ForegroundColor Green
}

# Ask user if they want to install now
Write-Host "Do you want to install the dependencies now? (Y/N): " -ForegroundColor Yellow -NoNewline
$response = Read-Host

if ($response -eq "Y" -or $response -eq "y") {
    Write-Host "`nInstalling Python packages..." -ForegroundColor Cyan
    Write-Host "This may take a few minutes...`n" -ForegroundColor White

    # Check if pip is available
    $pipCommand = Get-Command pip -ErrorAction SilentlyContinue

    if (-not $pipCommand) {
        Write-Host "Error: pip command not found." -ForegroundColor Red
        Write-Host "Please ensure Python and pip are installed and in your PATH." -ForegroundColor Red
        exit 1
    }

    # Install dependencies
    try {
        pip install -r $requirementsFile

        if ($LASTEXITCODE -eq 0) {
            Write-Host "`nDependencies installed successfully!" -ForegroundColor Green
        } else {
            Write-Host "`nError: pip install failed with exit code $LASTEXITCODE" -ForegroundColor Red
            exit 1
        }
    }
    catch {
        Write-Host "`nError installing dependencies: $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`nSkipping installation. You can install later with:" -ForegroundColor Yellow
    Write-Host "  pip install -r $requirementsFile`n" -ForegroundColor White
}

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Set up your .env file with Supabase configuration" -ForegroundColor White
Write-Host "  2. Run Test-DatabaseConnection.ps1 to verify database connectivity" -ForegroundColor White
Write-Host "  3. Start implementing the database layer (database.py, models.py)`n" -ForegroundColor White
