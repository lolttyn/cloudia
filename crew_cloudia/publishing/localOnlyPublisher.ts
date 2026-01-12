import type { Publisher, PublishResult } from "./types.js";

/**
 * No-op publisher for local development and testing.
 * 
 * Returns a placeholder external_id without actually publishing anywhere.
 * Useful for wiring the full pipeline without platform credentials.
 */
export class LocalOnlyPublisher implements Publisher {
  name = "local-only";

  async publishEpisode(input: {
    programSlug: string;
    episodeDate: string;
    episodeTitle: string;
    episodeAudioStoragePath: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PublishResult> {
    // No-op: just return a placeholder ID
    return {
      external_id: `local-${input.episodeDate}`,
      url: undefined,
      metadata: {
        note: "Local-only publisher: no external publish performed",
        episodeDate: input.episodeDate,
        programSlug: input.programSlug,
      },
    };
  }
}
