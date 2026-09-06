"""
Fetch `amenity=parking` nodes, but ONLY within 1-degree grid cells that already contain
at least one peak or hut/spring — never globally.

`amenity=parking` covers every supermarket, office, and mall on Earth, not just
trailheads (OSM has no widely-used "this is a trailhead" parking tag), so fetching it
everywhere the way fetch_osm_peaks.py does for peaks would pull in millions of irrelevant
nodes and put far more load on the shared Overpass instance for far less payoff. Instead,
this only looks in the (much smaller) set of places already known to be hiking-relevant,
and caps each query's result count so one dense city inside a mountainous cell can't
blow up the response.

Run this AFTER fetch_osm_peaks.py has produced at least one pass of raw_peaks.jsonl /
raw_pois.jsonl.

Usage:
    python fetch_trailhead_parking.py

Output:
    data/raw_parking.jsonl  one JSON object per parking node: {id, lat, lon, name}
    data/parking_progress.json
"""
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
RAW_PEAKS_PATH = os.path.join(DATA_DIR, "raw_peaks.jsonl")
RAW_POIS_PATH = os.path.join(DATA_DIR, "raw_pois.jsonl")
RAW_PARKING_PATH = os.path.join(DATA_DIR, "raw_parking.jsonl")
PROGRESS_PATH = os.path.join(DATA_DIR, "parking_progress.json")

# See fetch_osm_peaks.py for the full mirror notes (including why overpass-api.de looked
# blocked but wasn't — a bare "Mozilla/5.0" User-Agent test was the actual culprit).
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
CELL_SIZE_DEG = 1
MAX_RESULTS_PER_CELL = 300  # safety cap so one urban cell can't return a huge payload
REQUEST_DELAY_SECONDS = 1.5
MAX_RETRIES = 3
REQUEST_TIMEOUT_SECONDS = 45
USER_AGENT = "MountainScope-DataPipeline/1.0 (personal hiking app; contact via github)"

# Same optional scope-down as build_database.py: set BBOX_FILTER="south,west,north,east"
# to only consider occupied cells inside it. Without this, occupied_cells() picks up
# every peak/POI ever fetched, including stray data left over from an earlier, more
# broadly-scoped run (e.g. Antarctic tiles from a since-abandoned global fetch) — wasting
# time querying parking near places nothing else in the app currently covers.
_bbox_env = os.environ.get("BBOX_FILTER")
BBOX_FILTER = tuple(float(x) for x in _bbox_env.split(",")) if _bbox_env else None


def in_bbox(lat, lon):
    if BBOX_FILTER is None:
        return True
    south, west, north, east = BBOX_FILTER
    return south <= lat <= north and west <= lon <= east


def occupied_cells():
    cells = set()
    for path in (RAW_PEAKS_PATH, RAW_POIS_PATH):
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                if not in_bbox(rec["lat"], rec["lon"]):
                    continue
                cells.add((math.floor(rec["lat"]), math.floor(rec["lon"])))
    return cells


def build_query(lat_cell, lon_cell):
    south, north = lat_cell, lat_cell + CELL_SIZE_DEG
    west, east = lon_cell, lon_cell + CELL_SIZE_DEG
    bbox = f"{south},{west},{north},{east}"
    return f"""
    [out:json][timeout:60];
    node["amenity"="parking"]({bbox});
    out body {MAX_RESULTS_PER_CELL};
    """


def fetch_cell(lat_cell, lon_cell):
    query = build_query(lat_cell, lon_cell)
    last_error = None
    for attempt in range(MAX_RETRIES):
        endpoint = OVERPASS_ENDPOINTS[attempt % len(OVERPASS_ENDPOINTS)]
        try:
            req = urllib.request.Request(
                endpoint,
                data=f"data={urllib.parse.quote(query)}".encode("utf-8"),
                headers={"User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded"},
            )
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
                return json.loads(resp.read())
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
            last_error = e
            backoff = min(60, 2 ** attempt * 2)
            print(f"    attempt {attempt + 1}/{MAX_RETRIES} failed ({e}); retrying in {backoff}s", file=sys.stderr)
            time.sleep(backoff)
    raise RuntimeError(f"cell ({lat_cell},{lon_cell}) failed after {MAX_RETRIES} attempts: {last_error}")


def load_json(path, default):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f)
    os.replace(tmp, path)


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    cells = sorted(occupied_cells())
    if not cells:
        print("No peaks/POIs found yet — run fetch_osm_peaks.py first.")
        return

    progress = set(tuple(c) for c in load_json(PROGRESS_PATH, []))
    remaining = [c for c in cells if c not in progress]
    print(f"{len(cells)} occupied cells, {len(remaining)} remaining")

    seen_ids = set()
    if os.path.exists(RAW_PARKING_PATH):
        with open(RAW_PARKING_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    seen_ids.add(json.loads(line)["id"])

    new_count = 0
    with open(RAW_PARKING_PATH, "a", encoding="utf-8") as out_f:
        for i, (lat_cell, lon_cell) in enumerate(remaining):
            print(f"[{i + 1}/{len(remaining)}] cell {lat_cell},{lon_cell}")
            try:
                result = fetch_cell(lat_cell, lon_cell)
            except RuntimeError as e:
                print(f"  giving up on cell: {e}", file=sys.stderr)
                continue

            for el in result.get("elements", []):
                el_id = el.get("id")
                if el_id in seen_ids:
                    continue
                seen_ids.add(el_id)
                tags = el.get("tags", {})
                record = {
                    "id": el_id,
                    "lat": el.get("lat"),
                    "lon": el.get("lon"),
                    "name": tags.get("name"),
                }
                out_f.write(json.dumps(record) + "\n")
                new_count += 1
            out_f.flush()

            progress.add((lat_cell, lon_cell))
            save_json(PROGRESS_PATH, sorted(list(c) for c in progress))
            time.sleep(REQUEST_DELAY_SECONDS)

    print(f"Done. {new_count} new parking nodes, {len(seen_ids)} total in {RAW_PARKING_PATH}")


if __name__ == "__main__":
    main()
