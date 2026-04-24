"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "weatherverse:watchlist:v1";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota/errors: silently drop, not load-bearing */
  }
}

// Simple cross-tab-synced string set keyed in localStorage. Each entry is a
// cityKey (the same string used by TempMarket / the Globe's point data).
export function useWatchlist() {
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    // Hydrate from localStorage on mount and keep in sync across tabs. The
    // initial read must happen in an effect (not useState's lazy init) so
    // SSR and client match; the lint rule flags this but it's the correct
    // pattern for localStorage-backed state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCities(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setCities(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((cityKey: string) => {
    setCities((prev) => {
      if (prev.includes(cityKey)) return prev;
      const next = [...prev, cityKey];
      write(next);
      return next;
    });
  }, []);

  const remove = useCallback((cityKey: string) => {
    setCities((prev) => {
      const next = prev.filter((c) => c !== cityKey);
      write(next);
      return next;
    });
  }, []);

  const toggle = useCallback(
    (cityKey: string) => {
      setCities((prev) => {
        const next = prev.includes(cityKey)
          ? prev.filter((c) => c !== cityKey)
          : [...prev, cityKey];
        write(next);
        return next;
      });
    },
    []
  );

  const has = useCallback(
    (cityKey: string) => cities.includes(cityKey),
    [cities]
  );

  return { cities, add, remove, toggle, has };
}
