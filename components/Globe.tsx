"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import * as THREE from "three";
import type { GlobeMethods } from "react-globe.gl";
import type { TempMarket } from "@/lib/polymarket";

// react-globe.gl pulls three.js and expects the DOM, so it must be client-only.
// We resolve the default export explicitly because some bundlers (including
// turbopack) don't consistently unwrap it when handed the module record.
const GlobeGL = dynamic(
  () => import("react-globe.gl").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-[0.3em] text-ink-dim">
        ● booting globe<span className="blink">_</span>
      </div>
    ),
  }
);

type CityPin = {
  cityKey: string;
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  color: string;
  size: number;
  marketCount: number;
  activeCount: number;
  volume: number;
};

// Continent palette. Each color doubles as the country fill tint and the
// label accent so the eye links a land mass to its label at a glance.
const CONTINENT_COLORS: Record<string, string> = {
  "North America": "#5ef1ff", // cyan
  "South America": "#ff5ecc", // magenta
  Europe: "#ffb947", // amber
  Africa: "#ff7a5e", // coral
  Asia: "#7dff9b", // phosphor green
  Oceania: "#c56eff", // violet
  Antarctica: "#e8f4ff", // ice
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const n =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Rough centroid labels for the continents. Good enough for a diegetic
// "sci-fi map" feel without pulling in a real GeoJSON-with-centroids file.
const CONTINENTS = [
  { name: "NORTH AMERICA", key: "North America", lat: 45, lng: -100 },
  { name: "SOUTH AMERICA", key: "South America", lat: -14, lng: -60 },
  { name: "EUROPE", key: "Europe", lat: 54, lng: 15 },
  { name: "AFRICA", key: "Africa", lat: 2, lng: 21 },
  { name: "ASIA", key: "Asia", lat: 45, lng: 95 },
  { name: "OCEANIA", key: "Oceania", lat: -25, lng: 140 },
  { name: "ANTARCTICA", key: "Antarctica", lat: -82, lng: 0 },
];

function groupByCity(markets: TempMarket[]): CityPin[] {
  const map = new Map<string, CityPin>();
  for (const m of markets) {
    const existing = map.get(m.cityKey);
    const hiColor = m.kind === "high" ? "#ffb947" : "#5ef1ff";
    const isActive = !m.closed;
    if (!existing) {
      map.set(m.cityKey, {
        cityKey: m.cityKey,
        name: m.city.name,
        country: m.city.country,
        countryCode: m.city.countryCode,
        lat: m.city.lat,
        lng: m.city.lon,
        color: isActive ? hiColor : "#7fa990",
        size: 0.4,
        marketCount: 1,
        activeCount: isActive ? 1 : 0,
        volume: m.volume,
      });
    } else {
      existing.marketCount += 1;
      if (isActive) existing.activeCount += 1;
      existing.volume += m.volume;
      if (isActive) existing.color = hiColor;
    }
  }
  for (const pin of map.values()) {
    const v = Math.max(1, pin.volume);
    pin.size = 0.35 + Math.log10(v) * 0.08;
  }
  return [...map.values()];
}

type GeoFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

type Props = {
  markets: TempMarket[];
  selectedCityKey: string | null;
  onSelectCity: (cityKey: string) => void;
};

export default function Globe({ markets, selectedCityKey, onSelectCity }: Props) {
  const pins = useMemo(() => groupByCity(markets), [markets]);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 600, h: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [countries, setCountries] = useState<GeoFeature[]>([]);

  // Dark phosphor sphere material — the hex polygons sit on top in cyan so the
  // base only needs to absorb light and provide a faint blue glow behind them.
  const globeMaterial = useMemo(() => {
    return new THREE.MeshPhongMaterial({
      color: 0x061423,
      emissive: 0x07192e,
      specular: 0x1a3a5a,
      shininess: 8,
      transparent: true,
      opacity: 0.95,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/earth/countries.geojson")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setCountries(data.features ?? []);
      })
      .catch(() => !cancelled && setCountries([]));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(320, Math.floor(rect.height));
      setSize({ w, h });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls?.() as
      | {
          autoRotate: boolean;
          autoRotateSpeed: number;
          enableDamping: boolean;
          dampingFactor: number;
          enabled: boolean;
          enableRotate: boolean;
          enableZoom: boolean;
          enablePan: boolean;
          minDistance: number;
          maxDistance: number;
        }
      | undefined;
    if (controls) {
      controls.enabled = true;
      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.enablePan = false;
      controls.minDistance = 180;
      controls.maxDistance = 600;
      controls.autoRotate = !selectedCityKey;
      controls.autoRotateSpeed = 0.35;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
    }
  }, [selectedCityKey, pins.length]);

  useEffect(() => {
    if (!selectedCityKey) return;
    const g = globeRef.current;
    const pin = pins.find((p) => p.cityKey === selectedCityKey);
    if (g && pin) {
      g.pointOfView({ lat: pin.lat, lng: pin.lng, altitude: 1.6 }, 1200);
    }
  }, [selectedCityKey, pins]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <div className="globe-glow pointer-events-none absolute inset-0" />
      <GlobeGL
        ref={globeRef}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        globeMaterial={globeMaterial}
        showAtmosphere
        atmosphereColor="#5ef1ff"
        atmosphereAltitude={0.25}
        // Countries rendered as translucent filled polygons with bright
        // neon borders — a "heads-up display" look rather than a data-dot
        // aesthetic. Each continent gets its own tint.
        polygonsData={countries}
        polygonCapColor={(f: object) => {
          const cont = (f as GeoFeature).properties?.CONTINENT as
            | string
            | undefined;
          const base = (cont && CONTINENT_COLORS[cont]) || "#5ef1ff";
          return hexToRgba(base, 0.22);
        }}
        polygonSideColor={(f: object) => {
          const cont = (f as GeoFeature).properties?.CONTINENT as
            | string
            | undefined;
          const base = (cont && CONTINENT_COLORS[cont]) || "#5ef1ff";
          return hexToRgba(base, 0.35);
        }}
        polygonStrokeColor={(f: object) => {
          const cont = (f as GeoFeature).properties?.CONTINENT as
            | string
            | undefined;
          return (cont && CONTINENT_COLORS[cont]) || "#5ef1ff";
        }}
        polygonAltitude={0.008}
        // Continent labels as HTML "HUD badges" — a solid dark pill with
        // colored border/text so they read clearly on top of the filled
        // country polygons no matter the background luminance.
        htmlElementsData={CONTINENTS}
        htmlLat={(d: object) => (d as (typeof CONTINENTS)[number]).lat}
        htmlLng={(d: object) => (d as (typeof CONTINENTS)[number]).lng}
        htmlAltitude={0.08}
        htmlElement={(d: object) => {
          const c = d as (typeof CONTINENTS)[number];
          const color = CONTINENT_COLORS[c.key] ?? "#ffffff";
          const el = document.createElement("div");
          el.textContent = c.name;
          el.style.cssText = `
            font-family: ui-monospace, 'JetBrains Mono', monospace;
            font-weight: 600;
            font-size: 10px;
            line-height: 1;
            letter-spacing: 0.3em;
            padding: 5px 9px;
            color: ${color};
            background: rgba(4, 10, 18, 0.82);
            border: 1px solid ${hexToRgba(color, 0.7)};
            border-radius: 2px;
            box-shadow:
              0 0 0 1px rgba(0,0,0,0.5),
              0 0 10px ${hexToRgba(color, 0.35)},
              inset 0 0 6px ${hexToRgba(color, 0.15)};
            text-shadow: 0 0 6px ${hexToRgba(color, 0.7)};
            white-space: nowrap;
            transform: translate(-50%, -50%);
            backdrop-filter: blur(2px);
            pointer-events: none;
            user-select: none;
          `;
          return el;
        }}
        pointsData={pins}
        pointLat={(d: object) => (d as CityPin).lat}
        pointLng={(d: object) => (d as CityPin).lng}
        pointColor={(d: object) => (d as CityPin).color}
        pointAltitude={(d: object) =>
          (d as CityPin).cityKey === selectedCityKey ? 0.05 : 0.015
        }
        pointRadius={(d: object) => (d as CityPin).size}
        pointLabel={(d: object) => {
          const p = d as CityPin;
          return `
          <div style="
            font-family: ui-monospace, 'JetBrains Mono', monospace;
            background: rgba(4, 12, 10, 0.92);
            border: 1px solid rgba(94, 241, 255, 0.45);
            color: #c8f2d8;
            padding: 6px 10px;
            font-size: 11px;
            letter-spacing: 0.08em;
          ">
            <div style="color:#5ef1ff; text-transform: uppercase;">${p.name}</div>
            <div style="opacity:0.7;">${p.country}</div>
            <div style="color:#ffb947; margin-top:4px;">
              ${p.activeCount} active · ${p.marketCount} total
            </div>
          </div>
        `;
        }}
        onPointClick={(d: object) => onSelectCity((d as CityPin).cityKey)}
      />
    </div>
  );
}
