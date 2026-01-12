/**
 * Publishing adapter interface.
 * 
 * Implementations handle publishing episodes to external destinations
 * (RSS hosts, Substack, storage + webhook, etc.).
 */
export type PublishResult = {
  external_id: string;
  url?: string;
  metadata?: Record<string, unknown>;
};

export interface Publisher {
  name: string;

  /**
   * Publish an episode to the external destination.
   * 
   * @param input - Episode metadata and audio location
   * @returns External ID and optional URL
   */
  publishEpisode(input: {
    programSlug: string;
    episodeDate: string;
    episodeTitle: string;
    episodeAudioStoragePath: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PublishResult>;
}
