#requires -Version 5.1
Set-StrictMode -Version Latest

$Script:OmmiQuizApiBaseUrl = 'https://nanoquiz-backend-ypez6.ondigitalocean.app/api/'

function Set-OmmiQuizApiBaseUrl {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$BaseUrl
    )

    if (-not $BaseUrl.EndsWith('/')) {
        $BaseUrl = "$BaseUrl/"
    }

    try {
        $null = [uri]$BaseUrl
    }
    catch {
        throw "The provided base url '$BaseUrl' is not a valid absolute URI."
    }

    $Script:OmmiQuizApiBaseUrl = $BaseUrl
}

function Get-OmmiQuizApiBaseUrl {
    [CmdletBinding()]
    param()
    return $Script:OmmiQuizApiBaseUrl
}

function Invoke-OmmiQuizApiRequest {
    <#
    .SYNOPSIS
    Sends a request to the OmmiQuiz API and captures the HTTP response metadata.

    .DESCRIPTION
    Internal helper that uses Invoke-WebRequest to call the API and optionally asserts
    an expected HTTP status code.

    .PARAMETER Path
    Relative path that will be appended to the currently configured base url.

    .PARAMETER Method
    HTTP verb to use. Defaults to GET.

    .PARAMETER Body
    Optional request body. When provided and not already a string it will be converted to JSON.

    .PARAMETER Headers
    Optional HTTP headers that should be included in the request.

    .PARAMETER ExpectedStatusCode
    Optional numeric HTTP status code that must match the server response.

    .OUTPUTS
    PSCustomObject describing the request and response metadata as well as the parsed content (if JSON).
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [ValidateSet('GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD')]
        [string]$Method = 'GET',

        [object]$Body,
        [hashtable]$Headers,
        [int]$ExpectedStatusCode,
        [switch]$SkipJsonParsing
    )

    $baseUrl = Get-OmmiQuizApiBaseUrl
    $relativePath = $Path.TrimStart('/')
    $uri = [uri]::new([uri]$baseUrl, $relativePath)

    $requestBody = $null
    $contentType = $null
    if ($PSBoundParameters.ContainsKey('Body')) {
        if ($Body -is [string]) {
            $requestBody = $Body
            $contentType = 'application/json'
        }
        else {
            $requestBody = ($Body | ConvertTo-Json -Depth 10)
            $contentType = 'application/json'
        }
    }

    try {
        $response = Invoke-WebRequest -Uri $uri -Method $Method -Headers $Headers -Body $requestBody -ContentType $contentType -UseBasicParsing -ErrorAction Stop
    }
    catch {
        throw "Request to $uri failed: $($_.Exception.Message)"
    }

    if ($PSBoundParameters.ContainsKey('ExpectedStatusCode') -and $response.StatusCode -ne $ExpectedStatusCode) {
        throw "Expected status code $ExpectedStatusCode but received $($response.StatusCode) for $uri."
    }

    $content = $response.Content
    $parsedContent = $null
    if (-not $SkipJsonParsing -and $content -and ($response.Headers['Content-Type'] -match 'application/json')) {
        try {
            $parsedContent = $content | ConvertFrom-Json -Depth 10
        }
        catch {
            Write-Warning "Failed to parse JSON content from $uri`: $($_.Exception.Message)"
        }
    }

    [pscustomobject]@{
        Uri = $uri.AbsoluteUri
        Method = $Method
        StatusCode = $response.StatusCode
        Headers = $response.Headers
        Content = if ($parsedContent) { $parsedContent } else { $content }
    }
}

function Test-OmmiQuizHealthEndpoint {
    <#
    .SYNOPSIS
    Validates the /health endpoint and ensures it reports a healthy status.

    .OUTPUTS
    PSCustomObject with the health information as well as a Success flag and message.
    #>
    [CmdletBinding()]
    param()

    $result = Invoke-OmmiQuizApiRequest -Path '/health' -Method 'GET' -ExpectedStatusCode 200

    $isHealthy = $false
    $message = 'Health endpoint did not return the expected payload.'
    if ($result.Content -and $result.Content.status) {
        $isHealthy = $true
        $message = "Health status: $($result.Content.status)"
    }

    [pscustomobject]@{
        Test = 'Health'
        Success = $isHealthy
        StatusCode = $result.StatusCode
        Message = $message
        Payload = $result.Content
    }
}

function Get-OmmiQuizFlashcardSet {
    <#
    .SYNOPSIS
    Retrieves flashcard set(s) from the API.

    .DESCRIPTION
    Retrieves either a single flashcard set by its identifier or all available flashcard sets.

    .PARAMETER FlashcardId
    The identifier of the flashcard set to retrieve. Required unless -All is specified.

    .PARAMETER All
    If specified, retrieves all available flashcard sets instead of a single set.

    .EXAMPLE
    Get-OmmiQuizFlashcardSet -FlashcardId "my-flashcard-set"

    .EXAMPLE
    Get-OmmiQuizFlashcardSet -All
    #>
    [CmdletBinding(DefaultParameterSetName='Single')]
    param(
        [Parameter(Mandatory, ParameterSetName='Single')]
        [ValidateNotNullOrEmpty()]
        [string]$FlashcardId,

        [Parameter(Mandatory, ParameterSetName='All')]
        [switch]$All
    )

    if ($All) {
        Invoke-OmmiQuizApiRequest -Path '/flashcards' -Method 'GET' -ExpectedStatusCode 200
    } else {
        Invoke-OmmiQuizApiRequest -Path "/flashcards/$FlashcardId" -Method 'GET' -ExpectedStatusCode 200
    }
}

function Test-OmmiQuizFlashcardListing {
    <#
    .SYNOPSIS
    Ensures the flashcard overview endpoint returns at least one set with the required metadata.
    #>
    [CmdletBinding()]
    param()

    $result = Get-OmmiQuizFlashcardSet -All
    $content = $result.Content

    # Handle both array and single object responses
    $sets = @()
    if ($content) {
        if ($content -is [array]) {
            $sets = $content
        } elseif ($content.PSObject.Properties['flashcards']) {
            $sets = @($content.flashcards)
        } elseif ($content.PSObject.Properties['flashcard_sets']) {
            $sets = @($content.flashcard_sets)
        } else {
            $sets = @($content)
        }
    }

    $hasSets = ($sets.Count -gt 0)
    $hasMetadata = $false
    if ($hasSets) {
        $first = $sets | Select-Object -First 1
        $hasMetadata = ($null -ne $first.id)
    }

    [pscustomobject]@{
        Test = 'FlashcardListing'
        Success = ($hasSets -and $hasMetadata)
        StatusCode = $result.StatusCode
        Message = if ($hasSets) { "Retrieved $($sets.Count) flashcard set(s)." } else { 'No flashcard sets returned.' }
        Payload = $content
    }
}

function Test-OmmiQuizFlashcardDetail {
    <#
    .SYNOPSIS
    Fetches a single flashcard set (defaulting to the first available) and validates its structure.
    #>
    [CmdletBinding()]
    param(
        [string]$FlashcardId
    )

    $selectedId = $FlashcardId
    if (-not $selectedId) {
        $listing = Get-OmmiQuizFlashcardSet -All
        
        # Handle both array and single object responses
        $sets = @()
        if ($listing.Content) {
            if ($listing.Content -is [array]) {
                $sets = $listing.Content
            } elseif ($listing.Content.PSObject.Properties['flashcards']) {
                $sets = @($listing.Content.flashcards)
            } elseif ($listing.Content.PSObject.Properties['flashcard_sets']) {
                $sets = @($listing.Content.flashcard_sets)
            } else {
                $sets = @($listing.Content)
            }
        }
        
        $first = $sets | Select-Object -First 1
        if (-not $first -or -not $first.id) {
            return [pscustomobject]@{
                Test = 'FlashcardDetail'
                Success = $false
                StatusCode = $listing.StatusCode
                Message = 'No flashcard sets available to test.'
                Payload = $null
            }
        }
        $selectedId = $first.id
    }

    $result = Get-OmmiQuizFlashcardSet -FlashcardId $selectedId
    $content = $result.Content

    $cards = @()
    if ($content.flashcards) {
        $cards = @($content.flashcards)
    }
    
    $hasCards = $cards.Count -gt 0
    $firstCardHasFields = $false
    if ($hasCards) {
        $card = $cards | Select-Object -First 1
        $firstCardHasFields = ($card.question -and ($card.answer -or $card.answers))
    }

    [pscustomobject]@{
        Test = 'FlashcardDetail'
        Success = ($hasCards -and $firstCardHasFields)
        StatusCode = $result.StatusCode
        Message = if ($hasCards) { "Flashcard set '$selectedId' returned $($cards.Count) card(s)." } else { "Flashcard set '$selectedId' did not return any cards." }
        Payload = $content
    }
}

function Invoke-OmmiQuizApiSmokeTests {
    <#
    .SYNOPSIS
    Executes all API validation tests and returns an aggregated summary.
    #>
    [CmdletBinding()]
    param(
        [string]$FlashcardId
    )

    $tests = @(
        { Test-OmmiQuizHealthEndpoint },
        { Test-OmmiQuizFlashcardListing },
        { Test-OmmiQuizFlashcardDetail -FlashcardId $FlashcardId }
    )

    $results = foreach ($test in $tests) {
        & $test
    }

    $allResults = @($results)
    $passedResults = @($allResults | Where-Object { $_.Success })
    $failedResults = @($allResults | Where-Object { -not $_.Success })

    $summary = [pscustomobject]@{
        Total = $allResults.Count
        Passed = $passedResults.Count
        Failed = $failedResults.Count
    }

    [pscustomobject]@{
        Summary = $summary
        Results = $allResults
    }
}

function Get-OmmiQuizLog {
    <#
    .SYNOPSIS
    Queries application logs from the OmmiQuiz API with optional filtering.

    .DESCRIPTION
    Retrieves log entries from the backend with support for time-based filtering,
    log level filtering, message content search, and pagination.

    .PARAMETER StartTime
    Start time for log filtering (ISO format datetime).

    .PARAMETER EndTime
    End time for log filtering (ISO format datetime).

    .PARAMETER Level
    Log level filter (DEBUG, INFO, WARNING, ERROR).

    .PARAMETER MessageContains
    Filter logs containing this text in the message field.

    .PARAMETER Limit
    Maximum number of log entries to return (default: 100).

    .PARAMETER Offset
    Number of log entries to skip for pagination (default: 0).

    .EXAMPLE
    Get-OmmiQuizLog -Level ERROR -Limit 50

    .EXAMPLE
    Get-OmmiQuizLog -StartTime "2025-12-16T10:00:00" -MessageContains "flashcard"

    .EXAMPLE
    Get-OmmiQuizLog -Level WARNING -StartTime (Get-Date).AddHours(-1).ToString("yyyy-MM-ddTHH:mm:ss")
    #>
    [CmdletBinding()]
    param(
        [datetime]$StartTime,
        [datetime]$EndTime,
        [ValidateSet('DEBUG','INFO','WARNING','ERROR')]
        [string]$Level,
        [string]$MessageContains,
        [int]$Limit = 100,
        [int]$Offset = 0
    )

    $queryParams = @()
    
    if ($PSBoundParameters.ContainsKey('StartTime')) {
        $startTimeStr = $StartTime.ToString('yyyy-MM-ddTHH:mm:ss')
        $queryParams += "start_time=$([uri]::EscapeDataString($startTimeStr))"
    }
    
    if ($PSBoundParameters.ContainsKey('EndTime')) {
        $endTimeStr = $EndTime.ToString('yyyy-MM-ddTHH:mm:ss')
        $queryParams += "end_time=$([uri]::EscapeDataString($endTimeStr))"
    }
    
    if ($PSBoundParameters.ContainsKey('Level')) {
        $queryParams += "level=$([uri]::EscapeDataString($Level))"
    }
    
    if ($PSBoundParameters.ContainsKey('MessageContains')) {
        $queryParams += "message_contains=$([uri]::EscapeDataString($MessageContains))"
    }
    
    $queryParams += "limit=$Limit"
    $queryParams += "offset=$Offset"
    
    $queryString = if ($queryParams.Count -gt 0) { "?" + ($queryParams -join "&") } else { "" }
    $path = "/logs$queryString"
    
    Invoke-OmmiQuizApiRequest -Path $path -Method 'GET' -ExpectedStatusCode 200
}

function Get-OmmiQuizLogFile {
    <#
    .SYNOPSIS
    Retrieves log file(s) from the API.

    .DESCRIPTION
    Retrieves either a specific log file's content by filename or metadata about all available log files.

    .PARAMETER Filename
    Name of the log file to download (e.g., "app-2025-12-16.log"). Required unless -All is specified.

    .PARAMETER All
    If specified, retrieves metadata about all available log files instead of downloading a specific file.

    .EXAMPLE
    Get-OmmiQuizLogFile -Filename "app-2025-12-16.log"

    .EXAMPLE
    Get-OmmiQuizLogFile -All
    #>
    [CmdletBinding(DefaultParameterSetName='Single')]
    param(
        [Parameter(Mandatory, ParameterSetName='Single')]
        [ValidateNotNullOrEmpty()]
        [string]$Filename,

        [Parameter(Mandatory, ParameterSetName='All')]
        [switch]$All
    )

    if ($All) {
        Invoke-OmmiQuizApiRequest -Path '/logs/files' -Method 'GET' -ExpectedStatusCode 200
    } else {
        # Validate filename pattern
        if ($Filename -notmatch '^[a-zA-Z0-9_-]+\.log$') {
            throw "Invalid log filename format. Expected format: alphanumeric characters, hyphens, underscores, and .log extension."
        }

        Invoke-OmmiQuizApiRequest -Path "/logs/download/$Filename" -Method 'GET' -ExpectedStatusCode 200 -SkipJsonParsing
    }
}

function Test-OmmiQuizLogsEndpoint {
    <#
    .SYNOPSIS
    Validates the logs endpoint and ensures it returns log data.

    .DESCRIPTION
    Tests the logs querying functionality by making a basic request and validating
    the response structure.

    .OUTPUTS
    PSCustomObject with test results including Success flag and message.
    #>
    [CmdletBinding()]
    param()

    try {
        $result = Get-OmmiQuizLog -Limit 10
        $content = $result.Content

        $hasLogs = $false
        $hasStructure = $false
        $logCount = 0

        if ($content) {
            $hasStructure = ($null -ne $content.logs -and $null -ne $content.total)
            if ($hasStructure) {
                $logs = @($content.logs)
                $logCount = $logs.Count
                $hasLogs = $logCount -gt 0
                
                # Validate log entry structure if we have logs
                if ($hasLogs) {
                    $firstLog = $logs | Select-Object -First 1
                    $hasRequiredFields = ($null -ne $firstLog.timestamp -and 
                                        $null -ne $firstLog.level -and 
                                        $null -ne $firstLog.message)
                    if (-not $hasRequiredFields) {
                        $hasStructure = $false
                    }
                }
            }
        }

        $success = $hasStructure
        $message = if ($hasLogs) {
            "Logs endpoint returned $logCount log entries with valid structure."
        } elseif ($hasStructure) {
            "Logs endpoint returned valid structure but no log entries."
        } else {
            "Logs endpoint did not return expected structure."
        }

        [pscustomobject]@{
            Test = 'LogsEndpoint'
            Success = $success
            StatusCode = $result.StatusCode
            Message = $message
            LogCount = $logCount
            Payload = $content
        }
    }
    catch {
        [pscustomobject]@{
            Test = 'LogsEndpoint'
            Success = $false
            StatusCode = $null
            Message = "Logs endpoint test failed: $($_.Exception.Message)"
            LogCount = 0
            Payload = $null
        }
    }
}

function Test-OmmiQuizLogFilesEndpoint {
    <#
    .SYNOPSIS
    Validates the log files listing endpoint.

    .OUTPUTS
    PSCustomObject with test results including Success flag and message.
    #>
    [CmdletBinding()]
    param()

    try {
        $result = Get-OmmiQuizLogFile -All
        $content = $result.Content

        $hasFiles = $false
        $hasStructure = $false
        $fileCount = 0

        if ($content -and $content.log_files) {
            $files = @($content.log_files)
            $fileCount = $files.Count
            $hasFiles = $fileCount -gt 0
            $hasStructure = $true
            
            # Validate file entry structure if we have files
            if ($hasFiles) {
                $firstFile = $files | Select-Object -First 1
                $hasRequiredFields = ($null -ne $firstFile.filename -and 
                                    $null -ne $firstFile.size -and 
                                    $null -ne $firstFile.modified)
                if (-not $hasRequiredFields) {
                    $hasStructure = $false
                }
            }
        }

        $success = $hasStructure
        $message = if ($hasFiles) {
            "Log files endpoint returned $fileCount log files with valid structure."
        } elseif ($hasStructure) {
            "Log files endpoint returned valid structure but no log files."
        } else {
            "Log files endpoint did not return expected structure."
        }

        [pscustomobject]@{
            Test = 'LogFilesEndpoint'
            Success = $success
            StatusCode = $result.StatusCode
            Message = $message
            FileCount = $fileCount
            Payload = $content
        }
    }
    catch {
        [pscustomobject]@{
            Test = 'LogFilesEndpoint'
            Success = $false
            StatusCode = $null
            Message = "Log files endpoint test failed: $($_.Exception.Message)"
            FileCount = 0
            Payload = $null
        }
    }
}

function Get-OmmiQuizSpeedQuizPdf {
    <#
    .SYNOPSIS
    Downloads a speed quiz PDF worksheet for a flashcard set.

    .DESCRIPTION
    Generates and downloads a printable PDF worksheet containing 12 randomly
    selected flashcards. The PDF includes questions without answers:
    - Single choice questions have dotted lines for writing answers
    - Multiple choice questions have empty checkboxes for each option

    .PARAMETER FlashcardId
    The identifier of the flashcard set to generate the PDF for.

    .PARAMETER OutputPath
    Optional path where the PDF should be saved. If not specified, saves to
    the current directory with the filename from the Content-Disposition header.

    .EXAMPLE
    Get-OmmiQuizSpeedQuizPdf -FlashcardId "my-flashcard-set"

    .EXAMPLE
    Get-OmmiQuizSpeedQuizPdf -FlashcardId "my-flashcard-set" -OutputPath "C:\Temp\quiz.pdf"

    .OUTPUTS
    PSCustomObject with the download result including Success flag, file path, and size.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$FlashcardId,

        [string]$OutputPath
    )

    $baseUrl = Get-OmmiQuizApiBaseUrl
    $path = "flashcards/$FlashcardId/speed-quiz-pdf"
    $uri = [uri]::new([uri]$baseUrl, $path)

    try {
        # Download the PDF
        $response = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing -ErrorAction Stop

        # Extract filename from Content-Disposition header if not specified
        $filename = $null
        if ($response.Headers['Content-Disposition']) {
            # Convert to string in case it's an array
            $disposition = [string]$response.Headers['Content-Disposition']
            if ($disposition -match 'filename="?([^"]+)"?') {
                $filename = $matches[1]
            }
        }

        # Default filename if not found in header
        if (-not $filename) {
            $filename = "$FlashcardId-speed-quiz.pdf"
        }

        # Determine output path
        $savePath = if ($OutputPath) {
            $OutputPath
        } else {
            Join-Path -Path (Get-Location) -ChildPath $filename
        }

        # Save the PDF file
        [System.IO.File]::WriteAllBytes($savePath, $response.Content)

        $fileInfo = Get-Item -Path $savePath
        $fileSizeKB = [math]::Round($fileInfo.Length / 1KB, 2)

        [pscustomobject]@{
            Success = $true
            FlashcardId = $FlashcardId
            FilePath = $savePath
            FileName = $fileInfo.Name
            FileSizeKB = $fileSizeKB
            StatusCode = $response.StatusCode
            Message = "Successfully downloaded speed quiz PDF ($fileSizeKB KB)"
        }
    }
    catch {
        [pscustomobject]@{
            Success = $false
            FlashcardId = $FlashcardId
            FilePath = $null
            FileName = $null
            FileSizeKB = 0
            StatusCode = $null
            Message = "Failed to download speed quiz PDF: $($_.Exception.Message)"
        }
    }
}

function Test-OmmiQuizSpeedQuizPdfEndpoint {
    <#
    .SYNOPSIS
    Validates the speed quiz PDF generation endpoint.

    .DESCRIPTION
    Tests the PDF generation functionality by requesting a speed quiz PDF
    for a flashcard set and validating that a valid PDF file is returned.

    .PARAMETER FlashcardId
    Optional flashcard ID to test with. If not provided, uses the first available flashcard set.

    .PARAMETER KeepFile
    If specified, keeps the downloaded PDF file. Otherwise, it's deleted after validation.

    .OUTPUTS
    PSCustomObject with test results including Success flag, message, and file information.

    .EXAMPLE
    Test-OmmiQuizSpeedQuizPdfEndpoint

    .EXAMPLE
    Test-OmmiQuizSpeedQuizPdfEndpoint -FlashcardId "my-set" -KeepFile
    #>
    [CmdletBinding()]
    param(
        [string]$FlashcardId,
        [switch]$KeepFile
    )

    try {
        # Get flashcard ID if not provided
        $selectedId = $FlashcardId
        if (-not $selectedId) {
            $listing = Get-OmmiQuizFlashcardSet -All

            $sets = @()
            if ($listing.Content) {
                if ($listing.Content -is [array]) {
                    $sets = $listing.Content
                } elseif ($listing.Content.PSObject.Properties['flashcards']) {
                    $sets = @($listing.Content.flashcards)
                } elseif ($listing.Content.PSObject.Properties['flashcard_sets']) {
                    $sets = @($listing.Content.flashcard_sets)
                } else {
                    $sets = @($listing.Content)
                }
            }

            $first = $sets | Select-Object -First 1
            if (-not $first -or -not $first.id) {
                return [pscustomobject]@{
                    Test = 'SpeedQuizPdfEndpoint'
                    Success = $false
                    StatusCode = $null
                    Message = 'No flashcard sets available to test PDF generation.'
                    FilePath = $null
                    FileSizeKB = 0
                }
            }
            $selectedId = $first.id
        }

        # Download the PDF
        $result = Get-OmmiQuizSpeedQuizPdf -FlashcardId $selectedId

        if (-not $result.Success) {
            return [pscustomobject]@{
                Test = 'SpeedQuizPdfEndpoint'
                Success = $false
                StatusCode = $result.StatusCode
                Message = $result.Message
                FilePath = $null
                FileSizeKB = 0
            }
        }

        # Validate PDF file
        $isPdf = $false
        $isValidSize = $false

        if (Test-Path -Path $result.FilePath) {
            # Check if it's a PDF by reading the header
            $bytes = [System.IO.File]::ReadAllBytes($result.FilePath)
            if ($bytes.Length -ge 4) {
                $header = [System.Text.Encoding]::ASCII.GetString($bytes[0..3])
                $isPdf = $header -eq '%PDF'
            }

            # Check file size (should be reasonable, > 1KB)
            $isValidSize = $result.FileSizeKB -gt 1
        }

        $success = $isPdf -and $isValidSize
        $message = if ($success) {
            "Speed quiz PDF generated successfully for '$selectedId' ($($result.FileSizeKB) KB)"
        } elseif (-not $isPdf) {
            "Downloaded file is not a valid PDF"
        } else {
            "Downloaded file size is invalid"
        }

        # Cleanup unless KeepFile is specified
        if (-not $KeepFile -and (Test-Path -Path $result.FilePath)) {
            Remove-Item -Path $result.FilePath -Force
        }

        [pscustomobject]@{
            Test = 'SpeedQuizPdfEndpoint'
            Success = $success
            StatusCode = $result.StatusCode
            Message = $message
            FilePath = if ($KeepFile) { $result.FilePath } else { $null }
            FileSizeKB = $result.FileSizeKB
            FlashcardId = $selectedId
        }
    }
    catch {
        [pscustomobject]@{
            Test = 'SpeedQuizPdfEndpoint'
            Success = $false
            StatusCode = $null
            Message = "Speed quiz PDF endpoint test failed: $($_.Exception.Message)"
            FilePath = $null
            FileSizeKB = 0
            FlashcardId = $FlashcardId
        }
    }
}

# ============================================================================
# Version & Info Endpoints
# ============================================================================

function Get-OmmiQuizVersion {
    <#
    .SYNOPSIS
    Retrieves the API version information.

    .EXAMPLE
    Get-OmmiQuizVersion
    #>
    [CmdletBinding()]
    param()

    Invoke-OmmiQuizApiRequest -Path '/version' -Method 'GET' -ExpectedStatusCode 200
}

function Get-OmmiQuizRoot {
    <#
    .SYNOPSIS
    Retrieves the root API information.

    .EXAMPLE
    Get-OmmiQuizRoot
    #>
    [CmdletBinding()]
    param()

    Invoke-OmmiQuizApiRequest -Path '/' -Method 'GET' -ExpectedStatusCode 200
}

# ============================================================================
# Flashcard Management Endpoints (Admin)
# ============================================================================

function Update-OmmiQuizFlashcardSet {
    <#
    .SYNOPSIS
    Updates an existing flashcard set.

    .PARAMETER FlashcardId
    The identifier of the flashcard set to update.

    .PARAMETER FlashcardData
    The flashcard data object or JSON string containing the updated flashcard set.

    .PARAMETER AuthToken
    Authentication token (JWT) for admin access.

    .EXAMPLE
    $data = @{ title = "Updated Title"; cards = @() } | ConvertTo-Json
    Update-OmmiQuizFlashcardSet -FlashcardId "my-set" -FlashcardData $data -AuthToken $token
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$FlashcardId,

        [Parameter(Mandatory)]
        [object]$FlashcardData,

        [Parameter(Mandatory)]
        [string]$AuthToken
    )

    $headers = @{
        'Authorization' = "Bearer $AuthToken"
    }

    Invoke-OmmiQuizApiRequest -Path "/flashcards/$FlashcardId" -Method 'PUT' -Body $FlashcardData -Headers $headers -ExpectedStatusCode 200
}

function New-OmmiQuizFlashcardSet {
    <#
    .SYNOPSIS
    Uploads a new flashcard set from YAML file.

    .PARAMETER FilePath
    Path to the YAML file containing the flashcard set.

    .PARAMETER AuthToken
    Authentication token (JWT) for admin access.

    .EXAMPLE
    New-OmmiQuizFlashcardSet -FilePath "C:\flashcards\my-set.yml" -AuthToken $token
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [ValidateScript({Test-Path $_})]
        [string]$FilePath,

        [Parameter(Mandatory)]
        [string]$AuthToken
    )

    $baseUrl = Get-OmmiQuizApiBaseUrl
    $uri = [uri]::new([uri]$baseUrl, "flashcards/upload")

    $fileContent = [System.IO.File]::ReadAllBytes($FilePath)
    $fileName = [System.IO.Path]::GetFileName($FilePath)

    $boundary = [System.Guid]::NewGuid().ToString()
    $headers = @{
        'Authorization' = "Bearer $AuthToken"
        'Content-Type' = "multipart/form-data; boundary=$boundary"
    }

    # Build multipart form data
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"",
        "Content-Type: application/x-yaml",
        "",
        [System.Text.Encoding]::UTF8.GetString($fileContent),
        "--$boundary--"
    )
    $body = $bodyLines -join "`r`n"

    try {
        $response = Invoke-WebRequest -Uri $uri -Method POST -Headers $headers -Body $body -UseBasicParsing -ErrorAction Stop

        [pscustomobject]@{
            Uri = $uri.AbsoluteUri
            Method = 'POST'
            StatusCode = $response.StatusCode
            Headers = $response.Headers
            Content = $response.Content | ConvertFrom-Json
        }
    }
    catch {
        throw "Failed to upload flashcard set: $($_.Exception.Message)"
    }
}

function Remove-OmmiQuizFlashcardSet {
    <#
    .SYNOPSIS
    Deletes a flashcard set.

    .PARAMETER FlashcardId
    The identifier of the flashcard set to delete.

    .PARAMETER AuthToken
    Authentication token (JWT) for admin access.

    .EXAMPLE
    Remove-OmmiQuizFlashcardSet -FlashcardId "my-set" -AuthToken $token
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact='High')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$FlashcardId,

        [Parameter(Mandatory)]
        [string]$AuthToken
    )

    if ($PSCmdlet.ShouldProcess($FlashcardId, "Delete flashcard set")) {
        $headers = @{
            'Authorization' = "Bearer $AuthToken"
        }

        Invoke-OmmiQuizApiRequest -Path "/flashcards/$FlashcardId" -Method 'DELETE' -Headers $headers -ExpectedStatusCode 200
    }
}

function Test-OmmiQuizFlashcardYaml {
    <#
    .SYNOPSIS
    Validates a flashcard YAML file without uploading it.

    .PARAMETER FilePath
    Path to the YAML file to validate.

    .PARAMETER AuthToken
    Authentication token (JWT) for admin access.

    .EXAMPLE
    Test-OmmiQuizFlashcardYaml -FilePath "C:\flashcards\my-set.yml" -AuthToken $token
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [ValidateScript({Test-Path $_})]
        [string]$FilePath,

        [Parameter(Mandatory)]
        [string]$AuthToken
    )

    $baseUrl = Get-OmmiQuizApiBaseUrl
    $uri = [uri]::new([uri]$baseUrl, "flashcards/validate")

    $fileContent = [System.IO.File]::ReadAllBytes($FilePath)
    $fileName = [System.IO.Path]::GetFileName($FilePath)

    $boundary = [System.Guid]::NewGuid().ToString()
    $headers = @{
        'Authorization' = "Bearer $AuthToken"
        'Content-Type' = "multipart/form-data; boundary=$boundary"
    }

    # Build multipart form data
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"",
        "Content-Type: application/x-yaml",
        "",
        [System.Text.Encoding]::UTF8.GetString($fileContent),
        "--$boundary--"
    )
    $body = $bodyLines -join "`r`n"

    try {
        $response = Invoke-WebRequest -Uri $uri -Method POST -Headers $headers -Body $body -UseBasicParsing -ErrorAction Stop

        [pscustomobject]@{
            Uri = $uri.AbsoluteUri
            Method = 'POST'
            StatusCode = $response.StatusCode
            Headers = $response.Headers
            Content = $response.Content | ConvertFrom-Json
        }
    }
    catch {
        throw "Failed to validate flashcard YAML: $($_.Exception.Message)"
    }
}

function Get-OmmiQuizFlashcardCatalog {
    <#
    .SYNOPSIS
    Retrieves the flashcard catalog (list view).

    .EXAMPLE
    Get-OmmiQuizFlashcardCatalog
    #>
    [CmdletBinding()]
    param()

    Invoke-OmmiQuizApiRequest -Path '/flashcards/catalog' -Method 'GET' -ExpectedStatusCode 200
}

function Get-OmmiQuizFlashcardCatalogData {
    <#
    .SYNOPSIS
    Retrieves the flashcard catalog metadata.

    .EXAMPLE
    Get-OmmiQuizFlashcardCatalogData
    #>
    [CmdletBinding()]
    param()

    Invoke-OmmiQuizApiRequest -Path '/flashcards/catalog/data' -Method 'GET' -ExpectedStatusCode 200
}

# ============================================================================
# Progress Tracking Endpoints
# ============================================================================

function Get-OmmiQuizProgress {
    <#
    .SYNOPSIS
    Retrieves user progress for a flashcard set.

    .PARAMETER FlashcardId
    The identifier of the flashcard set.

    .PARAMETER AuthToken
    Authentication token (JWT).

    .EXAMPLE
    Get-OmmiQuizProgress -FlashcardId "my-set" -AuthToken $token
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$FlashcardId,

        [Parameter(Mandatory)]
        [string]$AuthToken
    )

    $headers = @{
        'Authorization' = "Bearer $AuthToken"
    }

    Invoke-OmmiQuizApiRequest -Path "/flashcards/$FlashcardId/progress" -Method 'GET' -Headers $headers -ExpectedStatusCode 200
}

function Set-OmmiQuizProgress {
    <#
    .SYNOPSIS
    Saves user progress for a flashcard set.

    .PARAMETER FlashcardId
    The identifier of the flashcard set.

    .PARAMETER ProgressData
    The progress data object or JSON string.

    .PARAMETER AuthToken
    Authentication token (JWT).

    .EXAMPLE
    $progress = @{
        cards = @{
            "card1" = @{ box = 1; last_reviewed = (Get-Date).ToString("o"); review_count = 1 }
        }
        session_summary = @{
            completed_at = (Get-Date).ToString("o")
            cards_reviewed = 1
            box_distribution = @{ box1 = 1; box2 = 0; box3 = 0 }
        }
    }
    Set-OmmiQuizProgress -FlashcardId "my-set" -ProgressData $progress -AuthToken $token
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$FlashcardId,

        [Parameter(Mandatory)]
        [object]$ProgressData,

        [Parameter(Mandatory)]
        [string]$AuthToken
    )

    $headers = @{
        'Authorization' = "Bearer $AuthToken"
    }

    Invoke-OmmiQuizApiRequest -Path "/flashcards/$FlashcardId/progress" -Method 'PUT' -Body $ProgressData -Headers $headers -ExpectedStatusCode 200
}

function Clear-OmmiQuizProgress {
    <#
    .SYNOPSIS
    Deletes user progress for a flashcard set.

    .PARAMETER FlashcardId
    The identifier of the flashcard set.

    .PARAMETER AuthToken
    Authentication token (JWT).

    .EXAMPLE
    Clear-OmmiQuizProgress -FlashcardId "my-set" -AuthToken $token
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact='High')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$FlashcardId,

        [Parameter(Mandatory)]
        [string]$AuthToken
    )

    if ($PSCmdlet.ShouldProcess($FlashcardId, "Delete progress data")) {
        $headers = @{
            'Authorization' = "Bearer $AuthToken"
        }

        Invoke-OmmiQuizApiRequest -Path "/flashcards/$FlashcardId/progress" -Method 'DELETE' -Headers $headers -ExpectedStatusCode 200
    }
}

# ============================================================================
# User Reports Endpoints
# ============================================================================

function Get-OmmiQuizCurrentUser {
    <#
    .SYNOPSIS
    Retrieves the current user's profile information.

    .PARAMETER AuthToken
    Authentication token (JWT).

    .EXAMPLE
    Get-OmmiQuizCurrentUser -AuthToken $token
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$AuthToken
    )

    $headers = @{
        'Authorization' = "Bearer $AuthToken"
    }

    Invoke-OmmiQuizApiRequest -Path '/users/me' -Method 'GET' -Headers $headers -ExpectedStatusCode 200
}

function Get-OmmiQuizLearningReport {
    <#
    .SYNOPSIS
    Retrieves the user's learning report.

    .PARAMETER Days
    Number of days to include in the report (default: 30).

    .PARAMETER FlashcardId
    Optional flashcard set ID to filter by.

    .PARAMETER AuthToken
    Authentication token (JWT).

    .EXAMPLE
    Get-OmmiQuizLearningReport -AuthToken $token

    .EXAMPLE
    Get-OmmiQuizLearningReport -Days 7 -FlashcardId "my-set" -AuthToken $token
    #>
    [CmdletBinding()]
    param(
        [int]$Days = 30,
        [string]$FlashcardId,

        [Parameter(Mandatory)]
        [string]$AuthToken
    )

    $headers = @{
        'Authorization' = "Bearer $AuthToken"
    }

    $queryParams = @("days=$Days")
    if ($FlashcardId) {
        $queryParams += "flashcard_id=$([uri]::EscapeDataString($FlashcardId))"
    }

    $queryString = if ($queryParams.Count -gt 0) { "?" + ($queryParams -join "&") } else { "" }
    $path = "/users/me/learning-report$queryString"

    Invoke-OmmiQuizApiRequest -Path $path -Method 'GET' -Headers $headers -ExpectedStatusCode 200
}

function Get-OmmiQuizQuizHistoryPdf {
    <#
    .SYNOPSIS
    Downloads the user's quiz history as a PDF report.

    .PARAMETER Days
    Number of days to include in the report (default: 30).

    .PARAMETER OutputPath
    Optional path where the PDF should be saved.

    .PARAMETER AuthToken
    Authentication token (JWT).

    .EXAMPLE
    Get-OmmiQuizQuizHistoryPdf -AuthToken $token

    .EXAMPLE
    Get-OmmiQuizQuizHistoryPdf -Days 7 -OutputPath "C:\Reports\quiz-history.pdf" -AuthToken $token
    #>
    [CmdletBinding()]
    param(
        [int]$Days = 30,
        [string]$OutputPath,

        [Parameter(Mandatory)]
        [string]$AuthToken
    )

    $baseUrl = Get-OmmiQuizApiBaseUrl
    $path = "users/me/quiz-history-pdf?days=$Days"
    $uri = [uri]::new([uri]$baseUrl, $path)

    $headers = @{
        'Authorization' = "Bearer $AuthToken"
    }

    try {
        $response = Invoke-WebRequest -Uri $uri -Method GET -Headers $headers -UseBasicParsing -ErrorAction Stop

        # Extract filename from Content-Disposition header
        $filename = "quiz-history.pdf"
        if ($response.Headers['Content-Disposition']) {
            $disposition = [string]$response.Headers['Content-Disposition']
            if ($disposition -match 'filename="?([^"]+)"?') {
                $filename = $matches[1]
            }
        }

        # Determine save path
        $savePath = if ($OutputPath) {
            $OutputPath
        } else {
            Join-Path -Path (Get-Location) -ChildPath $filename
        }

        # Save PDF
        [System.IO.File]::WriteAllBytes($savePath, $response.Content)

        $fileInfo = Get-Item -Path $savePath
        $fileSizeKB = [math]::Round($fileInfo.Length / 1KB, 2)

        [pscustomobject]@{
            Success = $true
            FilePath = $savePath
            FileName = $fileInfo.Name
            FileSizeKB = $fileSizeKB
            StatusCode = $response.StatusCode
            Message = "Successfully downloaded quiz history PDF ($fileSizeKB KB)"
        }
    }
    catch {
        [pscustomobject]@{
            Success = $false
            FilePath = $null
            FileName = $null
            FileSizeKB = 0
            StatusCode = $null
            Message = "Failed to download quiz history PDF: $($_.Exception.Message)"
        }
    }
}

# ============================================================================
# Admin Endpoints
# ============================================================================

function Get-OmmiQuizAdminUsers {
    <#
    .SYNOPSIS
    Retrieves the list of all users (admin only).

    .PARAMETER AuthToken
    Authentication token (JWT) for admin access.

    .EXAMPLE
    Get-OmmiQuizAdminUsers -AuthToken $adminToken
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$AuthToken
    )

    $headers = @{
        'Authorization' = "Bearer $AuthToken"
    }

    Invoke-OmmiQuizApiRequest -Path '/admin/users' -Method 'GET' -Headers $headers -ExpectedStatusCode 200
}

function Set-OmmiQuizUserAdminStatus {
    <#
    .SYNOPSIS
    Updates a user's admin status (admin only).

    .PARAMETER UserId
    The ID of the user to modify.

    .PARAMETER IsAdmin
    Boolean indicating whether the user should be an admin.

    .PARAMETER AuthToken
    Authentication token (JWT) for admin access.

    .EXAMPLE
    Set-OmmiQuizUserAdminStatus -UserId "user-uuid" -IsAdmin $true -AuthToken $adminToken
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact='High')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$UserId,

        [Parameter(Mandatory)]
        [bool]$IsAdmin,

        [Parameter(Mandatory)]
        [string]$AuthToken
    )

    if ($PSCmdlet.ShouldProcess($UserId, "Set admin status to $IsAdmin")) {
        $headers = @{
            'Authorization' = "Bearer $AuthToken"
        }

        $body = @{
            is_admin = $IsAdmin
        }

        Invoke-OmmiQuizApiRequest -Path "/admin/users/$UserId/admin-status" -Method 'PUT' -Body $body -Headers $headers -ExpectedStatusCode 200
    }
}

Export-ModuleMember -Function *OmmiQuiz*
