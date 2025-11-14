import logging
import logging.handlers
import structlog
import os
import sys
import json
from typing import Optional, Dict, Any
from pathlib import Path
import httpx
from datetime import datetime
import asyncio


class BetterstackHandler(logging.Handler):
    """Custom logging handler for Betterstack (Logtail)"""
    
    def __init__(self, source_token: str, timeout: float = 10.0):
        super().__init__()
        self.source_token = source_token
        self.timeout = timeout
        self.session = None
        self.url = "https://in.logs.betterstack.com/"
        
    async def _get_session(self) -> httpx.AsyncClient:
        """Get or create HTTP session"""
        if self.session is None or self.session.is_closed:
            self.session = httpx.AsyncClient(timeout=self.timeout)
        return self.session
        
    def emit(self, record):
        """Send log record to Betterstack"""
        try:
            # Create log entry
            log_entry = {
                "dt": datetime.utcnow().isoformat(),
                "level": record.levelname,
                "message": record.getMessage(),
                "source": record.name,
                "line": record.lineno,
                "file": record.filename,
                "function": record.funcName,
            }
            
            # Add extra fields if available
            if hasattr(record, 'extra'):
                log_entry.update(record.extra)
                
            # Send async (fire and forget)
            asyncio.create_task(self._send_log(log_entry))
            
        except Exception:
            # Don't raise exceptions in logging handler
            pass
    
    async def _send_log(self, log_entry: Dict[str, Any]):
        """Send log entry to Betterstack asynchronously"""
        try:
            session = await self._get_session()
            headers = {
                "Authorization": f"Bearer {self.source_token}",
                "Content-Type": "application/json"
            }
            
            await session.post(
                self.url,
                json=log_entry,
                headers=headers
            )
        except Exception:
            # Silently fail for logging errors
            pass
    
    def close(self):
        """Close the handler and HTTP session"""
        if self.session and not self.session.is_closed:
            asyncio.create_task(self.session.aclose())
        super().close()


class LoggingConfig:
    """Centralized logging configuration"""
    
    def __init__(self):
        self.log_level = os.getenv("LOG_LEVEL", "INFO").upper()
        self.log_format = os.getenv("LOG_FORMAT", "json")  # json or text
        self.log_file_enabled = os.getenv("LOG_FILE_ENABLED", "true").lower() == "true"
        self.log_file_path = os.getenv("LOG_FILE_PATH", "/app/backend/logs/app.log")
        self.log_file_max_size = int(os.getenv("LOG_FILE_MAX_SIZE", "10485760"))  # 10MB
        self.log_file_backup_count = int(os.getenv("LOG_FILE_BACKUP_COUNT", "5"))
        
        # Cloud logging configuration
        self.betterstack_enabled = os.getenv("BETTERSTACK_ENABLED", "false").lower() == "true"
        self.betterstack_token = os.getenv("BETTERSTACK_SOURCE_TOKEN", "")
        
        # Application metadata
        self.app_name = os.getenv("APP_NAME", "ommiquiz-backend")
        self.app_version = os.getenv("APP_VERSION", "1.0.0")
        self.environment = os.getenv("ENVIRONMENT", "development")
        
    def setup_logging(self):
        """Setup comprehensive logging configuration"""
        
        # Clear any existing handlers
        logging.getLogger().handlers.clear()
        
        # Configure structlog
        structlog.configure(
            processors=[
                structlog.stdlib.filter_by_level,
                structlog.stdlib.add_logger_name,
                structlog.stdlib.add_log_level,
                structlog.stdlib.PositionalArgumentsFormatter(),
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.StackInfoRenderer(),
                structlog.processors.format_exc_info,
                self._add_app_context,
                structlog.processors.UnicodeDecoder(),
                structlog.processors.JSONRenderer() if self.log_format == "json" else structlog.dev.ConsoleRenderer()
            ],
            context_class=dict,
            logger_factory=structlog.stdlib.LoggerFactory(),
            wrapper_class=structlog.stdlib.BoundLogger,
            cache_logger_on_first_use=True,
        )
        
        # Get root logger
        root_logger = logging.getLogger()
        root_logger.setLevel(getattr(logging, self.log_level))
        
        # Console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(getattr(logging, self.log_level))
        
        if self.log_format == "json":
            from pythonjsonlogger import jsonlogger
            formatter = jsonlogger.JsonFormatter(
                '%(asctime)s %(name)s %(levelname)s %(message)s %(pathname)s %(lineno)d %(funcName)s'
            )
        else:
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
        
        console_handler.setFormatter(formatter)
        root_logger.addHandler(console_handler)
        
        # File handler (if enabled)
        if self.log_file_enabled:
            self._setup_file_handler(root_logger, formatter)
        
        # Cloud handlers
        if self.betterstack_enabled and self.betterstack_token:
            self._setup_betterstack_handler(root_logger)
        
        # Set up specific loggers
        self._setup_specific_loggers()
        
        # Log initial configuration
        logger = structlog.get_logger("logging.config")
        logger.info(
            "Logging configuration initialized",
            log_level=self.log_level,
            log_format=self.log_format,
            file_logging=self.log_file_enabled,
            betterstack_logging=self.betterstack_enabled,
            environment=self.environment
        )
    
    def _add_app_context(self, logger, method_name, event_dict):
        """Add application context to all log entries"""
        event_dict.update({
            "app_name": self.app_name,
            "app_version": self.app_version,
            "environment": self.environment,
        })
        return event_dict
    
    def _setup_file_handler(self, logger, formatter):
        """Setup file logging with rotation"""
        try:
            # Create log directory if it doesn't exist
            log_dir = Path(self.log_file_path).parent
            log_dir.mkdir(parents=True, exist_ok=True)
            
            # Log directory creation success
            console_logger = structlog.get_logger("logging.config")
            console_logger.info("Log directory ensured", 
                              log_dir=str(log_dir), 
                              log_file=str(self.log_file_path))
            
            # Rotating file handler
            file_handler = logging.handlers.RotatingFileHandler(
                self.log_file_path,
                maxBytes=self.log_file_max_size,
                backupCount=self.log_file_backup_count,
                encoding='utf-8'
            )
            file_handler.setLevel(getattr(logging, self.log_level))
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
            
            # Confirm file handler setup
            console_logger.info("File logging handler configured successfully",
                              max_size_mb=self.log_file_max_size / 1024 / 1024,
                              backup_count=self.log_file_backup_count)
            
        except PermissionError as e:
            # Specific handling for permission errors
            console_logger = structlog.get_logger("logging.config")
            console_logger.error("Permission denied when setting up file logging", 
                                error=str(e), 
                                log_path=str(self.log_file_path),
                                solution="Check directory permissions or run with appropriate privileges")
        except Exception as e:
            # Log to console if file logging fails
            console_logger = structlog.get_logger("logging.config")
            console_logger.error("Failed to setup file logging", 
                                error=str(e),
                                log_path=str(self.log_file_path),
                                log_dir=str(Path(self.log_file_path).parent))
    
    def _setup_betterstack_handler(self, logger):
        """Setup Betterstack cloud logging"""
        try:
            betterstack_handler = BetterstackHandler(self.betterstack_token)
            betterstack_handler.setLevel(getattr(logging, self.log_level))
            logger.addHandler(betterstack_handler)
            
        except Exception as e:
            console_logger = structlog.get_logger("logging.config")
            console_logger.error("Failed to setup Betterstack logging", error=str(e))
    
    def _setup_specific_loggers(self):
        """Setup specific logger configurations"""
        # Reduce noise from third-party libraries
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
        
        # Application loggers
        logging.getLogger("ommiquiz").setLevel(getattr(logging, self.log_level))
        logging.getLogger("fastapi").setLevel(logging.INFO)


# Global logging configuration instance
logging_config = LoggingConfig()


def setup_logging():
    """Initialize logging configuration"""
    logging_config.setup_logging()


def get_logger(name: str):
    """Get a structured logger for the given name"""
    return structlog.get_logger(name)


# Logging middleware for FastAPI
class LoggingMiddleware:
    """FastAPI middleware for request/response logging"""
    
    def __init__(self, app):
        self.app = app
        self.logger = get_logger("ommiquiz.middleware")
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        start_time = datetime.utcnow()
        request_id = id(scope)  # Simple request ID
        
        # Log request
        self.logger.info(
            "Request started",
            request_id=request_id,
            method=scope["method"],
            path=scope["path"],
            query_string=scope["query_string"].decode(),
            client_ip=scope["client"][0] if scope["client"] else None,
        )
        
        # Capture response
        status_code = None
        
        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)
        
        try:
            await self.app(scope, receive, send_wrapper)
            
            # Log successful response
            duration = (datetime.utcnow() - start_time).total_seconds()
            self.logger.info(
                "Request completed",
                request_id=request_id,
                status_code=status_code,
                duration_seconds=duration,
            )
            
        except Exception as e:
            # Log error
            duration = (datetime.utcnow() - start_time).total_seconds()
            self.logger.error(
                "Request failed",
                request_id=request_id,
                error=str(e),
                error_type=type(e).__name__,
                duration_seconds=duration,
            )
            raise


def log_function_call(func_name: str, **kwargs):
    """Decorator for logging function calls"""
    def decorator(func):
        async def async_wrapper(*args, **kwargs):
            logger = get_logger("ommiquiz.functions")
            logger.debug(f"Calling {func_name}", function_args=kwargs)
            
            try:
                result = await func(*args, **kwargs)
                logger.debug(f"Completed {func_name}", success=True)
                return result
            except Exception as e:
                logger.error(f"Error in {func_name}", error=str(e), error_type=type(e).__name__)
                raise
        
        def sync_wrapper(*args, **kwargs):
            logger = get_logger("ommiquiz.functions")
            logger.debug(f"Calling {func_name}", function_args=kwargs)
            
            try:
                result = func(*args, **kwargs)
                logger.debug(f"Completed {func_name}", success=True)
                return result
            except Exception as e:
                logger.error(f"Error in {func_name}", error=str(e), error_type=type(e).__name__)
                raise
        
        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    return decorator