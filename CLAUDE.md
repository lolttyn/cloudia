# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cloudia is a Railway-deployed Node.js worker that stitches audio episode segments into a single final audio file. It's part of a larger audio content generation system serving as a microservice for audio post-processing.

**Flow:** Receives HTTP POST with episode date + segment paths → Downloads segments from Supabase → Stitches with FFmpeg → Uploads final audio → Updates database status.

## Commands

```bash
# Install dependencies
npm install

# Start server (runs on PORT env var or 3000)
npm start

# No test suite currently implemented
```

## Architecture

**Single-file application** - All code lives in `index.js` (~430 lines).

### Key Components in index.js

1. **Express server** with endpoints:
   - `POST /` - Main stitching endpoint
   - `GET /` - Status check (returns "OK")
   - `GET /health` - Detailed health check

2. **Segment processing** with hardcoded order:
   ```
   intro → ephemeris → numerology → zodiac_batch_1 → zodiac_batch_2 → zodiac_batch_3 → reflection → closing
   ```

3. **Storage paths** follow canonical structure:
   - Segments: `cloudia/[year]/[month]/[day]/segments/<id>.mp3`
   - Final: `cloudia/[year]/[month]/[day]/final/final.mp3`

4. **Keep-alive mechanisms** - Heartbeat every 10s, internal healthcheck every 30s (prevents Railway idle timeout)

### External Services

- **Supabase** - Storage bucket `audio-public` and table `cloudia_episodes`
- **FFmpeg** - Audio concatenation via `fluent-ffmpeg` + `ffmpeg-static`

## Environment Variables

Required (see `.env.example`):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `PORT` (default: 3000)

## API

**POST /**
```json
{
  "episode_date": "2024-01-15",
  "segment_audio_paths": {
    "intro": "cloudia/2024/01/15/segments/intro.mp3",
    "ephemeris": "...",
    ...
  }
}
```
Returns `{ "status": "stitched" }` on success.

## Deployment

Configured via `railway.json`:
- Builder: Nixpacks
- Restart: ON_FAILURE (max 10 retries)
