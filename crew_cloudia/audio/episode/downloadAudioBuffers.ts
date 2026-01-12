import { supabase } from "../../lib/supabaseClient";

/**
 * Download audio file from Supabase storage.
 * 
 * Returns ArrayBuffer of the audio file.
 */
export async function downloadAudioBuffer(params: {
  storagePath: string;
}): Promise<ArrayBuffer> {
  const { storagePath } = params;

  // Extract bucket and path (assuming path is relative to bucket root)
  // Path format: cloudia/segments/... or cloudia/episodes/...
  const { data, error } = await supabase.storage
    .from("audio-private")
    .download(storagePath);

  if (error) {
    throw new Error(`Failed to download ${storagePath}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Download returned null for ${storagePath}`);
  }

  // Convert Blob to ArrayBuffer
  const arrayBuffer = await data.arrayBuffer();

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error(`Downloaded file is empty: ${storagePath}`);
  }

  return arrayBuffer;
}

/**
 * Download multiple audio files in parallel.
 */
export async function downloadAudioBuffers(params: {
  storagePaths: string[];
}): Promise<ArrayBuffer[]> {
  const { storagePaths } = params;

  const downloads = storagePaths.map((path) => downloadAudioBuffer({ storagePath: path }));

  return Promise.all(downloads);
}
