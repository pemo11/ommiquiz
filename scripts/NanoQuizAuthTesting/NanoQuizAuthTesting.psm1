#requires -Version 5.1
Set-StrictMode -Version Latest

$Script:OmmiQuizApiBaseUrl = 'https://nanoquiz-backend-woe2w.ondigitalocean.app/api/'
$Script:OmmiQuizAuthConfig = @{
    Domain = $env:AUTH0_DOMAIN
    ClientId = $env:AUTH0_CLIENT_ID
    ClientSecret = $env:AUTH0_CLIENT_SECRET
    Audience = $env:AUTH0_AUDIENCE
    Scope = $env:AUTH0_SCOPE
}
$Script:OmmiQuizAccessToken = $null

function Set-OmmiQuizAuthTestConfig {
    [CmdletBinding()]
    param(
        [string]$BaseUrl,
        [string]$Domain,
        [string]$ClientId,
        [System.Security.SecureString]$ClientSecretSecure,
        [string]$ClientSecret,
        [string]$Audience,
        [string]$Scope
    )

    if ($PSBoundParameters.ContainsKey('BaseUrl')) {
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

    if ($PSBoundParameters.ContainsKey('Domain')) {
        $Script:OmmiQuizAuthConfig.Domain = $Domain
    }

    if ($PSBoundParameters.ContainsKey('ClientId')) {
        $Script:OmmiQuizAuthConfig.ClientId = $ClientId
    }

    if ($PSBoundParameters.ContainsKey('ClientSecretSecure')) {
        $ClientSecret = ConvertTo-PlainTextSecureString -SecureString $ClientSecretSecure
    }

    if ($PSBoundParameters.ContainsKey('ClientSecret')) {
        $Script:OmmiQuizAuthConfig.ClientSecret = $ClientSecret
    }

    if ($PSBoundParameters.ContainsKey('Audience')) {
        $Script:OmmiQuizAuthConfig.Audience = $Audience
    }

    if ($PSBoundParameters.ContainsKey('Scope')) {
        $Script:OmmiQuizAuthConfig.Scope = $Scope
    }
}

function ConvertTo-PlainTextSecureString {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [System.Security.SecureString]$SecureString
    )

    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        if ($bstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

function Get-OmmiQuizAuthTestConfig {
    [CmdletBinding()]
    param()

    [pscustomobject]@{
        BaseUrl = $Script:OmmiQuizApiBaseUrl
        Domain = $Script:OmmiQuizAuthConfig.Domain
        ClientId = $Script:OmmiQuizAuthConfig.ClientId
        Audience = $Script:OmmiQuizAuthConfig.Audience
        Scope = $Script:OmmiQuizAuthConfig.Scope
        HasClientSecret = [bool]$Script:OmmiQuizAuthConfig.ClientSecret
    }
}

function Clear-OmmiQuizAccessToken {
    [CmdletBinding()]
    param()
    $Script:OmmiQuizAccessToken = $null
}

function Get-OmmiQuizAccessToken {
    [CmdletBinding()]
    param()

    if ($Script:OmmiQuizAccessToken -and $Script:OmmiQuizAccessToken.ExpiresAt -gt (Get-Date).AddSeconds(30)) {
        return $Script:OmmiQuizAccessToken
    }

    $config = $Script:OmmiQuizAuthConfig
    foreach ($key in 'Domain','ClientId','ClientSecret','Audience') {
        if (-not $config[$key]) {
            throw "Auth0 configuration value '$key' is missing. Use Set-OmmiQuizAuthTestConfig to provide it."
        }
    }

    $domainValue = $config.Domain
    if (-not $domainValue) {
        throw 'Auth0 domain is required.'
    }
    if ($domainValue -notmatch '^https?://') {
        $domainValue = "https://$domainValue"
    }
    $tokenEndpoint = "$domainValue/oauth/token"

    $tokenRequestBody = @{
        grant_type = 'client_credentials'
        client_id = $config.ClientId
        client_secret = $config.ClientSecret
        audience = $config.Audience
    }
    if ($config.Scope) {
        $tokenRequestBody.scope = $config.Scope
    }

    try {
        $tokenResponse = Invoke-RestMethod -Method Post -Uri $tokenEndpoint -ContentType 'application/x-www-form-urlencoded' -Body $tokenRequestBody -ErrorAction Stop
    }
    catch {
        throw "Failed to acquire Auth0 access token: $($_.Exception.Message)"
    }

    if (-not $tokenResponse.access_token) {
        throw 'Auth0 response did not include an access_token.'
    }

    $expiresIn = if ($tokenResponse.expires_in) { [int]$tokenResponse.expires_in } else { 3600 }
    $expiresAt = (Get-Date).AddSeconds([Math]::Max($expiresIn - 60, 60))

    $Script:OmmiQuizAccessToken = [pscustomobject]@{
        AccessToken = $tokenResponse.access_token
        TokenType = $tokenResponse.token_type
        ExpiresAt = $expiresAt
        RawResponse = $tokenResponse
    }

    return $Script:OmmiQuizAccessToken
}

function Invoke-OmmiQuizAuthenticatedRequest {
    <#
    .SYNOPSIS
    Sends an HTTP request to the Ommiquiz API and automatically attaches an Auth0 bearer token.
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
        [switch]$SkipJsonParsing,
        [switch]$SkipAuthentication
    )

    $baseUrl = $Script:OmmiQuizApiBaseUrl
    $relativePath = $Path.TrimStart('/')
    $uri = [uri]::new([uri]$baseUrl, $relativePath)

    $requestHeaders = @{}
    if ($Headers) {
        foreach ($key in $Headers.Keys) {
            $requestHeaders[$key] = $Headers[$key]
        }
    }

    if (-not $SkipAuthentication) {
        $token = Get-OmmiQuizAccessToken
        $requestHeaders['Authorization'] = "Bearer $($token.AccessToken)"
    }

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
        $response = Invoke-WebRequest -Uri $uri -Method $Method -Headers $requestHeaders -Body $requestBody -ContentType $contentType -UseBasicParsing -ErrorAction Stop
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

function Test-OmmiQuizAuthTokenAcquisition {
    [CmdletBinding()]
    param()

    try {
        $token = Get-OmmiQuizAccessToken
        return [pscustomobject]@{
            Test = 'AuthToken'
            Success = $true
            StatusCode = 200
            Message = "Token acquired. Expires at $($token.ExpiresAt.ToUniversalTime().ToString('u'))."
            Payload = $token.RawResponse
        }
    }
    catch {
        return [pscustomobject]@{
            Test = 'AuthToken'
            Success = $false
            StatusCode = 0
            Message = $_.Exception.Message
            Payload = $null
        }
    }
}

function Test-OmmiQuizAuthenticatedFlashcardAccess {
    [CmdletBinding()]
    param(
        [string]$FlashcardId
    )

    $selectedId = $FlashcardId
    $listingResult = $null
    if (-not $selectedId) {
        $listingResult = Invoke-OmmiQuizAuthenticatedRequest -Path '/flashcards' -Method 'GET' -ExpectedStatusCode 200
        $content = $listingResult.Content
        $sets = @()
        if ($content) {
            if ($content.flashcards) {
                $sets = @($content.flashcards)
            }
            elseif ($content -is [array]) {
                $sets = $content
            }
        }
        $first = $sets | Select-Object -First 1
        if (-not $first -or -not $first.id) {
            return [pscustomobject]@{
                Test = 'AuthenticatedFlashcard'
                Success = $false
                StatusCode = if ($listingResult) { $listingResult.StatusCode } else { 0 }
                Message = 'No flashcard sets returned by the API.'
                Payload = $listingResult.Content
            }
        }
        $selectedId = $first.id
    }

    $detailResult = Invoke-OmmiQuizAuthenticatedRequest -Path "/flashcards/$selectedId" -Method 'GET' -ExpectedStatusCode 200
    $cards = @()
    if ($detailResult.Content -and $detailResult.Content.flashcards) {
        $cards = @($detailResult.Content.flashcards)
    }

    $hasCards = $cards.Count -gt 0
    $firstCardHasFields = $false
    if ($hasCards) {
        $card = $cards | Select-Object -First 1
        $firstCardHasFields = ($card.question -and ($card.answer -or $card.answers))
    }

    [pscustomobject]@{
        Test = 'AuthenticatedFlashcard'
        Success = ($hasCards -and $firstCardHasFields)
        StatusCode = $detailResult.StatusCode
        Message = if ($hasCards) { "Flashcard set '$selectedId' returned $($cards.Count) card(s)." } else { "Flashcard set '$selectedId' did not return cards." }
        Payload = $detailResult.Content
    }
}

function Invoke-OmmiQuizAuthSmokeTests {
    [CmdletBinding()]
    param(
        [string]$FlashcardId
    )

    $tests = @(
        { Test-OmmiQuizAuthTokenAcquisition },
        { Test-OmmiQuizAuthenticatedFlashcardAccess -FlashcardId $FlashcardId }
    )

    $results = foreach ($test in $tests) {
        & $test
    }

    $allResults = @($results)
    $passed = @($allResults | Where-Object { $_.Success })
    $failed = @($allResults | Where-Object { -not $_.Success })

    [pscustomobject]@{
        Summary = [pscustomobject]@{
            Total = $allResults.Count
            Passed = $passed.Count
            Failed = $failed.Count
        }
        Results = $allResults
    }
}

Export-ModuleMember -Function *OmmiQuiz*
