import { InterpretiveFrame } from "./schema/InterpretiveFrame.js";

export type LunationLabelResult = {
  label: string;
  isFallback: boolean;
  phase_name?: string;
};

const LUNATION_LABELS: Record<string, string> = {
  new: "New Moon",
  waxing_crescent: "Waxing Crescent",
  first_quarter: "First Quarter",
  waxing_gibbous: "Waxing Gibbous",
  full: "Full Moon",
  waning_gibbous: "Waning Gibbous",
  last_quarter: "Last Quarter",
  waning_crescent: "Waning Crescent",
};

export function extractPhaseNameFromFrame(
  frame: InterpretiveFrame
): string | undefined {
  const lunarPhaseSignal = frame.signals?.find?.(
    (signal) => signal?.kind === "lunar_phase"
  );
  if (!lunarPhaseSignal?.meta || typeof lunarPhaseSignal.meta !== "object") {
    return undefined;
  }
  const phaseName = (lunarPhaseSignal.meta as any).phase_name;
  return typeof phaseName === "string" ? phaseName : undefined;
}

export function mapPhaseNameToLunationLabel(
  phase_name?: string
): LunationLabelResult {
  const normalized = String(phase_name ?? "").toLowerCase();
  const label = LUNATION_LABELS[normalized];
  if (!label) {
    return { label: "Lunar phase", isFallback: true, phase_name: phase_name };
  }
  return { label, isFallback: false, phase_name: normalized };
}
