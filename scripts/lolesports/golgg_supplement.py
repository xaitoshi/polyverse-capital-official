"""gol.gg thin-row supplement after OE cutoff. Match results + lineups only — no GD@15/player combat stats."""
from __future__ import annotations

import re
import sqlite3
from pathlib import Path

import pandas as pd

def _compact(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def build_name_map(oe_teams: set[str], gg_teams: set[str]) -> dict[str, str]:
    """Map gol.gg team name -> OE canonical name when uniquely matchable."""
    oe_by_c = {}
    for t in oe_teams:
        c = _compact(t)
        oe_by_c.setdefault(c, []).append(t)
    # manual aliases for known OE/gol.gg spelling gaps
    manual = {
        "dpluskia": "Dplus Kia",
        "anyonesslegend": "Anyone's Legend",  # Anyone s Legend
        "anyoneslegend": "Anyone's Legend",
        "ctbcflyingoyster": "CTBC Flying Oyster",
        "teamsecretwhales": "Team Secret Whales",
        "hanwhalifeesports": "Hanwha Life Esports",
        "bilibiligaming": "Bilibili Gaming",
        "invictusgaming": "Invictus Gaming",
        "topesports": "Top Esports",
        "karminecorp": "Karmine Corp",
        "movistarkoi": "Movistar KOI",
        "g2esports": "G2 Esports",
        "teamliquid": "Team Liquid",
        "losgrandes": "Los Grandes",
    }
    # resolve manual to actual OE names present
    oe_lookup = { _compact(t): t for t in oe_teams }
    out = {}
    for g in gg_teams:
        c = _compact(g)
        if c in oe_by_c and len(oe_by_c[c]) == 1:
            out[g] = oe_by_c[c][0]
            continue
        if c in manual and _compact(manual[c]) in oe_lookup:
            out[g] = oe_lookup[_compact(manual[c])]
            continue
        # fuzzy: oe name compact contained / equal ignoring apostrophe
        hits = [t for t in oe_teams if _compact(t) == c]
        if len(hits) == 1:
            out[g] = hits[0]
    return out


def load_golgg_maps(maps_db: str | Path, after_date: str) -> pd.DataFrame:
    """Load gol.gg maps with date > after_date (exclusive). Thin rows: no golddiffat15."""
    con = sqlite3.connect(str(maps_db))
    q = """
    SELECT gameid, date, league, tournament, patch, game, team, opponent, side, result,
           gamelength, golddiffat15, firstblood, firsttower, firstdragon, firstherald, firstbaron,
           player_top, player_jng, player_mid, player_bot, player_sup
    FROM maps
    WHERE date IS NOT NULL AND date > ?
    ORDER BY date, gameid
    """
    df = pd.read_sql(q, con, params=[after_date[:19]])
    con.close()
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date", "team", "opponent", "result"])
    # mark provenance
    df["source"] = "golgg"
    df["firstPick"] = pd.NA  # unavailable on gol.gg page-game scrape
    # Explicitly null combat early stats that OE would have — never invent
    for col in ["golddiffat15", "firstdragon", "firstherald", "firstbaron"]:
        if col in df.columns:
            # keep scraped values if present, else null; gol.gg leaves these null
            pass
    return df


def summarize_extension(df: pd.DataFrame, name_map: dict[str, str]) -> dict:
    if df.empty:
        return {
            "maps": 0,
            "match_results_through": None,
            "tournaments": [],
            "notable_series": [],
            "unmapped_teams": [],
        }
    teams = set(df.team) | set(df.opponent)
    unmapped = sorted(t for t in teams if t not in name_map)
    # series summaries for Worlds QF etc.
    notable = []
    w = df[df.league.astype(str).str.contains("World", case=False, na=False)]
    if not w.empty:
        # blue-side unique maps
        blue = w[w.side == "Blue"]
        for (date, t, o), g in blue.groupby([blue.date.dt.strftime("%Y-%m-%d"), "team", "opponent"]):
            tw = int((g.result == 1).sum())
            tl = int((g.result == 0).sum())
            notable.append({
                "date": date,
                "team": name_map.get(t, t),
                "opponent": name_map.get(o, o),
                "map_score": f"{tw}-{tl}",
                "source": "golgg",
            })
    return {
        "maps": int(len(df)),
        "match_results_through": df.date.max().strftime("%Y-%m-%d"),
        "tournaments": sorted(df.tournament.dropna().unique().tolist()),
        "notable_series": notable[-20:],
        "unmapped_teams": unmapped,
    }
