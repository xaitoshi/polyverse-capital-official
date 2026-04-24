import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { HistoryDay } from "../../lib/weatherverse/metar";

type Props = {
  days: HistoryDay[];
  highlightDate?: string;
  marketKind?: "high" | "low";
};

export default function HistoryChart({
  days,
  highlightDate,
  marketKind = "high",
}: Props) {
  if (!days.length) {
    return (
      <div className="p-4 text-xs text-ink-dim">
        No recorded data yet for this station / window.
      </div>
    );
  }

  return (
    <div className="h-full min-h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={days}
          margin={{ top: 8, right: 12, bottom: 8, left: -12 }}
        >
          <CartesianGrid
            stroke="rgba(94, 241, 255, 0.12)"
            strokeDasharray="2 3"
          />
          <XAxis
            dataKey="date"
            tick={{ fill: "#7fa990", fontSize: 10 }}
            tickFormatter={(d) => d.slice(5)}
            stroke="rgba(94, 241, 255, 0.3)"
          />
          <YAxis
            tick={{ fill: "#7fa990", fontSize: 10 }}
            stroke="rgba(94, 241, 255, 0.3)"
            unit="°C"
            domain={["auto", "auto"]}
            width={52}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(4, 12, 10, 0.95)",
              border: "1px solid rgba(94, 241, 255, 0.4)",
              fontFamily: "ui-monospace, monospace",
              fontSize: 11,
              color: "#c8f2d8",
            }}
            labelStyle={{ color: "#ffb947" }}
          />
          {highlightDate && (
            <ReferenceLine
              x={highlightDate}
              stroke="#ffb947"
              strokeDasharray="4 2"
              label={{
                value: "market",
                fill: "#ffb947",
                fontSize: 10,
                position: "top",
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="highC"
            stroke="#ffb947"
            dot={{ r: 2, fill: "#ffb947" }}
            strokeWidth={marketKind === "high" ? 2.2 : 1.2}
            isAnimationActive={false}
            name="High"
          />
          <Line
            type="monotone"
            dataKey="lowC"
            stroke="#5ef1ff"
            dot={{ r: 2, fill: "#5ef1ff" }}
            strokeWidth={marketKind === "low" ? 2.2 : 1.2}
            isAnimationActive={false}
            name="Low"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
