#!/bin/sh

# Application Startup Script
# This script pushes schema changes (if enabled) and starts the Node.js application server

# Exit immediately if any command fails
set -e

# Only run database operations if DB_HOST is set
if [ -n "${DB_HOST}" ]; then
  echo "Waiting for database at ${DB_HOST}:5432..."

  # Wait for the PostgreSQL database to be available on port 5432
  MAX_RETRIES=30
  RETRY_COUNT=0

  until nc -z "${DB_HOST}" 5432; do
    RETRY_COUNT=$((RETRY_COUNT+1))
    if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
      echo "Error: Database at ${DB_HOST}:5432 did not become available after $((MAX_RETRIES * 2)) seconds."
      exit 1
    fi
    echo "  waiting… sleeping 2s (attempt ${RETRY_COUNT}/${MAX_RETRIES})"
    sleep 2
  done

  echo "Database is ready."
fi

# Push schema changes if PRISMA_DB_PUSH is set to "true"
if [ "${PRISMA_DB_PUSH}" = "true" ]; then
  echo "Pushing schema changes..."
  npx prisma db push --skip-generate
  echo "Schema push complete."
fi

echo "Starting application..."

# Start the Node.js application server
# exec replaces the current shell process with the node process
# This ensures proper signal handling (SIGTERM, SIGINT, etc.) for graceful shutdowns
exec node /app/server/index.mjs