# OmmiQuiz Backend Authentication Test Script
# Tests backend authentication endpoints and configuration

$BackendUrl = "https://nanoquiz-backend-ypez6.ondigitalocean.app/api"
$TestEmail = "testuser$(Get-Random -Maximum 999)@example.com"
$TestPassword = "TestPass123!"

Write-Host "================================" -ForegroundColor Cyan
Write-Host "OmmiQuiz Backend Auth Test" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend URL: $BackendUrl" -ForegroundColor Yellow
Write-Host "Test Email: $TestEmail" -ForegroundColor Yellow
Write-Host ""

# Test 1: Backend Health Check
Write-Host "1. Testing Backend Health..." -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Method Get -Uri "$BackendUrl/../" -ErrorAction Stop
    Write-Host "✅ Backend is reachable" -ForegroundColor Green
    $health | ConvertTo-Json
} catch {
    Write-Host "❌ Backend health check failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Signup
Write-Host "2. Testing Signup..." -ForegroundColor Cyan
try {
    $signupBody = @{
        email = $TestEmail
        password = $TestPassword
    } | ConvertTo-Json

    Write-Host "Payload:" -ForegroundColor Gray
    Write-Host $signupBody -ForegroundColor Gray
    Write-Host ""

    $signupResponse = Invoke-WebRequest -Method Post `
        -Uri "$BackendUrl/auth/signup" `
        -ContentType "application/json" `
        -Body $signupBody `
        -ErrorAction Stop

    Write-Host "✅ Signup successful!" -ForegroundColor Green
    Write-Host "Status: $($signupResponse.StatusCode)" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Gray
    $signupResponse.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
    
} catch {
    Write-Host "❌ Signup failed!" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.Value__)" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "Details:" -ForegroundColor Red
        try {
            $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 5
        } catch {
            Write-Host $_.ErrorDetails.Message
        }
    }
}
Write-Host ""

# Test 3: Login (using existing user)
Write-Host "3. Testing Login (using known credentials)..." -ForegroundColor Cyan
try {
    $loginBody = @{
        email = "pmonadjemi@posteo.de"
        password = "demo+123"
    } | ConvertTo-Json

    $loginResponse = Invoke-WebRequest -Method Post `
        -Uri "$BackendUrl/auth/login" `
        -ContentType "application/json" `
        -Body $loginBody `
        -ErrorAction Stop

    Write-Host "✅ Login successful!" -ForegroundColor Green
    Write-Host "Status: $($loginResponse.StatusCode)" -ForegroundColor Green
    
    $loginData = $loginResponse.Content | ConvertFrom-Json
    Write-Host "Access Token (first 30 chars): $($loginData.access_token.Substring(0,30))..." -ForegroundColor Green
    
} catch {
    Write-Host "❌ Login failed!" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.Value__)" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "Details:" -ForegroundColor Red
        try {
            $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 5
        } catch {
            Write-Host $_.ErrorDetails.Message
        }
    }
}
Write-Host ""

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Test Complete" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "If signup/login failed, check:" -ForegroundColor Yellow
Write-Host "1. DigitalOcean Backend has SUPABASE_PUBLISHABLE_KEY set" -ForegroundColor Yellow
Write-Host "2. The key value is: sb_publishable_06GTeAb6I9QWgNTOCH0LKw_H_4lzXnP" -ForegroundColor Yellow
Write-Host "3. Backend has been redeployed after adding the env var" -ForegroundColor Yellow
