/**
 * Structured logging for audio pipeline events.
 * 
 * Emits JSON logs with consistent structure for observability.
 */

export type AudioLogEvent =
  | "audio.generate.started"
  | "audio.generate.succeeded"
  | "audio.generate.failed"
  | "episode.stitch.started"
  | "episode.stitch.succeeded"
  | "episode.stitch.failed"
  | "episode.publish.started"
  | "episode.publish.succeeded"
  | "episode.publish.failed";

export type AudioLogData = {
  event: AudioLogEvent;
  episode_date?: string;
  episode_id?: string;
  segment_key?: string;
  script_version?: number;
  attempt?: number;
  duration_seconds?: number;
  storage_path?: string;
  error_code?: string;
  error_message?: string;
  [key: string]: unknown; // Allow additional fields
};

/**
 * Emit a structured log entry.
 * 
 * Outputs JSON to stdout (or console.log) for log aggregation.
 */
export function audioLog(data: AudioLogData): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...data,
  };

  // Output as JSON (one line per event)
  console.log(JSON.stringify(logEntry));
}

/**
 * Convenience helpers for common events.
 */
export const audioLogHelpers = {
  generateStarted(params: {
    episode_id: string;
    segment_key: string;
    script_version: number;
    attempt: number;
  }): void {
    audioLog({
      event: "audio.generate.started",
      episode_id: params.episode_id,
      segment_key: params.segment_key,
      script_version: params.script_version,
      attempt: params.attempt,
    });
  },

  generateSucceeded(params: {
    episode_id: string;
    segment_key: string;
    script_version: number;
    attempt: number;
    duration_seconds: number;
    storage_path: string;
  }): void {
    audioLog({
      event: "audio.generate.succeeded",
      episode_id: params.episode_id,
      segment_key: params.segment_key,
      script_version: params.script_version,
      attempt: params.attempt,
      duration_seconds: params.duration_seconds,
      storage_path: params.storage_path,
    });
  },

  generateFailed(params: {
    episode_id: string;
    segment_key: string;
    script_version: number;
    attempt: number;
    error_code: string;
    error_message: string;
  }): void {
    audioLog({
      event: "audio.generate.failed",
      episode_id: params.episode_id,
      segment_key: params.segment_key,
      script_version: params.script_version,
      attempt: params.attempt,
      error_code: params.error_code,
      error_message: params.error_message,
    });
  },

  stitchStarted(params: { episode_date: string }): void {
    audioLog({
      event: "episode.stitch.started",
      episode_date: params.episode_date,
    });
  },

  stitchSucceeded(params: {
    episode_date: string;
    duration_seconds: number;
    storage_path: string;
  }): void {
    audioLog({
      event: "episode.stitch.succeeded",
      episode_date: params.episode_date,
      duration_seconds: params.duration_seconds,
      storage_path: params.storage_path,
    });
  },

  stitchFailed(params: {
    episode_date: string;
    error_code: string;
    error_message: string;
  }): void {
    audioLog({
      event: "episode.stitch.failed",
      episode_date: params.episode_date,
      error_code: params.error_code,
      error_message: params.error_message,
    });
  },

  publishStarted(params: { episode_date: string; program_slug: string }): void {
    audioLog({
      event: "episode.publish.started",
      episode_date: params.episode_date,
      program_slug: params.program_slug,
    });
  },

  publishSucceeded(params: {
    episode_date: string;
    program_slug: string;
    external_id: string;
    url?: string;
  }): void {
    audioLog({
      event: "episode.publish.succeeded",
      episode_date: params.episode_date,
      program_slug: params.program_slug,
      external_id: params.external_id,
      url: params.url,
    });
  },

  publishFailed(params: {
    episode_date: string;
    program_slug: string;
    error_code: string;
    error_message: string;
  }): void {
    audioLog({
      event: "episode.publish.failed",
      episode_date: params.episode_date,
      program_slug: params.program_slug,
      error_code: params.error_code,
      error_message: params.error_message,
    });
  },
};
