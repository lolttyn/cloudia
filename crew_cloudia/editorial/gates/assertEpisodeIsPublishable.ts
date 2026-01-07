import { supabase } from "../../lib/supabaseClient";

export async function assertEpisodeIsPublishable(params: {
  episode_date: string; // YYYY-MM-DD
  required_segments: string[];
}): Promise<void> {
  const { episode_date, required_segments } = params;

  if (required_segments.length === 0) {
    throw new Error("required_segments cannot be empty");
  }

  // Query cloudia_segment_versions to get the latest attempt per segment
  // Order by segment_key, then attempt_number DESC, then created_at DESC for deterministic selection
  const { data, error } = await supabase
    .from("cloudia_segment_versions")
    .select("segment_key, gate_decision, blocking_reasons, attempt_number, created_at")
    .eq("episode_date", episode_date)
    .in("segment_key", required_segments)
    .order("segment_key", { ascending: true })
    .order("attempt_number", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to query segment versions: ${error.message}`);
  }

  // Group by segment_key and take the latest version (first after DESC sort)
  const latestBySegment = new Map<string, typeof data[0]>();
  for (const row of data || []) {
    if (!latestBySegment.has(row.segment_key)) {
      latestBySegment.set(row.segment_key, row);
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

