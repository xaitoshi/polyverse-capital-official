/** Client-side mirror of polyverse-lolesports-v1 grade thresholds for tests & UI. */
export const GRADE_THRESHOLDS = {
  S: 0.9,
  A: 0.75,
  B: 0.55,
  C: 0.35,
  D: 0.15,
  F: 0,
} as const;

export function gradeFromPercentile(p: number | null | undefined): string | null {
  if (p == null || Number.isNaN(p)) return null;
  if (p >= GRADE_THRESHOLDS.S) return "S";
  if (p >= GRADE_THRESHOLDS.A) return "A";
  if (p >= GRADE_THRESHOLDS.B) return "B";
  if (p >= GRADE_THRESHOLDS.C) return "C";
  if (p >= GRADE_THRESHOLDS.D) return "D";
  return "F";
}

export function shrinkTowardMean(
  obs: number | null | undefined,
  n: number,
  peerMean: number | null | undefined,
  k = 8,
): number | null {
  if (obs == null || Number.isNaN(obs)) return null;
  if (peerMean == null || Number.isNaN(peerMean)) return obs;
  const w = n / (n + k);
  return w * obs + (1 - w) * peerMean;
}
