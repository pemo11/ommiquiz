# Ommiquiz Authenticated API Testing Module

This PowerShell module extends the NanoQuiz API testing helpers with Auth0-aware
utilities. It is meant for validating scenarios that require authenticated
requests, such as downloading flashcards while including a bearer token. The
module acquires an access token via the Auth0 Client Credentials flow and
reuses it for subsequent test calls.

## Installation

```powershell
Import-Module "$PSScriptRoot/NanoQuizAuthTesting.psm1"
```

Alternatively, reference the absolute path:

```powershell
Import-Module /path/to/repo/scripts/NanoQuizAuthTesting/NanoQuizAuthTesting.psm1
```

## Configuration

The module automatically reads the following environment variables when
available:

- `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`
- `AUTH0_AUDIENCE`
- `AUTH0_SCOPE` (optional)

Use `Set-OmmiQuizAuthTestConfig` to override any of these values or to change
the API base URL. The configuration cmdlet stores the settings for subsequent
invocations:

```powershell
Set-OmmiQuizAuthTestConfig \
    -BaseUrl 'http://localhost:8000/api/' \
    -Domain 'example.us.auth0.com' \
    -ClientId '...' \
    -ClientSecret (Read-Host 'Secret' -AsSecureString) \
    -Audience 'https://ommiquiz/api'
```

## Exported Functions

| Function | Description |
| --- | --- |
| `Set-OmmiQuizAuthTestConfig` | Stores the API base URL and Auth0 credentials for token acquisition. |
| `Get-OmmiQuizAuthTestConfig` | Returns the effective configuration the module is using. |
| `Clear-OmmiQuizAccessToken` | Drops the cached access token so that a new one will be requested. |
| `Get-OmmiQuizAccessToken` | Ensures a valid Auth0 access token exists (obtaining a new one if needed). |
| `Invoke-OmmiQuizAuthenticatedRequest` | Sends HTTP requests that automatically attach the bearer token. |
| `Test-OmmiQuizAuthTokenAcquisition` | Verifies that the configured Auth0 credentials can issue a token. |
| `Test-OmmiQuizAuthenticatedFlashcardAccess` | Downloads a flashcard set using the bearer token and validates the payload. |
| `Invoke-OmmiQuizAuthSmokeTests` | Runs all Auth0-aware tests and returns their aggregated status. |

## Example

```powershell
Import-Module ./scripts/NanoQuizAuthTesting/NanoQuizAuthTesting.psm1

Set-OmmiQuizAuthTestConfig -Domain 'example.auth0.com' -ClientId 'client-id' \`
    -ClientSecret 'client-secret' -Audience 'https://ommiquiz/api'

$result = Invoke-OmmiQuizAuthSmokeTests
$result.Summary
$result.Results | Format-Table Test, Success, StatusCode, Message
```

## Notes

- The module uses `Invoke-WebRequest` for HTTP calls so that response metadata
  (status code, headers) is always available.
- Access tokens are cached in-memory until they are about to expire. Call
  `Clear-OmmiQuizAccessToken` if you need to force a fresh token.
- Functions emit rich objects to simplify automation, logging, or CI/CD
  integration.
