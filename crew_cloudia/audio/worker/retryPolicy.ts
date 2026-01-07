export type RetryDecision = { shouldRetry: boolean; backoffMs: number };

export function classifyError(e: unknown): { errorClass: string; message: string } {
  const message = e instanceof Error ? e.message : String(e);

  // crude but effective Phase G classification
  if (message.includes("429") || message.toLowerCase().includes("rate")) return { errorClass: "tts_rate_limited", message };
  if (message.includes("timeout") || message.toLowerCase().includes("etimedout")) return { errorClass: "tts_timeout", message };
  if (message.includes("fetch") || message.toLowerCase().includes("network")) return { errorClass: "tts_network", message };

  if (message.toLowerCase().startsWith("qa_") || message.toLowerCase().includes("qa_") || message.toLowerCase().includes("qa_silence")) {
    return { errorClass: "qa_failure", message };
  }

  return { errorClass: "worker_error", message };
}

export function decideRetry(params: { attempt: number; errorClass: string }): RetryDecision {
  // Max 3 attempts total (attempt is 1-based once claimed)
  if (params.attempt >= 3) return { shouldRetry: false, backoffMs: 0 };

  // Retry only transient classes
  const retryable = new Set(["tts_rate_limited", "tts_timeout", "tts_network"]);
  if (!retryable.has(params.errorClass)) return { shouldRetry: false, backoffMs: 0 };

  const backoffs = [30_000, 120_000, 600_000]; // 30s, 2m, 10m
  return { shouldRetry: true, backoffMs: backoffs[Math.min(params.attempt - 1, backoffs.length - 1)] };
}

export async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

