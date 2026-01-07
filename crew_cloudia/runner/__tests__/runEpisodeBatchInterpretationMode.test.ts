/**
 * Phase E2 — Interpretation Mode Routing Test
 * 
 * Tests that runEpisodeBatch correctly routes to legacy or canonical interpreter
 * based on CLOUDIA_INTERPRETATION_MODE environment variable.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock interpreters
const mockRunInterpreter = vi.fn();
const mockRunInterpreterCanonical = vi.fn();

vi.mock("../../interpretation/runInterpreter.js", () => ({
  runInterpreter: (...args: any[]) => mockRunInterpreter(...args),
}));

vi.mock("../../astro/interpretation/runInterpreterCanonical.js", () => ({
  runInterpreterCanonical: (...args: any[]) => mockRunInterpreterCanonical(...args),
}));

// Mock segment runners
const mockRunIntroForDate = vi.fn();
const mockRunMainThemesForDate = vi.fn();
const mockRunClosingForDate = vi.fn();

vi.mock("../../../run-intro.js", () => ({
  runIntroForDate: (...args: any[]) => mockRunIntroForDate(...args),
}));

vi.mock("../../../run-main-themes.js", () => ({
  runMainThemesForDate: (...args: any[]) => mockRunMainThemesForDate(...args),
}));

vi.mock("../../../run-closing.js", () => ({
  runClosingForDate: (...args: any[]) => mockRunClosingForDate(...args),
}));

// Mock gate evaluation and persistence
const mockEvaluateEpisodeGate = vi.fn();
const mockPersistEpisodeGateResult = vi.fn();

vi.mock("../../editorial/gate/evaluateEpisodeGate.js", () => ({
  evaluateEpisodeGate: (...args: any[]) => mockEvaluateEpisodeGate(...args),
}));

vi.mock("../../editorial/gate/persistEpisodeGateResult.js", () => ({
  persistEpisodeGateResult: (...args: any[]) => mockPersistEpisodeGateResult(...args),
}));

// Minimal InterpretiveFrame stub
const minimalFrame = {
  date: "2024-01-15",
  dominant_contrast_axis: {
    statement: "test over test",
    primary: "test",
    counter: "test",
  },
  tone_descriptor: "test",
  why_today: ["test"],
  supporting_themes: [],
  sky_anchors: [
    {
      type: "moon_sign" as const,
      label: "Moon in Test",
      meaning: "test",
    },
  ],
  causal_logic: ["test"],
  why_today_clause: "test",
  temporal_phase: "building" as const,
  intensity_modifier: "emerging" as const,
  continuity: {},
  temporal_arc: {
    type: "none" as const,
    phase: "baseline",
    intensity: "emerging" as const,
    arc_day_index: 1,
    arc_total_days: 1,
  },
  timing: { state: "building" as const },
  signals: [
    {
      signal_key: "test",
      kind: "lunar_phase" as const,
      salience: 0.5,
      source: "sky_features" as const,
    },
  ],
  interpretation_bundles: {
    primary: [],
    secondary: [],
    suppressed: [],
  },
  confidence_level: "medium" as const,
  canon_compliance: {
    violations: [],
    notes: [],
  },
};

// Mock segment runner return values
const mockSegmentResult = {
  segment_key: "test-segment",
  gate_result: {
    decision: "approve" as const,
    is_approved: true,
    blocking_reasons: [],
    warnings: [],
    rewrite_instructions: null,
    policy_version: "v0.1",
    evaluated_at: new Date().toISOString(),
  },
};

// Mock gate evaluation return value
const mockEpisodeGate = {
  decision: "approve" as const,
  is_approved: true,
  failed_segments: [],
  warnings: [],
  policy_version: "v0.1",
  evaluated_at: new Date().toISOString(),
};

describe("runEpisodeBatch interpretation mode routing", () => {
  const oldEnv = process.env.CLOUDIA_INTERPRETATION_MODE;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CLOUDIA_INTERPRETATION_MODE;

    // Setup default mocks
    mockRunInterpreter.mockResolvedValue(minimalFrame);
    mockRunInterpreterCanonical.mockResolvedValue(minimalFrame);
    mockRunIntroForDate.mockResolvedValue(mockSegmentResult);
    mockRunMainThemesForDate.mockResolvedValue(mockSegmentResult);
    mockRunClosingForDate.mockResolvedValue(mockSegmentResult);
    mockEvaluateEpisodeGate.mockReturnValue(mockEpisodeGate);
    mockPersistEpisodeGateResult.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (oldEnv === undefined) {
      delete process.env.CLOUDIA_INTERPRETATION_MODE;
    } else {
      process.env.CLOUDIA_INTERPRETATION_MODE = oldEnv;
    }
  });

  it("defaults to legacy when env is unset", async () => {
    // Mock process.argv to prevent main() from running
    const originalArgv = process.argv;
    process.argv = ["node", "test", "test-program", "2024-01-15", "--window-days", "1"];
    
    // Import after mocks are set up
    const { runForDate } = await import("../runEpisodeBatch.js");
    
    await runForDate("test-program", "2024-01-15");

    expect(mockRunInterpreter).toHaveBeenCalledTimes(1);
    expect(mockRunInterpreter).toHaveBeenCalledWith({ date: "2024-01-15" });
    expect(mockRunInterpreterCanonical).not.toHaveBeenCalled();
    
    process.argv = originalArgv;
  });

  it("routes to canonical when env is canonical", async () => {
    process.env.CLOUDIA_INTERPRETATION_MODE = "canonical";
    
    // Mock process.argv to prevent main() from running
    const originalArgv = process.argv;
    process.argv = ["node", "test", "test-program", "2024-01-15", "--window-days", "1"];
    
    const { runForDate } = await import("../runEpisodeBatch.js");
    await runForDate("test-program", "2024-01-15");

    expect(mockRunInterpreterCanonical).toHaveBeenCalledTimes(1);
    expect(mockRunInterpreterCanonical).toHaveBeenCalledWith({ date: "2024-01-15" });
    expect(mockRunInterpreter).not.toHaveBeenCalled();
    
    process.argv = originalArgv;
  });

  it("treats invalid values as legacy", async () => {
    process.env.CLOUDIA_INTERPRETATION_MODE = "banana";
    
    // Mock process.argv to prevent main() from running
    const originalArgv = process.argv;
    process.argv = ["node", "test", "test-program", "2024-01-15", "--window-days", "1"];
    
    const { runForDate } = await import("../runEpisodeBatch.js");
    await runForDate("test-program", "2024-01-15");

    expect(mockRunInterpreter).toHaveBeenCalledTimes(1);
    expect(mockRunInterpreter).toHaveBeenCalledWith({ date: "2024-01-15" });
    expect(mockRunInterpreterCanonical).not.toHaveBeenCalled();
    
    process.argv = originalArgv;
  });

  it("treats case-insensitive canonical as canonical", async () => {
    process.env.CLOUDIA_INTERPRETATION_MODE = "CANONICAL";
    
    // Mock process.argv to prevent main() from running
    const originalArgv = process.argv;
    process.argv = ["node", "test", "test-program", "2024-01-15", "--window-days", "1"];
    
    const { runForDate } = await import("../runEpisodeBatch.js");
    await runForDate("test-program", "2024-01-15");

    expect(mockRunInterpreterCanonical).toHaveBeenCalledTimes(1);
    expect(mockRunInterpreterCanonical).toHaveBeenCalledWith({ date: "2024-01-15" });
    expect(mockRunInterpreter).not.toHaveBeenCalled();
    
    process.argv = originalArgv;
  });
});

