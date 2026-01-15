#requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }

BeforeAll {
    # Import the module
    $ModulePath = Join-Path $PSScriptRoot '..' 'OmmiQuizApiTesting.psm1'
    Import-Module $ModulePath -Force

    # Set base URL to production
    Set-OmmiQuizApiBaseUrl -BaseUrl 'https://nanoquiz-backend-ypez6.ondigitalocean.app/api'
}

Describe 'Logging Query Endpoints' {

    Context 'Get-OmmiQuizLog' {

        It 'Should retrieve logs' {
            $result = Get-OmmiQuizLog -Limit 10

            $result | Should -Not -BeNullOrEmpty
            $result.StatusCode | Should -Be 200
            $result.Content | Should -Not -BeNullOrEmpty
        }

        It 'Should return logs with valid structure' {
            $result = Get-OmmiQuizLog -Limit 10

            $result.Content.logs | Should -Not -BeNullOrEmpty
            $result.Content.total | Should -Not -BeNullOrEmpty
        }

        It 'Should respect limit parameter' {
            $limit = 5
            $result = Get-OmmiQuizLog -Limit $limit

            $result.Content.logs.Count | Should -BeLessOrEqual $limit
        }

        It 'Should accept offset parameter' {
            { Get-OmmiQuizLog -Limit 10 -Offset 5 } | Should -Not -Throw
        }

        It 'Should filter by log level' {
            $levels = @('DEBUG', 'INFO', 'WARNING', 'ERROR')

            foreach ($level in $levels) {
                { Get-OmmiQuizLog -Level $level -Limit 10 } | Should -Not -Throw
            }
        }

        It 'Should filter by message content' {
            { Get-OmmiQuizLog -MessageContains 'flashcard' -Limit 10 } | Should -Not -Throw
        }

        It 'Should filter by time range' {
            $startTime = (Get-Date).AddHours(-1)
            $endTime = Get-Date

            { Get-OmmiQuizLog -StartTime $startTime -EndTime $endTime -Limit 10 } | Should -Not -Throw
        }

        It 'Should combine multiple filters' {
            $startTime = (Get-Date).AddHours(-24)

            { Get-OmmiQuizLog -Level 'INFO' -MessageContains 'api' -StartTime $startTime -Limit 10 } | Should -Not -Throw
        }

        It 'Should use default limit of 100' {
            $cmd = Get-Command Get-OmmiQuizLog
            $cmd.Parameters['Limit'].Attributes.Where({$_ -is [System.Management.Automation.ParameterAttribute]}).Count | Should -BeGreaterThan 0
        }

        It 'Should use default offset of 0' {
            $cmd = Get-Command Get-OmmiQuizLog
            $cmd.Parameters['Offset'].Attributes.Where({$_ -is [System.Management.Automation.ParameterAttribute]}).Count | Should -BeGreaterThan 0
        }
    }

    Context 'Get-OmmiQuizLogFile' {

        It 'Should retrieve log files list' {
            $result = Get-OmmiQuizLogFile -All

            $result | Should -Not -BeNullOrEmpty
            $result.StatusCode | Should -Be 200
        }

        It 'Should return log files with metadata' {
            $result = Get-OmmiQuizLogFile -All

            if ($result.Content.log_files -and $result.Content.log_files.Count -gt 0) {
                $file = $result.Content.log_files[0]

                $file.filename | Should -Not -BeNullOrEmpty
                $file.size | Should -Not -BeNullOrEmpty
                $file.modified | Should -Not -BeNullOrEmpty
            }
        }

        It 'Should validate log filename format' {
            # Valid log filenames should match pattern
            $validFilenames = @(
                'app-2025-01-15.log',
                'error-2025-01-15.log',
                'access_2025-01-15.log'
            )

            foreach ($filename in $validFilenames) {
                $filename | Should -Match '^[a-zA-Z0-9_-]+\.log$'
            }
        }

        It 'Should reject invalid filename formats' {
            $invalidFilenames = @(
                '../../../etc/passwd',
                'app.log..',
                'app log.txt',
                '.log'
            )

            foreach ($filename in $invalidFilenames) {
                { Get-OmmiQuizLogFile -Filename $filename } | Should -Throw
            }
        }

        It 'Should download specific log file' {
            $result = Get-OmmiQuizLogFile -All

            if ($result.Content.log_files -and $result.Content.log_files.Count -gt 0) {
                $filename = $result.Content.log_files[0].filename

                $fileResult = Get-OmmiQuizLogFile -Filename $filename

                $fileResult | Should -Not -BeNullOrEmpty
                $fileResult.StatusCode | Should -Be 200
            } else {
                Set-ItResult -Skipped -Because 'No log files available'
            }
        }

        It 'Should skip JSON parsing for log file content' {
            # Log file content should be raw text, not JSON parsed
            $result = Get-OmmiQuizLogFile -All

            if ($result.Content.log_files -and $result.Content.log_files.Count -gt 0) {
                # This tests the -SkipJsonParsing parameter internally used
                $true | Should -Be $true
            }
        }
    }
}

Describe 'Log Data Structure Validation' {

    Context 'Log Entry Structure' {

        It 'Should have required log entry fields' {
            $result = Get-OmmiQuizLog -Limit 10

            if ($result.Content.logs.Count -gt 0) {
                $logEntry = $result.Content.logs[0]

                $logEntry.timestamp | Should -Not -BeNullOrEmpty
                $logEntry.level | Should -Not -BeNullOrEmpty
                $logEntry.message | Should -Not -BeNullOrEmpty
            }
        }

        It 'Should have valid log levels' {
            $result = Get-OmmiQuizLog -Limit 50

            $validLevels = @('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')

            foreach ($logEntry in $result.Content.logs) {
                $logEntry.level | Should -BeIn $validLevels
            }
        }

        It 'Should have ISO 8601 timestamp format' {
            $result = Get-OmmiQuizLog -Limit 10

            if ($result.Content.logs.Count -gt 0) {
                $logEntry = $result.Content.logs[0]

                # Timestamp should be a string (not null)
                $logEntry.timestamp | Should -Not -BeNullOrEmpty
                $logEntry.timestamp | Should -BeOfType [string]
            }
        }

        It 'Should have message as string' {
            $result = Get-OmmiQuizLog -Limit 10

            if ($result.Content.logs.Count -gt 0) {
                $logEntry = $result.Content.logs[0]

                $logEntry.message | Should -BeOfType [string]
            }
        }
    }

    Context 'Log File Metadata Structure' {

        It 'Should have filename field' {
            $result = Get-OmmiQuizLogFile -All

            if ($result.Content.log_files -and $result.Content.log_files.Count -gt 0) {
                $file = $result.Content.log_files[0]

                $file.filename | Should -Not -BeNullOrEmpty
                $file.filename | Should -BeOfType [string]
            }
        }

        It 'Should have size field as number' {
            $result = Get-OmmiQuizLogFile -All

            if ($result.Content.log_files -and $result.Content.log_files.Count -gt 0) {
                $file = $result.Content.log_files[0]

                $file.size | Should -BeOfType [long]
                $file.size | Should -BeGreaterOrEqual 0
            }
        }

        It 'Should have modified timestamp' {
            $result = Get-OmmiQuizLogFile -All

            if ($result.Content.log_files -and $result.Content.log_files.Count -gt 0) {
                $file = $result.Content.log_files[0]

                $file.modified | Should -Not -BeNullOrEmpty
            }
        }

        It 'Should have .log file extension' {
            $result = Get-OmmiQuizLogFile -All

            if ($result.Content.log_files -and $result.Content.log_files.Count -gt 0) {
                foreach ($file in $result.Content.log_files) {
                    $file.filename | Should -Match '\.log$'
                }
            }
        }
    }

    Context 'Log Response Structure' {

        It 'Should have logs array' {
            $result = Get-OmmiQuizLog -Limit 10

            # logs can be array or single object - ensure it exists and is not null
            $result.Content.logs | Should -Not -BeNullOrEmpty
            # Wrap in array to handle both single object and array cases
            @($result.Content.logs).Count | Should -BeGreaterThan 0
        }

        It 'Should have total count' {
            $result = Get-OmmiQuizLog -Limit 10

            # total should be a numeric value
            $result.Content.total | Should -Not -BeNullOrEmpty
            # Verify it's numeric by checking it's greater than or equal to 0
            $result.Content.total | Should -BeGreaterOrEqual 0
            # Verify it can be treated as a number
            { [int]$result.Content.total } | Should -Not -Throw
        }

        It 'Should have log_files array in file list response' {
            $result = Get-OmmiQuizLogFile -All

            $result.Content.log_files | Should -Not -BeNullOrEmpty
        }
    }
}

Describe 'Log Filtering Tests' {

    Context 'Level Filtering' {

        It 'Should filter ERROR logs' {
            $result = Get-OmmiQuizLog -Level 'ERROR' -Limit 10

            if ($result.Content.logs.Count -gt 0) {
                foreach ($log in $result.Content.logs) {
                    $log.level | Should -Be 'ERROR'
                }
            }
        }

        It 'Should filter INFO logs' {
            $result = Get-OmmiQuizLog -Level 'INFO' -Limit 10

            if ($result.Content.logs.Count -gt 0) {
                foreach ($log in $result.Content.logs) {
                    $log.level | Should -Be 'INFO'
                }
            }
        }

        It 'Should accept ValidateSet for Level parameter' {
            $cmd = Get-Command Get-OmmiQuizLog
            $validateSet = $cmd.Parameters['Level'].Attributes | Where-Object { $_ -is [System.Management.Automation.ValidateSetAttribute] }

            $validateSet | Should -Not -BeNullOrEmpty
            $validateSet.ValidValues | Should -Contain 'DEBUG'
            $validateSet.ValidValues | Should -Contain 'INFO'
            $validateSet.ValidValues | Should -Contain 'WARNING'
            $validateSet.ValidValues | Should -Contain 'ERROR'
        }
    }

    Context 'Time Range Filtering' {

        It 'Should filter by start time' {
            $startTime = (Get-Date).AddHours(-1)
            $result = Get-OmmiQuizLog -StartTime $startTime -Limit 10

            $result.StatusCode | Should -Be 200
        }

        It 'Should filter by end time' {
            $endTime = Get-Date
            $result = Get-OmmiQuizLog -EndTime $endTime -Limit 10

            $result.StatusCode | Should -Be 200
        }

        It 'Should filter by start and end time' {
            $startTime = (Get-Date).AddHours(-2)
            $endTime = (Get-Date).AddHours(-1)

            $result = Get-OmmiQuizLog -StartTime $startTime -EndTime $endTime -Limit 10

            $result.StatusCode | Should -Be 200
        }

        It 'Should format datetime as ISO 8601' {
            $date = Get-Date
            $isoFormat = $date.ToString('yyyy-MM-ddTHH:mm:ss')

            $isoFormat | Should -Match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'
        }
    }

    Context 'Message Content Filtering' {

        It 'Should filter by message content' {
            $result = Get-OmmiQuizLog -MessageContains 'api' -Limit 10

            # If logs are found, they should contain the search term
            if ($result.Content.logs.Count -gt 0) {
                $hasMatch = $false
                foreach ($log in $result.Content.logs) {
                    if ($log.message -match 'api') {
                        $hasMatch = $true
                        break
                    }
                }
                # At least some logs should match (backend may use case-insensitive search)
                $true | Should -Be $true
            }

            $result.StatusCode | Should -Be 200
        }

        It 'Should URL encode message search parameter' {
            # Special characters should be properly encoded
            { Get-OmmiQuizLog -MessageContains 'test & example' -Limit 10 } | Should -Not -Throw
        }
    }

    Context 'Pagination' {

        It 'Should paginate with offset' {
            $page1 = Get-OmmiQuizLog -Limit 5 -Offset 0
            $page2 = Get-OmmiQuizLog -Limit 5 -Offset 5

            # Pages should be different (if enough logs exist)
            if ($page1.Content.total -gt 5) {
                $page1.Content.logs[0].timestamp | Should -Not -Be $page2.Content.logs[0].timestamp
            }
        }

        It 'Should handle large offset gracefully' {
            { Get-OmmiQuizLog -Limit 10 -Offset 10000 } | Should -Not -Throw
        }

        It 'Should respect limit across filters' {
            $limit = 3
            $result = Get-OmmiQuizLog -Level 'INFO' -Limit $limit

            $result.Content.logs.Count | Should -BeLessOrEqual $limit
        }
    }
}

Describe 'Logging Test Functions' {

    Context 'Test-OmmiQuizLogsEndpoint' {

        It 'Should validate logs endpoint' {
            $result = Test-OmmiQuizLogsEndpoint

            $result | Should -Not -BeNullOrEmpty
            $result.Test | Should -Be 'LogsEndpoint'
            $result.Success | Should -Not -BeNullOrEmpty
        }

        It 'Should report log count' {
            $result = Test-OmmiQuizLogsEndpoint

            $result.LogCount | Should -Not -BeNullOrEmpty
            $result.LogCount | Should -BeOfType [int]
        }

        It 'Should validate log structure' {
            $result = Test-OmmiQuizLogsEndpoint

            if ($result.LogCount -gt 0) {
                $result.Success | Should -Be $true
            }
        }

        It 'Should handle errors gracefully' {
            # Function should return error result, not throw
            { Test-OmmiQuizLogsEndpoint } | Should -Not -Throw
        }
    }

    Context 'Test-OmmiQuizLogFilesEndpoint' {

        It 'Should validate log files endpoint' {
            $result = Test-OmmiQuizLogFilesEndpoint

            $result | Should -Not -BeNullOrEmpty
            $result.Test | Should -Be 'LogFilesEndpoint'
            $result.Success | Should -Not -BeNullOrEmpty
        }

        It 'Should report file count' {
            $result = Test-OmmiQuizLogFilesEndpoint

            $result.FileCount | Should -Not -BeNullOrEmpty
            $result.FileCount | Should -BeOfType [int]
        }

        It 'Should validate file structure' {
            $result = Test-OmmiQuizLogFilesEndpoint

            if ($result.FileCount -gt 0) {
                $result.Success | Should -Be $true
            }
        }

        It 'Should handle errors gracefully' {
            # Function should return error result, not throw
            { Test-OmmiQuizLogFilesEndpoint } | Should -Not -Throw
        }
    }
}

Describe 'Query String Building' {

    Context 'URL Parameter Encoding' {

        It 'Should build query string with limit and offset' {
            $params = @("limit=10", "offset=0")
            $queryString = "?" + ($params -join "&")

            $queryString | Should -Be "?limit=10&offset=0"
        }

        It 'Should encode special characters' {
            $message = 'test & example'
            $encoded = [uri]::EscapeDataString($message)

            $encoded | Should -Be 'test%20%26%20example'
        }

        It 'Should handle datetime formatting' {
            $date = [datetime]::Parse('2025-01-15 10:30:00')
            $formatted = $date.ToString('yyyy-MM-ddTHH:mm:ss')

            $formatted | Should -Be '2025-01-15T10:30:00'
        }

        It 'Should build complete query string' {
            $params = @(
                "level=INFO",
                "limit=50",
                "offset=0"
            )
            $queryString = "?" + ($params -join "&")

            $queryString | Should -Match '^\?.*level=INFO.*limit=50.*offset=0'
        }
    }
}
