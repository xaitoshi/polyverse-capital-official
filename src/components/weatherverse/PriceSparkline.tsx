import { useEffect, useMemo, useState } from "react";
import type { PricePoint } from "../../lib/weatherverse/prices";
import { fetchPriceHistory } from "../../lib/weatherverse/prices";

type Props = {
  tokenId?: string;
  interval?: "6h" | "1d" | "1w";
  height?: number;
  width?: number;
  stroke?: string;
};

// Lightweight inline SVG sparkline so we don't pay the recharts bill for the
// per-outcome mini-charts. Fetches CLOB price history on mount.
export default function PriceSparkline({
  tokenId,
  interval = "1d",
  height = 24,
  width = 96,
  stroke = "#ffb947",
}: Props) {
  const [points, setPoints] = useState<PricePoint[] | null>(null);

  useEffect(() => {
    if (!tokenId) return;
    let cancelled = false;
    fetchPriceHistory(tokenId, interval)
      .then((history) => !cancelled && setPoints(history))
      .catch(() => !cancelled && setPoints([]));
    return () => {
      cancelled = true;
    };
  }, [tokenId, interval]);

  const path = useMemo(() => {
    if (!points || points.length < 2) return "";
    const xs = points.map((p) => p.t);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const dx = maxX - minX || 1;
    // Price is 0..1 so we fix the y scale to that range; the line is then
    // directly comparable across outcomes of the same magnitude.
    const scaleX = (t: number) => ((t - minX) / dx) * (width - 2) + 1;
    const scaleY = (p: number) => (1 - Math.max(0, Math.min(1, p))) * (height - 2) + 1;
    return points
      .map((pt, i) => `${i === 0 ? "M" : "L"}${scaleX(pt.t).toFixed(1)},${scaleY(pt.p).toFixed(1)}`)
      .join(" ");
  }, [points, height, width]);

  if (!tokenId) return null;
  if (!points) {
    return (
      <svg width={width} height={height} className="opacity-40">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#7fa990"
          strokeDasharray="2 3"
        />
      </svg>
    );
  }
  if (points.length < 2) {
    return (
      <svg width={width} height={height}>
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="9"
          fill="#7fa990"
        >
          —
        </text>
      </svg>
    );
  }

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.2" />
      {/* Last point emphasis */}
      {(() => {
        const last = points[points.length - 1];
        const xs = points.map((p) => p.t);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const dx = maxX - minX || 1;
        const x = ((last.t - minX) / dx) * (width - 2) + 1;
        const y = (1 - Math.max(0, Math.min(1, last.p))) * (height - 2) + 1;
        return <circle cx={x} cy={y} r="1.6" fill={stroke} />;
      })()}
    </svg>
  );
}
