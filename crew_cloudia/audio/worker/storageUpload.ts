import { supabase } from "../../lib/supabaseClient";

export async function uploadToAudioPrivateBucket(params: {
  path: string;
  bytes: ArrayBuffer;
  contentType?: string;
}) {
  const { error } = await supabase.storage
    .from("audio-private")
    .upload(params.path, params.bytes, {
      contentType: params.contentType ?? "audio/mpeg",
      upsert: true, // idempotent for deterministic path
    });

  if (error) throw error;
}

