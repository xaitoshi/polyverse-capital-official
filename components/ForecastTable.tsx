"use client";

import type { ModelForecast } from "@/lib/forecasts";

type Props = {
  models: ModelForecast[];
  highlightDate?: string;
  marketKind?: "high" | "low";
};

function toF(c: number | null): string {
  if (c == null) return "—";
  return `${Math.round((c * 9) / 5 + 32)}°F`;
}

function toC(c: number | null): string {
  if (c == null) return "—";
  return `${Math.round(c)}°C`;
}

export default function ForecastTable({
  models,
  highlightDate,
  marketKind = "high",
}: Props) {
  if (!models.length) {
    return (
      <div className="p-4 text-xs text-ink-dim">No forecast data available.</div>
    );
  }
  const dates = models[0].points.map((p) => p.date);

  // Consensus: mean across available models for the tracked metric.
  const consensus = dates.map((d, i) => {
    const vals = models
      .map((m) => (marketKind === "low" ? m.points[i]?.lowC : m.points[i]?.highC))
      .filter((v): v is number => v != null);
    const mean =
      vals.length > 0
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : null;
    const spread =
      vals.length > 1
        ? Math.max(...vals) - Math.min(...vals)
        : 0;
    return { date: d, mean, spread };
  });

  return (
    <div className="overflow-x-auto slim-scroll">
      <table className="w-full min-w-[640px] border-collapse text-[11px]">
        <thead>
          <tr className="text-left uppercase tracking-[0.2em] text-ink-dim">
            <th className="px-2 py-2 font-normal">Date</th>
            {models.map((m) => (
              <th key={m.model} className="px-2 py-2 font-normal">
                {m.label}
              </th>
            ))}
            <th className="px-2 py-2 font-normal text-amber">μ · spread</th>
          </tr>
        </thead>
        <tbody>
          {dates.map((d, i) => {
            const isTarget = d === highlightDate;
            return (
              <tr
                key={d}
                className={
                  "border-t border-panel-border/30 " +
                  (isTarget ? "bg-cyan/[0.08]" : "")
                }
              >
                <td
                  className={
                    "px-2 py-1.5 " +
                    (isTarget ? "phosphor-amber" : "text-ink-dim")
                  }
                >
                  {d.slice(5)} {isTarget ? "←" : ""}
                </td>
                {models.map((m) => {
                  const pt = m.points[i];
                  const val = marketKind === "low" ? pt?.lowC : pt?.highC;
                  return (
                    <td key={m.model} className="px-2 py-1.5">
                      <span className="phosphor">{toC(val ?? null)}</span>
                      <span className="ml-1 text-ink-dim">
                        / {toF(val ?? null)}
                      </span>
                    </td>
                  );
                })}
                <td className="px-2 py-1.5">
                  <span className="phosphor-amber">
                    {consensus[i].mean != null
                      ? `${Math.round(consensus[i].mean!)}°C`
                      : "—"}
                  </span>
                  <span className="ml-2 text-ink-dim">
                    ±{consensus[i].spread.toFixed(1)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
