# Cloudia audio worker
FROM node:22-slim

# Install ffmpeg (includes ffprobe)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Ensure dev deps are installed (tsx is needed at runtime)
ENV NPM_CONFIG_PRODUCTION=false

COPY package*.json ./
RUN npm ci

COPY . .

# If you have runtime env vars, Railway injects them at runtime.
CMD ["npm", "run", "audio-worker"]

