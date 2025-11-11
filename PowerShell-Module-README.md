# Ommiquiz PowerShell Module

A comprehensive PowerShell module for managing YAML flashcard files with the Ommiquiz API.

## Features

- 🔧 **Configuration Management** - Set API endpoints and default settings
- 📚 **Flashcard Operations** - List, get, upload, and delete flashcard sets
- ✅ **Validation** - Validate YAML files before uploading
- 🎯 **Template Creation** - Generate properly formatted YAML templates
- 🏥 **Health Monitoring** - Check API health status
- 🛡️ **Error Handling** - Comprehensive validation and error management
- 🧪 **Full Test Coverage** - Extensive Pester tests included

## Installation

1. **Copy module files** to your PowerShell modules directory:
   ```powershell
   # Find your modules path
   $env:PSModulePath -split ';'
   
   # Copy to user modules directory (recommended)
   $ModulePath = "$env:USERPROFILE\Documents\PowerShell\Modules\OmmiquizModule"
   New-Item -Path $ModulePath -ItemType Directory -Force
   Copy-Item "OmmiquizModule.psm1" $ModulePath
   Copy-Item "OmmiquizModule.psd1" $ModulePath
   ```

2. **Import the module**:
   ```powershell
   Import-Module OmmiquizModule
   ```

## Quick Start

```powershell
# 1. Configure the API endpoint
Set-OmmiquizConfig -BaseUrl "http://localhost:8000"

# 2. Check API health
Test-OmmiquizHealth

# 3. List all flashcards
Get-OmmiquizFlashcards

# 4. Get a specific flashcard
$pythonCards = Get-OmmiquizFlashcard -FlashcardId "python-basics"

# 5. Create a new flashcard template
New-OmmiquizFlashcard -Id "powershell-basics" -Title "PowerShell Basics" -Author "Your Name" -Description "Basic PowerShell concepts" -OutputPath "./powershell-basics.yaml"

# 6. Upload the flashcard
Send-OmmiquizFlashcard -FilePath "./powershell-basics.yaml"
```

## Function Reference

### Configuration Functions

#### Set-OmmiquizConfig
Sets the API base URL for all operations.

```powershell
Set-OmmiquizConfig -BaseUrl "https://your-ommiquiz-server.com"
```

#### Get-OmmiquizConfig
Returns current configuration settings.

```powershell
$config = Get-OmmiquizConfig
Write-Host "API URL: $($config.BaseUrl)"
```

### Flashcard Management Functions

#### Get-OmmiquizFlashcards
Lists all available flashcard sets.

```powershell
$flashcards = Get-OmmiquizFlashcards
$flashcards | Format-Table id, filename
```

#### Get-OmmiquizFlashcard
Retrieves a specific flashcard set by ID.

```powershell
$cards = Get-OmmiquizFlashcard -FlashcardId "python-basics"
Write-Host "Author: $($cards.author)"
Write-Host "Total cards: $($cards.flashcards.Count)"
```

#### Send-OmmiquizFlashcard
Uploads a YAML flashcard file to the server.

```powershell
# Upload file
Send-OmmiquizFlashcard -FilePath "./my-cards.yaml"

# Validate only (don't upload)
$validation = Send-OmmiquizFlashcard -FilePath "./my-cards.yaml" -Validate
if ($validation.valid) {
    Write-Host "File is valid!" -ForegroundColor Green
}
```

#### Remove-OmmiquizFlashcard
Deletes a flashcard set from the server.

```powershell
# With confirmation
Remove-OmmiquizFlashcard -FlashcardId "old-cards"

# Skip confirmation
Remove-OmmiquizFlashcard -FlashcardId "test-cards" -Force
```

### Template Creation

#### New-OmmiquizFlashcard
Creates a new flashcard YAML file template.

```powershell
New-OmmiquizFlashcard `
    -Id "react-basics" `
    -Title "React Fundamentals" `
    -Author "John Doe" `
    -Description "Basic React concepts and patterns" `
    -Language "en" `
    -Level "intermediate" `
    -Topics @("React", "JavaScript", "Frontend") `
    -Keywords @("components", "jsx", "hooks") `
    -OutputPath "./react-basics.yaml"
```

### Health Monitoring

#### Test-OmmiquizHealth
Checks if the Ommiquiz API is healthy and accessible.

```powershell
if (Test-OmmiquizHealth) {
    Write-Host "API is healthy ✅" -ForegroundColor Green
} else {
    Write-Host "API is not responding ❌" -ForegroundColor Red
}
```

## YAML Flashcard Format

The module creates and validates YAML files in this format:

```yaml
id: my-flashcard-set
author: Your Name
title: My Flashcard Set
description: Description of the flashcard set
createDate: 2025-11-11
language: en
level: beginner
topics:
  - topic1
  - topic2
keywords:
  - keyword1
  - keyword2

flashcards:
  - question: "Single answer question?"
    answer: "The answer"
    type: single
  
  - question: "Multiple choice question?"
    answers:
      - "Option 1"
      - "Option 2" 
      - "Option 3"
    type: multiple
```

## Examples

### Example 1: Bulk Upload Flashcards

```powershell
# Get all YAML files in a directory
$yamlFiles = Get-ChildItem -Path "./flashcards" -Filter "*.yaml"

foreach ($file in $yamlFiles) {
    try {
        Write-Host "Uploading: $($file.Name)"
        $result = Send-OmmiquizFlashcard -FilePath $file.FullName
        if ($result.success) {
            Write-Host "✅ Success: $($result.message)" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}
```

### Example 2: Validate All Local Files

```powershell
$yamlFiles = Get-ChildItem -Path "./flashcards" -Filter "*.yaml"

foreach ($file in $yamlFiles) {
    Write-Host "`nValidating: $($file.Name)"
    $validation = Send-OmmiquizFlashcard -FilePath $file.FullName -Validate
    
    if ($validation.valid) {
        Write-Host "✅ Valid" -ForegroundColor Green
        if ($validation.warnings.Count -gt 0) {
            Write-Host "⚠️ Warnings:" -ForegroundColor Yellow
            $validation.warnings | ForEach-Object { Write-Host "  - $_" }
        }
    } else {
        Write-Host "❌ Invalid" -ForegroundColor Red
        $validation.errors | ForEach-Object { Write-Host "  - $_" }
    }
}
```

### Example 3: Backup All Flashcards

```powershell
# Create backup directory
$backupDir = "./backup-$(Get-Date -Format 'yyyy-MM-dd-HH-mm-ss')"
New-Item -Path $backupDir -ItemType Directory

# Get all flashcards and save them locally
$flashcards = Get-OmmiquizFlashcards

foreach ($card in $flashcards) {
    try {
        Write-Host "Backing up: $($card.id)"
        $content = Get-OmmiquizFlashcard -FlashcardId $card.id
        $filePath = Join-Path $backupDir "$($card.id).yaml"
        
        # Convert to YAML and save (you might want to use a proper YAML library)
        $content | ConvertTo-Json -Depth 10 | Set-Content $filePath
        Write-Host "✅ Saved to: $filePath" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Failed to backup $($card.id): $($_.Exception.Message)" -ForegroundColor Red
    }
}
```

## Error Handling

The module provides comprehensive error handling:

```powershell
try {
    $flashcard = Get-OmmiquizFlashcard -FlashcardId "nonexistent"
}
catch {
    switch -Wildcard ($_.Exception.Message) {
        "*not found*" { 
            Write-Host "Flashcard doesn't exist" 
        }
        "*Invalid flashcard ID*" { 
            Write-Host "Invalid ID format" 
        }
        "*API request failed*" { 
            Write-Host "Server connection issue" 
        }
        default { 
            Write-Host "Unexpected error: $_" 
        }
    }
}
```

## Testing

Run the comprehensive Pester tests:

```powershell
# Install Pester if not already installed
Install-Module -Name Pester -Force -SkipPublisherCheck

# Run tests
Invoke-Pester -Path "./OmmiquizModule.Tests.ps1" -Output Detailed
```

The test suite covers:
- ✅ Configuration management
- ✅ All API functions with mocking
- ✅ File operations and validation
- ✅ YAML generation and parsing
- ✅ Input validation and error handling
- ✅ End-to-end workflows

## Production Deployment

For production use with your deployed Ommiquiz application:

```powershell
# Configure for DigitalOcean App Platform
Set-OmmiquizConfig -BaseUrl "https://your-ommiquiz-app.ondigitalocean.app"

# Configure for custom domain
Set-OmmiquizConfig -BaseUrl "https://ommiquiz.yourcompany.com"

# Test connection
Test-OmmiquizHealth
```

## Requirements

- PowerShell 5.1 or later
- Network access to Ommiquiz API
- Pester module (for testing)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

This module is part of the Ommiquiz project and follows the same licensing terms.

---

**Happy learning with Ommiquiz! 🎓**