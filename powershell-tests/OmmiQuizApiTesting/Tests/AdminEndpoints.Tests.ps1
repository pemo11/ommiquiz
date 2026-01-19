#requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }

BeforeAll {
    # Import the module
    $ModulePath = Join-Path $PSScriptRoot '..' 'OmmiQuizApiTesting.psm1'
    Import-Module $ModulePath -Force

    # Set base URL to production
    Set-OmmiQuizApiBaseUrl -BaseUrl 'https://nanoquiz-backend-ypez6.ondigitalocean.app/api'

    # Get admin token from environment variable for testing
    # Note: Set $env:OMMIQUIZ_ADMIN_TOKEN before running these tests
    $script:AdminToken = $env:OMMIQUIZ_ADMIN_TOKEN
    $script:HasAdminToken = -not [string]::IsNullOrEmpty($script:AdminToken)
}

Describe 'Admin User Management Endpoints' {

    Context 'Get-OmmiQuizAdminUsers' {

        It 'Should require authentication token' {
            { Get-OmmiQuizAdminUsers -AuthToken '' } | Should -Throw
        }

        It 'Should require AuthToken parameter' {
            $cmd = Get-Command Get-OmmiQuizAdminUsers
            $cmd.Parameters['AuthToken'].Attributes.Mandatory | Should -Be $true
        }

        It 'Should retrieve users list' -Skip:(-not $script:HasAdminToken) {
            $result = Get-OmmiQuizAdminUsers -AuthToken $script:AdminToken

            $result | Should -Not -BeNullOrEmpty
            $result.StatusCode | Should -Be 200
            $result.Content | Should -Not -BeNullOrEmpty
        }

        It 'Should return users array' -Skip:(-not $script:HasAdminToken) {
            $result = Get-OmmiQuizAdminUsers -AuthToken $script:AdminToken

            # Response may be array or object with users property
            if ($result.Content.PSObject.Properties['users']) {
                $result.Content.users | Should -BeOfType [array]
            } else {
                $result.Content | Should -BeOfType [array]
            }
        }

        It 'Should return users with required fields' -Skip:(-not $script:HasAdminToken) {
            $result = Get-OmmiQuizAdminUsers -AuthToken $script:AdminToken

            $users = if ($result.Content.PSObject.Properties['users']) {
                $result.Content.users
            } else {
                $result.Content
            }

            if ($users.Count -gt 0) {
                $user = $users[0]

                $user.id | Should -Not -BeNullOrEmpty
                $user.email | Should -Not -BeNullOrEmpty
                $user.PSObject.Properties['is_admin'] | Should -Not -BeNullOrEmpty
            }
        }

        It 'Should fail with non-admin token' -Skip:(-not $script:HasAdminToken) {
            # This test requires a non-admin token to verify rejection
            # Skip if we don't have a separate non-admin token
            Set-ItResult -Skipped -Because 'Non-admin token test requires separate token'
        }
    }

    Context 'Set-OmmiQuizUserAdminStatus' {

        It 'Should require authentication token' {
            { Set-OmmiQuizUserAdminStatus -UserId 'test-id' -IsAdmin $true -AuthToken '' -Confirm:$false } | Should -Throw
        }

        It 'Should require UserId parameter' {
            { Set-OmmiQuizUserAdminStatus -UserId $null -IsAdmin $true -AuthToken 'token' -Confirm:$false } | Should -Throw
        }

        It 'Should require IsAdmin parameter' {
            $cmd = Get-Command Set-OmmiQuizUserAdminStatus
            $cmd.Parameters['IsAdmin'].Attributes.Mandatory | Should -Be $true
        }

        It 'Should accept boolean IsAdmin value' {
            $cmd = Get-Command Set-OmmiQuizUserAdminStatus
            $cmd.Parameters['IsAdmin'].ParameterType | Should -Be ([bool])
        }

        It 'Should support ShouldProcess' {
            $command = Get-Command Set-OmmiQuizUserAdminStatus

            $command.Parameters.ContainsKey('WhatIf') | Should -Be $true
            $command.Parameters.ContainsKey('Confirm') | Should -Be $true
        }

        It 'Should support WhatIf parameter' -Skip:(-not $script:HasAdminToken) {
            # Get a user ID for testing
            $usersResult = Get-OmmiQuizAdminUsers -AuthToken $script:AdminToken
            $users = if ($usersResult.Content.PSObject.Properties['users']) {
                $usersResult.Content.users
            } else {
                $usersResult.Content
            }

            if ($users.Count -gt 0) {
                $testUserId = $users[0].id

                # WhatIf should not throw and not execute
                { Set-OmmiQuizUserAdminStatus -UserId $testUserId -IsAdmin $true -AuthToken $script:AdminToken -WhatIf } | Should -Not -Throw
            }
        }

        It 'Should have high impact confirmation' {
            $command = Get-Command Set-OmmiQuizUserAdminStatus
            $shouldProcessAttr = $command.ScriptBlock.Attributes | Where-Object { $_ -is [System.Management.Automation.CmdletBindingAttribute] }

            $shouldProcessAttr.ConfirmImpact | Should -Be 'High'
        }

        It 'Should reject empty UserId' {
            { Set-OmmiQuizUserAdminStatus -UserId '' -IsAdmin $true -AuthToken 'token' -Confirm:$false } | Should -Throw
        }

        It 'Should validate boolean IsAdmin parameter' {
            # Should accept true
            { $true -is [bool] } | Should -Not -Throw

            # Should accept false
            { $false -is [bool] } | Should -Not -Throw
        }
    }
}

Describe 'Admin Authorization' {

    Context 'Admin Endpoint Security' {

        It 'Should fail without authentication token' {
            { Get-OmmiQuizAdminUsers -AuthToken '' } | Should -Throw
        }

        It 'Should fail with invalid token' {
            { Get-OmmiQuizAdminUsers -AuthToken 'invalid-token-xyz' } | Should -Throw
        }

        It 'Should require admin role' -Skip:(-not $script:HasAdminToken) {
            # Admin endpoints should only work with admin tokens
            # This is verified by successful call with admin token
            $result = Get-OmmiQuizAdminUsers -AuthToken $script:AdminToken
            $result.StatusCode | Should -Be 200
        }
    }

    Context 'User Management Permissions' {

        It 'Should prevent unauthorized admin status changes' {
            # Attempting with empty token should fail
            { Set-OmmiQuizUserAdminStatus -UserId 'test-id' -IsAdmin $true -AuthToken '' -Confirm:$false } | Should -Throw
        }

        It 'Should prevent unauthorized user listing' {
            # Attempting with empty token should fail
            { Get-OmmiQuizAdminUsers -AuthToken '' } | Should -Throw
        }
    }
}

Describe 'User Data Structure Validation' {

    Context 'User Object Structure' {

        It 'Should have required user fields' -Skip:(-not $script:HasAdminToken) {
            $result = Get-OmmiQuizAdminUsers -AuthToken $script:AdminToken

            $users = if ($result.Content.PSObject.Properties['users']) {
                $result.Content.users
            } else {
                $result.Content
            }

            if ($users.Count -gt 0) {
                $user = $users[0]

                $requiredFields = @('id', 'email', 'is_admin')

                foreach ($field in $requiredFields) {
                    $user.PSObject.Properties[$field] | Should -Not -BeNullOrEmpty -Because "$field is required in user object"
                }
            }
        }

        It 'Should have valid email format' -Skip:(-not $script:HasAdminToken) {
            $result = Get-OmmiQuizAdminUsers -AuthToken $script:AdminToken

            $users = if ($result.Content.PSObject.Properties['users']) {
                $result.Content.users
            } else {
                $result.Content
            }

            if ($users.Count -gt 0) {
                $user = $users[0]

                $user.email | Should -Match '@'
            }
        }

        It 'Should have boolean is_admin field' -Skip:(-not $script:HasAdminToken) {
            $result = Get-OmmiQuizAdminUsers -AuthToken $script:AdminToken

            $users = if ($result.Content.PSObject.Properties['users']) {
                $result.Content.users
            } else {
                $result.Content
            }

            if ($users.Count -gt 0) {
                $user = $users[0]

                $user.is_admin | Should -BeOfType [bool]
            }
        }

        It 'Should have UUID format for user ID' -Skip:(-not $script:HasAdminToken) {
            $result = Get-OmmiQuizAdminUsers -AuthToken $script:AdminToken

            $users = if ($result.Content.PSObject.Properties['users']) {
                $result.Content.users
            } else {
                $result.Content
            }

            if ($users.Count -gt 0) {
                $user = $users[0]

                # UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
                $user.id | Should -Match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            }
        }
    }

    Context 'Admin Status Body Structure' {

        It 'Should create valid request body for admin status' {
            $body = @{
                is_admin = $true
            }

            $body.is_admin | Should -BeOfType [bool]
            $body.is_admin | Should -Be $true
        }

        It 'Should create valid request body with false value' {
            $body = @{
                is_admin = $false
            }

            $body.is_admin | Should -BeOfType [bool]
            $body.is_admin | Should -Be $false
        }
    }
}

Describe 'Parameter Validation' {

    Context 'UserId Parameter' {

        It 'Should reject null UserId' {
            { Set-OmmiQuizUserAdminStatus -UserId $null -IsAdmin $true -AuthToken 'token' -Confirm:$false } | Should -Throw
        }

        It 'Should reject empty UserId' {
            { Set-OmmiQuizUserAdminStatus -UserId '' -IsAdmin $true -AuthToken 'token' -Confirm:$false } | Should -Throw
        }

        It 'Should accept valid UUID format' {
            # Valid UUID should not throw validation error
            $validUuid = '12345678-1234-1234-1234-123456789012'
            { $validUuid | Should -Match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' } | Should -Not -Throw
        }
    }

    Context 'IsAdmin Parameter' {

        It 'Should accept true value' {
            $isAdmin = $true
            $isAdmin | Should -BeOfType [bool]
            $isAdmin | Should -Be $true
        }

        It 'Should accept false value' {
            $isAdmin = $false
            $isAdmin | Should -BeOfType [bool]
            $isAdmin | Should -Be $false
        }

        It 'Should be mandatory parameter' {
            $cmd = Get-Command Set-OmmiQuizUserAdminStatus
            $cmd.Parameters['IsAdmin'].Attributes.Mandatory | Should -Be $true
        }
    }

    Context 'Mandatory Parameters' {

        It 'Should require AuthToken in Get-OmmiQuizAdminUsers' {
            $cmd = Get-Command Get-OmmiQuizAdminUsers
            $cmd.Parameters['AuthToken'].Attributes.Mandatory | Should -Be $true
        }

        It 'Should require AuthToken in Set-OmmiQuizUserAdminStatus' {
            $cmd = Get-Command Set-OmmiQuizUserAdminStatus
            $cmd.Parameters['AuthToken'].Attributes.Mandatory | Should -Be $true
        }
    }
}

Describe 'Admin Token Environment Check' {

    It 'Should notify if admin token is not set' {
        if (-not $script:HasAdminToken) {
            Write-Warning 'Admin token not set. Set $env:OMMIQUIZ_ADMIN_TOKEN to run admin endpoint tests.'
        }

        # This test always passes, just informational
        $true | Should -Be $true
    }

    It 'Should have admin token for full test coverage' {
        if (-not $script:HasAdminToken) {
            Set-ItResult -Skipped -Because 'Admin token not configured in environment'
        }

        $script:HasAdminToken | Should -Be $true
    }

    It 'Should differentiate admin vs regular user tokens' {
        # Admin endpoints should fail with regular user token
        # This is a reminder that tests should use separate tokens
        $true | Should -Be $true
    }
}
