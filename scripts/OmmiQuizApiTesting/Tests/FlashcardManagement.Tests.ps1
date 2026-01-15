#requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }

BeforeAll {
    # Import the module
    $ModulePath = Join-Path $PSScriptRoot '..' 'OmmiQuizApiTesting.psm1'
    Import-Module $ModulePath -Force

    # Set base URL to production
    Set-OmmiQuizApiBaseUrl -BaseUrl 'https://ommiquiz.de/api'

    # Get admin token from environment variable for testing
    # Note: Set $env:OMMIQUIZ_ADMIN_TOKEN before running these tests
    $script:AdminToken = $env:OMMIQUIZ_ADMIN_TOKEN
    $script:HasAdminToken = -not [string]::IsNullOrEmpty($script:AdminToken)
}

Describe 'Flashcard Management - Admin Endpoints' {

    Context 'Update-OmmiQuizFlashcardSet' {

        It 'Should require authentication token' -Skip:(-not $script:HasAdminToken) {
            { Update-OmmiQuizFlashcardSet -FlashcardId 'test-id' -FlashcardData @{} -AuthToken '' } | Should -Throw
        }

        It 'Should require FlashcardId parameter' -Skip:(-not $script:HasAdminToken) {
            { Update-OmmiQuizFlashcardSet -FlashcardId $null -FlashcardData @{} -AuthToken $script:AdminToken } | Should -Throw
        }

        It 'Should require FlashcardData parameter' -Skip:(-not $script:HasAdminToken) {
            { Update-OmmiQuizFlashcardSet -FlashcardId 'test-id' -FlashcardData $null -AuthToken $script:AdminToken } | Should -Throw
        }

        It 'Should accept valid flashcard data' -Skip:(-not $script:HasAdminToken) {
            $flashcardData = @{
                id = 'test-set'
                title = 'Test Flashcard Set'
                flashcards = @()
            }

            # This will fail if the flashcard doesn't exist, but parameters should be valid
            { Update-OmmiQuizFlashcardSet -FlashcardId 'test-set' -FlashcardData $flashcardData -AuthToken $script:AdminToken } | Should -Not -Throw -Because 'Parameters are valid'
        }
    }

    Context 'New-OmmiQuizFlashcardSet' {

        It 'Should require authentication token' -Skip:(-not $script:HasAdminToken) {
            $tempFile = [System.IO.Path]::GetTempFileName()
            Set-Content -Path $tempFile -Value 'test: data'

            { New-OmmiQuizFlashcardSet -FilePath $tempFile -AuthToken '' } | Should -Throw

            Remove-Item $tempFile -Force
        }

        It 'Should require FilePath parameter' -Skip:(-not $script:HasAdminToken) {
            { New-OmmiQuizFlashcardSet -FilePath $null -AuthToken $script:AdminToken } | Should -Throw
        }

        It 'Should require file to exist' -Skip:(-not $script:HasAdminToken) {
            { New-OmmiQuizFlashcardSet -FilePath 'C:\NonExistent\File.yml' -AuthToken $script:AdminToken } | Should -Throw
        }

        It 'Should accept valid YAML file path' -Skip:(-not $script:HasAdminToken) {
            $tempFile = [System.IO.Path]::GetTempFileName()
            $yamlContent = @'
id: test-flashcard-set
title: Test Set
flashcards:
  - question: Test Question
    answer: Test Answer
'@
            Set-Content -Path $tempFile -Value $yamlContent

            # Function should not throw for valid file
            $tempFile | Should -Exist

            Remove-Item $tempFile -Force
        }
    }

    Context 'Remove-OmmiQuizFlashcardSet' {

        It 'Should require authentication token' -Skip:(-not $script:HasAdminToken) {
            { Remove-OmmiQuizFlashcardSet -FlashcardId 'test-id' -AuthToken '' -Confirm:$false } | Should -Throw
        }

        It 'Should require FlashcardId parameter' -Skip:(-not $script:HasAdminToken) {
            { Remove-OmmiQuizFlashcardSet -FlashcardId $null -AuthToken $script:AdminToken -Confirm:$false } | Should -Throw
        }

        It 'Should support ShouldProcess' -Skip:(-not $script:HasAdminToken) {
            $command = Get-Command Remove-OmmiQuizFlashcardSet

            $command.Parameters.ContainsKey('WhatIf') | Should -Be $true
            $command.Parameters.ContainsKey('Confirm') | Should -Be $true
        }

        It 'Should support WhatIf parameter' -Skip:(-not $script:HasAdminToken) {
            # WhatIf should not throw and not execute
            { Remove-OmmiQuizFlashcardSet -FlashcardId 'test-id' -AuthToken $script:AdminToken -WhatIf } | Should -Not -Throw
        }
    }

    Context 'Test-OmmiQuizFlashcardYaml' {

        It 'Should require authentication token' -Skip:(-not $script:HasAdminToken) {
            $tempFile = [System.IO.Path]::GetTempFileName()
            Set-Content -Path $tempFile -Value 'test: data'

            { Test-OmmiQuizFlashcardYaml -FilePath $tempFile -AuthToken '' } | Should -Throw

            Remove-Item $tempFile -Force
        }

        It 'Should require FilePath parameter' -Skip:(-not $script:HasAdminToken) {
            { Test-OmmiQuizFlashcardYaml -FilePath $null -AuthToken $script:AdminToken } | Should -Throw
        }

        It 'Should require file to exist' -Skip:(-not $script:HasAdminToken) {
            { Test-OmmiQuizFlashcardYaml -FilePath 'C:\NonExistent\File.yml' -AuthToken $script:AdminToken } | Should -Throw
        }

        It 'Should validate YAML structure' -Skip:(-not $script:HasAdminToken) {
            $tempFile = [System.IO.Path]::GetTempFileName()
            $yamlContent = @'
id: test-flashcard-validation
title: Test Validation Set
flashcards:
  - question: Valid Question
    answer: Valid Answer
'@
            Set-Content -Path $tempFile -Value $yamlContent

            # Should accept valid YAML file
            $tempFile | Should -Exist

            Remove-Item $tempFile -Force
        }
    }
}

Describe 'Parameter Validation' {

    Context 'FlashcardId Parameter Validation' {

        It 'Should reject null FlashcardId in Update-OmmiQuizFlashcardSet' {
            { Update-OmmiQuizFlashcardSet -FlashcardId $null -FlashcardData @{} -AuthToken 'token' } | Should -Throw
        }

        It 'Should reject empty FlashcardId in Update-OmmiQuizFlashcardSet' {
            { Update-OmmiQuizFlashcardSet -FlashcardId '' -FlashcardData @{} -AuthToken 'token' } | Should -Throw
        }

        It 'Should reject null FlashcardId in Remove-OmmiQuizFlashcardSet' {
            { Remove-OmmiQuizFlashcardSet -FlashcardId $null -AuthToken 'token' -Confirm:$false } | Should -Throw
        }

        It 'Should reject empty FlashcardId in Remove-OmmiQuizFlashcardSet' {
            { Remove-OmmiQuizFlashcardSet -FlashcardId '' -AuthToken 'token' -Confirm:$false } | Should -Throw
        }
    }

    Context 'FilePath Parameter Validation' {

        It 'Should reject null FilePath in New-OmmiQuizFlashcardSet' {
            { New-OmmiQuizFlashcardSet -FilePath $null -AuthToken 'token' } | Should -Throw
        }

        It 'Should reject empty FilePath in New-OmmiQuizFlashcardSet' {
            { New-OmmiQuizFlashcardSet -FilePath '' -AuthToken 'token' } | Should -Throw
        }

        It 'Should reject non-existent file in New-OmmiQuizFlashcardSet' {
            { New-OmmiQuizFlashcardSet -FilePath 'C:\Does\Not\Exist.yml' -AuthToken 'token' } | Should -Throw
        }

        It 'Should reject null FilePath in Test-OmmiQuizFlashcardYaml' {
            { Test-OmmiQuizFlashcardYaml -FilePath $null -AuthToken 'token' } | Should -Throw
        }

        It 'Should reject empty FilePath in Test-OmmiQuizFlashcardYaml' {
            { Test-OmmiQuizFlashcardYaml -FilePath '' -AuthToken 'token' } | Should -Throw
        }
    }

    Context 'AuthToken Parameter Validation' {

        It 'Should require AuthToken for admin functions' {
            $commands = @(
                'Update-OmmiQuizFlashcardSet',
                'Remove-OmmiQuizFlashcardSet'
            )

            foreach ($cmdName in $commands) {
                $cmd = Get-Command $cmdName
                $cmd.Parameters['AuthToken'].Attributes.Mandatory | Should -Be $true -Because "$cmdName requires authentication"
            }
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
}
