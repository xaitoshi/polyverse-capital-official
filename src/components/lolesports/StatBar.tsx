export default function StatBar({
  value,
  max = 100,
  label,
  tone = "cyan",
}: {
  value: number | null | undefined;
  max?: number;
  label?: string;
  tone?: "cyan" | "green" | "amber";
}) {
  if (value == null) {
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="flex-1 h-2 rounded-sm bg-white/5 border border-white/10" />
        <span className="text-[10px] text-ink-dim w-8 text-right">—</span>
      </div>
    );
  }
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill =
    tone === "green"
      ? "bg-emerald-400/80"
      : tone === "amber"
        ? "bg-amber-400/80"
        : "bg-cyan-400/80";
  return (
    <div className="flex items-center gap-2 min-w-[120px]" title={label}>
      <div className="flex-1 h-2 rounded-sm bg-white/5 border border-white/10 overflow-hidden">
        <div className={`h-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-ink w-8 text-right tabular-nums">{Math.round(value)}</span>
    </div>
  );
}
