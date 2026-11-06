import { championIconUrl } from "../../lib/lolesports/format";

export default function ChampIcon({
  cdn,
  name,
  ringed,
  size = 28,
}: {
  cdn?: string | null;
  name: string;
  ringed?: boolean;
  size?: number;
}) {
  const url = championIconUrl(cdn);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-sm overflow-hidden bg-black/40 border ${
        ringed ? "border-amber-400/70 ring-1 ring-amber-400/40" : "border-white/10"
      }`}
      style={{ width: size, height: size }}
      title={name}
    >
      {url ? (
        <img
          src={url}
          alt={name}
          width={size}
          height={size}
          className="object-cover w-full h-full"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span className="text-[8px] text-ink-dim px-0.5 truncate">{name.slice(0, 3)}</span>
      )}
    </span>
  );
}
