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

function Get-OmmiQuizFlashcardSets {
    <#
    .SYNOPSIS
    Retrieves all flashcard sets from the API.
    #>
    [CmdletBinding()]
    param()

    Invoke-OmmiQuizApiRequest -Path '/flashcards' -Method 'GET' -ExpectedStatusCode 200
}

function Get-OmmiQuizFlashcardSet {
    <#
    .SYNOPSIS
    Retrieves a single flashcard set by its identifier.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$FlashcardId
    )

    Invoke-OmmiQuizApiRequest -Path "/flashcards/$FlashcardId" -Method 'GET' -ExpectedStatusCode 200
}

function Test-OmmiQuizFlashcardListing {
    <#
    .SYNOPSIS
    Ensures the flashcard overview endpoint returns at least one set with the required metadata.
    #>
    [CmdletBinding()]
    param()

    $result = Get-OmmiQuizFlashcardSets
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
        $listing = Get-OmmiQuizFlashcardSets
        
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

function Get-OmmiQuizLogs {
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
    Get-OmmiQuizLogs -Level ERROR -Limit 50

    .EXAMPLE
    Get-OmmiQuizLogs -StartTime "2025-12-16T10:00:00" -MessageContains "flashcard"

    .EXAMPLE
    Get-OmmiQuizLogs -Level WARNING -StartTime (Get-Date).AddHours(-1).ToString("yyyy-MM-ddTHH:mm:ss")
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

function Get-OmmiQuizLogFiles {
    <#
    .SYNOPSIS
    Lists available log files from the OmmiQuiz API.

    .DESCRIPTION
    Retrieves metadata about available log files including filename, size, 
    and last modified date.

    .EXAMPLE
    Get-OmmiQuizLogFiles
    #>
    [CmdletBinding()]
    param()

    Invoke-OmmiQuizApiRequest -Path '/logs/files' -Method 'GET' -ExpectedStatusCode 200
}

function Get-OmmiQuizLogFile {
    <#
    .SYNOPSIS
    Downloads a specific log file from the OmmiQuiz API.

    .DESCRIPTION
    Downloads the content of a specific log file. The content is returned as text.

    .PARAMETER Filename
    Name of the log file to download (e.g., "app-2025-12-16.log").

    .EXAMPLE
    Get-OmmiQuizLogFile -Filename "app-2025-12-16.log"
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Filename
    )

    # Validate filename pattern
    if ($Filename -notmatch '^[a-zA-Z0-9_-]+\.log$') {
        throw "Invalid log filename format. Expected format: alphanumeric characters, hyphens, underscores, and .log extension."
    }

    Invoke-OmmiQuizApiRequest -Path "/logs/download/$Filename" -Method 'GET' -ExpectedStatusCode 200 -SkipJsonParsing
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
        $result = Get-OmmiQuizLogs -Limit 10
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
        $result = Get-OmmiQuizLogFiles
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
            $listing = Get-OmmiQuizFlashcardSets

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

Export-ModuleMember -Function *OmmiQuiz*
