import type { SegmentKey } from "./audioTypes";

export function buildAudioJobKey(params: {
  episodeId: string;
  segmentKey: SegmentKey;
  scriptVersion: number;
  ttsVoiceId: string;
  ttsModelId: string;
}): string {
  const { episodeId, segmentKey, scriptVersion, ttsVoiceId, ttsModelId } = params;
  return `${episodeId}::${segmentKey}::${scriptVersion}::${ttsVoiceId}::${ttsModelId}`;
}

export function buildSegmentAudioStoragePath(params: {
  episodeDate: string; // YYYY-MM-DD
  segmentKey: SegmentKey;
  scriptVersion: number;
  jobKey: string;
  ext?: "mp3" | "wav";
}): string {
  const { episodeDate, segmentKey, scriptVersion, jobKey, ext = "mp3" } = params;
  const safeJobKey = encodeURIComponent(jobKey);
  return `cloudia/segments/${episodeDate}/${segmentKey}/v${scriptVersion}/${safeJobKey}.${ext}`;
}

