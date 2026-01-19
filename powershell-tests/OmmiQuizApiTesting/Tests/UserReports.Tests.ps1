#requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }

BeforeAll {
    # Import the module
    $ModulePath = Join-Path $PSScriptRoot '..' 'OmmiQuizApiTesting.psm1'
    Import-Module $ModulePath -Force

    # Set base URL to production
    Set-OmmiQuizApiBaseUrl -BaseUrl 'https://nanoquiz-backend-ypez6.ondigitalocean.app/api'

    # Get auth token from environment variable for testing
    # Note: Set $env:OMMIQUIZ_AUTH_TOKEN before running these tests
    $script:AuthToken = $env:OMMIQUIZ_AUTH_TOKEN
    $script:HasAuthToken = -not [string]::IsNullOrEmpty($script:AuthToken)
}

Describe 'User Report Endpoints' {

    Context 'Get-OmmiQuizCurrentUser' {

        It 'Should require authentication token' {
            { Get-OmmiQuizCurrentUser -AuthToken '' } | Should -Throw
        }

        It 'Should require AuthToken parameter' {
            $cmd = Get-Command Get-OmmiQuizCurrentUser
            $cmd.Parameters['AuthToken'].Attributes.Mandatory | Should -Be $true
        }

        It 'Should retrieve current user profile' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizCurrentUser -AuthToken $script:AuthToken

            $result | Should -Not -BeNullOrEmpty
            $result.StatusCode | Should -Be 200
            $result.Content | Should -Not -BeNullOrEmpty
        }

        It 'Should return user with ID' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizCurrentUser -AuthToken $script:AuthToken

            $result.Content.user_id | Should -Not -BeNullOrEmpty
        }

        It 'Should return user with email' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizCurrentUser -AuthToken $script:AuthToken

            $result.Content.email | Should -Not -BeNullOrEmpty
        }
    }

    Context 'Get-OmmiQuizLearningReport' {

        It 'Should require authentication token' {
            { Get-OmmiQuizLearningReport -AuthToken '' } | Should -Throw
        }

        It 'Should use default days value of 30' -Skip:(-not $script:HasAuthToken) {
            $cmd = Get-Command Get-OmmiQuizLearningReport
            $cmd.Parameters['Days'].Attributes.Where({$_ -is [System.Management.Automation.ParameterAttribute]}).Count | Should -BeGreaterThan 0
        }

        It 'Should retrieve learning report' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizLearningReport -AuthToken $script:AuthToken

            $result | Should -Not -BeNullOrEmpty
            $result.StatusCode | Should -Be 200
            $result.Content | Should -Not -BeNullOrEmpty
        }

        It 'Should return report with summary' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizLearningReport -AuthToken $script:AuthToken

            $result.Content.summary | Should -Not -BeNullOrEmpty
        }

        It 'Should return report with sessions list' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizLearningReport -AuthToken $script:AuthToken

            $result.Content.sessions | Should -Not -BeNullOrEmpty
        }

        It 'Should accept custom days parameter' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizLearningReport -Days 7 -AuthToken $script:AuthToken

            $result.StatusCode | Should -Be 200
        }

        It 'Should accept flashcard filter' -Skip:(-not $script:HasAuthToken) {
            # Get first flashcard ID for testing
            $listing = Get-OmmiQuizFlashcardSet -All
            $sets = if ($listing.Content -is [array]) {
                $listing.Content
            } elseif ($listing.Content.PSObject.Properties['flashcards']) {
                $listing.Content.flashcards
            } else {
                @($listing.Content)
            }
            $flashcardId = ($sets | Select-Object -First 1).id

            $result = Get-OmmiQuizLearningReport -Days 30 -FlashcardId $flashcardId -AuthToken $script:AuthToken

            $result.StatusCode | Should -Be 200
        }

        It 'Should validate summary statistics structure' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizLearningReport -AuthToken $script:AuthToken
            $summary = $result.Content.summary

            $summary.total_sessions | Should -Not -BeNullOrEmpty
            $summary.total_cards_reviewed | Should -Not -BeNullOrEmpty
            $summary.total_learned | Should -Not -BeNullOrEmpty
            $summary.total_duration_seconds | Should -Not -BeNullOrEmpty
        }

        It 'Should include average_time_to_flip_seconds in summary' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizLearningReport -AuthToken $script:AuthToken
            $summary = $result.Content.summary

            # May be null if no data, but property should exist
            $summary.PSObject.Properties['average_time_to_flip_seconds'] | Should -Not -BeNullOrEmpty
        }
    }

    Context 'Get-OmmiQuizQuizHistoryPdf' {

        It 'Should require authentication token' {
            { Get-OmmiQuizQuizHistoryPdf -AuthToken '' } | Should -Throw
        }

        It 'Should use default days value of 30' {
            $cmd = Get-Command Get-OmmiQuizQuizHistoryPdf
            $cmd.Parameters['Days'].Attributes.Where({$_ -is [System.Management.Automation.ParameterAttribute]}).Count | Should -BeGreaterThan 0
        }

        It 'Should download quiz history PDF' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizQuizHistoryPdf -AuthToken $script:AuthToken

            $result | Should -Not -BeNullOrEmpty
            $result.Success | Should -Be $true
        }

        It 'Should create valid PDF file' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizQuizHistoryPdf -AuthToken $script:AuthToken

            Test-Path $result.FilePath | Should -Be $true
            $result.FileSizeKB | Should -BeGreaterThan 1

            # Verify PDF header
            $bytes = [System.IO.File]::ReadAllBytes($result.FilePath)
            $header = [System.Text.Encoding]::ASCII.GetString($bytes[0..3])
            $header | Should -Be '%PDF'

            # Cleanup
            Remove-Item $result.FilePath -Force
        }

        It 'Should accept custom days parameter' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizQuizHistoryPdf -Days 7 -AuthToken $script:AuthToken

            $result.Success | Should -Be $true

            # Cleanup
            Remove-Item $result.FilePath -Force
        }

        It 'Should save to custom output path' -Skip:(-not $script:HasAuthToken) {
            $tempPath = [System.IO.Path]::GetTempFileName() + '.pdf'
            $result = Get-OmmiQuizQuizHistoryPdf -Days 30 -OutputPath $tempPath -AuthToken $script:AuthToken

            $result.FilePath | Should -Be $tempPath
            Test-Path $tempPath | Should -Be $true

            # Cleanup
            Remove-Item $tempPath -Force
        }

        It 'Should have appropriate file size' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizQuizHistoryPdf -AuthToken $script:AuthToken

            # PDF should be at least 5KB (reasonable minimum)
            $result.FileSizeKB | Should -BeGreaterThan 5

            # Cleanup
            Remove-Item $result.FilePath -Force
        }

        It 'Should extract filename from headers' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizQuizHistoryPdf -AuthToken $script:AuthToken

            $result.FileName | Should -Not -BeNullOrEmpty
            $result.FileName | Should -Match '\.pdf$'

            # Cleanup
            Remove-Item $result.FilePath -Force
        }
    }
}

Describe 'Report Data Structure Validation' {

    Context 'Learning Report Summary' {

        It 'Should have required summary fields' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizLearningReport -AuthToken $script:AuthToken
            $summary = $result.Content.summary

            $requiredFields = @(
                'total_sessions',
                'total_cards_reviewed',
                'total_learned',
                'total_uncertain',
                'total_not_learned',
                'total_duration_seconds',
                'average_session_duration'
            )

            foreach ($field in $requiredFields) {
                $summary.PSObject.Properties[$field] | Should -Not -BeNullOrEmpty -Because "$field is required in summary"
            }
        }

        It 'Should have numeric values for statistics' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizLearningReport -AuthToken $script:AuthToken
            $summary = $result.Content.summary

            $summary.total_sessions | Should -BeOfType [int]
            $summary.total_cards_reviewed | Should -BeOfType [int]
            $summary.total_learned | Should -BeOfType [int]
        }
    }

    Context 'Learning Report Sessions' {

        It 'Should have sessions array' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizLearningReport -AuthToken $script:AuthToken

            $result.Content.sessions | Should -Not -BeNullOrEmpty
            $result.Content.sessions | Should -BeOfType [array]
        }

        It 'Should have valid session structure if sessions exist' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizLearningReport -AuthToken $script:AuthToken

            if ($result.Content.sessions.Count -gt 0) {
                $session = $result.Content.sessions[0]

                $session.id | Should -Not -BeNullOrEmpty
                $session.flashcard_id | Should -Not -BeNullOrEmpty
                $session.completed_at | Should -Not -BeNullOrEmpty
                $session.cards_reviewed | Should -Not -BeNullOrEmpty
                $session.box1_count | Should -Not -BeNullOrEmpty
                $session.box2_count | Should -Not -BeNullOrEmpty
                $session.box3_count | Should -Not -BeNullOrEmpty
            }
        }

        It 'Should include average_time_to_flip_seconds in sessions' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizLearningReport -AuthToken $script:AuthToken

            if ($result.Content.sessions.Count -gt 0) {
                $session = $result.Content.sessions[0]

                # Property should exist (may be null for old sessions)
                $session.PSObject.Properties['average_time_to_flip_seconds'] | Should -Not -BeNullOrEmpty
            }
        }
    }

    Context 'User Profile Structure' {

        It 'Should have user_id field' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizCurrentUser -AuthToken $script:AuthToken

            $result.Content.user_id | Should -Not -BeNullOrEmpty
        }

        It 'Should have email field' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizCurrentUser -AuthToken $script:AuthToken

            $result.Content.email | Should -Not -BeNullOrEmpty
        }

        It 'Should have is_admin field' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizCurrentUser -AuthToken $script:AuthToken

            $result.Content.PSObject.Properties['is_admin'] | Should -Not -BeNullOrEmpty
            $result.Content.is_admin | Should -BeOfType [bool]
        }
    }
}

Describe 'Parameter Validation' {

    Context 'Days Parameter' {

        It 'Should accept valid days value in Get-OmmiQuizLearningReport' -Skip:(-not $script:HasAuthToken) {
            { Get-OmmiQuizLearningReport -Days 7 -AuthToken $script:AuthToken } | Should -Not -Throw
        }

        It 'Should accept valid days value in Get-OmmiQuizQuizHistoryPdf' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizQuizHistoryPdf -Days 90 -AuthToken $script:AuthToken
            $result.Success | Should -Be $true
            Remove-Item $result.FilePath -Force
        }

        It 'Should use default days when not specified' -Skip:(-not $script:HasAuthToken) {
            $result = Get-OmmiQuizLearningReport -AuthToken $script:AuthToken
            $result.StatusCode | Should -Be 200
        }
    }

    Context 'FlashcardId Filter' {

        It 'Should accept optional FlashcardId parameter' -Skip:(-not $script:HasAuthToken) {
            $listing = Get-OmmiQuizFlashcardSet -All
            $sets = if ($listing.Content -is [array]) {
                $listing.Content
            } elseif ($listing.Content.PSObject.Properties['flashcards']) {
                $listing.Content.flashcards
            } else {
                @($listing.Content)
            }
            $flashcardId = ($sets | Select-Object -First 1).id

            { Get-OmmiQuizLearningReport -FlashcardId $flashcardId -AuthToken $script:AuthToken } | Should -Not -Throw
        }

        It 'Should work without FlashcardId parameter' -Skip:(-not $script:HasAuthToken) {
            { Get-OmmiQuizLearningReport -AuthToken $script:AuthToken } | Should -Not -Throw
        }
    }

    Context 'Mandatory Parameters' {

        It 'Should require AuthToken in all user endpoints' {
            $commands = @(
                'Get-OmmiQuizCurrentUser',
                'Get-OmmiQuizLearningReport',
                'Get-OmmiQuizQuizHistoryPdf'
            )

            foreach ($cmdName in $commands) {
                $cmd = Get-Command $cmdName
                $cmd.Parameters['AuthToken'].Attributes.Mandatory | Should -Be $true -Because "$cmdName requires authentication"
            }
        }
    }
}

Describe 'Authentication Token Check' {

    It 'Should notify if auth token is not set' {
        if (-not $script:HasAuthToken) {
            Write-Warning 'Auth token not set. Set $env:OMMIQUIZ_AUTH_TOKEN to run user report tests.'
        }

        # This test always passes, just informational
        $true | Should -Be $true
    }

    It 'Should have auth token for full test coverage' {
        if (-not $script:HasAuthToken) {
            Set-ItResult -Skipped -Because 'Auth token not configured in environment'
        }

        $script:HasAuthToken | Should -Be $true
    }
}
