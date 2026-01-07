export function generatePlaceholderAudioMp3Bytes(): ArrayBuffer {
  // This is NOT real MP3 audio. It's a placeholder blob so we can test:
  // - storage uploads
  // - ready/fail transitions
  // We'll replace this with real TTS in the next step.
  const text = `PLACEHOLDER_AUDIO_${new Date().toISOString()}`;
  return new TextEncoder().encode(text).buffer;
}

