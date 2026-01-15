#requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }

BeforeAll {
    # Import the module
    $ModulePath = Join-Path $PSScriptRoot '..' 'OmmiQuizApiTesting.psm1'
    Import-Module $ModulePath -Force

    # Set base URL to production
    Set-OmmiQuizApiBaseUrl -BaseUrl 'https://nanoquiz-backend-ypez6.ondigitalocean.app/api'
}

Describe 'Flashcard Retrieval Endpoints' {

    Context 'Get-OmmiQuizFlashcardSet -All' {

        It 'Should retrieve flashcard list' {
            $result = Get-OmmiQuizFlashcardSet -All

            $result | Should -Not -BeNullOrEmpty
            $result.StatusCode | Should -Be 200
            $result.Content | Should -Not -BeNullOrEmpty
        }

        It 'Should return object with flashcards property' {
            $result = Get-OmmiQuizFlashcardSet -All

            $result.Content.PSObject.Properties['flashcards'] | Should -Not -BeNullOrEmpty
            $result.Content.flashcards | Should -Not -BeNullOrEmpty
        }

        It 'Should return at least one flashcard set' {
            $result = Get-OmmiQuizFlashcardSet -All

            $sets = if ($result.Content -is [array]) {
                $result.Content
            } elseif ($result.Content.PSObject.Properties['flashcards']) {
                $result.Content.flashcards
            } elseif ($result.Content.PSObject.Properties['flashcard_sets']) {
                $result.Content.flashcard_sets
            } else {
                @($result.Content)
            }

            $sets.Count | Should -BeGreaterThan 0
        }
    }

    Context 'Get-OmmiQuizFlashcardSet -FlashcardId' {

        BeforeAll {
            # Get first available flashcard ID for testing
            $listing = Get-OmmiQuizFlashcardSet -All
            $sets = if ($listing.Content -is [array]) {
                $listing.Content
            } elseif ($listing.Content.PSObject.Properties['flashcards']) {
                $listing.Content.flashcards
            } else {
                @($listing.Content)
            }
            $script:TestFlashcardId = ($sets | Select-Object -First 1).id
        }

        It 'Should retrieve specific flashcard set' {
            $result = Get-OmmiQuizFlashcardSet -FlashcardId $script:TestFlashcardId

            $result | Should -Not -BeNullOrEmpty
            $result.StatusCode | Should -Be 200
            $result.Content | Should -Not -BeNullOrEmpty
        }

        It 'Should return flashcard set with ID' {
            $result = Get-OmmiQuizFlashcardSet -FlashcardId $script:TestFlashcardId

            $result.Content.id | Should -Be $script:TestFlashcardId
        }

        It 'Should return flashcard set with cards' {
            $result = Get-OmmiQuizFlashcardSet -FlashcardId $script:TestFlashcardId

            $result.Content.flashcards | Should -Not -BeNullOrEmpty
            $result.Content.flashcards.Count | Should -BeGreaterThan 0
        }

        It 'Should fail with invalid flashcard ID' {
            { Get-OmmiQuizFlashcardSet -FlashcardId 'nonexistent-flashcard-id-12345' } | Should -Throw
        }

        It 'Should require FlashcardId parameter' {
            { Get-OmmiQuizFlashcardSet -FlashcardId $null } | Should -Throw
        }
    }

    Context 'Get-OmmiQuizFlashcardCatalog' {

        It 'Should retrieve flashcard catalog' {
            $result = Get-OmmiQuizFlashcardCatalog

            $result | Should -Not -BeNullOrEmpty
            $result.StatusCode | Should -Be 200
        }

        It 'Should return catalog data structure' {
            $result = Get-OmmiQuizFlashcardCatalog

            $result.Content | Should -Not -BeNullOrEmpty
        }
    }

    Context 'Get-OmmiQuizFlashcardCatalogData' {

        It 'Should retrieve catalog metadata' {
            $result = Get-OmmiQuizFlashcardCatalogData

            $result | Should -Not -BeNullOrEmpty
            $result.StatusCode | Should -Be 200
        }

        It 'Should return metadata structure' {
            $result = Get-OmmiQuizFlashcardCatalogData

            $result.Content | Should -Not -BeNullOrEmpty
        }
    }

    Context 'Get-OmmiQuizSpeedQuizPdf' {

        BeforeAll {
            # Get first available flashcard ID for testing
            $listing = Get-OmmiQuizFlashcardSet -All
            $sets = if ($listing.Content -is [array]) {
                $listing.Content
            } elseif ($listing.Content.PSObject.Properties['flashcards']) {
                $listing.Content.flashcards
            } else {
                @($listing.Content)
            }
            $script:TestFlashcardId = ($sets | Select-Object -First 1).id
        }

        It 'Should download speed quiz PDF' {
            $result = Get-OmmiQuizSpeedQuizPdf -FlashcardId $script:TestFlashcardId

            $result | Should -Not -BeNullOrEmpty
            $result.Success | Should -Be $true
        }

        It 'Should create valid PDF file' {
            $result = Get-OmmiQuizSpeedQuizPdf -FlashcardId $script:TestFlashcardId

            Test-Path $result.FilePath | Should -Be $true
            $result.FileSizeKB | Should -BeGreaterThan 1

            # Verify PDF header
            $bytes = [System.IO.File]::ReadAllBytes($result.FilePath)
            $header = [System.Text.Encoding]::ASCII.GetString($bytes[0..3])
            $header | Should -Be '%PDF'

            # Cleanup
            Remove-Item $result.FilePath -Force
        }

        It 'Should save to custom output path' {
            $tempPath = [System.IO.Path]::GetTempFileName() + '.pdf'
            $result = Get-OmmiQuizSpeedQuizPdf -FlashcardId $script:TestFlashcardId -OutputPath $tempPath

            $result.FilePath | Should -Be $tempPath
            Test-Path $tempPath | Should -Be $true

            # Cleanup
            Remove-Item $tempPath -Force
        }

        It 'Should require FlashcardId parameter' {
            { Get-OmmiQuizSpeedQuizPdf -FlashcardId $null } | Should -Throw
        }
    }
}

Describe 'Flashcard Listing Tests' {

    Context 'Test-OmmiQuizFlashcardListing' {

        It 'Should pass flashcard listing validation' {
            $result = Test-OmmiQuizFlashcardListing

            $result | Should -Not -BeNullOrEmpty
            $result.Success | Should -Be $true
            $result.Test | Should -Be 'FlashcardListing'
        }

        It 'Should report number of flashcard sets' {
            $result = Test-OmmiQuizFlashcardListing

            $result.Message | Should -Match '\d+ flashcard set'
        }
    }

    Context 'Test-OmmiQuizFlashcardDetail' {

        It 'Should pass flashcard detail validation' {
            $result = Test-OmmiQuizFlashcardDetail

            $result | Should -Not -BeNullOrEmpty
            $result.Success | Should -Be $true
            $result.Test | Should -Be 'FlashcardDetail'
        }

        It 'Should report number of cards' {
            $result = Test-OmmiQuizFlashcardDetail

            $result.Message | Should -Match '\d+ card'
        }

        It 'Should validate with specific flashcard ID' {
            $listing = Get-OmmiQuizFlashcardSet -All
            $sets = if ($listing.Content -is [array]) {
                $listing.Content
            } elseif ($listing.Content.PSObject.Properties['flashcards']) {
                $listing.Content.flashcards
            } else {
                @($listing.Content)
            }
            $testId = ($sets | Select-Object -First 1).id

            $result = Test-OmmiQuizFlashcardDetail -FlashcardId $testId

            $result.Success | Should -Be $true
        }
    }

    Context 'Test-OmmiQuizSpeedQuizPdfEndpoint' {

        It 'Should pass speed quiz PDF validation' {
            $result = Test-OmmiQuizSpeedQuizPdfEndpoint

            $result | Should -Not -BeNullOrEmpty
            $result.Success | Should -Be $true
            $result.Test | Should -Be 'SpeedQuizPdfEndpoint'
        }

        It 'Should not keep file by default' {
            $result = Test-OmmiQuizSpeedQuizPdfEndpoint

            $result.FilePath | Should -BeNullOrEmpty
        }

        It 'Should keep file when requested' {
            $result = Test-OmmiQuizSpeedQuizPdfEndpoint -KeepFile

            $result.FilePath | Should -Not -BeNullOrEmpty
            Test-Path $result.FilePath | Should -Be $true

            # Cleanup
            Remove-Item $result.FilePath -Force
        }
    }
}

Describe 'Smoke Tests' {

    Context 'Invoke-OmmiQuizApiSmokeTests' {

        It 'Should run all smoke tests' {
            $result = Invoke-OmmiQuizApiSmokeTests

            $result | Should -Not -BeNullOrEmpty
            $result.Summary | Should -Not -BeNullOrEmpty
            $result.Results | Should -Not -BeNullOrEmpty
        }

        It 'Should report test summary' {
            $result = Invoke-OmmiQuizApiSmokeTests

            $result.Summary.Total | Should -BeGreaterThan 0
            $result.Summary.Passed | Should -BeGreaterThan 0
        }

        It 'Should pass all smoke tests' {
            $result = Invoke-OmmiQuizApiSmokeTests

            $result.Summary.Failed | Should -Be 0
        }
    }
}
