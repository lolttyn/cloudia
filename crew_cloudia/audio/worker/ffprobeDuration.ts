import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getMp3DurationSecondsFromBytes(bytes: ArrayBuffer): Promise<number> {
  const tmpPath = join(tmpdir(), `cloudia_audio_${Date.now()}_${Math.random().toString(16).slice(2)}.mp3`);

  try {
    await writeFile(tmpPath, Buffer.from(bytes));

    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      tmpPath,
    ]);

    const s = stdout.trim();
    const dur = Number(s);
    if (!Number.isFinite(dur) || dur <= 0) {
      throw new Error(`ffprobe returned invalid duration: "${s}"`);
    }
    return dur;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

