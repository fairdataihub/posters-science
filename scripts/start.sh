#!/bin/sh

# Application Startup Script
# This script ensures the database is ready, pushes schema changes,
# and then starts the Node.js application server

# Exit immediately if any command fails
set -e

echo "Waiting for database at ${DB_HOST}:5432..."

# Wait for the PostgreSQL database to be available on port 5432
# nc (netcat) is used to test if the port is open and accepting connections
# This prevents the application from starting before the database is ready
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

echo "Database is ready. Pushing schema changes..."

# Push schema changes to the database without creating migrations
# This syncs the Prisma schema with the database for staging/development
npx prisma db push --skip-generate

echo "Schema push complete. Starting application..."

# Start the Node.js application server
# exec replaces the current shell process with the node process
# This ensures proper signal handling (SIGTERM, SIGINT, etc.) for graceful shutdowns
exec node /app/server/index.mjs