import type { WatchWallet } from "./types";

/** Hosts allowed when parsing pasted Polymarket links (SSRF guard). */
export const ALLOWED_PUBLIC_HOSTS = new Set([
  "polymarket.com",
  "www.polymarket.com",
]);

/** Upstream API hosts used by adapters (server allowlist). */
export const ALLOWED_API_HOSTS = new Set([
  "gamma-api.polymarket.com",
  "clob.polymarket.com",
  "data-api.polymarket.com",
]);

export const DISPLAY_TZ = "Asia/Singapore";
export const DISPLAY_TZ_LABEL = "SGT";

export const ADAPTER_VERSIONS = {
  gammaEvents: "gammaEventsV1@2026-11-06",
  clobPrices: "clobPricesV1@2026-11-06",
  clobBook: "clobBookV1@2026-11-06",
  dataTrades: "dataTradesV2@2026-11-06",
  modelFair: "modelFairUnavailable@2026-11-06",
} as const;

export const TRADE_PAGE_LIMIT = 100;
export const TRADE_MAX_PAGES = 8; // 800 trades max per load
export const SEARCH_DEBOUNCE_MS = 280;

export interface ExplorerPreset {
  id: string;
  label: string;
  /** Prefill resolve input — same path as paste/keyword. */
  resolveRaw: string;
  resolveKind: "slug" | "keyword" | "url";
  marketKindPrefer?: string[];
  watchPresetGroup?: string;
}

export const EXPLORER_PRESETS: ExplorerPreset[] = [
  {
    id: "lol-t1-kc-worlds-qa",
    label: "LoL QA: KC vs T1",
    resolveRaw: "lol-kc-t1-2026-11-04",
    resolveKind: "slug",
    marketKindPrefer: ["series_match_winner", "binary"],
    watchPresetGroup: "lol-paper-book",
  },
];

export const WATCH_PRESETS: Record<string, WatchWallet[]> = {
  "lol-paper-book": [
    {
      id: "gooo",
      label: "Gooo",
      handle: "@Gooooooollllllllll",
      addresses: ["0xda3a9b7afff7b44ad4fd75308723194e0a11381f"],
      identityVerification: "verified",
      profileUrl: "https://polymarket.com/@Gooooooollllllllll",
      presetGroup: "lol-paper-book",
    },
    {
      id: "edward",
      label: "Edward",
      handle: "@Edwardkang3080",
      addresses: ["0x0bf840764ca2efac73ba45dbc67142fdd91403b2"],
      identityVerification: "verified",
      profileUrl: "https://polymarket.com/@Edwardkang3080",
      presetGroup: "lol-paper-book",
    },
    {
      id: "mei",
      label: "Mei",
      handle: "@MeiGuNiuBi",
      addresses: ["0xdd882a70680633a75516f6ed5fce443e2d96dadb"],
      identityVerification: "verified",
      profileUrl: "https://polymarket.com/@MeiGuNiuBi",
      presetGroup: "lol-paper-book",
    },
    {
      id: "herbert",
      label: "Herbert",
      handle: "@JUSTINHERBERTMVP",
      addresses: ["0x86e99faea12fccd8925de5d9f052471baf7a4cdf"],
      identityVerification: "verified",
      profileUrl: "https://polymarket.com/@JUSTINHERBERTMVP",
      presetGroup: "lol-paper-book",
    },
    {
      id: "grebby",
      label: "grebby",
      handle: "@grebby",
      addresses: [
        "0xa882fb71aa1967a6a8aa11375f8abd5fee5bdd6a",
        "0x59847267e2a004e3886d7a02ac53778c5ea176eb",
      ],
      identityVerification: "unverified",
      profileUrl: "https://polymarket.com/@grebby",
      presetGroup: "lol-paper-book",
    },
    {
      id: "dancingmonkey1",
      label: "dancingmonkey1",
      handle: "@dancingmonkey1",
      addresses: ["0xce0871a82a7799ace36ab2fcd08f95b21cdf510b"],
      identityVerification: "unverified",
      profileUrl: "https://polymarket.com/@dancingmonkey1",
      presetGroup: "lol-paper-book",
    },
  ],
};

export function getWatchList(presetGroup?: string | null): WatchWallet[] {
  if (!presetGroup) return [];
  return WATCH_PRESETS[presetGroup] ?? [];
}
