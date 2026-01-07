import "dotenv/config";
import { runAudioWorkerOnce } from "./runAudioWorkerOnce";
import { sleep } from "./retryPolicy";

function requireEnv(name: string) {
  if (!process.env[name]) throw new Error(`Missing env var: ${name}`);
}

async function main() {
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  requireEnv("ELEVENLABS_API_KEY");

  const pollMs = Number(process.env.CLOUDIA_AUDIO_POLL_MS ?? "5000");
  console.log("[audio-worker-loop] started", { pollMs });

  while (true) {
    if (process.env.CLOUDIA_AUDIO_WORKER_DISABLED === "1") {
      console.log("[audio-worker-loop] disabled via CLOUDIA_AUDIO_WORKER_DISABLED=1");
      await sleep(10_000);
      continue;
    }

    try {
      await runAudioWorkerOnce({ limit: 1 });
    } catch (e: any) {
      console.error("[audio-worker-loop] tick failed", { msg: e?.message ?? String(e) });
    }

    await sleep(pollMs);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

