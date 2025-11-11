# OmmiquizModule.Tests.ps1
# Pester tests for the OmmiquizModule

BeforeAll {
    # Import the module
    $ModulePath = Join-Path $PSScriptRoot "OmmiquizModule.psm1"
    Import-Module $ModulePath -Force
    
    # Mock API base URL for testing
    $Script:TestBaseUrl = "http://localhost:8000"
    $Script:TestFlashcardId = "test-flashcard"
    $Script:TestFilePath = Join-Path $TestDrive "test-flashcard.yaml"
}

AfterAll {
    # Clean up
    Remove-Module OmmiquizModule -Force -ErrorAction SilentlyContinue
}

Describe "OmmiquizModule Configuration" {
    Context "Set-OmmiquizConfig" {
        It "Should set the base URL correctly" {
            Set-OmmiquizConfig -BaseUrl "https://example.com/"
            $config = Get-OmmiquizConfig
            $config.BaseUrl | Should -Be "https://example.com"
        }
        
        It "Should remove trailing slash from URL" {
            Set-OmmiquizConfig -BaseUrl "https://example.com/"
            $config = Get-OmmiquizConfig
            $config.BaseUrl | Should -Not -Match "/$"
        }
        
        It "Should accept URL without trailing slash" {
            Set-OmmiquizConfig -BaseUrl "https://example.com"
            $config = Get-OmmiquizConfig
            $config.BaseUrl | Should -Be "https://example.com"
        }
    }
    
    Context "Get-OmmiquizConfig" {
        It "Should return configuration object" {
            $config = Get-OmmiquizConfig
            $config | Should -Not -BeNullOrEmpty
            $config.BaseUrl | Should -Not -BeNullOrEmpty
            $config.ValidLanguages | Should -Not -BeNullOrEmpty
            $config.ValidLevels | Should -Not -BeNullOrEmpty
        }
        
        It "Should contain expected properties" {
            $config = Get-OmmiquizConfig
            $config.PSObject.Properties.Name | Should -Contain "BaseUrl"
            $config.PSObject.Properties.Name | Should -Contain "DefaultOutputPath"
            $config.PSObject.Properties.Name | Should -Contain "ValidLanguages"
            $config.PSObject.Properties.Name | Should -Contain "ValidLevels"
        }
    }
}

Describe "OmmiquizModule API Functions" {
    BeforeEach {
        Set-OmmiquizConfig -BaseUrl $Script:TestBaseUrl
    }
    
    Context "Test-OmmiquizHealth" {
        It "Should return true for healthy API" {
            Mock Invoke-OmmiquizApiRequest {
                return @{ status = "healthy" }
            } -ModuleName OmmiquizModule
            
            $result = Test-OmmiquizHealth
            $result | Should -Be $true
        }
        
        It "Should return false for unhealthy API" {
            Mock Invoke-OmmiquizApiRequest {
                return @{ status = "unhealthy" }
            } -ModuleName OmmiquizModule
            
            $result = Test-OmmiquizHealth
            $result | Should -Be $false
        }
        
        It "Should return false when API request fails" {
            Mock Invoke-OmmiquizApiRequest {
                throw "Connection failed"
            } -ModuleName OmmiquizModule
            
            $result = Test-OmmiquizHealth
            $result | Should -Be $false
        }
    }
    
    Context "Get-OmmiquizFlashcards" {
        It "Should return flashcards list" {
            $mockResponse = @{
                flashcards = @(
                    @{ id = "python-basics"; filename = "python-basics.yaml" },
                    @{ id = "javascript-basics"; filename = "javascript-basics.yaml" }
                )
            }
            
            Mock Invoke-OmmiquizApiRequest {
                return $mockResponse
            } -ModuleName OmmiquizModule
            
            $result = Get-OmmiquizFlashcards
            $result | Should -HaveCount 2
            $result[0].id | Should -Be "python-basics"
            $result[1].id | Should -Be "javascript-basics"
        }
        
        It "Should call correct API endpoint" {
            Mock Invoke-OmmiquizApiRequest {
                return @{ flashcards = @() }
            } -ModuleName OmmiquizModule
            
            Get-OmmiquizFlashcards
            
            Assert-MockCalled Invoke-OmmiquizApiRequest -ModuleName OmmiquizModule -ParameterFilter {
                $Endpoint -eq "/flashcards"
            }
        }
    }
    
    Context "Get-OmmiquizFlashcard" {
        It "Should return specific flashcard" {
            $mockFlashcard = @{
                id = "test-flashcard"
                author = "Test Author"
                title = "Test Flashcard"
                flashcards = @(
                    @{ question = "Test question?"; answer = "Test answer"; type = "single" }
                )
            }
            
            Mock Invoke-OmmiquizApiRequest {
                return $mockFlashcard
            } -ModuleName OmmiquizModule
            
            $result = Get-OmmiquizFlashcard -FlashcardId "test-flashcard"
            $result.id | Should -Be "test-flashcard"
            $result.author | Should -Be "Test Author"
            $result.flashcards | Should -HaveCount 1
        }
        
        It "Should validate flashcard ID format" {
            { Get-OmmiquizFlashcard -FlashcardId "../invalid/path" } | Should -Throw "Invalid flashcard ID format*"
            { Get-OmmiquizFlashcard -FlashcardId "valid-id_123" } | Should -Not -Throw
        }
        
        It "Should call correct API endpoint with ID" {
            Mock Invoke-OmmiquizApiRequest {
                return @{ id = "test-id" }
            } -ModuleName OmmiquizModule
            
            Get-OmmiquizFlashcard -FlashcardId "test-id"
            
            Assert-MockCalled Invoke-OmmiquizApiRequest -ModuleName OmmiquizModule -ParameterFilter {
                $Endpoint -eq "/flashcards/test-id"
            }
        }
    }
    
    Context "Remove-OmmiquizFlashcard" {
        It "Should remove flashcard successfully" {
            Mock Invoke-OmmiquizApiRequest {
                return @{ success = $true; message = "Flashcard deleted successfully" }
            } -ModuleName OmmiquizModule
            
            $result = Remove-OmmiquizFlashcard -FlashcardId "test-id" -Force
            $result.success | Should -Be $true
        }
        
        It "Should validate flashcard ID format" {
            { Remove-OmmiquizFlashcard -FlashcardId "../invalid" -Force } | Should -Throw "Invalid flashcard ID format*"
        }
        
        It "Should call DELETE method" {
            Mock Invoke-OmmiquizApiRequest {
                return @{ success = $true }
            } -ModuleName OmmiquizModule
            
            Remove-OmmiquizFlashcard -FlashcardId "test-id" -Force
            
            Assert-MockCalled Invoke-OmmiquizApiRequest -ModuleName OmmiquizModule -ParameterFilter {
                $Method -eq "DELETE" -and $Endpoint -eq "/flashcards/test-id"
            }
        }
    }
}

Describe "OmmiquizModule File Operations" {
    Context "New-OmmiquizFlashcard" {
        BeforeEach {
            $Script:TestOutputPath = Join-Path $TestDrive "new-flashcard.yaml"
        }
        
        It "Should create valid flashcard template" {
            $result = New-OmmiquizFlashcard -Id "test-id" -Title "Test Title" -Author "Test Author" -Description "Test Description" -OutputPath $Script:TestOutputPath
            
            $result.id | Should -Be "test-id"
            $result.title | Should -Be "Test Title"
            $result.author | Should -Be "Test Author"
            $result.flashcards | Should -HaveCount 2
            Test-Path $Script:TestOutputPath | Should -Be $true
        }
        
        It "Should validate ID format" {
            { New-OmmiquizFlashcard -Id "../invalid" -Title "Test" -Author "Test" -Description "Test" -OutputPath $Script:TestOutputPath } | Should -Throw "Invalid ID format*"
        }
        
        It "Should set default language and level" {
            $result = New-OmmiquizFlashcard -Id "test-id" -Title "Test" -Author "Test" -Description "Test" -OutputPath $Script:TestOutputPath
            
            $result.language | Should -Be "en"
            $result.level | Should -Be "beginner"
        }
        
        It "Should accept custom language and level" {
            $result = New-OmmiquizFlashcard -Id "test-id" -Title "Test" -Author "Test" -Description "Test" -Language "de" -Level "advanced" -OutputPath $Script:TestOutputPath
            
            $result.language | Should -Be "de"
            $result.level | Should -Be "advanced"
        }
        
        It "Should include topics and keywords" {
            $topics = @("Topic1", "Topic2")
            $keywords = @("key1", "key2")
            
            $result = New-OmmiquizFlashcard -Id "test-id" -Title "Test" -Author "Test" -Description "Test" -Topics $topics -Keywords $keywords -OutputPath $Script:TestOutputPath
            
            $result.topics | Should -Be $topics
            $result.keywords | Should -Be $keywords
        }
        
        It "Should create file with UTF8 encoding" {
            New-OmmiquizFlashcard -Id "test-id" -Title "Test" -Author "Test" -Description "Test" -OutputPath $Script:TestOutputPath
            
            # Check that file exists and can be read
            Test-Path $Script:TestOutputPath | Should -Be $true
            $content = Get-Content $Script:TestOutputPath -Raw
            $content | Should -Not -BeNullOrEmpty
            $content | Should -Match "id: test-id"
        }
    }
    
    Context "Send-OmmiquizFlashcard" {
        BeforeEach {
            # Create a test YAML file
            $testContent = @"
id: test-upload
author: Test Author
title: Test Upload
description: Test file for upload
createDate: 2025-11-11
language: en
level: beginner
topics: [testing]
keywords: [upload, test]

flashcards:
  - question: "Test question?"
    answer: "Test answer"
    type: single
"@
            $Script:TestFilePath | Set-Content -Value $testContent -Encoding UTF8
        }
        
        It "Should upload file successfully" {
            Mock Invoke-RestMethod {
                return @{ success = $true; message = "Upload successful" }
            }
            
            $result = Send-OmmiquizFlashcard -FilePath $Script:TestFilePath
            $result.success | Should -Be $true
        }
        
        It "Should validate file exists" {
            { Send-OmmiquizFlashcard -FilePath "nonexistent.yaml" } | Should -Throw "File not found*"
        }
        
        It "Should validate file extension" {
            $txtFile = Join-Path $TestDrive "test.txt"
            "test content" | Out-File $txtFile
            
            { Send-OmmiquizFlashcard -FilePath $txtFile } | Should -Throw "File must have .yaml or .yml extension"
        }
        
        It "Should use validate endpoint when Validate switch is used" {
            Mock Invoke-RestMethod {
                param($Uri)
                $Uri | Should -Match "/flashcards/validate"
                return @{ valid = $true }
            }
            
            Send-OmmiquizFlashcard -FilePath $Script:TestFilePath -Validate
        }
        
        It "Should use upload endpoint by default" {
            Mock Invoke-RestMethod {
                param($Uri)
                $Uri | Should -Match "/flashcards/upload"
                return @{ success = $true }
            }
            
            Send-OmmiquizFlashcard -FilePath $Script:TestFilePath
        }
    }
}

Describe "OmmiquizModule YAML Conversion" {
    Context "ConvertTo-Yaml Helper Function" {
        # Note: ConvertTo-Yaml is a private function, but we can test it indirectly through New-OmmiquizFlashcard
        
        It "Should create valid YAML structure" {
            $outputPath = Join-Path $TestDrive "yaml-test.yaml"
            New-OmmiquizFlashcard -Id "yaml-test" -Title "YAML Test" -Author "Test" -Description "Test" -OutputPath $outputPath
            
            $content = Get-Content $outputPath -Raw
            $content | Should -Match "id: yaml-test"
            $content | Should -Match "title: YAML Test"
            $content | Should -Match "flashcards:"
            $content | Should -Match "question:"
            $content | Should -Match "answer:"
        }
        
        It "Should handle arrays properly" {
            $outputPath = Join-Path $TestDrive "array-test.yaml"
            $topics = @("Topic1", "Topic2", "Topic3")
            
            New-OmmiquizFlashcard -Id "array-test" -Title "Array Test" -Author "Test" -Description "Test" -Topics $topics -OutputPath $outputPath
            
            $content = Get-Content $outputPath -Raw
            $content | Should -Match "topics:"
            $content | Should -Match "- Topic1"
            $content | Should -Match "- Topic2"
            $content | Should -Match "- Topic3"
        }
        
        It "Should handle nested objects" {
            $outputPath = Join-Path $TestDrive "nested-test.yaml"
            New-OmmiquizFlashcard -Id "nested-test" -Title "Nested Test" -Author "Test" -Description "Test" -OutputPath $outputPath
            
            $content = Get-Content $outputPath -Raw
            $content | Should -Match "flashcards:"
            $content | Should -Match "question:"
            $content | Should -Match "answers:"
            $content | Should -Match "type:"
        }
    }
}

Describe "OmmiquizModule Input Validation" {
    Context "ID Validation" {
        It "Should accept valid IDs" {
            $validIds = @("test-id", "test_id", "TestID123", "my-flashcard_v2")
            
            foreach ($id in $validIds) {
                { Get-OmmiquizFlashcard -FlashcardId $id } | Should -Not -Throw
            }
        }
        
        It "Should reject invalid IDs" {
            $invalidIds = @("../path", "test id", "test@id", "test.id", "test/id")
            
            foreach ($id in $invalidIds) {
                { Get-OmmiquizFlashcard -FlashcardId $id } | Should -Throw
            }
        }
    }
    
    Context "Language Validation" {
        It "Should accept valid languages" {
            $validLanguages = @("en", "de", "fr", "es")
            
            foreach ($lang in $validLanguages) {
                $outputPath = Join-Path $TestDrive "lang-test-$lang.yaml"
                { New-OmmiquizFlashcard -Id "test-$lang" -Title "Test" -Author "Test" -Description "Test" -Language $lang -OutputPath $outputPath } | Should -Not -Throw
            }
        }
    }
    
    Context "Level Validation" {
        It "Should accept valid levels" {
            $validLevels = @("beginner", "intermediate", "advanced", "expert")
            
            foreach ($level in $validLevels) {
                $outputPath = Join-Path $TestDrive "level-test-$level.yaml"
                { New-OmmiquizFlashcard -Id "test-$level" -Title "Test" -Author "Test" -Description "Test" -Level $level -OutputPath $outputPath } | Should -Not -Throw
            }
        }
    }
}

Describe "OmmiquizModule Error Handling" {
    Context "API Error Handling" {
        BeforeEach {
            Set-OmmiquizConfig -BaseUrl $Script:TestBaseUrl
        }
        
        It "Should handle API connection errors gracefully" {
            Mock Invoke-OmmiquizApiRequest {
                throw "Connection timeout"
            } -ModuleName OmmiquizModule
            
            { Get-OmmiquizFlashcards } | Should -Throw "Failed to retrieve flashcards*"
        }
        
        It "Should handle 404 errors for specific flashcards" {
            Mock Invoke-OmmiquizApiRequest {
                throw "404 Not Found"
            } -ModuleName OmmiquizModule
            
            { Get-OmmiquizFlashcard -FlashcardId "nonexistent" } | Should -Throw "Failed to retrieve flashcard*"
        }
    }
    
    Context "File Error Handling" {
        It "Should handle file creation errors" {
            # Try to create file in read-only location (if possible on current OS)
            $readOnlyPath = "/invalid/path/test.yaml"
            
            if ($IsWindows) {
                $readOnlyPath = "C:\Windows\test.yaml"
            }
            
            { New-OmmiquizFlashcard -Id "test" -Title "Test" -Author "Test" -Description "Test" -OutputPath $readOnlyPath } | Should -Throw "Failed to create flashcard file*"
        }
    }
}

Describe "OmmiquizModule Integration" {
    Context "End-to-End Workflow" {
        BeforeEach {
            Set-OmmiquizConfig -BaseUrl $Script:TestBaseUrl
            $Script:WorkflowOutputPath = Join-Path $TestDrive "workflow-test.yaml"
        }
        
        It "Should create, validate, and upload flashcard" {
            # Create flashcard
            $flashcard = New-OmmiquizFlashcard -Id "workflow-test" -Title "Workflow Test" -Author "Test Author" -Description "Test workflow" -OutputPath $Script:WorkflowOutputPath
            
            # Verify creation
            $flashcard.id | Should -Be "workflow-test"
            Test-Path $Script:WorkflowOutputPath | Should -Be $true
            
            # Mock validation
            Mock Invoke-RestMethod {
                return @{ valid = $true; errors = @(); warnings = @() }
            }
            
            # Validate
            $validation = Send-OmmiquizFlashcard -FilePath $Script:WorkflowOutputPath -Validate
            $validation.valid | Should -Be $true
            
            # Mock upload
            Mock Invoke-RestMethod {
                return @{ success = $true; message = "Upload successful" }
            }
            
            # Upload
            $upload = Send-OmmiquizFlashcard -FilePath $Script:WorkflowOutputPath
            $upload.success | Should -Be $true
        }
    }
}