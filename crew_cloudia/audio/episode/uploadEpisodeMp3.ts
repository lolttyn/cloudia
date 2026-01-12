import { uploadToAudioPrivateBucket } from "../worker/storageUpload.js";

/**
 * Upload stitched episode MP3 to storage.
 * 
 * Uses same upload pattern as segment audio (idempotent upsert).
 */
export async function uploadEpisodeMp3(params: {
  storagePath: string;
  bytes: ArrayBuffer;
}): Promise<void> {
  const { storagePath, bytes } = params;

  await uploadToAudioPrivateBucket({
    path: storagePath,
    bytes,
    contentType: "audio/mpeg",
  });
}
