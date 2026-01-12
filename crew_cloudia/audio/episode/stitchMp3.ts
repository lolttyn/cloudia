import { writeFile, readFile, mkdir, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getMp3DurationSecondsFromBytes } from "../worker/ffprobeDuration.js";

const execFileAsync = promisify(execFile);

export type StitchResult = {
  bytes: ArrayBuffer;
  durationSeconds: number;
};

/**
 * Stitch multiple MP3 files into a single episode MP3 using ffmpeg concat demuxer.
 * 
 * Uses ffmpeg concat demuxer (not naive byte concatenation) for proper MP3 handling.
 * 
 * @param segments - Array of segment audio buffers in order (intro, main_themes, closing)
 * @returns Stitched MP3 buffer and total duration
 */
export async function stitchMp3(params: {
  segments: ArrayBuffer[];
}): Promise<StitchResult> {
  const { segments } = params;

  if (segments.length === 0) {
    throw new Error("Cannot stitch: no segments provided");
  }

  // Create temp directory for this stitch operation
  const workDir = join(tmpdir(), `cloudia_stitch_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  const tempFiles: string[] = [];
  const concatListPath = join(workDir, "concat_list.txt");
  const outputPath = join(workDir, "episode.mp3");

  try {
    // Create temp directory (must exist before writing files)
    await mkdir(workDir, { recursive: true });
    
    // Defensive check: verify directory was created
    await access(workDir);
    
    // Write each segment to a temp file
    for (let i = 0; i < segments.length; i++) {
      const segmentPath = join(workDir, `segment_${i}.mp3`);
      await writeFile(segmentPath, Buffer.from(segments[i]));
      tempFiles.push(segmentPath);
    }

    // Write concat list file (ffmpeg format)
    // Format: file 'path/to/file.mp3'
    // Use absolute paths to avoid path resolution issues
    const concatLines = tempFiles.map((path) => `file '${path}'`).join("\n");
    await writeFile(concatListPath, concatLines, "utf-8");

    // Run ffmpeg concat demuxer
    // -f concat: use concat demuxer
    // -safe 0: allow absolute paths
    // -c copy: stream copy (no re-encoding, fast)
    await execFileAsync("ffmpeg", [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy",
      outputPath,
      "-y", // Overwrite output if exists
    ]);

    // Read stitched output
    const outputBuffer = await readFile(outputPath);
    const outputArrayBuffer = outputBuffer.buffer.slice(
      outputBuffer.byteOffset,
      outputBuffer.byteOffset + outputBuffer.byteLength
    );

    // Get duration via ffprobe (more accurate than summing)
    const durationSeconds = await getMp3DurationSecondsFromBytes(outputArrayBuffer);

    return {
      bytes: outputArrayBuffer,
      durationSeconds,
    };
  } finally {
    // Cleanup: remove entire temp directory (recursive, force)
    await rm(workDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors (directory may not exist or already cleaned up)
    });
  }
}
