export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtNum(x: number | null | undefined, digits = 1): string {
  if (x == null || Number.isNaN(x)) return "—";
  return x.toFixed(digits);
}

export function fmtSigned(x: number | null | undefined, digits = 0): string {
  if (x == null || Number.isNaN(x)) return "—";
  const s = x.toFixed(digits);
  return x > 0 ? `+${s}` : s;
}

export function fmtRecord(w: number, l: number): string {
  return `${w}–${l}`;
}

export function gradeClass(g: string | null | undefined): string {
  switch (g) {
    case "S":
      return "text-amber-300 border-amber-400/50 bg-amber-500/10";
    case "A":
      return "text-emerald-300 border-emerald-400/40 bg-emerald-500/10";
    case "B":
      return "text-cyan-300 border-cyan-400/40 bg-cyan-500/10";
    case "C":
      return "text-ink-dim border-white/20 bg-white/5";
    case "D":
    case "F":
      return "text-rose-300 border-rose-400/40 bg-rose-500/10";
    default:
      return "text-ink-dim border-white/10 bg-white/5";
  }
}

export function championIconUrl(cdn: string | null | undefined): string | null {
  if (!cdn) return null;
  return `https://ddragon.leagueoflegends.com/cdn/14.19.1/img/champion/${cdn}.png`;
}
