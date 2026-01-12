/**
 * Build deterministic storage path for stitched episode audio.
 * 
 * Path pattern: cloudia/episodes/{episodeDate}/episode.mp3
 */
export function buildEpisodeAudioStoragePath(params: {
  episodeDate: string; // YYYY-MM-DD
  programSlug?: string; // Optional, for future multi-program support
}): string {
  const { episodeDate, programSlug } = params;
  
  // For now, programSlug is optional and not included in path
  // If you need multi-program support later, change to:
  // return `cloudia/episodes/${programSlug ?? 'cloudia'}/${episodeDate}/episode.mp3`;
  
  return `cloudia/episodes/${episodeDate}/episode.mp3`;
}
