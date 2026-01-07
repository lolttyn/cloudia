# Cloudia audio worker
FROM node:20-bookworm-slim

# Install ffmpeg (includes ffprobe) and build tools for native modules (swisseph)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Ensure dev deps are installed (tsx is needed at runtime)
ENV NPM_CONFIG_PRODUCTION=false

COPY package*.json ./
RUN npm ci

COPY . .

# If you have runtime env vars, Railway injects them at runtime.
CMD ["npm", "run", "audio-worker"]

