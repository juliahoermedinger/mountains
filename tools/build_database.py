"""
Merge raw_peaks.jsonl + elevation_cache.json into a single compact JSON file that the
web app fetches once and caches offline via its service worker.

Peaks with no name and no resolvable elevation are dropped — an unnamed, elevation-less
node isn't useful to show a hiker. Deduplicated by id (OSM occasionally has near-duplicate
nodes for the same summit from different mapping passes) isn't attempted here — that's
rare enough, and harmless enough (just an extra label), not to be worth the complexity.

Usage:
    python build_database.py
Output:
    data/peaks.json  — [{id, name, lat, lon, ele, prom}, ...]
"""
import json
import os

from backfill_elevation import parse_ele

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
RAW_PEAKS_PATH = os.path.join(DATA_DIR, "raw_peaks.jsonl")
CACHE_PATH = os.path.join(DATA_DIR, "elevation_cache.json")
OUTPUT_PATH = os.path.join(DATA_DIR, "peaks.json")


def load_elevation_cache():
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def main():
    cache = load_elevation_cache()

    total = 0
    dropped_no_name = 0
    dropped_no_elevation = 0
    peaks = []

    with open(RAW_PEAKS_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            total += 1

            name = rec.get("name")
            if not name:
                dropped_no_name += 1
                continue

            elevation = parse_ele(rec.get("ele"))
            if elevation is None:
                elevation = cache.get(str(rec["id"]))
            if elevation is None:
                dropped_no_elevation += 1
                continue

            prominence = parse_ele(rec.get("prominence"))

            peak = {
                "id": rec["id"],
                "name": name,
                "lat": round(rec["lat"], 6),
                "lon": round(rec["lon"], 6),
                "ele": round(elevation, 1),
            }
            if prominence is not None:
                peak["prom"] = round(prominence, 1)
            peaks.append(peak)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(peaks, f, separators=(",", ":"))

    size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f"{total} raw peaks read")
    print(f"{dropped_no_name} dropped (no name), {dropped_no_elevation} dropped (no elevation)")
    print(f"{len(peaks)} peaks written to {OUTPUT_PATH} ({size_mb:.1f} MB)")

    by_name = {p["name"]: p["ele"] for p in peaks}
    for name in ("Mount Everest", "Everest", "Denali", "Matterhorn", "Mont Blanc"):
        if name in by_name:
            print(f"  spot check: {name} = {by_name[name]} m")


if __name__ == "__main__":
    main()
