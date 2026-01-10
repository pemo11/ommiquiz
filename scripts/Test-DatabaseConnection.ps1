# Test-DatabaseConnection.ps1
# Tests connection to Supabase PostgreSQL database

param(
    [string]$DatabaseUrl = $env:DATABASE_URL
)

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Database Connection Tester" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check if DATABASE_URL is provided
if (-not $DatabaseUrl) {
    Write-Host "Error: DATABASE_URL not set." -ForegroundColor Red
    Write-Host "`nPlease set it in one of the following ways:" -ForegroundColor Yellow
    Write-Host "  1. Set environment variable: `$env:DATABASE_URL = 'your-connection-string'" -ForegroundColor White
    Write-Host "  2. Pass as parameter: .\Test-DatabaseConnection.ps1 -DatabaseUrl 'your-connection-string'" -ForegroundColor White
    Write-Host "  3. Add to .env file and load it before running this script`n" -ForegroundColor White
    exit 1
}

Write-Host "Testing database connection..." -ForegroundColor Cyan
Write-Host "Database URL: $($DatabaseUrl.Substring(0, [Math]::Min(30, $DatabaseUrl.Length)))...`n" -ForegroundColor White

# Python script to test connection
$pythonScript = @"
import os
import sys
import asyncio

try:
    import asyncpg
except ImportError as e:
    print(f'Error: Required package not installed: {e}')
    print('Please run Install-BackendDependencies.ps1 first.')
    sys.exit(1)

async def test_connection():
    db_url = os.getenv('DATABASE_URL', '$DatabaseUrl')

    try:
        print('Attempting to connect to PostgreSQL...')

        # Create a connection
        conn = await asyncpg.connect(db_url)

        print('Connection established.')

        # Test query
        result = await conn.fetchval('SELECT 1 as test')

        if result == 1:
            print('\n✓ Database connection successful!')
            print('✓ PostgreSQL is responding correctly')
            await conn.close()
            print('Connection closed.')
            return 0
        else:
            print('\n✗ Unexpected result from database')
            await conn.close()
            return 1

    except Exception as e:
        print(f'\n✗ Database connection failed!')
        print(f'Error: {e}')
        print(f'\nCommon issues:')
        print(f'  - Check your DATABASE_URL is correct')
        print(f'  - Verify network connectivity to Supabase')
        print(f'  - Ensure your IP is allowed in Supabase settings')
        print(f'  - Check if asyncpg is installed (pip install asyncpg)')
        return 1

if __name__ == '__main__':
    try:
        exit_code = asyncio.run(test_connection())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print('\nTest cancelled by user.')
        sys.exit(1)
"@

# Check if Python is available
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue

if (-not $pythonCommand) {
    Write-Host "Error: Python not found in PATH." -ForegroundColor Red
    Write-Host "Please ensure Python is installed and accessible." -ForegroundColor Red
    exit 1
}

# Run the test
try {
    # Set environment variable for the Python script
    $env:DATABASE_URL = $DatabaseUrl

    # Execute Python script
    $pythonScript | python -

    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Host "`n========================================" -ForegroundColor Green
        Write-Host "Database connection test PASSED!" -ForegroundColor Green
        Write-Host "========================================`n" -ForegroundColor Green

        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "  1. Create database.py and models.py" -ForegroundColor White
        Write-Host "  2. Update auth.py for Supabase authentication" -ForegroundColor White
        Write-Host "  3. Migrate progress_storage.py to PostgreSQL`n" -ForegroundColor White
    } else {
        Write-Host "`n========================================" -ForegroundColor Red
        Write-Host "Database connection test FAILED!" -ForegroundColor Red
        Write-Host "========================================`n" -ForegroundColor Red

        Write-Host "Troubleshooting:" -ForegroundColor Yellow
        Write-Host "  1. Verify your DATABASE_URL in .env file" -ForegroundColor White
        Write-Host "  2. Check Supabase project settings" -ForegroundColor White
        Write-Host "  3. Ensure required packages are installed" -ForegroundColor White
        Write-Host "  4. Check your internet connection`n" -ForegroundColor White

        exit 1
    }
}
catch {
    Write-Host "`nUnexpected error: $_" -ForegroundColor Red
    exit 1
}
