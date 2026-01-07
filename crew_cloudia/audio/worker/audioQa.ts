// Minimal QA for Phase G:
// - non-empty bytes
// - duration bounds (computed via ffprobe)
// - script word count (deterministic proxy for audio duration)

export type QaResult =
  | { ok: true }
  | { ok: false; errorClass: string; message: string };

export function qaNonEmpty(bytes: ArrayBuffer): QaResult {
  if (!bytes || bytes.byteLength === 0) {
    return { ok: false, errorClass: "qa_empty", message: "Audio buffer is empty" };
  }
  // 1KB minimum sanity (very conservative)
  if (bytes.byteLength < 1024) {
    return { ok: false, errorClass: "qa_too_small", message: `Audio buffer too small: ${bytes.byteLength} bytes` };
  }
  return { ok: true };
}

export function qaScriptWordCount(params: { segmentKey: string; scriptText: string }): QaResult {
  const { segmentKey, scriptText } = params;
  
  if (!scriptText || typeof scriptText !== "string") {
    return { ok: false, errorClass: "qa_script_empty", message: "Script text is empty or invalid" };
  }
  
  const wordCount = scriptText.trim().split(/\s+/).filter(word => word.length > 0).length;
  
  // Minimum word counts to reduce duration variability (cheap, deterministic check)
  const minWords =
    segmentKey === "intro"
      ? 40
      : segmentKey === "closing"
      ? 30  // Lower threshold for closings (15s min audio duration)
      : segmentKey === "main_themes"
      ? 200
      : 10;
  
  if (wordCount < minWords) {
    return { 
      ok: false, 
      errorClass: "qa_script_too_short", 
      message: `${segmentKey} script has ${wordCount} words, minimum is ${minWords}` 
    };
  }
  
  return { ok: true };
}

export function qaDuration(params: { segmentKey: string; durationSeconds: number }): QaResult {
  const { segmentKey, durationSeconds } = params;

  // Conservative initial bounds (tighten later with real data)
  const bounds =
    segmentKey === "intro"
      ? { min: 20, max: 120 }
      : segmentKey === "closing"
      ? { min: 15, max: 120 }
      : segmentKey === "main_themes"
      ? { min: 120, max: 900 }
      : { min: 5, max: 1800 };

  if (durationSeconds < bounds.min) {
    return { ok: false, errorClass: "qa_duration_too_short", message: `${segmentKey} duration ${durationSeconds}s < ${bounds.min}s` };
  }
  if (durationSeconds > bounds.max) {
    return { ok: false, errorClass: "qa_duration_too_long", message: `${segmentKey} duration ${durationSeconds}s > ${bounds.max}s` };
  }
  return { ok: true };
}

