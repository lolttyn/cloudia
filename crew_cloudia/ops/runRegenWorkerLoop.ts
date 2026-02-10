import "dotenv/config";
import { runRegenWorkerOnce } from "./runRegenWorkerOnce.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const pollMs = Number(process.env.CLOUDIA_REGEN_POLL_MS ?? "60000");
  const killSwitch = process.env.CLOUDIA_REGEN_WORKER_DISABLED ?? "not set";
  const isEnabled = killSwitch !== "1";

  console.log("[regen-worker-loop] started", {
    pollMs,
    CLOUDIA_REGEN_WORKER_DISABLED: killSwitch,
    enabled: isEnabled,
  });

  if (!isEnabled) {
    console.log("[regen-worker-loop] worker disabled, exiting");
    process.exit(0);
  }

  while (true) {
    try {
      await runRegenWorkerOnce();
    } catch (e: any) {
      console.error("[regen-worker-loop] tick failed", { msg: e?.message ?? String(e) });
    }
    await sleep(pollMs);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
