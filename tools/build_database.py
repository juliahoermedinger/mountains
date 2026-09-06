"""
Merge the raw fetch outputs into two compact JSON files the web app fetches once and
caches offline via its service worker: peaks.json (summits) and pois.json (huts, water
sources, trailhead parking).

Peaks with no name and no resolvable elevation are dropped — an unnamed, elevation-less
node isn't useful to show a hiker. POIs are kept even without a name (the app falls back
to a generic label like "Hut" or "Water source") since knowing one exists nearby is
useful even unnamed — unlike a peak, a POI's value isn't tied to identifying it by name.

Usage:
    python build_database.py
Output:
    data/peaks.json — [{id, name, lat, lon, ele, prom?}, ...]
    data/pois.json  — [{id, name?, lat, lon, kind, ele?}, ...]  kind: hut | spring | parking
"""
import json
import os

from backfill_elevation import parse_ele

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
RAW_PEAKS_PATH = os.path.join(DATA_DIR, "raw_peaks.jsonl")
RAW_POIS_PATH = os.path.join(DATA_DIR, "raw_pois.jsonl")
RAW_PARKING_PATH = os.path.join(DATA_DIR, "raw_parking.jsonl")
CACHE_PATH = os.path.join(DATA_DIR, "elevation_cache.json")
PEAKS_OUTPUT_PATH = os.path.join(DATA_DIR, "peaks.json")
POIS_OUTPUT_PATH = os.path.join(DATA_DIR, "pois.json")


def load_elevation_cache():
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def build_peaks(cache):
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

    with open(PEAKS_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(peaks, f, separators=(",", ":"))

    size_mb = os.path.getsize(PEAKS_OUTPUT_PATH) / (1024 * 1024)
    print(f"{total} raw peaks read")
    print(f"{dropped_no_name} dropped (no name), {dropped_no_elevation} dropped (no elevation)")
    print(f"{len(peaks)} peaks written to {PEAKS_OUTPUT_PATH} ({size_mb:.1f} MB)")

    by_name = {p["name"]: p["ele"] for p in peaks}
    for name in ("Mount Everest", "Everest", "Denali", "Matterhorn", "Mont Blanc"):
        if name in by_name:
            print(f"  spot check: {name} = {by_name[name]} m")


def build_pois():
    pois = []

    if os.path.exists(RAW_POIS_PATH):
        with open(RAW_POIS_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                poi = {
                    "id": rec["id"],
                    "lat": round(rec["lat"], 6),
                    "lon": round(rec["lon"], 6),
                    "kind": rec["kind"],
                }
                if rec.get("name"):
                    poi["name"] = rec["name"]
                ele = parse_ele(rec.get("ele"))
                if ele is not None:
                    poi["ele"] = round(ele, 1)
                pois.append(poi)

    if os.path.exists(RAW_PARKING_PATH):
        with open(RAW_PARKING_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                poi = {
                    "id": rec["id"],
                    "lat": round(rec["lat"], 6),
                    "lon": round(rec["lon"], 6),
                    "kind": "parking",
                }
                if rec.get("name"):
                    poi["name"] = rec["name"]
                pois.append(poi)

    with open(POIS_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(pois, f, separators=(",", ":"))

    size_mb = os.path.getsize(POIS_OUTPUT_PATH) / (1024 * 1024)
    by_kind = {}
    for p in pois:
        by_kind[p["kind"]] = by_kind.get(p["kind"], 0) + 1
    print(f"{len(pois)} POIs written to {POIS_OUTPUT_PATH} ({size_mb:.1f} MB): {by_kind}")


def main():
    cache = load_elevation_cache()
    build_peaks(cache)
    build_pois()


if __name__ == "__main__":
    main()
