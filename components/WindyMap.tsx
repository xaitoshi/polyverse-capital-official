"use client";

type Props = {
  lat: number;
  lon: number;
  overlay?: "temp" | "wind" | "clouds" | "rain";
  // When embedded, the component renders only the iframe and expects the
  // parent to provide the ascii-panel chrome and height. Standalone mode
  // keeps its own frame + fixed 320px height (kept for other callers).
  embedded?: boolean;
};

export default function WindyMap({
  lat,
  lon,
  overlay = "temp",
  embedded = false,
}: Props) {
  const params = new URLSearchParams({
    lat: lat.toFixed(3),
    lon: lon.toFixed(3),
    detailLat: lat.toFixed(3),
    detailLon: lon.toFixed(3),
    width: "650",
    height: "450",
    zoom: "6",
    level: "surface",
    overlay,
    product: "ecmwf",
    menu: "",
    message: "",
    marker: "true",
    calendar: "now",
    pressure: "",
    type: "map",
    location: "coordinates",
    detail: "",
    metricWind: "default",
    metricTemp: "default",
    radarRange: "-1",
  });
  const src = `https://embed.windy.com/embed2.html?${params.toString()}`;

  if (embedded) {
    return (
      <iframe
        src={src}
        title={`Windy map at ${lat},${lon}`}
        className="block h-full w-full"
        frameBorder={0}
      />
    );
  }

  return (
    <div className="ascii-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-panel-border/40 px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] text-ink-dim">
        <span className="phosphor">WINDY · {overlay}</span>
        <a
          href={`https://www.windy.com/?${lat.toFixed(3)},${lon.toFixed(3)},7`}
          target="_blank"
          rel="noreferrer"
          className="phosphor-amber hover:underline"
        >
          open ↗
        </a>
      </div>
      <iframe
        src={src}
        title={`Windy map at ${lat},${lon}`}
        width="100%"
        height="320"
        frameBorder={0}
        className="block"
      />
    </div>
  );
}
