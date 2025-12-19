function normalizeSign(sign: string): string {
  return sign.toLowerCase();
}

export function sunInSignKey(sign: string): string {
  return `sun_in_${normalizeSign(sign)}`;
}

export function sunMoonAspectKey(aspect: string): string {
  return `sun_moon_${aspect.toLowerCase()}`;
}

export function moonPhaseKey(phase: string): string {
  return `moon_phase_${phase.toLowerCase()}`;
}

export function moonIngressKey(toSign: string, window: string): string {
  return `moon_ingress_${normalizeSign(toSign)}_${window.toLowerCase()}`;
}

export { normalizeSign };

