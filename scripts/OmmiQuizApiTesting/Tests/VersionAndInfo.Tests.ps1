#requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }

BeforeAll {
    # Import the module
    $ModulePath = Join-Path $PSScriptRoot '..' 'OmmiQuizApiTesting.psm1'
    Import-Module $ModulePath -Force

    # Set base URL to production
    Set-OmmiQuizApiBaseUrl -BaseUrl 'https://ommiquiz.de/api'
}

Describe 'Version and Info Endpoints' {

    Context 'Get-OmmiQuizVersion' {

        It 'Should return version information' {
            $result = Get-OmmiQuizVersion

            $result | Should -Not -BeNullOrEmpty
            $result.StatusCode | Should -Be 200
            $result.Content | Should -Not -BeNullOrEmpty
        }

        It 'Should return valid version format' {
            $result = Get-OmmiQuizVersion

            $result.Content.api_version | Should -Not -BeNullOrEmpty
            $result.Content.api_version | Should -Match '^\d+\.\d+\.\d+$'
        }

        It 'Should return JSON content' {
            $result = Get-OmmiQuizVersion

            $result.Content | Should -BeOfType [PSCustomObject]
        }
    }

    Context 'Get-OmmiQuizRoot' {

        It 'Should return root API information' {
            $result = Get-OmmiQuizRoot

            $result | Should -Not -BeNullOrEmpty
            $result.StatusCode | Should -Be 200
            $result.Content | Should -Not -BeNullOrEmpty
        }

        It 'Should return API welcome message' {
            $result = Get-OmmiQuizRoot

            $result.Content.message | Should -Not -BeNullOrEmpty
            $result.Content.message | Should -Match 'Welcome'
        }
    }

    Context 'Test-OmmiQuizHealthEndpoint' {

        It 'Should return healthy status' {
            $result = Test-OmmiQuizHealthEndpoint

            $result | Should -Not -BeNullOrEmpty
            $result.Success | Should -Be $true
            $result.StatusCode | Should -Be 200
        }

        It 'Should have required health check properties' {
            $result = Test-OmmiQuizHealthEndpoint

            $result.Test | Should -Be 'Health'
            $result.Message | Should -Not -BeNullOrEmpty
            $result.Payload | Should -Not -BeNullOrEmpty
        }

        It 'Should report status as healthy' {
            $result = Test-OmmiQuizHealthEndpoint

            $result.Payload.status | Should -Be 'healthy'
        }
    }
}

Describe 'Base URL Configuration' {

    Context 'Set-OmmiQuizApiBaseUrl' {

        It 'Should accept valid URL' {
            { Set-OmmiQuizApiBaseUrl -BaseUrl 'http://localhost:8080/api' } | Should -Not -Throw
        }

        It 'Should add trailing slash if missing' {
            Set-OmmiQuizApiBaseUrl -BaseUrl 'http://localhost:8080/api'
            $url = Get-OmmiQuizApiBaseUrl

            $url | Should -Match '/$'
        }

        It 'Should reject empty URL' {
            { Set-OmmiQuizApiBaseUrl -BaseUrl '' } | Should -Throw
        }
    }

    Context 'Get-OmmiQuizApiBaseUrl' {

        It 'Should return current base URL' {
            # First set to production URL
            Set-OmmiQuizApiBaseUrl -BaseUrl 'https://ommiquiz.de/api'

            $url = Get-OmmiQuizApiBaseUrl

            $url | Should -Not -BeNullOrEmpty
            $url | Should -Match '^https?://'
        }
    }
}

AfterAll {
    # Restore production URL
    Set-OmmiQuizApiBaseUrl -BaseUrl 'https://ommiquiz.de/api'
}
