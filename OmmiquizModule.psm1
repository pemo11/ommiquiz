# OmmiquizModule.psm1
# PowerShell module for managing Ommiquiz YAML flashcard files

# Default configuration
$Script:OmmiquizConfig = @{
    BaseUrl = "http://localhost:8000"
    DefaultOutputPath = "./flashcards"
    ValidLanguages = @("en", "de", "fr", "es", "it", "pt", "nl", "ru", "ja", "zh")
    ValidLevels = @("beginner", "intermediate", "advanced", "expert")
}

#region Configuration Functions

<#
.SYNOPSIS
    Sets the Ommiquiz API base URL
.DESCRIPTION
    Configures the base URL for the Ommiquiz API endpoints
.PARAMETER BaseUrl
    The base URL of the Ommiquiz API (e.g., "https://your-app.ondigitalocean.app")
.EXAMPLE
    Set-OmmiquizConfig -BaseUrl "https://ommiquiz-app.ondigitalocean.app"
#>
function Set-OmmiquizConfig {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseUrl
    )
    
    # Remove trailing slash if present
    $BaseUrl = $BaseUrl.TrimEnd('/')
    $Script:OmmiquizConfig.BaseUrl = $BaseUrl
    
    Write-Verbose "Ommiquiz base URL set to: $BaseUrl"
}

<#
.SYNOPSIS
    Gets the current Ommiquiz configuration
.DESCRIPTION
    Returns the current configuration settings for the Ommiquiz module
.EXAMPLE
    Get-OmmiquizConfig
#>
function Get-OmmiquizConfig {
    [CmdletBinding()]
    param()
    
    return $Script:OmmiquizConfig
}

#endregion

#region API Helper Functions

function Invoke-OmmiquizApiRequest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Endpoint,
        
        [Parameter(Mandatory = $false)]
        [string]$Method = "GET",
        
        [Parameter(Mandatory = $false)]
        [hashtable]$Body = @{},
        
        [Parameter(Mandatory = $false)]
        [string]$ContentType = "application/json"
    )
    
    $uri = "$($Script:OmmiquizConfig.BaseUrl)$Endpoint"
    
    try {
        $params = @{
            Uri = $uri
            Method = $Method
            ContentType = $ContentType
        }
        
        if ($Method -ne "GET" -and $Body.Count -gt 0) {
            if ($ContentType -eq "application/json") {
                $params.Body = ($Body | ConvertTo-Json -Depth 10)
            } else {
                $params.Body = $Body
            }
        }
        
        Write-Verbose "Making $Method request to: $uri"
        $response = Invoke-RestMethod @params
        return $response
    }
    catch {
        Write-Error "API request failed: $($_.Exception.Message)"
        throw
    }
}

#endregion

#region Flashcard Management Functions

<#
.SYNOPSIS
    Gets all available flashcard sets from the Ommiquiz API
.DESCRIPTION
    Retrieves a list of all flashcard YAML files available on the server
.EXAMPLE
    Get-OmmiquizFlashcards
.EXAMPLE
    $flashcards = Get-OmmiquizFlashcards
    $flashcards | Format-Table
#>
function Get-OmmiquizFlashcards {
    [CmdletBinding()]
    param()
    
    try {
        $response = Invoke-OmmiquizApiRequest -Endpoint "/flashcards"
        return $response.flashcards
    }
    catch {
        Write-Error "Failed to retrieve flashcards: $($_.Exception.Message)"
        throw
    }
}

<#
.SYNOPSIS
    Gets a specific flashcard set by ID
.DESCRIPTION
    Retrieves the complete content of a flashcard YAML file from the server
.PARAMETER FlashcardId
    The ID of the flashcard set to retrieve
.EXAMPLE
    Get-OmmiquizFlashcard -FlashcardId "python-basics"
.EXAMPLE
    $pythonCards = Get-OmmiquizFlashcard -FlashcardId "python-basics"
    $pythonCards.flashcards | ForEach-Object { Write-Host $_.question }
#>
function Get-OmmiquizFlashcard {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$FlashcardId
    )
    
    # Validate ID format
    if ($FlashcardId -notmatch '^[a-zA-Z0-9_-]+$') {
        throw "Invalid flashcard ID format. Use only alphanumeric characters, hyphens, and underscores."
    }
    
    try {
        $response = Invoke-OmmiquizApiRequest -Endpoint "/flashcards/$FlashcardId"
        return $response
    }
    catch {
        Write-Error "Failed to retrieve flashcard '$FlashcardId': $($_.Exception.Message)"
        throw
    }
}

<#
.SYNOPSIS
    Uploads a YAML flashcard file to the Ommiquiz server
.DESCRIPTION
    Uploads and validates a flashcard YAML file to the server
.PARAMETER FilePath
    Path to the YAML file to upload
.PARAMETER Validate
    If specified, only validates the file without uploading
.EXAMPLE
    Send-OmmiquizFlashcard -FilePath "./my-flashcards.yaml"
.EXAMPLE
    Send-OmmiquizFlashcard -FilePath "./test-cards.yaml" -Validate
#>
function Send-OmmiquizFlashcard {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        
        [Parameter(Mandatory = $false)]
        [switch]$Validate
    )
    
    # Validate file exists
    if (!(Test-Path $FilePath)) {
        throw "File not found: $FilePath"
    }
    
    # Validate file extension
    $extension = [System.IO.Path]::GetExtension($FilePath).ToLower()
    if ($extension -notin @('.yaml', '.yml')) {
        throw "File must have .yaml or .yml extension"
    }
    
    try {
        # Prepare multipart form data
        $fileBinary = [System.IO.File]::ReadAllBytes($FilePath)
        $fileName = [System.IO.Path]::GetFileName($FilePath)
        
        # Create boundary
        $boundary = [System.Guid]::NewGuid().ToString()
        
        # Create form data
        $bodyLines = @()
        $bodyLines += "--$boundary"
        $bodyLines += "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`""
        $bodyLines += "Content-Type: application/x-yaml"
        $bodyLines += ""
        $bodyLines += [System.Text.Encoding]::UTF8.GetString($fileBinary)
        $bodyLines += "--$boundary--"
        
        $body = $bodyLines -join "`r`n"
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
        
        # Determine endpoint
        $endpoint = if ($Validate) { "/flashcards/validate" } else { "/flashcards/upload" }
        
        # Make request
        $uri = "$($Script:OmmiquizConfig.BaseUrl)$endpoint"
        $response = Invoke-RestMethod -Uri $uri -Method POST -Body $bodyBytes -ContentType "multipart/form-data; boundary=$boundary"
        
        return $response
    }
    catch {
        Write-Error "Failed to upload flashcard: $($_.Exception.Message)"
        throw
    }
}

<#
.SYNOPSIS
    Removes a flashcard set from the server
.DESCRIPTION
    Deletes a flashcard YAML file from the server by ID
.PARAMETER FlashcardId
    The ID of the flashcard set to remove
.PARAMETER Force
    If specified, skips confirmation prompt
.EXAMPLE
    Remove-OmmiquizFlashcard -FlashcardId "old-flashcard"
.EXAMPLE
    Remove-OmmiquizFlashcard -FlashcardId "test-cards" -Force
#>
function Remove-OmmiquizFlashcard {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory = $true)]
        [string]$FlashcardId,
        
        [Parameter(Mandatory = $false)]
        [switch]$Force
    )
    
    # Validate ID format
    if ($FlashcardId -notmatch '^[a-zA-Z0-9_-]+$') {
        throw "Invalid flashcard ID format. Use only alphanumeric characters, hyphens, and underscores."
    }
    
    if (!$Force -and !$PSCmdlet.ShouldProcess("Flashcard '$FlashcardId'", "Remove")) {
        return
    }
    
    try {
        $response = Invoke-OmmiquizApiRequest -Endpoint "/flashcards/$FlashcardId" -Method "DELETE"
        return $response
    }
    catch {
        Write-Error "Failed to remove flashcard '$FlashcardId': $($_.Exception.Message)"
        throw
    }
}

#endregion

#region YAML Creation and Validation Functions

<#
.SYNOPSIS
    Creates a new flashcard YAML file template
.DESCRIPTION
    Generates a properly formatted flashcard YAML file template with metadata
.PARAMETER Id
    Unique identifier for the flashcard set
.PARAMETER Title
    Title of the flashcard set
.PARAMETER Author
    Author of the flashcard set
.PARAMETER Description
    Description of the flashcard set
.PARAMETER Language
    Language code (e.g., "en", "de")
.PARAMETER Level
    Difficulty level (beginner, intermediate, advanced, expert)
.PARAMETER Topics
    Array of topics covered
.PARAMETER Keywords
    Array of keywords
.PARAMETER OutputPath
    Path where the YAML file should be saved
.EXAMPLE
    New-OmmiquizFlashcard -Id "powershell-basics" -Title "PowerShell Basics" -Author "Admin" -Description "Basic PowerShell concepts" -Language "en" -Level "beginner" -Topics @("PowerShell", "Scripting") -Keywords @("cmdlets", "variables") -OutputPath "./powershell-basics.yaml"
#>
function New-OmmiquizFlashcard {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Id,
        
        [Parameter(Mandatory = $true)]
        [string]$Title,
        
        [Parameter(Mandatory = $true)]
        [string]$Author,
        
        [Parameter(Mandatory = $true)]
        [string]$Description,
        
        [Parameter(Mandatory = $false)]
        [ValidateSet("en", "de", "fr", "es", "it", "pt", "nl", "ru", "ja", "zh")]
        [string]$Language = "en",
        
        [Parameter(Mandatory = $false)]
        [ValidateSet("beginner", "intermediate", "advanced", "expert")]
        [string]$Level = "beginner",
        
        [Parameter(Mandatory = $false)]
        [string[]]$Topics = @(),
        
        [Parameter(Mandatory = $false)]
        [string[]]$Keywords = @(),
        
        [Parameter(Mandatory = $true)]
        [string]$OutputPath
    )
    
    # Validate ID format
    if ($Id -notmatch '^[a-zA-Z0-9_-]+$') {
        throw "Invalid ID format. Use only alphanumeric characters, hyphens, and underscores."
    }
    
    # Create flashcard template
    $flashcard = @{
        id = $Id
        author = $Author
        title = $Title
        description = $Description
        createDate = (Get-Date).ToString("yyyy-MM-dd")
        language = $Language
        level = $Level
        topics = $Topics
        keywords = $Keywords
        flashcards = @(
            @{
                question = "Sample question?"
                answer = "Sample answer"
                type = "single"
            },
            @{
                question = "Multiple choice question?"
                answers = @(
                    "Option 1",
                    "Option 2", 
                    "Option 3"
                )
                type = "multiple"
            }
        )
    }
    
    try {
        # Convert to YAML and save
        $yamlContent = ConvertTo-Yaml $flashcard
        $yamlContent | Out-File -FilePath $OutputPath -Encoding UTF8
        
        Write-Host "Flashcard template created: $OutputPath" -ForegroundColor Green
        return $flashcard
    }
    catch {
        Write-Error "Failed to create flashcard file: $($_.Exception.Message)"
        throw
    }
}

<#
.SYNOPSIS
    Tests the health of the Ommiquiz API
.DESCRIPTION
    Performs a health check against the Ommiquiz API endpoint
.EXAMPLE
    Test-OmmiquizHealth
#>
function Test-OmmiquizHealth {
    [CmdletBinding()]
    param()
    
    try {
        $response = Invoke-OmmiquizApiRequest -Endpoint "/health"
        
        if ($response.status -eq "healthy") {
            Write-Host "✅ Ommiquiz API is healthy" -ForegroundColor Green
            return $true
        } else {
            Write-Warning "⚠️ Ommiquiz API returned unexpected health status: $($response.status)"
            return $false
        }
    }
    catch {
        Write-Error "❌ Ommiquiz API health check failed: $($_.Exception.Message)"
        return $false
    }
}

#endregion

#region Utility Functions

function ConvertTo-Yaml {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object]$InputObject
    )
    
    # Simple YAML conversion (basic implementation)
    # For production use, consider using a proper YAML library
    
    function ConvertValue {
        param($value, $indent = 0)
        
        $spaces = "  " * $indent
        
        if ($null -eq $value) {
            return "null"
        }
        elseif ($value -is [string]) {
            if ($value.Contains(":") -or $value.Contains("`n") -or $value.StartsWith(" ") -or $value.EndsWith(" ")) {
                return "`"$($value.Replace('`"', '\`"'))`""
            }
            return $value
        }
        elseif ($value -is [bool]) {
            return $value.ToString().ToLower()
        }
        elseif ($value -is [array]) {
            if ($value.Count -eq 0) {
                return "[]"
            }
            $result = @()
            foreach ($item in $value) {
                $result += "$spaces- $(ConvertValue $item 0)"
            }
            return "`n" + ($result -join "`n")
        }
        elseif ($value -is [hashtable] -or $value.GetType().Name -eq "PSCustomObject") {
            $props = if ($value -is [hashtable]) { $value.GetEnumerator() } else { $value.PSObject.Properties }
            $result = @()
            foreach ($prop in $props) {
                $key = if ($value -is [hashtable]) { $prop.Key } else { $prop.Name }
                $val = if ($value -is [hashtable]) { $prop.Value } else { $prop.Value }
                
                $convertedValue = ConvertValue $val ($indent + 1)
                if ($convertedValue.StartsWith("`n")) {
                    $result += "$spaces$($key):$convertedValue"
                } else {
                    $result += "$spaces$($key): $convertedValue"
                }
            }
            return "`n" + ($result -join "`n")
        }
        else {
            return $value.ToString()
        }
    }
    
    $yaml = ConvertValue $InputObject
    return $yaml.TrimStart("`n")
}

#endregion

#region Export Module Members

# Export all public functions
Export-ModuleMember -Function @(
    'Set-OmmiquizConfig',
    'Get-OmmiquizConfig',
    'Get-OmmiquizFlashcards',
    'Get-OmmiquizFlashcard',
    'Send-OmmiquizFlashcard',
    'Remove-OmmiquizFlashcard',
    'New-OmmiquizFlashcard',
    'Test-OmmiquizHealth'
)

#endregion