// Minimal QA for Phase G:
// - non-empty bytes
// - duration bounds (computed via ffprobe in next step)
//
// For now, implement byte checks + file-size sanity. We'll add ffprobe-based duration immediately after.

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

