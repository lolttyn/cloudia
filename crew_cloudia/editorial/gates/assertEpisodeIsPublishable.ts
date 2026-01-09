import { supabase } from "../../lib/supabaseClient";

export async function assertEpisodeIsPublishable(params: {
  episode_id: string;
  required_segments: string[];
}): Promise<void> {
  const { episode_id, required_segments } = params;

  if (required_segments.length === 0) {
    throw new Error("required_segments cannot be empty");
  }

  // Query canonical approved segments from cloudia_segments table
  // This is the authoritative source for publishability (updated by upsertCurrentSegment after approval)
  // Note: cloudia_segments only contains approved segments (gate_decision is always "approve")
  const latestBySegment = new Map<string, {
    segment_key: string;
    gate_decision: string;
    blocking_reasons: string[];
    attempt_number: number;
  }>();

  for (const segmentKey of required_segments) {
    const { data, error } = await supabase
      .from("cloudia_segments")
      .select("segment_key, gate_decision, script_version")
      .eq("episode_id", episode_id)
      .eq("segment_key", segmentKey)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to query segment for ${segmentKey}: ${error.message}`);
    }

    if (data) {
      // cloudia_segments only contains approved segments, so gate_decision should be "approve"
      // If it exists in this table, it's been approved (blocking_reasons are not stored here)
      latestBySegment.set(segmentKey, {
        segment_key: data.segment_key,
        gate_decision: data.gate_decision || "approve",
        blocking_reasons: [], // Approved segments have no blocking reasons
        attempt_number: data.script_version || 0,
      });
    }
  }

  // Check for missing segments
  const foundSegments = Array.from(latestBySegment.keys());
  const missingSegments = required_segments.filter(
    (key) => !foundSegments.includes(key)
  );

  if (missingSegments.length > 0) {
    throw new Error(
      `Missing required segment${missingSegments.length > 1 ? "s" : ""}: ${missingSegments.join(", ")}`
    );
  }

  // Check that all segments are approved
  const blockedSegments: Array<{
    segment_key: string;
    gate_decision: string;
    blocking_reasons: string[];
  }> = [];

  for (const segmentKey of required_segments) {
    const latest = latestBySegment.get(segmentKey);
    if (!latest) {
      // This should not happen after the missing check, but defensive
      throw new Error(`Internal error: segment ${segmentKey} not found after query`);
    }

    if (latest.gate_decision !== "approve") {
      blockedSegments.push({
        segment_key: segmentKey,
        gate_decision: latest.gate_decision,
        blocking_reasons: latest.blocking_reasons || [],
      });
    }
  }

  if (blockedSegments.length > 0) {
    const messages = blockedSegments.map((seg) => {
      const reasons = seg.blocking_reasons.length > 0
        ? ` (${seg.blocking_reasons.join(", ")})`
        : "";
      return `${seg.segment_key} (gate_decision=${seg.gate_decision}${reasons})`;
    });

    throw new Error(
      `Segment${blockedSegments.length > 1 ? "s" : ""} blocked by gate: ${messages.join(", ")}`
    );
  }

  // If we reach here, all checks passed
  // Function returns void - if it doesn't throw, publishing is allowed
}

