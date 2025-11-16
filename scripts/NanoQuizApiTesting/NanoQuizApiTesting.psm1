#requires -Version 5.1
Set-StrictMode -Version Latest

$Script:NanoQuizApiBaseUrl = 'https://nanoquiz-backend-woe2w.ondigitalocean.app/api/'

function Set-NanoQuizApiBaseUrl {
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

    $Script:NanoQuizApiBaseUrl = $BaseUrl
}

function Get-NanoQuizApiBaseUrl {
    [CmdletBinding()]
    param()
    return $Script:NanoQuizApiBaseUrl
}

function Invoke-NanoQuizApiRequest {
    <#
    .SYNOPSIS
    Sends a request to the NanoQuiz API and captures the HTTP response metadata.

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

    $baseUrl = Get-NanoQuizApiBaseUrl
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
            Write-Warning "Failed to parse JSON content from $uri: $($_.Exception.Message)"
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

function Test-NanoQuizHealthEndpoint {
    <#
    .SYNOPSIS
    Validates the /health endpoint and ensures it reports a healthy status.

    .OUTPUTS
    PSCustomObject with the health information as well as a Success flag and message.
    #>
    [CmdletBinding()]
    param()

    $result = Invoke-NanoQuizApiRequest -Path '/health' -Method 'GET' -ExpectedStatusCode 200

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

function Get-NanoQuizFlashcardSets {
    <#
    .SYNOPSIS
    Retrieves all flashcard sets from the API.
    #>
    [CmdletBinding()]
    param()

    Invoke-NanoQuizApiRequest -Path '/flashcards' -Method 'GET' -ExpectedStatusCode 200
}

function Get-NanoQuizFlashcardSet {
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

    Invoke-NanoQuizApiRequest -Path "/flashcards/$FlashcardId" -Method 'GET' -ExpectedStatusCode 200
}

function Test-NanoQuizFlashcardListing {
    <#
    .SYNOPSIS
    Ensures the flashcard overview endpoint returns at least one set with the required metadata.
    #>
    [CmdletBinding()]
    param()

    $result = Get-NanoQuizFlashcardSets
    $content = $result.Content

    $hasSets = ($content -is [array] -and $content.Count -gt 0)
    $hasMetadata = $false
    if ($hasSets) {
        $first = $content | Select-Object -First 1
        $hasMetadata = ($first.id -and $first.author -and $first.cards)
    }

    [pscustomobject]@{
        Test = 'FlashcardListing'
        Success = ($hasSets -and $hasMetadata)
        StatusCode = $result.StatusCode
        Message = if ($hasSets) { "Retrieved $($content.Count) flashcard set(s)." } else { 'No flashcard sets returned.' }
        Payload = $content
    }
}

function Test-NanoQuizFlashcardDetail {
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
        $listing = Get-NanoQuizFlashcardSets
        $first = $listing.Content | Select-Object -First 1
        if (-not $first) {
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

    $result = Get-NanoQuizFlashcardSet -FlashcardId $selectedId
    $content = $result.Content

    $hasCards = $content.cards -and $content.cards.Count -gt 0
    $firstCardHasFields = $false
    if ($hasCards) {
        $card = $content.cards | Select-Object -First 1
        $firstCardHasFields = ($card.question -and ($card.answer -or $card.answers))
    }

    [pscustomobject]@{
        Test = 'FlashcardDetail'
        Success = ($hasCards -and $firstCardHasFields)
        StatusCode = $result.StatusCode
        Message = if ($hasCards) { "Flashcard set '$selectedId' returned $($content.cards.Count) card(s)." } else { "Flashcard set '$selectedId' did not return any cards." }
        Payload = $content
    }
}

function Invoke-NanoQuizApiSmokeTests {
    <#
    .SYNOPSIS
    Executes all API validation tests and returns an aggregated summary.
    #>
    [CmdletBinding()]
    param(
        [string]$FlashcardId
    )

    $tests = @(
        Test-NanoQuizHealthEndpoint,
        Test-NanoQuizFlashcardListing,
        { Test-NanoQuizFlashcardDetail -FlashcardId $FlashcardId }
    )

    $results = foreach ($test in $tests) {
        if ($test -is [scriptblock]) {
            & $test
        } else {
            & $test
        }
    }

    $summary = [pscustomobject]@{
        Total = $results.Count
        Passed = ($results | Where-Object { $_.Success }).Count
        Failed = ($results | Where-Object { -not $_.Success }).Count
    }

    [pscustomobject]@{
        Summary = $summary
        Results = $results
    }
}

Export-ModuleMember -Function *NanoQuiz*
