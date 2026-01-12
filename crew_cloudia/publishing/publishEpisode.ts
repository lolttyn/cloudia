import type { Publisher } from "./types.js";
import { assertEpisodeAudioReady } from "../audio/episode/assertEpisodeAudioReady.js";
import { buildEpisodeAudioStoragePath } from "../audio/episode/buildEpisodeAudioStoragePath.js";

/**
 * Publish an episode using the provided publisher adapter.
 * 
 * Validates episode readiness before publishing.
 */
export async function publishEpisode(params: {
  programSlug: string;
  episodeDate: string;
  episodeTitle: string;
  publisher: Publisher;
  description?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ external_id: string; url?: string }> {
  const { programSlug, episodeDate, episodeTitle, publisher, description, metadata } = params;

  // Validate episode is ready for publishing
  await assertEpisodeAudioReady({
    episodeDate,
    programSlug,
  });

  // Build episode audio storage path
  const episodeAudioStoragePath = buildEpisodeAudioStoragePath({
    episodeDate,
    programSlug,
  });

  // Publish via adapter
  const result = await publisher.publishEpisode({
    programSlug,
    episodeDate,
    episodeTitle,
    episodeAudioStoragePath,
    description,
    metadata,
  });

  // TODO: Persist external_id somewhere (table or metadata field)
  // For now, just return it

  return {
    external_id: result.external_id,
    url: result.url,
  };
}
