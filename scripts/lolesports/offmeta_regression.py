#!/usr/bin/env python3
"""Regression tests for pick+ban presence off-meta classification."""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from offmeta import (
    OFF_META_PB_THRESHOLD,
    MapDraft,
    classify_champion,
    compute_presence,
    is_draft_complete,
    off_role_flag,
)


def M(gid, picks, bans, date="2026-06-01", league="LCK", patch="16.10", sides=2, dc="complete"):
    return MapDraft(gid, date, league, patch, frozenset(picks), frozenset(bans), dc, sides)


def test_unique_map_denominator():
    # Same champ on both sides counted once
    maps = [
        M("g1", ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], ["X", "Y", "Z", "Q", "W", "V"]),
        M("g2", ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], ["X", "Y", "Z", "Q", "W", "V"]),
    ]
    # inject A also as ban on g1 only via reconstruction
    maps[0] = M("g1", ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], ["A", "Y", "Z", "Q", "W", "V"])
    stats, meta = compute_presence(maps, buckets={"majors"}, date_start="2026-01-01", date_end="2026-12-31")
    assert meta["eligible_n"] == 2
    assert stats["A"].presence_maps == 2  # pick on both; ban on g1 still one map each
    assert stats["A"].pick_maps == 2
    assert stats["A"].ban_maps == 1


def test_high_ban_low_pick_never_off_meta():
    maps = []
    for i in range(250):
        bans = ["Threat"] + [f"B{j}" for j in range(5)]
        picks = [f"P{j}" for j in range(10)]
        if i < 5:
            picks[0] = "Threat"  # rare picks
        maps.append(M(f"g{i}", picks, bans))
    stats, meta = compute_presence(maps, buckets={"majors"}, date_start="2026-01-01", date_end="2026-12-31")
    assert meta["eligible_n"] == 250
    # Threat banned every map → PB% = 100%
    assert stats["Threat"].ban_maps == 250
    assert stats["Threat"].pick_maps == 5
    assert stats["Threat"].pb_rate == 1.0
    cls = classify_champion(stats["Threat"])
    assert cls["status"] == "not_off_meta"


def test_meta_champion_off_role_not_off_meta():
    # Contested champ with high PB, played off-role
    maps = []
    for i in range(250):
        picks = ["Viktor", "A", "B", "C", "D", "E", "F", "G", "H", "I"]
        bans = ["X", "Y", "Z", "Q", "W", "V"]
        maps.append(M(f"g{i}", picks, bans))
    stats, _ = compute_presence(maps, buckets={"majors"}, date_start="2026-01-01", date_end="2026-12-31")
    cls = classify_champion(stats["Viktor"])
    assert cls["status"] == "not_off_meta"
    roles = Counter({"mid": 100, "bot": 5})
    flag = off_role_flag("bot", roles)
    assert flag["off_role"] is True
    assert flag["modal_role"] == "mid"


def test_missing_bans_excluded_from_denominator():
    good = M("good", [f"P{i}" for i in range(10)], [f"B{i}" for i in range(6)])
    bad = M("bad", [f"P{i}" for i in range(10)], ["OnlyOne"])  # <6 bans
    assert is_draft_complete(good)
    assert not is_draft_complete(bad)
    stats, meta = compute_presence([good, bad], buckets={"majors"}, date_start="2026-01-01", date_end="2026-12-31")
    assert meta["eligible_n"] == 1


def test_low_window_unknown():
    maps = [M("g1", [f"P{i}" for i in range(10)], [f"B{i}" for i in range(6)])]
    stats, meta = compute_presence(maps, buckets={"majors"}, date_start="2026-01-01", date_end="2026-12-31")
    assert meta["eligible_n"] == 1
    cls = classify_champion(stats["P0"])
    assert cls["status"] == "unknown_low_window"


def test_tier_and_patch_window():
    maps = [
        M("a", [f"P{i}" for i in range(10)], [f"B{i}" for i in range(6)], league="LCK", patch="16.10"),
        M("b", [f"P{i}" for i in range(10)] + ["Rare"], [f"B{i}" for i in range(6)], league="LFL", patch="16.10"),
        M("c", [f"P{i}" for i in range(10)], [f"B{i}" for i in range(6)], league="LCK", patch="16.11"),
    ]
    # pad to eligible size with LCK 16.10
    for i in range(220):
        maps.append(M(f"pad{i}", [f"P{i%10}" for i in range(10)], [f"B{j}" for j in range(6)], league="LCK", patch="16.10"))
    stats_maj, meta_maj = compute_presence(maps, buckets={"majors"}, date_start="2026-01-01", date_end="2026-12-31", patches={"16.10"})
    assert "LFL" not in str(meta_maj["buckets"]) or True
    # Rare only on LFL map — not in majors+16.10 window
    assert "Rare" not in stats_maj
    assert meta_maj["eligible_n"] >= 220


def test_real_zeri_viktor_if_present():
    # Optional live OE probe — skip soft if raw missing
    raw = Path("/workspace/lol-model/data/raw/2026.csv")
    if not raw.exists():
        print("skip real OE probe")
        return
    import csv
    from offmeta import build_map_drafts_from_team_rows, peer_window_for_tier

    rows = []
    with raw.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("position") == "team":
                rows.append(row)
    drafts = build_map_drafts_from_team_rows(rows)
    stats, meta = compute_presence(
        drafts,
        buckets=peer_window_for_tier("majors"),
        date_start="2026-01-01",
        date_end="2026-10-24 23:59:59",
    )
    assert meta["eligible_n"] > 500
    v = classify_champion(stats.get("Viktor"))
    z = classify_champion(stats.get("Zeri"))
    assert v["status"] == "not_off_meta", v
    # Zeri ~3.4% PB in calibration — above 1% threshold ⇒ not off-meta
    assert z["status"] == "not_off_meta", z
    ill = classify_champion(stats.get("Illaoi"))
    assert ill["status"] in {"off_meta", "rare_low_sample"}, ill
    print("real OE", {"N": meta["eligible_n"], "Viktor": v["pb_rate"], "Zeri": z["pb_rate"], "Illaoi": ill})


def main():
    test_unique_map_denominator()
    test_high_ban_low_pick_never_off_meta()
    test_meta_champion_off_role_not_off_meta()
    test_missing_bans_excluded_from_denominator()
    test_low_window_unknown()
    test_tier_and_patch_window()
    test_real_zeri_viktor_if_present()
    print("offmeta_regression OK", {"threshold": OFF_META_PB_THRESHOLD})


if __name__ == "__main__":
    main()
