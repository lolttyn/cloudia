import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SilenceReport = {
  leadingSilenceSeconds: number;   // best-effort
  trailingSilenceSeconds: number;  // best-effort
  raw: string;
};

// Uses ffmpeg silencedetect. Conservative defaults.
// We only care about "obvious" dead air at ends.
export async function detectLeadingTrailingSilenceFromMp3Bytes(bytes: ArrayBuffer): Promise<SilenceReport> {
  const tmpPath = join(tmpdir(), `cloudia_audio_${Date.now()}_${Math.random().toString(16).slice(2)}.mp3`);

  try {
    await writeFile(tmpPath, Buffer.from(bytes));

    // silencedetect prints to stderr
    const { stderr } = await execFileAsync("ffmpeg", [
      "-i", tmpPath,
      "-af", "silencedetect=noise=-35dB:d=0.35",
      "-f", "null",
      "-",
    ]);

    // Parse lines like:
    // [silencedetect @ ...] silence_start: 0
    // [silencedetect @ ...] silence_end: 0.52 | silence_duration: 0.52
    const lines = stderr.split("\n").map(l => l.trim());
    const starts: number[] = [];
    const ends: number[] = [];

    for (const line of lines) {
      const m1 = line.match(/silence_start:\s*([0-9.]+)/);
      if (m1) starts.push(Number(m1[1]));
      const m2 = line.match(/silence_end:\s*([0-9.]+)/);
      if (m2) ends.push(Number(m2[1]));
    }

    let leading = 0;
    // leading silence is a silence_start at ~0 with a corresponding end
    if (starts.length && ends.length) {
      const idx = starts.findIndex(s => s <= 0.05);
      if (idx !== -1) {
        leading = Number.isFinite(ends[idx]) ? ends[idx] : 0;
      }
    }

    // trailing silence: last detected silence that ends near EOF is hard to compute
    // without knowing total duration. We'll pass duration in and compute trailing there.
    return {
      leadingSilenceSeconds: Number.isFinite(leading) ? leading : 0,
      trailingSilenceSeconds: 0,
      raw: stderr.slice(0, 4000),
    };
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

