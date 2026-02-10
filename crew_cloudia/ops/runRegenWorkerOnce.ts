import "dotenv/config";
import { supabase } from "../lib/supabaseClient.js";
import { runIntroForDate } from "../../run-intro.js";
import { runMainThemesForDate } from "../../run-main-themes.js";
import { runClosingForDate } from "../../run-closing.js";
import { runInterpreterCanonical } from "../astro/interpretation/runInterpreterCanonical.js";
import { runInterpreter } from "../interpretation/runInterpreter.js";
import { sanitizeEditorialFeedback } from "../generation/sanitizeEditorialFeedback.js";

const PROGRAM_SLUG = "cloudia";
const RESULT_NOTES_MAX = 2000;
const STALE_PROCESSING_MS = 15 * 60 * 1000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

type RegenRow = {
  id: string;
  episode_id: string;
  episode_date: string;
  segments: string[];
  feedback: string;
  status: string;
};

export async function runRegenWorkerOnce(): Promise<void> {
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  // Mark rows stuck in processing longer than 15 minutes as failed (Timed out).
  const staleCutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data: staleRows, error: staleErr } = await supabase
    .from("regeneration_requests")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      result_notes: "Timed out",
    })
    .eq("status", "processing")
    .or(`processing_started_at.is.null,processing_started_at.lt.${staleCutoff}`)
    .select("id");

  if (staleErr) {
    console.warn("[regen-worker] stale cleanup failed", { msg: staleErr.message });
  } else if (staleRows?.length) {
    console.log("[regen-worker] marked stale", { count: staleRows.length, ids: staleRows.map((r) => r.id) });
  }

  const { data: rows, error } = await supabase.rpc("regen_claim_pending");

  if (error) {
    throw new Error(`regen_claim_pending failed: ${error.message}`);
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || !row.id) {
    console.log("[regen-worker] no pending request");
    return;
  }

  const req = row as RegenRow;
  const requestId = req.id;
  const episodeId = req.episode_id;
  const episodeDate = req.episode_date;
  const segments = req.segments ?? [];
  const sanitizedFeedback = sanitizeEditorialFeedback(req.feedback);
  const batchId = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const timeContext = episodeDate === today ? ("day_of" as const) : ("future" as const);

  console.log("[regen-worker] claimed", { requestId, episodeDate, segments });

  try {
    const modeRaw = (process.env.CLOUDIA_INTERPRETATION_MODE ?? "canonical").toLowerCase();
    const interpretiveFrame =
      modeRaw === "canonical"
        ? await runInterpreterCanonical({ date: episodeDate })
        : await runInterpreter({ date: episodeDate });

    const notes: string[] = [];

    for (const segmentKey of segments) {
      const common = {
        program_slug: PROGRAM_SLUG,
        episode_date: episodeDate,
        episode_id: episodeId,
        batch_id: batchId,
        time_context: timeContext,
        interpretive_frame: interpretiveFrame,
        scripts_only: false,
        editorial_feedback: sanitizedFeedback,
      };

      if (segmentKey === "intro") {
        const result = await runIntroForDate(common);
        const decision = result.gate_result.decision;
        const reasons =
          result.gate_result.blocking_reasons?.length > 0
            ? ` (${result.gate_result.blocking_reasons.join("; ")})`
            : "";
        notes.push(`intro: ${decision}${reasons}`);
      } else if (segmentKey === "main_themes") {
        const result = await runMainThemesForDate({
          ...common,
          force_regenerate: true,
        });
        const decision = result.gate_result.decision;
        const reasons =
          result.gate_result.blocking_reasons?.length > 0
            ? ` (${result.gate_result.blocking_reasons.join("; ")})`
            : "";
        notes.push(`main_themes: ${decision}${reasons}`);
      } else if (segmentKey === "closing") {
        const result = await runClosingForDate(common);
        const decision = result.gate_result.decision;
        const reasons =
          result.gate_result.blocking_reasons?.length > 0
            ? ` (${result.gate_result.blocking_reasons.join("; ")})`
            : "";
        notes.push(`closing: ${decision}${reasons}`);
      } else {
        notes.push(`${segmentKey}: skipped (unknown)`);
      }
    }

    const resultNotes =
      "Regen: " +
      (notes.length > 0 ? notes.join("; ").slice(0, RESULT_NOTES_MAX - 7) : "No segments processed");

    const { error: updateErr } = await supabase
      .from("regeneration_requests")
      .update({
        status: "complete",
        completed_at: new Date().toISOString(),
        result_notes: resultNotes,
      })
      .eq("id", requestId);

    if (updateErr) {
      throw new Error(`Failed to mark complete: ${updateErr.message}`);
    }

    console.log("[regen-worker] complete", { requestId, result_notes: resultNotes });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const resultNotes = msg.slice(0, RESULT_NOTES_MAX);
    console.error("[regen-worker] failed", { requestId, error: msg });

    const { error: updateErr } = await supabase
      .from("regeneration_requests")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        result_notes: resultNotes,
      })
      .eq("id", requestId);

    if (updateErr) {
      console.error("[regen-worker] failed to mark failed", { requestId, err: updateErr.message });
    }
    throw e;
  }
}

if (process.argv[1]) {
  const invokedPath = (() => {
    try {
      return new URL(`file://${process.argv[1]}`).href;
    } catch {
      return undefined;
    }
  })();
  if (invokedPath && invokedPath === import.meta.url) {
    runRegenWorkerOnce().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  }
}
