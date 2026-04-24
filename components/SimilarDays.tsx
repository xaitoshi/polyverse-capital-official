"use client";

import { useEffect, useState } from "react";
import type { SameDayRecord } from "@/lib/metar";

type Props = {
  station?: string;
  date: string | null;
  marketKind: "high" | "low";
  forecastTarget?: number | null; // °C, for comparison
};

function cToF(c: number) {
  return (c * 9) / 5 + 32;
}

// Summary stats across the recorded years for the selected metric.
function summarize(rs: SameDayRecord[], kind: "high" | "low") {
  const vals = rs
    .map((r) => (kind === "high" ? r.highC : r.lowC))
    .filter((x): x is number => x != null);
  if (!vals.length) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return {
    mean,
    min: Math.min(...vals),
    max: Math.max(...vals),
    count: vals.length,
  };
}

export default function SimilarDays({
  station,
  date,
  marketKind,
  forecastTarget,
}: Props) {
  const [records, setRecords] = useState<SameDayRecord[] | null>(null);

  useEffect(() => {
    if (!station || !date) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecords(null);
    fetch(`/api/similar-days?station=${station}&date=${date}&years=5`)
      .then((r) => r.json())
      .then((d) => !cancelled && setRecords(d.records ?? []))
      .catch(() => !cancelled && setRecords([]));
    return () => {
      cancelled = true;
    };
  }, [station, date]);

  const summary = records ? summarize(records, marketKind) : null;
  const mmdd = date ? date.slice(5) : "";

  return (
    <div className="ascii-panel flex h-full flex-col overflow-hidden">
      <div className="ascii-panel-heading flex items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] leading-none">
        <span className="phosphor">same day · last 5y</span>
        <span className="text-ink-dim">{mmdd ? `${mmdd} @ ${station}` : ""}</span>
        <span className="ml-auto text-ink-dim">target = {marketKind}</span>
      </div>
      {!records ? (
        <div className="p-3 text-[11px] text-ink-dim">scanning archive…</div>
      ) : records.length === 0 ? (
        <div className="p-3 text-[11px] text-ink-dim">no archive data.</div>
      ) : (
        <div className="slim-scroll min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-[11px] leading-none">
          <thead>
            <tr className="text-left uppercase tracking-[0.22em] text-ink-dim">
              <th className="px-3 py-1.5 font-normal">Year</th>
              <th className="px-3 py-1.5 font-normal">High</th>
              <th className="px-3 py-1.5 font-normal">Low</th>
              <th className="px-3 py-1.5 text-right font-normal">
                Δ vs fcst
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const value = marketKind === "high" ? r.highC : r.lowC;
              const delta =
                value != null && forecastTarget != null
                  ? value - forecastTarget
                  : null;
              return (
                <tr
                  key={r.year}
                  className="border-t border-panel-border/30"
                >
                  <td className="px-3 py-1.5 tabular-nums text-ink-dim">
                    {r.year}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">
                    <span className="phosphor-amber">
                      {r.highC != null ? `${Math.round(r.highC)}°C` : "—"}
                    </span>
                    <span className="ml-2 text-ink-dim">
                      {r.highC != null
                        ? `${Math.round(cToF(r.highC))}°F`
                        : ""}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">
                    <span className="phosphor">
                      {r.lowC != null ? `${Math.round(r.lowC)}°C` : "—"}
                    </span>
                    <span className="ml-2 text-ink-dim">
                      {r.lowC != null
                        ? `${Math.round(cToF(r.lowC))}°F`
                        : ""}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {delta != null ? (
                      <span
                        className={
                          Math.abs(delta) >= 3
                            ? "phosphor-amber"
                            : "text-ink-dim"
                        }
                      >
                        {delta >= 0 ? "+" : ""}
                        {delta.toFixed(1)}°C
                      </span>
                    ) : (
                      <span className="text-ink-dim">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {summary && (
              <tr className="border-t border-panel-border/60 bg-cyan/[0.06]">
                <td className="px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-ink-dim">
                  μ ({summary.count}y)
                </td>
                <td
                  className="px-3 py-1.5 tabular-nums phosphor"
                  colSpan={2}
                >
                  {Math.round(summary.mean)}°C · range{" "}
                  {Math.round(summary.min)} → {Math.round(summary.max)}°C
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {forecastTarget != null ? (
                    <span
                      className={
                        Math.abs(summary.mean - forecastTarget) >= 2
                          ? "phosphor-amber"
                          : "text-ink-dim"
                      }
                    >
                      {summary.mean - forecastTarget >= 0 ? "+" : ""}
                      {(summary.mean - forecastTarget).toFixed(1)}°C
                    </span>
                  ) : (
                    <span className="text-ink-dim">—</span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
