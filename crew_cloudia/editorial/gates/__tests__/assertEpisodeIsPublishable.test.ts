import { describe, it, expect, vi, beforeEach } from "vitest";

// Set env vars BEFORE any imports
process.env.SUPABASE_URL = "http://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

// Create mock functions for the query chain
let mockQueryResult: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;
let mockSelect: ReturnType<typeof vi.fn>;
let mockEq: ReturnType<typeof vi.fn>;
let mockIn: ReturnType<typeof vi.fn>;

vi.mock("../../lib/supabaseClient", () => {
  mockQueryResult = vi.fn();
  const mockOrder3 = vi.fn();
  const mockOrder2 = vi.fn();
  const mockOrder1 = vi.fn();
  mockIn = vi.fn();
  mockEq = vi.fn();
  mockSelect = vi.fn();
  mockFrom = vi.fn();

  // Setup chain: from().select().eq().in().order().order().order()
  mockOrder3.mockImplementation(() => Promise.resolve(mockQueryResult()));
  mockOrder2.mockReturnValue({
    order: mockOrder3,
  });
  mockOrder1.mockReturnValue({
    order: mockOrder2,
  });
  mockIn.mockReturnValue({
    order: mockOrder1,
  });
  mockEq.mockReturnValue({
    in: mockIn,
  });
  mockSelect.mockReturnValue({
    eq: mockEq,
  });
  mockFrom.mockReturnValue({
    select: mockSelect,
  });

  return {
    supabase: {
      from: mockFrom,
    },
  };
});

import { assertEpisodeIsPublishable } from "../assertEpisodeIsPublishable.js";

describe("assertEpisodeIsPublishable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when main_themes segment is missing", async () => {
    mockQueryResult!.mockReturnValue({
      data: [
        {
          segment_key: "intro",
          gate_decision: "approve",
          blocking_reasons: [],
          attempt_number: 1,
          created_at: "2026-01-07T10:00:00Z",
        },
        {
          segment_key: "closing",
          gate_decision: "approve",
          blocking_reasons: [],
          attempt_number: 1,
          created_at: "2026-01-07T10:00:00Z",
        },
      ],
      error: null,
    });

    await expect(
      assertEpisodeIsPublishable({
        episode_date: "2026-01-07",
        required_segments: ["intro", "main_themes", "closing"],
      })
    ).rejects.toThrow("Missing required segment: main_themes");
  });

  it("throws when closing segment has gate_decision=rewrite with blocking_reasons", async () => {
    mockQueryResult!.mockReturnValue({
      data: [
        {
          segment_key: "intro",
          gate_decision: "approve",
          blocking_reasons: [],
          attempt_number: 1,
          created_at: "2026-01-07T10:00:00Z",
        },
        {
          segment_key: "main_themes",
          gate_decision: "approve",
          blocking_reasons: [],
          attempt_number: 1,
          created_at: "2026-01-07T10:00:00Z",
        },
        {
          segment_key: "closing",
          gate_decision: "rewrite",
          blocking_reasons: ["NO_BEHAVIORAL_AFFORDANCE"],
          attempt_number: 2,
          created_at: "2026-01-07T10:05:00Z",
        },
        // Earlier attempt (should be ignored)
        {
          segment_key: "closing",
          gate_decision: "approve",
          blocking_reasons: [],
          attempt_number: 1,
          created_at: "2026-01-07T10:00:00Z",
        },
      ],
      error: null,
    });

    await expect(
      assertEpisodeIsPublishable({
        episode_date: "2026-01-07",
        required_segments: ["intro", "main_themes", "closing"],
      })
    ).rejects.toThrow(
      "Segment blocked by gate: closing (gate_decision=rewrite (NO_BEHAVIORAL_AFFORDANCE))"
    );
  });

  it("does not throw when all latest segments are approve", async () => {
    mockQueryResult!.mockReturnValue({
      data: [
        {
          segment_key: "intro",
          gate_decision: "approve",
          blocking_reasons: [],
          attempt_number: 1,
          created_at: "2026-01-07T10:00:00Z",
        },
        {
          segment_key: "main_themes",
          gate_decision: "approve",
          blocking_reasons: [],
          attempt_number: 2,
          created_at: "2026-01-07T10:05:00Z",
        },
        {
          segment_key: "closing",
          gate_decision: "approve",
          blocking_reasons: [],
          attempt_number: 1,
          created_at: "2026-01-07T10:00:00Z",
        },
      ],
      error: null,
    });

    await expect(
      assertEpisodeIsPublishable({
        episode_date: "2026-01-07",
        required_segments: ["intro", "main_themes", "closing"],
      })
    ).resolves.toBeUndefined();
  });

  it("selects latest attempt per segment when multiple attempts exist", async () => {
    mockQueryResult!.mockReturnValue({
      data: [
        {
          segment_key: "intro",
          gate_decision: "approve",
          blocking_reasons: [],
          attempt_number: 3,
          created_at: "2026-01-07T10:10:00Z",
        },
        {
          segment_key: "intro",
          gate_decision: "block",
          blocking_reasons: ["SOME_REASON"],
          attempt_number: 2,
          created_at: "2026-01-07T10:05:00Z",
        },
        {
          segment_key: "intro",
          gate_decision: "approve",
          blocking_reasons: [],
          attempt_number: 1,
          created_at: "2026-01-07T10:00:00Z",
        },
        {
          segment_key: "main_themes",
          gate_decision: "approve",
          blocking_reasons: [],
          attempt_number: 1,
          created_at: "2026-01-07T10:00:00Z",
        },
        {
          segment_key: "closing",
          gate_decision: "approve",
          blocking_reasons: [],
          attempt_number: 1,
          created_at: "2026-01-07T10:00:00Z",
        },
      ],
      error: null,
    });

    // Should pass because latest intro (attempt 3) is approve
    await expect(
      assertEpisodeIsPublishable({
        episode_date: "2026-01-07",
        required_segments: ["intro", "main_themes", "closing"],
      })
    ).resolves.toBeUndefined();
  });

  it("throws when query fails", async () => {
    mockQueryResult!.mockReturnValue({
      data: null,
      error: { message: "Database connection failed" },
    });

    await expect(
      assertEpisodeIsPublishable({
        episode_date: "2026-01-07",
        required_segments: ["intro", "main_themes", "closing"],
      })
    ).rejects.toThrow("Failed to query segment versions: Database connection failed");
  });
});
