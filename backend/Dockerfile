FROM python:3.11-slim

WORKDIR /app

# Create logs directory
RUN mkdir -p /app/logs

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY flashcards/ ./flashcards/

# Set environment variables for logging
# Remove hardcoded LOG_FILE_PATH to allow date-stamped filenames
ENV LOG_LEVEL=INFO
ENV LOG_FORMAT=json

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
