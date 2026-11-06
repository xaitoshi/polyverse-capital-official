"""Pick+ban presence off-meta classification (polyverse-lolesports-v1.1).

PB% = (# eligible maps where champion appears in picks OR bans, deduped per map)
      / (# eligible draft-complete maps in window).

Not role-pick share. High ban + low pick ⇒ high PB% ⇒ not off-meta.
Fearless series locks are NOT separately labeled in OE (only ban1–5 per map).
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Iterable

# Product-calibrated from 2026 majors+intl OE window through 2026-10-24
# (approx. 20th–25th percentile of champion PB rates ≈ 0.3–0.5%; 1% is a clear
# "rarely contested" band below median ~3.6%). Not an objective league rule.
OFF_META_PB_THRESHOLD = 0.01
MIN_ELIGIBLE_MAPS = 200
MIN_PRESENCE_FOR_DEFINITE = 1  # presence can be 1; window size gates confidence
LOW_SAMPLE_PRESENCE = 5

OFFMETA_VERSION = "pb-presence-v1"

MAJOR = {
    "LCK", "LPL", "LEC", "LCS", "LCP", "CBLOL", "PCS", "VCS", "LJL", "LLA", "LCO",
    "LTA", "LTA North", "LTA South", "LTA N", "LTA S", "TCL",
}
INTL = {
    "WLDs", "Worlds", "MSI", "FST", "First Stand", "EWC", "DCup", "Demacia",
    "WSCI", "EM", "EMEA Masters", "AM", "Americas Challengers", "IC", "HM",
    "Hitpoint Masters", "KeSPA Cup", "KeSPA", "Kespa",
}


def competition_bucket(league: str) -> str:
    if not league:
        return "other"
    if league in INTL:
        return "intl"
    if league in MAJOR:
        return "majors"
    return "academy_erl"


def peer_window_for_tier(tier: str) -> set[str]:
    """Which competition buckets feed PB rates for a team tier."""
    if tier == "majors":
        return {"majors", "intl"}
    return {"academy_erl"}


@dataclass(frozen=True)
class MapDraft:
    gameid: str
    date: str
    league: str
    patch: str
    picks: frozenset[str]
    bans: frozenset[str]
    datacompleteness: str
    sides: int


def is_draft_complete(m: MapDraft, min_picks: int = 8, min_bans: int = 6) -> bool:
    if m.sides < 2:
        return False
    if m.datacompleteness not in {"complete", "partial"}:
        return False
    if len(m.picks) < min_picks:
        return False
    if len(m.bans) < min_bans:
        return False
    return True


def build_map_drafts_from_team_rows(team_rows: Iterable[dict]) -> list[MapDraft]:
    """Aggregate OE team rows (both sides) into per-map pick/ban sets."""
    acc: dict[str, dict] = {}
    for row in team_rows:
        gid = row.get("gameid")
        if not gid:
            continue
        g = acc.setdefault(
            gid,
            {
                "date": row.get("date"),
                "league": row.get("league"),
                "patch": str(row.get("patch") or ""),
                "dc": row.get("datacompleteness") or "",
                "sides": 0,
                "picks": set(),
                "bans": set(),
            },
        )
        g["sides"] += 1
        g["date"] = g["date"] or row.get("date")
        g["league"] = g["league"] or row.get("league")
        g["patch"] = g["patch"] or str(row.get("patch") or "")
        g["dc"] = g["dc"] or (row.get("datacompleteness") or "")
        for i in range(1, 6):
            b = row.get(f"ban{i}")
            p = row.get(f"pick{i}")
            if b is not None and not (isinstance(b, float) and b != b):
                bs = str(b).strip()
                if bs and bs.lower() != "nan":
                    g["bans"].add(bs)
            if p is not None and not (isinstance(p, float) and p != p):
                ps = str(p).strip()
                if ps and ps.lower() != "nan":
                    g["picks"].add(ps)
    out = []
    for gid, g in acc.items():
        out.append(
            MapDraft(
                gameid=str(gid),
                date=str(g["date"] or ""),
                league=str(g["league"] or ""),
                patch=str(g["patch"] or ""),
                picks=frozenset(g["picks"]),
                bans=frozenset(g["bans"]),
                datacompleteness=str(g["dc"] or ""),
                sides=int(g["sides"]),
            )
        )
    return out


@dataclass
class PresenceStats:
    eligible_n: int
    pick_maps: int
    ban_maps: int
    presence_maps: int
    pb_rate: float | None
    patches: list[str]
    date_start: str | None
    date_end: str | None
    buckets: list[str]


def compute_presence(
    maps: list[MapDraft],
    *,
    buckets: set[str],
    date_start: str,
    date_end: str,
    patches: set[str] | None = None,
) -> tuple[dict[str, PresenceStats], dict]:
    """Return per-champion presence stats + window meta. No future maps after date_end."""
    eligible = []
    for m in maps:
        if not m.date or m.date < date_start or m.date > date_end:
            continue
        if competition_bucket(m.league) not in buckets:
            continue
        if patches is not None and m.patch not in patches:
            continue
        if not is_draft_complete(m):
            continue
        eligible.append(m)

    pick_m: Counter[str] = Counter()
    ban_m: Counter[str] = Counter()
    pres_m: Counter[str] = Counter()
    patch_set: set[str] = set()
    for m in eligible:
        patch_set.add(m.patch)
        for c in m.picks:
            pick_m[c] += 1
        for c in m.bans:
            ban_m[c] += 1
        for c in m.picks | m.bans:
            pres_m[c] += 1

    n = len(eligible)
    dates = sorted(m.date for m in eligible if m.date)
    champs = set(pres_m) | set(pick_m) | set(ban_m)
    stats: dict[str, PresenceStats] = {}
    for c in champs:
        pm, bm, pr = pick_m[c], ban_m[c], pres_m[c]
        stats[c] = PresenceStats(
            eligible_n=n,
            pick_maps=pm,
            ban_maps=bm,
            presence_maps=pr,
            pb_rate=(pr / n) if n else None,
            patches=sorted(patch_set),
            date_start=dates[0] if dates else None,
            date_end=dates[-1] if dates else None,
            buckets=sorted(buckets),
        )
    meta = {
        "eligible_n": n,
        "draft_complete_maps": n,
        "date_start": dates[0] if dates else None,
        "date_end": dates[-1] if dates else None,
        "patches": sorted(patch_set),
        "buckets": sorted(buckets),
        "maps_scanned": len(maps),
        "missing_draft_note": (
            "Maps with <8 distinct picks or <6 distinct bans (or <2 sides / non complete|partial) "
            "are excluded from the denominator."
        ),
        "fearless_note": (
            "OE exposes ban1–5 per map only. Fearless / series-level unavailability is not a "
            "separate field; those champions are not labeled distinctly from ordinary bans."
        ),
        "threshold": OFF_META_PB_THRESHOLD,
        "min_eligible_maps": MIN_ELIGIBLE_MAPS,
        "version": OFFMETA_VERSION,
    }
    return stats, meta


def classify_champion(stats: PresenceStats | None) -> dict:
    """Return status + display fields. Never invent counts."""
    if stats is None or stats.eligible_n <= 0 or stats.pb_rate is None:
        return {
            "status": "unknown_no_data",
            "pb_rate": None,
            "pick_maps": None,
            "ban_maps": None,
            "presence_maps": None,
            "eligible_n": stats.eligible_n if stats else 0,
            "label": "unknown",
        }
    base = {
        "pb_rate": stats.pb_rate,
        "pick_maps": stats.pick_maps,
        "ban_maps": stats.ban_maps,
        "presence_maps": stats.presence_maps,
        "eligible_n": stats.eligible_n,
        "patches": stats.patches,
        "date_start": stats.date_start,
        "date_end": stats.date_end,
        "buckets": stats.buckets,
    }
    if stats.eligible_n < MIN_ELIGIBLE_MAPS:
        return {**base, "status": "unknown_low_window", "label": "unknown (low window N)"}
    # High ban / low pick still has high presence → not off-meta
    if stats.pb_rate >= OFF_META_PB_THRESHOLD:
        return {**base, "status": "not_off_meta", "label": "contested / meta-band"}
    if stats.presence_maps < LOW_SAMPLE_PRESENCE:
        return {
            **base,
            "status": "rare_low_sample",
            "label": "rare (low sample — not definitive)",
        }
    return {**base, "status": "off_meta", "label": "off-meta (low PB presence)"}


def modal_role(role_counts: Counter) -> str | None:
    if not role_counts:
        return None
    return role_counts.most_common(1)[0][0]


def off_role_flag(player_role: str, champ_role_counts: Counter, min_n: int = 10) -> dict:
    """Separate from off-meta: unusual role for this champion, not champion rarity."""
    total = sum(champ_role_counts.values())
    if total < min_n:
        return {"off_role": None, "modal_role": modal_role(champ_role_counts), "role_n": total, "note": "insufficient role sample"}
    modal = modal_role(champ_role_counts)
    return {
        "off_role": bool(modal and player_role != modal),
        "modal_role": modal,
        "role_n": total,
        "player_role": player_role,
        "note": "Off-role ≠ off-meta. Ban role is never inferred.",
    }
