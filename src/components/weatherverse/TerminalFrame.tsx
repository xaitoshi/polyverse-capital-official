import { ReactNode } from "react";

type Props = {
  title?: string;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function TerminalFrame({
  title = "WEATHERVERSE",
  status,
  children,
  className = "",
}: Props) {
  return (
    <div
      className={`ascii-panel crt-scanlines crt-flicker relative flex flex-col overflow-hidden rounded-sm ${className}`}
    >
      <header className="ascii-panel-heading flex items-center gap-3 px-4 py-2 text-[11px] uppercase tracking-[0.25em]">
        <span className="phosphor">[ {title} ]</span>
        <span className="text-ink-dim">{"//"}</span>
        <span className="phosphor-amber truncate">POLYMARKET TEMP MARKETS</span>
        <span className="ml-auto flex items-center gap-3 text-ink-dim">
          {status}
          <span className="phosphor">
            ● LIVE<span className="blink">{"_"}</span>
          </span>
        </span>
      </header>
      <div className="relative z-10 flex-1">{children}</div>
    </div>
  );
}
