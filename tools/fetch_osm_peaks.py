"""
Fetch every OpenStreetMap `natural=peak` and `natural=volcano` node worldwide via the
Overpass API and write them to a resumable JSONL file.

A single global query would time out and violate Overpass's fair-use policy, so the
world is split into a grid of small bounding-box tiles, queried one at a time with a
delay between requests. Progress is checkpointed after every tile, so the script can be
killed and re-run safely — it only re-fetches tiles that never completed.

Usage:
    python fetch_osm_peaks.py

Output:
    data/raw_peaks.jsonl   one JSON object per peak: {id, lat, lon, name, ele, tags}
    data/progress.json     set of completed tile keys (for resuming)
    data/failed_tiles.json tiles that failed after all retries (re-run to retry them)
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
RAW_PEAKS_PATH = os.path.join(DATA_DIR, "raw_peaks.jsonl")
PROGRESS_PATH = os.path.join(DATA_DIR, "progress.json")
FAILED_PATH = os.path.join(DATA_DIR, "failed_tiles.json")

# Public Overpass mirror. IMPORTANT: this must be a genuinely global instance.
# overpass-api.de (the "main" instance) was unreachable (406) from where this was
# developed; overpass.openstreetmap.fr returned 403; overpass.osm.ch LOOKED global (it
# has no coverage disclaimer in its query responses) but is actually the "Swiss Overpass
# API" — a regional mirror that returns valid, error-free, EMPTY results for anywhere
# outside Switzerland/nearby. It was in rotation for a full run and silently produced a
# near-empty worldwide database (only the Alps came back real) without raising a single
# error, so treat "looks fine, returns 200" as insufficient — verify new mirrors against
# a bbox far from Europe (e.g. Colorado, 38.5,-105.5,39.5,-104.5) before trusting them.
# kumi.systems is confirmed genuinely global (verified against that Colorado bbox) but
# is a busy shared public instance and times out under load — hence the generous
# retry/timeout budget below rather than adding more unverified mirrors.
OVERPASS_ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
]

TILE_SIZE_DEG = 6  # 30 x 60 = 1800 tiles worldwide; most ocean tiles return instantly
REQUEST_DELAY_SECONDS = 1.5  # be polite to the shared public Overpass instance
# Deliberately a short retry budget: under heavy load a single tile can eat minutes
# waiting through the full backoff schedule before failing anyway, which stalls the
# whole pass behind one stuck tile. Failing fast and moving on gets broad coverage much
# quicker; failed tiles just get retried automatically on the next run (see
# failed_tiles.json / progress.json — only successful tiles are marked done).
MAX_RETRIES = 3
REQUEST_TIMEOUT_SECONDS = 45

USER_AGENT = "MountainScope-DataPipeline/1.0 (personal hiking app; contact via github)"


def build_query(south, west, north, east):
    bbox = f"{south},{west},{north},{east}"
    return f"""
    [out:json][timeout:170];
    (
      node["natural"="peak"]({bbox});
      node["natural"="volcano"]({bbox});
    );
    out body;
    """


def fetch_tile(south, west, north, east):
    query = build_query(south, west, north, east)
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
                body = resp.read()
                return json.loads(body)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
            last_error = e
            backoff = min(60, 2 ** attempt * 2)
            print(f"    attempt {attempt + 1}/{MAX_RETRIES} failed ({e}); retrying in {backoff}s", file=sys.stderr)
            time.sleep(backoff)
    raise RuntimeError(f"tile ({south},{west},{north},{east}) failed after {MAX_RETRIES} attempts: {last_error}")


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


def load_seen_ids():
    seen = set()
    if os.path.exists(RAW_PEAKS_PATH):
        with open(RAW_PEAKS_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    seen.add(json.loads(line)["id"])
                except (json.JSONDecodeError, KeyError):
                    continue
    return seen


def all_tiles():
    tiles = []
    lat = -90
    while lat < 90:
        lon = -180
        while lon < 180:
            south, north = lat, min(lat + TILE_SIZE_DEG, 90)
            west, east = lon, min(lon + TILE_SIZE_DEG, 180)
            tiles.append((south, west, north, east))
            lon += TILE_SIZE_DEG
        lat += TILE_SIZE_DEG
    return tiles


def tile_key(tile):
    return f"{tile[0]}_{tile[1]}_{tile[2]}_{tile[3]}"


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    progress = set(load_json(PROGRESS_PATH, []))
    failed = load_json(FAILED_PATH, [])
    seen_ids = load_seen_ids()

    tiles = all_tiles()
    remaining = [t for t in tiles if tile_key(t) not in progress]

    print(f"{len(tiles)} tiles total, {len(remaining)} remaining, {len(seen_ids)} peaks already collected")

    new_peaks_count = 0
    with open(RAW_PEAKS_PATH, "a", encoding="utf-8") as out_f:
        for i, tile in enumerate(remaining):
            key = tile_key(tile)
            print(f"[{i + 1}/{len(remaining)}] tile {key}")
            try:
                result = fetch_tile(*tile)
            except RuntimeError as e:
                print(f"  giving up on tile {key}: {e}", file=sys.stderr)
                if key not in failed:
                    failed.append(key)
                save_json(FAILED_PATH, failed)
                continue

            elements = result.get("elements", [])
            for el in elements:
                peak_id = el.get("id")
                if peak_id in seen_ids:
                    continue
                seen_ids.add(peak_id)
                tags = el.get("tags", {})
                record = {
                    "id": peak_id,
                    "lat": el.get("lat"),
                    "lon": el.get("lon"),
                    "name": tags.get("name") or tags.get("name:en"),
                    "ele": tags.get("ele"),
                    "prominence": tags.get("prominence"),
                    "wikidata": tags.get("wikidata"),
                }
                out_f.write(json.dumps(record) + "\n")
                new_peaks_count += 1
            out_f.flush()

            progress.add(key)
            save_json(PROGRESS_PATH, sorted(progress))
            if key in failed:
                failed.remove(key)
                save_json(FAILED_PATH, failed)

            time.sleep(REQUEST_DELAY_SECONDS)

    print(f"Done. {new_peaks_count} new peaks collected this run, {len(seen_ids)} total in {RAW_PEAKS_PATH}")
    if failed:
        print(f"{len(failed)} tiles failed — re-run this script to retry just those.")


if __name__ == "__main__":
    import urllib.parse
    main()
