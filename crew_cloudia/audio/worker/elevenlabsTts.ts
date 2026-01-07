// Minimal ElevenLabs TTS wrapper (MP3).
// This is intentionally small and explicit to keep Phase G tight.

type ElevenLabsTtsResult = {
  bytes: ArrayBuffer;
  codec: "mp3";
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function synthesizeElevenLabsMp3(params: {
  text: string;
  voiceId: string;
  modelId: string;
}): Promise<ElevenLabsTtsResult> {
  const apiKey = requireEnv("ELEVENLABS_API_KEY");

  // ElevenLabs v1 TTS endpoint (voice-specific).
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(params.voiceId)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: params.text,
      model_id: params.modelId,
      // Keep defaults for now. If you later add voice settings,
      // include them in the job key hash/versioning.
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${errText.slice(0, 500)}`);
  }

  const buf = await res.arrayBuffer();

  if (!buf || buf.byteLength === 0) {
    throw new Error("ElevenLabs returned empty audio buffer");
  }

  return { bytes: buf, codec: "mp3" };
}

