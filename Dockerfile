# Stage 1: Build the frontend React app
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Serve the app with FastAPI
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies for OpenCV and PaddleOCR
RUN apt-get update && apt-get install -y \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install python requirements
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Install opencv-python and paddleocr manually
RUN pip install --no-cache-dir opencv-python paddleocr paddlepaddle

# Copy backend code
COPY backend/ ./

# Copy compiled frontend from Stage 1
COPY --from=frontend-builder /frontend/dist /frontend/dist

# Run ingestion at startup (where GEMINI_API_KEY runtime variable is available) and start uvicorn
CMD ["sh", "-c", "python -m app.rag.ingest && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
