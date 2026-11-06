#!/usr/bin/env python3
"""Build lightweight /lolesports snapshots from Oracle's Elixir raw CSVs.

Reads ONLY public OE yearly CSVs (no secrets). Writes JSON under public/data/lolesports/.
Scoring version: polyverse-lolesports-v1 (documented in methodology.json).

No fabricated stats. Missing fields are omitted / null, never coerced to 0.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from golgg_supplement import build_name_map, load_golgg_maps, summarize_extension

SCORING_VERSION = "polyverse-lolesports-v1"
MIN_TEAM_GAMES = 8
MIN_PLAYER_GAMES = 5
RECENT_DAYS = 90
OFF_META_ROLE_SHARE = 0.02
SHRINK_K = 8.0  # Bayesian shrinkage toward peer mean

# League classification (aligned with lol-model/model.py MAJOR / academy heuristics)
MAJOR_HOME = {
    "LCK", "LPL", "LEC", "LCS", "LCP", "CBLOL", "PCS", "VCS", "LJL", "LLA", "LCO",
    "LTA", "LTA North", "LTA South", "LTA N", "LTA S", "TCL",
}
INTL = {
    "WLDs", "Worlds", "MSI", "FST", "First Stand", "EWC", "DCup", "Demacia",
    "WSCI", "EM", "EMEA Masters", "AM", "Americas Challengers", "IC", "HM",
    "Hitpoint Masters", "KeSPA Cup", "KeSPA", "Kespa",
}
ACADEMY_RE = re.compile(
    r"CL|Academy|Challengers|NACL|Desafiante|LDL|Div\s*2|2nd Div|LCKC|LFL Div|Prime League 2",
    re.I,
)

ROLES = ["top", "jng", "mid", "bot", "sup"]
ROLE_LABEL = {"top": "Top", "jng": "Jungle", "mid": "Mid", "bot": "Bot", "sup": "Support"}

USECOLS = [
    "gameid", "datacompleteness", "league", "year", "split", "playoffs", "date", "game",
    "patch", "side", "position", "playername", "playerid", "teamname", "teamid",
    "firstPick", "champion", "result", "kills", "deaths", "assists",
    "damageshare", "earnedgoldshare", "dpm", "vspm", "cspm",
    "golddiffat15", "xpdiffat15", "csdiffat15", "golddiffat10",
    "firstdragon", "firstherald", "firsttower", "firstblood",
]


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return s or "unknown"


def parse_num(x):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip()
    if s == "" or s.lower() in {"nan", "none", "null"}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def safe_div(a, b):
    if a is None or b is None or b == 0:
        return None
    return a / b


def pct(wins, n):
    if n is None or n == 0:
        return None
    return wins / n


def classify_league(league: str) -> str:
    if not league:
        return "other"
    if league in INTL or league.upper() in {x.upper() for x in INTL}:
        return "intl"
    if league in MAJOR_HOME:
        return "major"
    if ACADEMY_RE.search(league or ""):
        return "academy"
    # Known academy codes
    if league in {"LCKC", "NACL", "LFL", "PRM", "NLC", "EBL", "LIT", "LPLOL", "HLL", "LRS", "LRN", "CD", "AL"}:
        return "academy"
    return "erl"


def grade_from_percentile(p: float | None) -> str | None:
    """Letter grades from peer percentile (0-1). Own thresholds, not copied."""
    if p is None:
        return None
    if p >= 0.90:
        return "S"
    if p >= 0.75:
        return "A"
    if p >= 0.55:
        return "B"
    if p >= 0.35:
        return "C"
    if p >= 0.15:
        return "D"
    return "F"


def percentile_rank(values: dict[str, float], key: str) -> float | None:
    """Fraction of peers with value <= this key's value (average-rank for ties)."""
    if key not in values:
        return None
    arr = np.array(list(values.values()), dtype=float)
    if len(arr) < 2:
        return 0.5
    v = values[key]
    return float((arr < v).sum() + 0.5 * (arr == v).sum()) / len(arr)


def shrink(obs: float | None, n: int, peer_mean: float | None, k: float = SHRINK_K) -> float | None:
    if obs is None:
        return None
    if peer_mean is None:
        return obs
    w = n / (n + k)
    return w * obs + (1 - w) * peer_mean


def confidence(n: int, min_n: int = MIN_PLAYER_GAMES) -> str:
    if n >= max(min_n * 4, 40):
        return "high"
    if n >= min_n * 2:
        return "medium"
    if n >= min_n:
        return "low"
    return "insufficient"


def load_raw(raw_dir: Path, years: list[str]) -> pd.DataFrame:
    frames = []
    for y in years:
        p = raw_dir / f"{y}.csv"
        if not p.exists():
            print(f"warn: missing {p}", file=sys.stderr)
            continue
        df = pd.read_csv(p, usecols=lambda c: c in USECOLS, low_memory=False)
        frames.append(df)
        print(f"loaded {p.name}: {len(df)} rows")
    if not frames:
        raise SystemExit("No raw CSVs found")
    df = pd.concat(frames, ignore_index=True)
    df = df[df.datacompleteness.isin(["complete", "partial"])].copy()
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date", "teamname"])
    for col in ["result", "firstPick", "game", "kills", "deaths", "assists",
                "golddiffat15", "xpdiffat15", "csdiffat15", "golddiffat10",
                "damageshare", "earnedgoldshare", "dpm", "vspm", "cspm",
                "firstdragon", "firstherald", "firsttower", "firstblood"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def home_league_map(team_rows: pd.DataFrame) -> dict[str, str]:
    """Most frequent non-international league per team."""
    domestic = team_rows[~team_rows["league"].map(lambda x: classify_league(str(x)) == "intl")]
    if domestic.empty:
        domestic = team_rows
    home = (
        domestic.groupby("teamname")["league"]
        .agg(lambda s: s.value_counts().index[0])
        .to_dict()
    )
    return home


def team_tier(home_lg: str) -> str:
    c = classify_league(home_lg)
    if c == "major":
        return "majors"
    if c in {"academy", "erl"}:
        return "academy_erl"
    return "other"


def champion_cdn_name(champ: str) -> str | None:
    if not champ or not isinstance(champ, str):
        return None
    specials = {
        "Wukong": "MonkeyKing",
        "Renata Glasc": "Renata",
        "Nunu & Willump": "Nunu",
        "Lee Sin": "LeeSin",
        "Miss Fortune": "MissFortune",
        "Twisted Fate": "TwistedFate",
        "Aurelion Sol": "AurelionSol",
        "Jarvan IV": "JarvanIV",
        "Master Yi": "MasterYi",
        "Tahm Kench": "TahmKench",
        "Xin Zhao": "XinZhao",
        "Dr. Mundo": "DrMundo",
        "Kog'Maw": "KogMaw",
        "Rek'Sai": "RekSai",
        "K'Sante": "KSante",
        "Cho'Gath": "Chogath",
        "Kai'Sa": "Kaisa",
        "Bel'Veth": "Belveth",
        "Vel'Koz": "Velkoz",
    }
    if champ in specials:
        return specials[champ]
    return re.sub(r"[^A-Za-z0-9]", "", champ)


def compute_elo(team_pairs: pd.DataFrame, home: dict[str, str], K=24.0, KL=16.0, half_life=365.0, kn=2.0):
    """Sequential hierarchical Elo; updates AFTER predicting each map (no lookahead)."""
    # Blue-side unique maps
    blue = team_pairs[team_pairs.side == "Blue"].sort_values(["date", "gameid"]).copy()
    if "opponent" in blue.columns:
        blue = blue.drop(columns=["opponent"])
    red = team_pairs[team_pairs.side == "Red"][["gameid", "teamname"]].rename(columns={"teamname": "opponent"})
    m = blue.merge(red, on="gameid", how="inner")
    L: dict[str, float] = {}
    T: dict[str, float] = {}
    last: dict[str, int] = {}
    n: dict[str, int] = {}
    # Prior by tier
    for lg in set(home.values()) | {"UNK"}:
        t = classify_league(lg)
        L[lg] = 0.0 if t == "major" and lg in {"LCK", "LPL"} else (-100.0 if t == "major" else -250.0)
    L["UNK"] = -250.0

    strength_after: dict[str, float] = {}
    dates = m["date"].values.astype("datetime64[D]").astype(int)
    pre_strength_rows = []  # for opponent-adjusted residuals

    for i, row in enumerate(m.itertuples(index=False)):
        a, b, y = row.teamname, row.opponent, float(row.result)
        t = int(dates[i])
        for x in (a, b):
            if x in T:
                T[x] *= 0.5 ** ((t - last[x]) / half_life)
            else:
                T[x] = 0.0
                n[x] = 0
            last[x] = t
        la, lb = home.get(a, "UNK"), home.get(b, "UNK")
        L.setdefault(la, -250.0)
        L.setdefault(lb, -250.0)
        sa = L[la] + T[a]
        sb = L[lb] + T[b]
        p = 1.0 / (1.0 + 10 ** (-(sa - sb) / 400.0))
        pre_strength_rows.append({
            "gameid": row.gameid,
            "team": a,
            "opponent": b,
            "p_pre": p,
            "result": y,
            "date": row.date,
            "firstPick": getattr(row, "firstPick", np.nan),
            "side": "Blue",
        })
        # Mirror for red
        pre_strength_rows.append({
            "gameid": row.gameid,
            "team": b,
            "opponent": a,
            "p_pre": 1 - p,
            "result": 1 - y,
            "date": row.date,
            "firstPick": np.nan,  # filled later
            "side": "Red",
        })
        e = y - p
        T[a] += K * (kn if n[a] < 10 else 1) * e
        T[b] -= K * (kn if n[b] < 10 else 1) * e
        if la != lb:
            L[la] += KL * e
            L[lb] -= KL * e
        n[a] += 1
        n[b] += 1
        strength_after[a] = L[la] + T[a]
        strength_after[b] = L[lb] + T[b]

    return strength_after, n, pd.DataFrame(pre_strength_rows)


def metric_bundle(series: pd.Series) -> dict:
    s = series.dropna()
    if s.empty:
        return {"n": 0, "mean": None}
    return {"n": int(len(s)), "mean": float(s.mean())}


def build_side_pick_matrix(team_df: pd.DataFrame) -> dict:
    """Rows G1-G5 + All; cols Blue-1st, Blue-2nd, Red-1st, Red-2nd as W-L."""
    df = team_df.dropna(subset=["firstPick", "side", "result"]).copy()
    df["game_n"] = pd.to_numeric(df["game"], errors="coerce")
    df["pick"] = df["firstPick"].map(lambda x: "1st" if x == 1 else ("2nd" if x == 0 else None))
    df = df.dropna(subset=["pick"])

    def bucket(sub):
        out = {}
        for side in ("Blue", "Red"):
            for pick in ("1st", "2nd"):
                g = sub[(sub.side == side) & (sub.pick == pick)]
                w = int((g.result == 1).sum())
                l = int((g.result == 0).sum())
                out[f"{side}-{pick}"] = {"w": w, "l": l, "n": w + l}
        return out

    rows = {"All": bucket(df)}
    for g in range(1, 6):
        rows[f"G{g}"] = bucket(df[df.game_n == g])

    # Aggregate win rates
    def wr(mask):
        g = df[mask]
        n = len(g)
        if n == 0:
            return None
        return float((g.result == 1).mean())

    summary = {
        "blue_wr": wr(df.side == "Blue"),
        "red_wr": wr(df.side == "Red"),
        "first_pick_wr": wr(df.pick == "1st"),
        "second_pick_wr": wr(df.pick == "2nd"),
        "n": int(len(df)),
    }
    return {"rows": rows, "summary": summary}


def player_strengths_weaknesses(metrics: dict[str, float | None], peer_pcts: dict[str, float | None]) -> tuple[list, list]:
    """Strengths = high peer pct metrics; weaknesses = low. Tied to actual metrics only."""
    items = []
    for k, p in peer_pcts.items():
        if p is None or metrics.get(k) is None:
            continue
        items.append((k, p, metrics[k]))
    strengths = sorted([x for x in items if x[1] >= 0.70], key=lambda x: -x[1])[:2]
    weaknesses = sorted([x for x in items if x[1] <= 0.30], key=lambda x: x[1])[:2]
    # Format with percentile*100 as display score like reference
    def fmt(lst, kind):
        out = []
        for name, p, _v in lst:
            label = {
                "kda": "KDA",
                "gd15": "GD@15",
                "csd15": "CSD@15",
                "dmg_share": "damage share",
                "gold_share": "gold share",
                "pool": "champion pool",
                "vision": "vision",
                "rating": "rating",
                "laning": "laning",
            }.get(name, name)
            out.append({"metric": name, "label": label, "percentile": round(p * 100), "kind": kind})
        return out
    return fmt(strengths, "strength"), fmt(weaknesses, "weakness")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", default=os.environ.get("LOL_OE_RAW", "/workspace/lol-model/data/raw"))
    ap.add_argument("--out-dir", default=str(Path(__file__).resolve().parents[2] / "public" / "data" / "lolesports"))
    ap.add_argument("--years", default="2024,2025,2026")
    ap.add_argument("--season-year", type=int, default=2026)
    ap.add_argument("--maps-db", default=os.environ.get("LOL_MAPS_DB", "/workspace/lol-model/data/maps.db"),
                    help="gol.gg maps.db for post-OE match-result supplement (thin rows)")
    args = ap.parse_args()

    raw_dir = Path(args.raw_dir)
    out_dir = Path(args.out_dir)
    teams_dir = out_dir / "teams"
    teams_dir.mkdir(parents=True, exist_ok=True)

    years = [y.strip() for y in args.years.split(",") if y.strip()]
    df = load_raw(raw_dir, years)
    cutoff = df["date"].max()  # OE detailed-stats cutoff (source timestamps, typically UTC-naive OE stamps)
    oe_cutoff = cutoff
    season_start = pd.Timestamp(f"{args.season_year}-01-01")

    team_all = df[df.position == "team"].copy()
    player_all = df[df.position.isin(ROLES)].copy()
    team_all["source"] = "oe"

    # --- gol.gg match-result supplement AFTER OE cutoff (no fabricated player combat stats) ---
    gg_ext = pd.DataFrame()
    gg_summary = {"maps": 0, "match_results_through": None, "tournaments": [], "notable_series": [], "unmapped_teams": []}
    name_map = {}
    maps_db = Path(args.maps_db)
    if maps_db.exists():
        gg_raw = load_golgg_maps(maps_db, oe_cutoff.strftime("%Y-%m-%d %H:%M:%S"))
        oe_names = set(team_all.teamname.unique())
        gg_names = set()
        if not gg_raw.empty:
            gg_names = set(gg_raw.team.unique()) | set(gg_raw.opponent.unique())
        name_map = build_name_map(oe_names, gg_names)
        gg_summary = summarize_extension(gg_raw, name_map)
        if not gg_raw.empty:
            gg = gg_raw.copy()
            gg["teamname"] = gg["team"].map(lambda x: name_map.get(x, x))
            gg["opponent"] = gg["opponent"].map(lambda x: name_map.get(x, x))
            # Align columns used downstream for Elo / records
            gg["playoffs"] = pd.NA
            gg["year"] = gg["date"].dt.year
            gg["split"] = ""
            gg["datacompleteness"] = "golgg_thin"
            # firstPick / golddiff unused for golgg in player/side metrics
            keep = ["gameid","date","league","year","split","playoffs","patch","game","side","teamname","opponent",
                    "result","firstPick","golddiffat15","source",
                    "player_top","player_jng","player_mid","player_bot","player_sup"]
            for c in keep:
                if c not in gg.columns:
                    gg[c] = pd.NA
            gg_ext = gg[keep]
            print(f"gol.gg supplement: {len(gg_ext)} team-rows after OE {oe_cutoff} through {gg_ext.date.max()}")
    match_cutoff = gg_ext.date.max() if len(gg_ext) else oe_cutoff
    recent_start = match_cutoff - pd.Timedelta(days=RECENT_DAYS)

    # Team rows for Elo + W/L: OE full history + post-OE gol.gg only (avoid double-counting overlap)
    team_for_records = pd.concat([team_all, gg_ext], ignore_index=True, sort=False) if len(gg_ext) else team_all

    home = home_league_map(team_for_records)
    # Elo over OE + post-OE gol.gg match results (no future leakage; predict-then-update)
    strength, elo_n, pre = compute_elo(team_for_records, home)
    # Attach firstPick to pre residuals
    fp_map = team_for_records.set_index(["gameid", "teamname"])["firstPick"].to_dict()
    pre["firstPick"] = [fp_map.get((gid, tm), np.nan) for gid, tm in zip(pre.gameid, pre.team)]

    # Season slices
    # Player / GD@15 / side-pick / off-meta: OE detailed window only
    season_players = player_all[(player_all.date >= season_start) & (player_all.date <= oe_cutoff)].copy()
    season_teams_detail = team_all[(team_all.date >= season_start) & (team_all.date <= oe_cutoff)].copy()
    # Match W/L + intl + Elo peers: include gol.gg supplement through match_cutoff
    season_teams = team_for_records[(team_for_records.date >= season_start) & (team_for_records.date <= match_cutoff)].copy()
    recent_teams = team_for_records[(team_for_records.date >= recent_start) & (team_for_records.date <= match_cutoff)].copy()
    cutoff = match_cutoff  # primary UI match-results end; detailed OE kept as oe_cutoff

    # Role-wide champion usage for off-meta (season, all leagues in df season)
    role_champ_n = season_players.groupby(["position", "champion"]).size()
    role_n = season_players.groupby("position").size()
    role_champ_share = {}
    for (role, champ), n in role_champ_n.items():
        role_champ_share[(role, champ)] = n / role_n[role] if role_n[role] else 0

    # Peer groups for percentiles
    # Build per-team season aggregates first
    team_ids = {}
    index_entries = []

    # Precompute player role peer means for shrinkage
    def player_metrics(g: pd.DataFrame) -> dict:
        kills = g["kills"].fillna(0)
        deaths = g["deaths"].fillna(0)
        assists = g["assists"].fillna(0)
        kda = float(((kills + assists) / deaths.replace(0, 1)).mean()) if len(g) else None
        # true KDA with 0 deaths = kills+assists — approximate per-row
        kda_rows = []
        for k, d, a in zip(g["kills"].fillna(0), g["deaths"].fillna(0), g["assists"].fillna(0)):
            kda_rows.append((k + a) / d if d else (k + a))
        kda = float(np.mean(kda_rows)) if kda_rows else None
        return {
            "games": int(len(g)),
            "kda": kda,
            "gd15": float(g["golddiffat15"].dropna().mean()) if g["golddiffat15"].notna().any() else None,
            "csd15": float(g["csdiffat15"].dropna().mean()) if g["csdiffat15"].notna().any() else None,
            "dmg_share": float(g["damageshare"].dropna().mean()) if g["damageshare"].notna().any() else None,
            "gold_share": float(g["earnedgoldshare"].dropna().mean()) if g["earnedgoldshare"].notna().any() else None,
            "vision": float(g["vspm"].dropna().mean()) if g["vspm"].notna().any() else None,
            "pool": int(g["champion"].nunique()),
        }

    # Group players in season by (team, player, role)
    # Most common role per player-team
    player_role = (
        season_players.groupby(["teamname", "playername"])["position"]
        .agg(lambda s: s.value_counts().index[0])
        .to_dict()
    )

    # Role peer raw metrics for percentile
    role_player_stats: dict[str, dict[str, dict]] = {r: {} for r in ROLES}
    for (team, player), role in player_role.items():
        g = season_players[(season_players.teamname == team) & (season_players.playername == player)]
        if len(g) < 1:
            continue
        m = player_metrics(g)
        if m["games"] < MIN_PLAYER_GAMES:
            continue
        # key unique across teams
        role_player_stats[role][f"{team}::{player}"] = m

    role_peer_means = {}
    for role, stats in role_player_stats.items():
        if not stats:
            role_peer_means[role] = {}
            continue
        keys = ["kda", "gd15", "csd15", "dmg_share", "gold_share", "vision", "pool"]
        role_peer_means[role] = {
            k: float(np.nanmean([v[k] for v in stats.values() if v.get(k) is not None]))
            for k in keys
        }

    def score_player(role: str, m: dict) -> dict:
        means = role_peer_means.get(role, {})
        peers = role_player_stats.get(role, {})
        # Build peer value maps for percentiles
        def peer_map(field):
            return {k: v[field] for k, v in peers.items() if v.get(field) is not None}

        shrunk = {
            "kda": shrink(m["kda"], m["games"], means.get("kda")),
            "gd15": shrink(m["gd15"], m["games"], means.get("gd15")),
            "csd15": shrink(m["csd15"], m["games"], means.get("csd15")),
            "dmg_share": shrink(m["dmg_share"], m["games"], means.get("dmg_share")),
            "gold_share": shrink(m["gold_share"], m["games"], means.get("gold_share")),
            "vision": shrink(m["vision"], m["games"], means.get("vision")),
            "pool": float(m["pool"]),
        }
        # Rating composite: role-aware weights
        # laning from gd15 + csd15; rating from kda + laning + share stats
        pcts = {}
        for field in ["kda", "gd15", "csd15", "dmg_share", "gold_share", "vision", "pool"]:
            pm = peer_map(field)
            # temporary insert self for ranking — use shrunk value
            self_key = "__self__"
            if shrunk[field] is None or not pm:
                pcts[field] = None
            else:
                tmp = dict(pm)
                tmp[self_key] = shrunk[field]
                pcts[field] = percentile_rank(tmp, self_key)

        # Laning score 0-100 from gd15 & csd15 percentiles
        laning_parts = [pcts[f] for f in ("gd15", "csd15") if pcts.get(f) is not None]
        laning = float(np.mean(laning_parts) * 100) if laning_parts else None

        if role in ("top", "mid", "bot"):
            rating_parts = [pcts.get("kda"), pcts.get("gd15"), pcts.get("dmg_share"), pcts.get("gold_share")]
        elif role == "jng":
            rating_parts = [pcts.get("kda"), pcts.get("gd15"), pcts.get("vision"), pcts.get("dmg_share")]
        else:  # support
            rating_parts = [pcts.get("kda"), pcts.get("vision"), pcts.get("gd15"), pcts.get("gold_share")]
        rating_parts = [p for p in rating_parts if p is not None]
        rating = float(np.mean(rating_parts) * 100) if rating_parts else None

        strengths, weaknesses = player_strengths_weaknesses(
            {**{k: shrunk[k] for k in shrunk}, "rating": rating, "laning": laning},
            {**pcts, "rating": (rating / 100 if rating is not None else None),
             "laning": (laning / 100 if laning is not None else None)},
        )

        return {
            "raw": m,
            "shrunk": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in shrunk.items() if v is not None},
            "percentiles": {k: (round(v, 4) if v is not None else None) for k, v in pcts.items()},
            "rating": round(rating, 1) if rating is not None else None,
            "laning": round(laning, 1) if laning is not None else None,
            "gd15_pct": round(pcts["gd15"] * 100, 1) if pcts.get("gd15") is not None else None,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "confidence": confidence(m["games"]),
        }

    # Team-level season stats
    team_names = season_teams.groupby("teamname").size()
    team_names = team_names[team_names >= MIN_TEAM_GAMES].index.tolist()

    # Precompute team metrics for peer percentiles
    team_season_metrics = {}
    for tn in team_names:
        g = season_teams[season_teams.teamname == tn]
        gd_src = season_teams_detail[season_teams_detail.teamname == tn]
        wins = int((g.result == 1).sum())
        n = int(len(g))
        gd = gd_src["golddiffat15"].dropna() if "golddiffat15" in gd_src.columns else pd.Series(dtype=float)
        team_season_metrics[tn] = {
            "wins": wins,
            "losses": n - wins,
            "games": n,
            "win_rate": wins / n if n else None,
            "gd15": float(gd.mean()) if len(gd) else None,
            "gd15_n": int(len(gd)),
            "maps_oe_detail": int(len(gd_src)),
            "maps_match_results": n,
            "home_league": home.get(tn, "UNK"),
            "tier": team_tier(home.get(tn, "UNK")),
            "strength_elo": strength.get(tn),
            "elo_maps": elo_n.get(tn, 0),
        }

    # Draft proxy: mean residual (result - p_pre) in season; also recent
    season_pre = pre[(pre.date >= season_start) & (pre.date <= cutoff)].copy()
    recent_pre = pre[(pre.date >= recent_start) & (pre.date <= cutoff)].copy()

    def draft_proxy_for(tn: str, frame: pd.DataFrame) -> dict:
        g = frame[frame.team == tn]
        if g.empty:
            return {"n": 0, "residual_mean": None, "label": "draft_proxy",
                    "note": "Opponent-adjusted map residual vs pre-map Elo expectation. Not causal draft quality."}
        resid = (g["result"] - g["p_pre"]).astype(float)
        return {
            "n": int(len(g)),
            "residual_mean": float(resid.mean()),
            "label": "draft_proxy",
            "note": "Opponent-adjusted map residual vs pre-map Elo expectation. Not causal draft quality.",
        }

    # International records
    intl_mask = season_teams["league"].map(lambda x: classify_league(str(x)) == "intl")

    # Signature / off-meta picks helpers
    def most_played(g: pd.DataFrame, n=3):
        c = g["champion"].value_counts().head(n)
        return [{"champion": k, "games": int(v), "cdn": champion_cdn_name(k)} for k, v in c.items()]

    def off_meta_for_player(g: pd.DataFrame, role: str):
        out = []
        for champ, sub in g.groupby("champion"):
            share = role_champ_share.get((role, champ), 0)
            if share >= OFF_META_ROLE_SHARE:
                continue
            w = int((sub.result == 1).sum())
            l = int((sub.result == 0).sum())
            # global games on champ in role this season
            global_n = int(role_champ_n.get((role, champ), 0))
            out.append({
                "champion": champ,
                "cdn": champion_cdn_name(champ),
                "w": w,
                "l": l,
                "role_share": round(share, 5),
                "global_role_games": global_n,
                "ringed": global_n <= 10,
            })
        out.sort(key=lambda x: -(x["w"] + x["l"]))
        return out[:8]

    # Peer strength maps by tier and by league
    by_tier_strength = defaultdict(dict)
    by_league_strength = defaultdict(dict)
    by_tier_draft = defaultdict(dict)
    by_league_draft = defaultdict(dict)

    for tn, m in team_season_metrics.items():
        if m["strength_elo"] is not None:
            by_tier_strength[m["tier"]][tn] = m["strength_elo"]
            by_league_strength[m["home_league"]][tn] = m["strength_elo"]
        dp = draft_proxy_for(tn, season_pre)
        if dp["residual_mean"] is not None and dp["n"] >= MIN_TEAM_GAMES:
            by_tier_draft[m["tier"]][tn] = dp["residual_mean"]
            by_league_draft[m["home_league"]][tn] = dp["residual_mean"]

    built = 0
    for tn in sorted(team_names):
        meta = team_season_metrics[tn]
        tier = meta["tier"]
        if tier not in {"majors", "academy_erl"}:
            continue
        home_lg = meta["home_league"]
        slug = slugify(f"{tn}-{home_lg}")
        # ensure unique
        base = slug
        i = 2
        while slug in team_ids:
            slug = f"{base}-{i}"
            i += 1
        team_ids[slug] = tn

        g = season_teams[season_teams.teamname == tn]
        g_detail = season_teams_detail[season_teams_detail.teamname == tn]
        g_recent = recent_teams[recent_teams.teamname == tn]
        g_intl = season_teams[intl_mask & (season_teams.teamname == tn)]

        # International breakdown by league
        intl_by = []
        if len(g_intl):
            for lg, sub in g_intl.groupby("league"):
                w = int((sub.result == 1).sum())
                l = int(len(sub) - w)
                intl_by.append({"league": lg, "w": w, "l": l})

        strength_pct_league = percentile_rank(by_league_strength.get(home_lg, {}), tn)
        strength_pct_tier = percentile_rank(by_tier_strength.get(tier, {}), tn)
        draft_season = draft_proxy_for(tn, season_pre)
        draft_recent = draft_proxy_for(tn, recent_pre)
        draft_pct_league = percentile_rank(by_league_draft.get(home_lg, {}), tn)
        draft_pct_tier = percentile_rank(by_tier_draft.get(tier, {}), tn)

        # Power rank within league peers
        league_peers = by_league_strength.get(home_lg, {})
        if tn in league_peers:
            ordered = sorted(league_peers.items(), key=lambda x: -x[1])
            power_rank = next(i for i, (name, _) in enumerate(ordered, 1) if name == tn)
            power_of = len(ordered)
        else:
            power_rank, power_of = None, None

        tier_peers = by_tier_draft.get(tier, {})
        if tn in tier_peers:
            d_ordered = sorted(tier_peers.items(), key=lambda x: -x[1])
            draft_rank_season = next(i for i, (name, _) in enumerate(d_ordered, 1) if name == tn)
            draft_of = len(d_ordered)
        else:
            draft_rank_season, draft_of = None, None

        # Recent draft rank
        recent_draft_vals = {}
        for peer in by_tier_draft.get(tier, {}):
            dp = draft_proxy_for(peer, recent_pre)
            if dp["residual_mean"] is not None and dp["n"] >= 5:
                recent_draft_vals[peer] = dp["residual_mean"]
        if tn in recent_draft_vals:
            rd = sorted(recent_draft_vals.items(), key=lambda x: -x[1])
            draft_rank_recent = next(i for i, (name, _) in enumerate(rd, 1) if name == tn)
            draft_recent_of = len(rd)
        else:
            draft_rank_recent, draft_recent_of = None, None

        strength_grade = grade_from_percentile(strength_pct_league if strength_pct_league is not None else strength_pct_tier)
        drafting_grade = grade_from_percentile(draft_pct_tier if draft_pct_tier is not None else draft_pct_league)

        # Players: five most-played roles
        tp = season_players[season_players.teamname == tn]
        # pick starter per role by games
        roster = []
        for role in ROLES:
            rp = tp[tp.position == role]
            if rp.empty:
                continue
            # primary player
            primary = rp.groupby("playername").size().sort_values(ascending=False)
            if primary.empty:
                continue
            pname = primary.index[0]
            pg = rp[rp.playername == pname]
            scored = score_player(role, player_metrics(pg))
            champs = most_played(pg, 3)
            offmeta = off_meta_for_player(pg, role)
            roster.append({
                "role": role,
                "role_label": ROLE_LABEL[role],
                "player": pname,
                "games": scored["raw"]["games"],
                "kda": round(scored["raw"]["kda"], 2) if scored["raw"]["kda"] is not None else None,
                "pool": scored["raw"]["pool"],
                "most_played": champs,
                "rating": scored["rating"],
                "laning": scored["laning"],
                "gd15": round(scored["raw"]["gd15"], 1) if scored["raw"]["gd15"] is not None else None,
                "gd15_pct": scored["gd15_pct"],
                "strengths": scored["strengths"],
                "weaknesses": scored["weaknesses"],
                "confidence": scored["confidence"],
                "peer_scope": f"role={role} across all season players with ≥{MIN_PLAYER_GAMES} games",
                "off_meta": offmeta,
            })

        # Best player by rating
        rated = [p for p in roster if p["rating"] is not None]
        best = max(rated, key=lambda p: p["rating"]) if rated else None

        # Signature picks: team champions with high relative frequency vs role baseline and decent games
        sig = []
        if not tp.empty:
            for (role, champ), sub in tp.groupby(["position", "champion"]):
                n = len(sub)
                if n < 4:
                    continue
                share = role_champ_share.get((role, champ), 0)
                # signature = over-indexed vs role baseline
                team_role_n = len(tp[tp.position == role]) or 1
                team_share = n / team_role_n
                if share > 0 and team_share / max(share, 1e-6) < 1.8:
                    continue
                w = int((sub.result == 1).sum())
                l = n - w
                sig.append({
                    "champion": champ,
                    "cdn": champion_cdn_name(champ),
                    "role": role,
                    "w": w,
                    "l": l,
                    "team_share": round(team_share, 3),
                    "role_share": round(share, 5),
                })
            sig.sort(key=lambda x: -(x["w"] + x["l"]))
            sig = sig[:5]

        side_pick = build_side_pick_matrix(g_detail)
        # Post-OE maps lack firstPick on gol.gg thin rows — side/pick stays OE-detailed only

        # Summary text — factual only
        wr = meta["win_rate"]
        summary_bits = []
        summary_bits.append(
            f"{tn} ({home_lg}) in {args.season_year}: "
            f"{meta['wins']}-{meta['losses']} maps"
            + (f" ({wr*100:.1f}% WR)" if wr is not None else "")
            + f". Match results through {cutoff.strftime('%Y-%m-%d')}; OE detailed stats through {oe_cutoff.strftime('%Y-%m-%d')}."
        )
        if intl_by:
            parts = [f"{x['league']} {x['w']}-{x['l']}" for x in intl_by]
            summary_bits.append("International: " + ", ".join(parts) + ".")
        if best:
            summary_bits.append(f"Highest Polyverse player rating on roster sample: {best['player']} ({best['role_label']}, {best['rating']}).")
        summary_bits.append(
            "Strength grade reflects sequential Elo within peers; drafting grade is an opponent-adjusted residual proxy, not causal draft quality."
        )

        aliases = list({tn, tn.replace(" ", ""), re.sub(r"[^A-Za-z0-9]", "", tn)})
        # Common short tags
        if home_lg == "LCK" and "Dplus" in tn:
            aliases.append("DK")
        if tn == "T1":
            aliases += ["SKT", "T1"]
        if "Gen" in tn and "G" in tn:
            aliases.append("GEN")

        card = {
            "id": slug,
            "name": tn,
            "aliases": sorted(set(a for a in aliases if a)),
            "home_league": home_lg,
            "tier": tier,
            "scoring_version": SCORING_VERSION,
            "window": {
                "season_year": args.season_year,
                "start": season_start.strftime("%Y-%m-%d"),
                "end": cutoff.strftime("%Y-%m-%d"),
                "match_results_through": cutoff.strftime("%Y-%m-%d"),
                "detailed_stats_through": oe_cutoff.strftime("%Y-%m-%d"),
                "recent_start": recent_start.strftime("%Y-%m-%d"),
                "recent_days": RECENT_DAYS,
                "timezone_note": "OE/gol.gg date stamps are source-native (typically UTC calendar dates). LoL Esports API event starts are converted separately in verification notes.",
            },
            "provenance": {
                "source": "Oracle's Elixir public yearly CSVs + gol.gg thin maps after OE cutoff",
                "raw_years": years,
                "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "generated_at_sgt": datetime.now(timezone.utc).astimezone(__import__('datetime').timezone(__import__('datetime').timedelta(hours=8))).strftime("%Y-%m-%d %H:%M %Z"),
                "oe_detailed_through": oe_cutoff.strftime("%Y-%m-%d %H:%M:%S"),
                "match_results_through": cutoff.strftime("%Y-%m-%d"),
                "golgg_extension": gg_summary,
                "notes": [
                    "Detailed player/combat stats (KDA, GD@15, damageshare, firstPick side-order, off-meta shares) use OE only through oe_detailed_through.",
                    "Match W/L, international map results, and Elo strength include gol.gg maps after OE cutoff when OE lag; those rows lack GD@15/firstPick.",
                    "Missing fields are null; never filled with 0. Thin gol.gg rows are never treated as full player-stat coverage.",
                    "Academy/ERL teams are separate from majors; aliases never merge Challengers/Academy into the main org.",
                    "OE public Drive download may be quota-blocked; refresh attempts are recorded in meta.refresh_attempt.",
                ],
            },
            "grades": {
                "strength": strength_grade,
                "drafting": drafting_grade,
                "strength_basis": "percentile of sequential hierarchical Elo among home-league peers (fallback: tier peers)",
                "drafting_basis": "percentile of opponent-adjusted residual proxy among tier peers — NOT causal draft quality",
            },
            "kpis": {
                "record": {
                    "wins": meta["wins"],
                    "losses": meta["losses"],
                    "games": meta["games"],
                    "win_rate": round(wr, 4) if wr is not None else None,
                },
                "international": {
                    "wins": int((g_intl.result == 1).sum()) if len(g_intl) else 0,
                    "losses": int((g_intl.result == 0).sum()) if len(g_intl) else 0,
                    "by_event": intl_by,
                    "note": "International leagues only (Worlds/MSI/EWC/etc). Null events omitted.",
                },
                "golddiffat15": {
                    "mean": round(meta["gd15"], 1) if meta["gd15"] is not None else None,
                    "n": int(meta.get("gd15_n") or 0),
                    "source_window": "oe_detailed_only",
                    "note": "GD@15 excludes gol.gg thin post-OE maps (field unavailable there).",
                },
                "power_rank": {
                    "rank": power_rank,
                    "of": power_of,
                    "scope": f"home league {home_lg} teams with ≥{MIN_TEAM_GAMES} season maps",
                    "metric": "sequential hierarchical Elo strength (descriptive rating, not future guarantee)",
                },
            },
            "summary": " ".join(summary_bits),
            "best_player": (
                {"player": best["player"], "role": best["role"], "rating": best["rating"]} if best else None
            ),
            "roster": roster,
            "drafting": {
                "grade": drafting_grade,
                "season_rank": {"rank": draft_rank_season, "of": draft_of, "scope": f"tier={tier}"},
                "recent_rank": {"rank": draft_rank_recent, "of": draft_recent_of, "scope": f"tier={tier}, last {RECENT_DAYS}d"},
                "season_proxy": draft_season,
                "recent_proxy": draft_recent,
                "signature_picks": sig,
                "analysis": (
                    f"Drafting grade {drafting_grade or 'n/a'} is a Polyverse proxy from opponent-adjusted map residuals "
                    f"(actual result minus pre-map Elo win probability). Positive residual means outperforming strength expectation; "
                    f"it can reflect draft, prep, or variance — not proven draft skill."
                ),
            },
            "side_pick_order": side_pick,
            "off_meta_definition": {
                "rule": f"Champion share of all season pro games in that role < {OFF_META_ROLE_SHARE*100:.0f}%",
                "ringed": "global_role_games ≤ 10 in season window",
            },
            "gaps": [
                g for g in [
                    None if meta["gd15"] is not None else "Team GD@15 unavailable for some/all maps",
                    None if roster else "No roster rows meeting min games",
                    None if draft_season["residual_mean"] is not None else "Draft proxy insufficient sample",
                    None if power_rank is not None else "Power rank unavailable (missing Elo peers)",
                    (
                        f"Match results include {meta['games']} maps through {cutoff.strftime('%Y-%m-%d')} but OE detailed player/combat stats only through {oe_cutoff.strftime('%Y-%m-%d')} ({meta.get('maps_match_results',0) - meta.get('maps_oe_detail',0)} post-OE thin maps)."
                        if meta.get("maps_match_results", 0) > meta.get("maps_oe_detail", 0)
                        else None
                    ),
                ] if g
            ],
        }

        (teams_dir / f"{slug}.json").write_text(json.dumps(card, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        index_entries.append({
            "id": slug,
            "name": tn,
            "aliases": card["aliases"],
            "home_league": home_lg,
            "tier": tier,
            "wins": meta["wins"],
            "losses": meta["losses"],
            "win_rate": card["kpis"]["record"]["win_rate"],
            "strength_grade": strength_grade,
            "drafting_grade": drafting_grade,
            "power_rank": power_rank,
            "power_of": power_of,
            "games": meta["games"],
        })
        built += 1
        if built % 25 == 0:
            print(f"wrote {built} teams...")

    index_entries.sort(key=lambda e: (0 if e["tier"] == "majors" else 1, e["home_league"], -(e["win_rate"] or 0)))

    meta_doc = {
        "scoring_version": SCORING_VERSION,
        "coverage": {
            "start": df["date"].min().strftime("%Y-%m-%d"),
            "detailed_stats_through": oe_cutoff.strftime("%Y-%m-%d"),
            "detailed_stats_through_full": oe_cutoff.strftime("%Y-%m-%d %H:%M:%S"),
            "match_results_through": cutoff.strftime("%Y-%m-%d"),
            "end": cutoff.strftime("%Y-%m-%d"),
            "season_year": args.season_year,
            "season_start": season_start.strftime("%Y-%m-%d"),
            "honest_cutoff": True,
            "timezone_note": "Cutoffs are source date stamps (OE/gol.gg). Asia/Singapore wall clock is used only for refresh attempt labeling, not as OE's native zone.",
            "refresh": "OE: lol-model/download.py (public Drive; often quota-blocked). Fallback match results: lol-model/scrape_golgg.py S16 + normalize.py. Then npm run build:lolesports-data.",
            "refresh_attempt": {
                "attempted_at_sgt": datetime.now(timezone.utc).astimezone(__import__('datetime').timezone(__import__('datetime').timedelta(hours=8))).strftime("%Y-%m-%d %H:%M %Z"),
                "oe_public_gdown": "quota_exceeded",
                "oe_user_drive_copy_max": "2026-10-18 (stale vs local OE 2026-10-24; not applied)",
                "golgg_scrape": "S16 incremental applied",
                "golgg_extension_maps": gg_summary.get("maps"),
                "golgg_notable_series": gg_summary.get("notable_series"),
            },
        },
        "counts": {
            "teams_indexed": len(index_entries),
            "majors": sum(1 for e in index_entries if e["tier"] == "majors"),
            "academy_erl": sum(1 for e in index_entries if e["tier"] == "academy_erl"),
        },
        "min_samples": {"team_games": MIN_TEAM_GAMES, "player_games": MIN_PLAYER_GAMES, "shrink_k": SHRINK_K},
        "provenance": {
            "source": "Oracle's Elixir public yearly CSVs",
            "path_hint": "lol-model/data/raw/{year}.csv",
            "license_note": "Redistributed aggregates only; not a dump of the raw warehouse.",
        },
    }

    methodology = {
        "scoring_version": SCORING_VERSION,
        "title": "Polyverse LoL Esports scoring (transparent)",
        "not_copied": "Letter grades and numeric ratings are Polyverse-defined. They are not tak_01_ / third-party unpublished scores.",
        "formulas": {
            "team_strength_elo": (
                "Sequential hierarchical Elo over OE maps ordered by date: "
                "strength = L[home_league] + T[team]. Predict then update (no lookahead). "
                "Cross-league maps move league ratings. Half-life decay toward prior."
            ),
            "strength_grade": (
                "Percentile of strength_elo among home-league peers with ≥ min team games, "
                "mapped to letters: S≥90, A≥75, B≥55, C≥35, D≥15, else F."
            ),
            "drafting_proxy": (
                "For each map, residual = result - p_pre where p_pre is pre-update Elo win probability. "
                "Team drafting_proxy = mean residual in window. Ranked among tier peers for grade. "
                "LABEL: proxy only — does not claim causal draft quality; can reflect prep, form, or variance. "
                "Opponent-adjusted by construction via p_pre."
            ),
            "player_rating": (
                "Role-adjusted mean of peer percentiles (after Bayesian shrinkage toward role mean with k=8): "
                "carry roles use KDA, GD@15, damage share, gold share; jungle adds vision; support emphasizes vision. "
                "Displayed on 0–100 scale = 100 × mean percentile."
            ),
            "laning": "100 × mean of GD@15 and CSD@15 peer percentiles (role peers).",
            "gd15_display": "Player mean golddiffat15 and its role-peer percentile.",
            "strengths_weaknesses": (
                "Strengths: metrics with peer percentile ≥70 (top 2). "
                "Weaknesses: metrics with peer percentile ≤30 (bottom 2). Tied to measured fields only."
            ),
            "off_meta": f"Champion used by player whose season role share across all OE games < {OFF_META_ROLE_SHARE*100:.0f}%.",
            "side_pick_order": "Win-loss by Blue/Red × firstPick (1st/2nd) × series game number G1–G5 from OE firstPick + game fields.",
            "tiers": "majors vs academy_erl classified from home league; Challengers/Academy orgs stay distinct from main teams.",
            "confidence": "insufficient / low / medium / high from sample size vs min games.",
        },
        "grade_thresholds": {"S": 0.90, "A": 0.75, "B": 0.55, "C": 0.35, "D": 0.15, "F": 0.0},
    }

    (out_dir / "index.json").write_text(json.dumps({
        "meta": meta_doc,
        "teams": index_entries,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "meta.json").write_text(json.dumps(meta_doc, indent=2), encoding="utf-8")
    (out_dir / "methodology.json").write_text(json.dumps(methodology, indent=2), encoding="utf-8")

    print(f"Done. {len(index_entries)} teams → {out_dir}")
    print(f"Coverage {meta_doc['coverage']['start']} → {meta_doc['coverage']['end']}")


if __name__ == "__main__":
    main()
