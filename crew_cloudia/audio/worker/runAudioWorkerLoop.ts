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
  const killSwitchValue = process.env.CLOUDIA_AUDIO_WORKER_DISABLED ?? "not set";
  const isEnabled = killSwitchValue !== "1";
  
  console.log("[audio-worker-loop] started", { 
    pollMs, 
    CLOUDIA_AUDIO_WORKER_DISABLED: killSwitchValue,
    enabled: isEnabled 
  });

  if (!isEnabled) {
    console.log("[audio-worker-loop] worker is disabled (CLOUDIA_AUDIO_WORKER_DISABLED=1), exiting");
    process.exit(0);
  }

  while (true) {

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

