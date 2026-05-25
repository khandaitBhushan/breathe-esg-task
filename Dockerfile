# --- Multi-Stage Unified Production Dockerfile ---

# Stage 1: Build the React Frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Setup the Python Django Backend
FROM python:3.10-slim AS backend-runner
WORKDIR /app/backend

# Prevent Python from writing pyc files and buffering stdout
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Install system dependencies if required
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend codebase
COPY backend/ ./

# Copy built frontend assets from Stage 1 to Django directory
COPY --from=frontend-builder /app/frontend/dist/ ./frontend_dist/

# Create standard folders and migrate database on start
ENV PORT=8000
EXPOSE 8000

# Executable launch script running migrations, seeding database, and starting Gunicorn
CMD python manage.py migrate --noinput && \
    python manage.py seed_esg && \
    python manage.py collectstatic --noinput && \
    gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
