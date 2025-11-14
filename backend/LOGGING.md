# Ommiquiz Backend Logging Configuration

## Overview

The Ommiquiz backend application includes a comprehensive, configurable logging system that supports:

- **Local file logging** with automatic rotation
- **Cloud provider integration** (Betterstack/Logtail)
- **Structured logging** with JSON output
- **Request/response logging** middleware
- **Configurable log levels** and formats

## Configuration

All logging configuration is controlled through environment variables:

### Basic Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `INFO` | Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL) |
| `LOG_FORMAT` | `json` | Output format (`json` or `text`) |
| `LOG_FILE_ENABLED` | `true` | Enable/disable file logging |

### File Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_FILE_PATH` | `/app/logs/app.log` | Path to log file |
| `LOG_FILE_MAX_SIZE` | `10485760` | Max log file size in bytes (10MB) |
| `LOG_FILE_BACKUP_COUNT` | `5` | Number of backup files to keep |

### Cloud Logging (Betterstack) Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BETTERSTACK_ENABLED` | `false` | Enable Betterstack logging |
| `BETTERSTACK_SOURCE_TOKEN` | `` | Your Betterstack source token |

### Application Metadata

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_NAME` | `ommiquiz-backend` | Application name in logs |
| `APP_VERSION` | `1.0.0` | Application version |
| `ENVIRONMENT` | `development` | Environment (development/staging/production) |

## Usage Examples

### Development Environment

Create a `.env` file in the backend directory:

```bash
# Basic development logging
LOG_LEVEL=DEBUG
LOG_FORMAT=text
LOG_FILE_ENABLED=true
ENVIRONMENT=development
```

### Production Environment

```bash
# Production logging with cloud integration
LOG_LEVEL=WARNING
LOG_FORMAT=json
LOG_FILE_ENABLED=true
BETTERSTACK_ENABLED=true
BETTERSTACK_SOURCE_TOKEN=bt_your_actual_token_here
ENVIRONMENT=production
APP_VERSION=1.2.3
```

### Docker Compose Usage

Set environment variables in your shell or `.env` file:

```bash
export LOG_LEVEL=INFO
export BETTERSTACK_ENABLED=true
export BETTERSTACK_SOURCE_TOKEN=your_token
docker-compose up
```

## Log Output Examples

### JSON Format (Default)

```json
{
  "timestamp": "2025-11-14T10:30:00.123Z",
  "level": "INFO",
  "logger": "ommiquiz.main",
  "message": "Getting flashcard",
  "flashcard_id": "python-basics",
  "app_name": "ommiquiz-backend",
  "app_version": "1.0.0",
  "environment": "development"
}
```

### Text Format

```
2025-11-14 10:30:00,123 - ommiquiz.main - INFO - Getting flashcard
```

## Logging Features

### Request/Response Logging

All HTTP requests are automatically logged with:
- Request method and path
- Query parameters
- Client IP address
- Response status code
- Request duration
- Unique request ID

### Error Logging

Errors include:
- Error type and message
- Function name and line number
- Full stack traces for exceptions
- Contextual information (flashcard ID, user data, etc.)

### Function Call Logging

Use the `@log_function_call` decorator for detailed function logging:

```python
from app.logging_config import log_function_call

@log_function_call("my_function")
def my_function(param1, param2):
    # Function implementation
    pass
```

## Betterstack Integration

### Setup

1. Sign up for [Betterstack](https://betterstack.com/)
2. Create a new log source
3. Copy your source token
4. Set environment variables:

```bash
BETTERSTACK_ENABLED=true
BETTERSTACK_SOURCE_TOKEN=bt_your_token_here
```

### Features

- Automatic log shipping to Betterstack
- Real-time log streaming
- Error alerting and notifications
- Log analytics and search
- Integration with other monitoring tools

## Log File Management

### Automatic Rotation

Log files automatically rotate when they reach the configured size:
- Default: 10MB per file
- Keeps 5 backup files by default
- Old files are compressed and archived

### File Structure

```
logs/
├── app.log          # Current log file
├── app.log.1        # First backup
├── app.log.2        # Second backup
└── ...
```

### Viewing Logs

```bash
# View current logs
tail -f logs/app.log

# View logs in JSON format with jq
tail -f logs/app.log | jq '.'

# Search for specific events
grep "flashcard_id.*python-basics" logs/app.log | jq '.'
```

## Docker Integration

### Volume Mounting

The Docker setup automatically mounts a logs directory:

```bash
# Create logs directory
mkdir -p logs

# Run with Docker Compose
docker-compose up

# View logs from host
tail -f logs/app.log
```

### Log Persistence

Logs are persisted on the host system even when containers are recreated.

## Monitoring and Alerting

### Health Checks

The logging system includes health monitoring:
- Failed log writes are tracked
- Cloud provider connectivity issues are logged
- File system errors are handled gracefully

### Best Practices

1. **Log Levels**: Use appropriate log levels
   - `DEBUG`: Detailed debugging information
   - `INFO`: General application events
   - `WARNING`: Unexpected but handled situations
   - `ERROR`: Error conditions that need attention
   - `CRITICAL`: Serious errors requiring immediate action

2. **Structured Logging**: Include relevant context
   ```python
   logger.info("User action", 
              user_id=user_id, 
              action="upload_flashcard",
              flashcard_id=flashcard_id)
   ```

3. **Security**: Never log sensitive information
   - Passwords, tokens, or API keys
   - Personal user data
   - Financial information

## Troubleshooting

### Common Issues

1. **Logs not appearing in files**
   - Check file permissions
   - Verify LOG_FILE_ENABLED=true
   - Check disk space

2. **Betterstack logs not appearing**
   - Verify BETTERSTACK_ENABLED=true
   - Check token validity
   - Ensure network connectivity

3. **Performance issues**
   - Lower log level (WARNING or ERROR)
   - Disable file logging in high-load scenarios
   - Use asynchronous cloud logging

### Debug Mode

Enable debug logging for troubleshooting:

```bash
LOG_LEVEL=DEBUG
```

This provides detailed information about:
- HTTP request/response cycles
- File operations
- Database queries
- External API calls

## Performance Considerations

### Log Volume

High traffic applications should consider:
- Setting LOG_LEVEL to WARNING or ERROR in production
- Using log sampling for high-frequency events
- Implementing log aggregation and rotation

### Cloud Logging Costs

Betterstack and similar services charge based on log volume:
- Monitor your log ingestion
- Filter out unnecessary debug logs in production
- Use appropriate log levels

## Security

### Log Security

- Logs may contain sensitive paths and system information
- Implement proper access controls for log files
- Consider log encryption for sensitive environments
- Regularly rotate and archive old logs

### Token Management

- Store Betterstack tokens securely
- Use environment variables, not hardcoded values
- Rotate tokens regularly
- Monitor token usage for anomalies