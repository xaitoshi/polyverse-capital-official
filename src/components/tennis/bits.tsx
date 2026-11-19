import { useState, type ReactNode } from "react";
import { initials } from "../../lib/tennis/names";
import { SHARE_URL } from "../../lib/tennis/methodology";
import type { PlayerSummary } from "../../lib/tennis/types";

export const NAV = [
  { href: "/liquidity", label: "Liquidity" },
  { href: "/esports", label: "Esports" },
  { href: "/lolesports", label: "LoL Teams" },
  { href: "/tennis", label: "Tennis" },
  { href: "/weather", label: "Weather" },
  { href: "/visualise", label: "Visualise" },
];

export function Nav({ active }: { active: "tennis" | "record" | "player" }) {
  return (
    <header className="tnav">
      <a className="tlogo" href="/">
        POLYVERSE CAPITAL <span>Tennis</span>
      </a>
      <nav className="tlinks" aria-label="Sections">
        {NAV.map((item) => (
          <a key={item.href} href={item.href} className={item.href === "/tennis" && active === "tennis" ? "on" : undefined}>
            {item.label}
          </a>
        ))}
        <a href="/tennis/record" className={active === "record" ? "on" : undefined}>
          Record
        </a>
      </nav>
    </header>
  );
}

export function Flag({ player }: { player: PlayerSummary }) {
  const src = player.flagUrl || (player.countryCode ? `https://flagcdn.com/w20/${player.countryCode}.png` : null);
  if (!src) return null;
  return <img className="flag" alt="" src={src} />;
}

export function Portrait({ player }: { player: PlayerSummary }) {
  const [broken, setBroken] = useState(false);
  if (player.photo?.url && !broken) {
    return <img className="portrait" src={player.photo.url} alt={player.name} onError={() => setBroken(true)} />;
  }
  return (
    <div className="portrait avatar" role="img" aria-label={`${player.name}, no photo on file`}>
      {initials(player.name)}
    </div>
  );
}

export function ShareLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <a className={className} href={SHARE_URL} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
