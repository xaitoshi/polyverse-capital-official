// Forecast providers. Open-Meteo is our default — no key, supports multi-model
// comparison across ECMWF, GFS, ICON, UKMO, JMA, etc. which lets us show a
// pseudo-consensus view for each city.

export type ForecastPoint = {
  date: string; // YYYY-MM-DD
  highC: number | null;
  lowC: number | null;
};

export type ModelForecast = {
  model: string;
  label: string;
  points: ForecastPoint[];
};

// Ordered by which models are most trusted for a given country/region. Open-Meteo
// accepts comma-separated models and returns arrays of arrays (per-model).
const MODELS_BY_REGION: Record<string, { key: string; label: string }[]> = {
  US: [
    { key: "gfs_seamless", label: "NOAA GFS" },
    { key: "ecmwf_ifs025", label: "ECMWF IFS" },
    { key: "gem_seamless", label: "Canada GEM" },
  ],
  CA: [
    { key: "gem_seamless", label: "Canada GEM" },
    { key: "gfs_seamless", label: "NOAA GFS" },
    { key: "ecmwf_ifs025", label: "ECMWF IFS" },
  ],
  GB: [
    { key: "ukmo_seamless", label: "UK Met Office" },
    { key: "ecmwf_ifs025", label: "ECMWF IFS" },
    { key: "gfs_seamless", label: "NOAA GFS" },
  ],
  JP: [
    { key: "jma_seamless", label: "JMA" },
    { key: "ecmwf_ifs025", label: "ECMWF IFS" },
    { key: "gfs_seamless", label: "NOAA GFS" },
  ],
  DE: [
    { key: "icon_seamless", label: "DWD ICON" },
    { key: "ecmwf_ifs025", label: "ECMWF IFS" },
    { key: "ukmo_seamless", label: "UK Met Office" },
  ],
  FR: [
    { key: "meteofrance_seamless", label: "Météo-France" },
    { key: "ecmwf_ifs025", label: "ECMWF IFS" },
    { key: "icon_seamless", label: "DWD ICON" },
  ],
  KR: [
    { key: "kma_seamless", label: "KMA" },
    { key: "ecmwf_ifs025", label: "ECMWF IFS" },
    { key: "jma_seamless", label: "JMA" },
  ],
  CN: [
    { key: "cma_grapes_global", label: "CMA GRAPES" },
    { key: "ecmwf_ifs025", label: "ECMWF IFS" },
    { key: "gfs_seamless", label: "NOAA GFS" },
  ],
};

const DEFAULT_MODELS = [
  { key: "ecmwf_ifs025", label: "ECMWF IFS" },
  { key: "gfs_seamless", label: "NOAA GFS" },
  { key: "icon_seamless", label: "DWD ICON" },
];

const ALWAYS_INCLUDE = [
  { key: "ecmwf_ifs025", label: "ECMWF IFS" },
  { key: "gfs_seamless", label: "NOAA GFS" },
];

export function modelsForCountry(code?: string) {
  const base = code
    ? MODELS_BY_REGION[code.toUpperCase()] ?? DEFAULT_MODELS
    : DEFAULT_MODELS;
  // Always return ECMWF + GFS first so the UI tabs have a stable default even
  // in country-routed requests that might otherwise drop one of them.
  const seen = new Set<string>();
  const out: { key: string; label: string }[] = [];
  for (const m of [...ALWAYS_INCLUDE, ...base]) {
    if (seen.has(m.key)) continue;
    seen.add(m.key);
    out.push(m);
  }
  return out;
}

export async function fetchOpenMeteo(
  lat: number,
  lon: number,
  countryCode?: string
): Promise<ModelForecast[]> {
  const models = modelsForCountry(countryCode);
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: "temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "10",
    models: models.map((m) => m.key).join(","),
  });
  // Open-Meteo via the project's CORS proxy (added in vercel.json +
  // vite.config.ts). Dropping the Next-specific `next: { revalidate }` since
  // this is a plain fetch in a Vite app.
  const res = await fetch(`/api/open-meteo/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const data = await res.json();

  // With `models=a,b,c`, Open-Meteo returns each metric suffixed with the
  // model key (e.g. `temperature_2m_max_gfs_seamless`). With a single model
  // there is no suffix. Normalise both into per-model point arrays.
  const daily = data?.daily ?? {};
  const dates: string[] = daily.time ?? [];

  return models.map((m) => {
    const hiKey =
      models.length === 1
        ? "temperature_2m_max"
        : `temperature_2m_max_${m.key}`;
    const loKey =
      models.length === 1
        ? "temperature_2m_min"
        : `temperature_2m_min_${m.key}`;
    const highs: (number | null)[] = daily[hiKey] ?? [];
    const lows: (number | null)[] = daily[loKey] ?? [];
    return {
      model: m.key,
      label: m.label,
      points: dates.map((date, i) => ({
        date,
        highC: highs[i] ?? null,
        lowC: lows[i] ?? null,
      })),
    };
  });
}
