# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=20.18.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules + CA certificates + gRPC dependencies
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
    build-essential \
    node-gyp \
    pkg-config \
    python-is-python3 \
    ca-certificates \
    openssl \
    curl \
    gnupg \
    libssl-dev \
    libgrpc-dev \
    libgrpc++-dev \
    protobuf-compiler-grpc && \
    rm -rf /var/lib/apt/lists/* && \
    update-ca-certificates

# Install node modules
COPY package-lock.json package.json ./
RUN npm ci

# Copy application code
COPY . .

# Final stage for app image
FROM base

# Install CA certificates and SSL libraries in final image
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
    ca-certificates \
    openssl \
    curl \
    libssl3 && \
    rm -rf /var/lib/apt/lists/* && \
    update-ca-certificates

# Configure SSL environment variables for gRPC
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_DIR=/etc/ssl/certs
ENV GRPC_SSL_CIPHER_SUITES=ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS
ENV NODE_TLS_REJECT_UNAUTHORIZED=1

# Copy built application
COPY --from=build /app /app

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD [ "npm", "run", "start" ]
