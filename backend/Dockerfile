FROM python:3.12-slim

WORKDIR /app

# Install uv for fast dependency management
RUN pip install uv

# Copy dependency files
COPY pyproject.toml .

# Install dependencies
RUN uv pip install --system -e .

# Copy source
COPY src/ ./src/

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import httpx; httpx.get('http://localhost:8000/health').raise_for_status()"

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
