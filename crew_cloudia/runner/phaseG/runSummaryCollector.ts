import { promises as fs } from "fs";
import { dirname } from "path";
import {
  hasBannedPhraseMeaningOverMinutiae,
  hasClosingPredictionLanguage,
  extractClosingPredictionTerms,
  hasSoftPermission,
} from "./phrasePatterns.js";

export interface AttemptRecord {
  episode_date: string;
  segment_key: string;
  attempt_number: number;
  decision: "approve" | "block" | "rewrite";
  blocking_reasons: string[];
  script_text: string;
}

export interface FinalRecord {
  episode_date: string;
  segment_key: string;
  final_attempt_number: number;
  final_decision: "approve" | "block" | "rewrite";
}

export interface EpisodeGateRecord {
  episode_date: string;
  decision: "ship" | "fail";
  failed_segments: Array<{
    segment_key: string;
    blocking_reasons: string[];
  }>;
}

export interface RunSummaryArtifact {
  program_slug: string;
  batch_id: string;
  mode: {
    canonical: boolean;
    scripts_only: boolean;
  };
  date_from: string;
  date_to: string;
  episodes: Array<{
    episode_date: string;
    segments: Array<{
      segment_key: string;
      attempts: Array<{
        attempt_number: number;
        decision: "approve" | "block" | "rewrite";
        blocking_reasons: string[];
        flags: {
          banned_phrase_meaning_over_minutiae: boolean;
          closing_prediction_terms: string[];
          closing_soft_permission_present: boolean | null;
        };
      }>;
      final: {
        decision: "approve" | "block" | "rewrite";
        attempt_number: number;
      } | null;
    }>;
    episode_gate: {
      decision: "ship" | "fail";
      failed_segments: Array<{
        segment_key: string;
        blocking_reasons: string[];
      }>;
    } | null;
  }>;
  rollups: {
    segments_total: number;
    segments_approved: number;
    attempts_per_segment: {
      p50: number;
      p95: number;
    };
    top_blockers: Array<{
      id: string;
      count: number;
    }>;
    banned_phrase_hits: number;
  };
}

export class RunSummaryCollector {
  private attempts: AttemptRecord[] = [];
  private finals: Map<string, FinalRecord> = new Map(); // key: `${episode_date}:${segment_key}`
  private episodeGates: Map<string, EpisodeGateRecord> = new Map(); // key: episode_date
  private config: {
    program_slug: string;
    batch_id: string;
    mode: { canonical: boolean; scripts_only: boolean };
    date_from: string;
    date_to: string;
  };

  constructor(config: {
    program_slug: string;
    batch_id: string;
    mode: { canonical: boolean; scripts_only: boolean };
    date_from: string;
    date_to: string;
  }) {
    this.config = config;
  }

  recordAttempt(params: {
    episode_date: string;
    segment_key: string;
    attempt_number: number;
    decision: "approve" | "block" | "rewrite";
    blocking_reasons: string[];
    script_text: string;
  }): void {
    this.attempts.push({
      episode_date: params.episode_date,
      segment_key: params.segment_key,
      attempt_number: params.attempt_number,
      decision: params.decision,
      blocking_reasons: params.blocking_reasons,
      script_text: params.script_text,
    });
  }

  recordFinal(params: {
    episode_date: string;
    segment_key: string;
    final_attempt_number: number;
    final_decision: "approve" | "block" | "rewrite";
  }): void {
    const key = `${params.episode_date}:${params.segment_key}`;
    this.finals.set(key, {
      episode_date: params.episode_date,
      segment_key: params.segment_key,
      final_attempt_number: params.final_attempt_number,
      final_decision: params.final_decision,
    });
  }

  recordEpisodeGate(params: {
    episode_date: string;
    decision: "ship" | "fail";
    failed_segments: Array<{
      segment_key: string;
      blocking_reasons: string[];
    }>;
  }): void {
    this.episodeGates.set(params.episode_date, {
      episode_date: params.episode_date,
      decision: params.decision,
      failed_segments: params.failed_segments,
    });
  }

  private computeRollups(): RunSummaryArtifact["rollups"] {
    // Group attempts by episode_date + segment_key
    const segmentAttempts = new Map<string, AttemptRecord[]>();
    for (const attempt of this.attempts) {
      const key = `${attempt.episode_date}:${attempt.segment_key}`;
      if (!segmentAttempts.has(key)) {
        segmentAttempts.set(key, []);
      }
      segmentAttempts.get(key)!.push(attempt);
    }

    const segmentsTotal = segmentAttempts.size;
    const segmentsApproved = Array.from(this.finals.values()).filter(
      (f) => f.final_decision === "approve"
    ).length;

    // Compute attempts per segment (p50, p95)
    const attemptsCounts = Array.from(segmentAttempts.values()).map(
      (attempts) => attempts.length
    );
    attemptsCounts.sort((a, b) => a - b);
    const p50 = attemptsCounts.length > 0
      ? attemptsCounts[Math.floor(attemptsCounts.length * 0.5)]
      : 0;
    const p95 = attemptsCounts.length > 0
      ? attemptsCounts[Math.floor(attemptsCounts.length * 0.95)]
      : 0;

    // Count blockers across all attempts
    const blockerCounts = new Map<string, number>();
    for (const attempt of this.attempts) {
      for (const reason of attempt.blocking_reasons) {
        blockerCounts.set(reason, (blockerCounts.get(reason) || 0) + 1);
      }
    }
    const topBlockers = Array.from(blockerCounts.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);

    // Count banned phrase hits
    const bannedPhraseHits = this.attempts.filter((attempt) =>
      hasBannedPhraseMeaningOverMinutiae(attempt.script_text)
    ).length;

    return {
      segments_total: segmentsTotal,
      segments_approved: segmentsApproved,
      attempts_per_segment: { p50, p95 },
      top_blockers: topBlockers,
      banned_phrase_hits: bannedPhraseHits,
    };
  }

  private buildArtifact(): RunSummaryArtifact {
    const rollups = this.computeRollups();

    // Group by episode_date
    const episodesByDate = new Map<string, {
      episode_date: string;
      segments: Map<string, {
        segment_key: string;
        attempts: Array<{
          attempt_number: number;
          decision: "approve" | "block" | "rewrite";
          blocking_reasons: string[];
          flags: {
            banned_phrase_meaning_over_minutiae: boolean;
            closing_prediction_terms: string[];
            closing_soft_permission_present: boolean | null;
          };
        }>;
        final: {
          decision: "approve" | "block" | "rewrite";
          attempt_number: number;
        } | null;
      }>;
    }>();

    // Process all attempts
    for (const attempt of this.attempts) {
      if (!episodesByDate.has(attempt.episode_date)) {
        episodesByDate.set(attempt.episode_date, {
          episode_date: attempt.episode_date,
          segments: new Map(),
        });
      }
      const episode = episodesByDate.get(attempt.episode_date)!;

      if (!episode.segments.has(attempt.segment_key)) {
        episode.segments.set(attempt.segment_key, {
          segment_key: attempt.segment_key,
          attempts: [],
          final: null,
        });
      }
      const segment = episode.segments.get(attempt.segment_key)!;

      // Compute flags for this attempt
      const isClosing = attempt.segment_key === "closing";
      const flags = {
        banned_phrase_meaning_over_minutiae: hasBannedPhraseMeaningOverMinutiae(
          attempt.script_text
        ),
        closing_prediction_terms: isClosing
          ? extractClosingPredictionTerms(attempt.script_text)
          : [],
        closing_soft_permission_present: isClosing
          ? hasSoftPermission(attempt.script_text)
          : null,
      };

      segment.attempts.push({
        attempt_number: attempt.attempt_number - 1, // Convert to 0-based for artifact
        decision: attempt.decision,
        blocking_reasons: attempt.blocking_reasons,
        flags,
      });
    }

    // Add final records
    for (const final of this.finals.values()) {
      const episode = episodesByDate.get(final.episode_date);
      if (episode) {
        const segment = episode.segments.get(final.segment_key);
        if (segment) {
          segment.final = {
            decision: final.final_decision,
            attempt_number: final.final_attempt_number - 1, // Convert to 0-based for artifact
          };
        }
      }
    }

    // Convert to array format
    const episodes = Array.from(episodesByDate.values())
      .map((ep) => ({
        episode_date: ep.episode_date,
        segments: Array.from(ep.segments.values()),
        episode_gate: this.episodeGates.get(ep.episode_date) || null,
      }))
      .sort((a, b) => a.episode_date.localeCompare(b.episode_date));

    return {
      program_slug: this.config.program_slug,
      batch_id: this.config.batch_id,
      mode: this.config.mode,
      date_from: this.config.date_from,
      date_to: this.config.date_to,
      episodes,
      rollups,
    };
  }

  printConsoleTable(): void {
    const artifact = this.buildArtifact();
    const rollups = artifact.rollups;

    console.log("\n=== Phase G Run Summary ===");
    console.log(`Program: ${artifact.program_slug}`);
    console.log(`Batch: ${artifact.batch_id}`);
    console.log(`Date range: ${artifact.date_from} to ${artifact.date_to}`);
    console.log(`Mode: canonical=${artifact.mode.canonical}, scripts_only=${artifact.mode.scripts_only}\n`);

    // Per-segment aggregate table
    console.log("Per-Segment Summary:");
    console.log(
      "date".padEnd(12) +
      "segment".padEnd(15) +
      "final".padEnd(10) +
      "attempts".padEnd(10) +
      "top_blocker".padEnd(30) +
      "banned_phrase".padEnd(15) +
      "closing_pred".padEnd(15) +
      "closing_soft_perm"
    );
    console.log("-".repeat(120));

    for (const episode of artifact.episodes) {
      for (const segment of episode.segments) {
        const topBlocker = segment.attempts.length > 0
          ? segment.attempts
              .flatMap((a) => a.blocking_reasons)
              .reduce((acc, reason) => {
                acc[reason] = (acc[reason] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
          : {};
        const topBlockerEntry = Object.entries(topBlocker)
          .sort((a, b) => b[1] - a[1])[0];
        const topBlockerStr = topBlockerEntry
          ? `${topBlockerEntry[0]} (${topBlockerEntry[1]})`
          : "none";

        const bannedPhraseHit = segment.attempts.some(
          (a) => a.flags.banned_phrase_meaning_over_minutiae
        )
          ? "Y"
          : "N";

        const closingPredTerms = segment.attempts
          .flatMap((a) => a.flags.closing_prediction_terms)
          .filter((t) => t.length > 0);
        const closingPredStr = closingPredTerms.length > 0
          ? `${closingPredTerms.length}`
          : "0";

        const closingSoftPerm = segment.segment_key === "closing"
          ? segment.attempts.some((a) => a.flags.closing_soft_permission_present === true)
            ? "Y"
            : "N"
          : "-";

        const finalStr = segment.final
          ? `${segment.final.decision} (${segment.final.attempt_number + 1})` // Display as 1-based
          : "unknown";

        console.log(
          episode.episode_date.padEnd(12) +
          segment.segment_key.padEnd(15) +
          finalStr.padEnd(10) +
          `${segment.attempts.length}`.padEnd(10) +
          topBlockerStr.substring(0, 30).padEnd(30) +
          bannedPhraseHit.padEnd(15) +
          closingPredStr.padEnd(15) +
          closingSoftPerm
        );
      }
    }

    console.log("\n=== Rollups ===");
    console.log(`Segments total: ${rollups.segments_total}`);
    console.log(`Segments approved: ${rollups.segments_approved}`);
    console.log(
      `Success rate: ${rollups.segments_total > 0
        ? ((rollups.segments_approved / rollups.segments_total) * 100).toFixed(1)
        : 0}%`
    );
    console.log(`Attempts per segment - p50: ${rollups.attempts_per_segment.p50}, p95: ${rollups.attempts_per_segment.p95}`);
    console.log(`Banned phrase hits: ${rollups.banned_phrase_hits}`);

    console.log("\nTop 10 Blockers:");
    for (const blocker of rollups.top_blockers.slice(0, 10)) {
      console.log(`  ${blocker.id}: ${blocker.count}`);
    }
    console.log("");
  }

  async writeArtifact(outputPath: string): Promise<void> {
    const artifact = this.buildArtifact();
    const json = JSON.stringify(artifact, null, 2);

    // Ensure directory exists
    await fs.mkdir(dirname(outputPath), { recursive: true });

    // Write file
    await fs.writeFile(outputPath, json, "utf-8");
    console.log(`\nArtifact written to: ${outputPath}`);
  }
}
