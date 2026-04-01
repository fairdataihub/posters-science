# Build stage
FROM node:22-alpine AS builder

# Use alpine-based image and install only necessary dependencies
RUN apk add --no-cache openssl

# Enable corepack and install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Only needed for prisma build
ARG DATABASE_URL

# Copy only necessary files for dependency installation
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile \
  && pnpm prisma:generate \
  && pnpm store prune

# Copy source files and build
COPY . .
RUN pnpm run build

# Production stage
FROM node:22-alpine

LABEL maintainer="FAIR Data Innovations Hub <contact@fairdataihub.org>" \
  description="A platform for disseminating research posters."

# Busybox is used netcat for waiting for Postgres to be ready
RUN apk add --no-cache openssl busybox-extras

WORKDIR /app

# Copy only the necessary files from builder stage
# COPY --from=builder /app/package.json ./
COPY --from=builder /app/.output ./
COPY --from=builder /app/shared/generated ./shared/generated
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
# Copy the Prisma schema & migrations, so `prisma migrate deploy` can see them
COPY --from=builder /app/prisma ./prisma

# Copy our startup script and make it executable
COPY scripts/start.sh /app/scripts/start.sh
RUN chmod +x /app/scripts/start.sh

EXPOSE 3000

# Run startup script that runs migrations before starting the app
CMD ["/app/scripts/start.sh"]
