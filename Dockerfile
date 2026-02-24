FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Create user with specific UID/GID (must match docker-compose user)
RUN groupadd -g 1000 aiuser && \
    useradd -u 1000 -g aiuser -m -s /bin/bash aiuser

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libmagic1 \
    gcc \
    python3-dev \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Install Python dependencies as root (for system-wide access)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code with correct ownership
COPY *.py ./
COPY agents/ ./agents/
COPY deepsearcher/ ./deepsearcher/
COPY lab/ ./lab/
COPY App/ ./App/
COPY llm/ ./llm/
COPY Mongodb/ ./Mongodb/
COPY prompts/ ./prompts/
COPY utilss/ ./utilss/
COPY EvenInfo/ ./EvenInfo/

RUN mkdir -p /app/.cache /app/logs /app/workspace && \
    chown -R aiuser:aiuser /app/.cache /app/logs /app/workspace

USER aiuser

# Expose port
EXPOSE 8000

# Health check (using curl instead of Python requests for reliability)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run application
CMD ["python", "main.py", "--host", "0.0.0.0", "--port", "8000"]