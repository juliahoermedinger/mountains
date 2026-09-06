"""
Fetch OpenStreetMap peaks AND hiking-relevant points of interest (huts, water sources)
worldwide via the Overpass API, in one combined query per tile so this doesn't cost any
extra requests beyond the original peaks-only pass.

A single global query would time out and violate Overpass's fair-use policy, so the
world is split into a grid of small bounding-box tiles, queried one at a time with a
delay between requests. Progress is checkpointed after every tile, so the script can be
killed and re-run safely — it only re-fetches tiles that never completed.

Trailhead parking is deliberately NOT included here — `amenity=parking` exists at a
completely different scale (every supermarket and office on Earth has one), so it's
fetched separately by fetch_trailhead_parking.py, only around the areas this script
found peaks/huts in, instead of everywhere.

Usage:
    python fetch_osm_peaks.py

Output:
    data/raw_peaks.jsonl   one JSON object per peak/volcano: {id, lat, lon, name, ele, ...}
    data/raw_pois.jsonl    one JSON object per hut/spring: {id, lat, lon, name, kind, ...}
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
RAW_POIS_PATH = os.path.join(DATA_DIR, "raw_pois.jsonl")
PROGRESS_PATH = os.path.join(DATA_DIR, "progress.json")
FAILED_PATH = os.path.join(DATA_DIR, "failed_tiles.json")

# Public Overpass mirrors. IMPORTANT: each must be a genuinely global instance.
# overpass.openstreetmap.fr returned 403; overpass.osm.ch LOOKED global (it has no
# coverage disclaimer in its query responses) but is actually the "Swiss Overpass API" —
# a regional mirror that returns valid, error-free, EMPTY results for anywhere outside
# Switzerland/nearby. It was in rotation for a full run and silently produced a
# near-empty worldwide database (only the Alps came back real) without raising a single
# error, so treat "looks fine, returns 200" as insufficient — verify new mirrors against
# a bbox far from Europe (e.g. Colorado, 38.5,-105.5,39.5,-104.5) before trusting them.
#
# overpass-api.de looked blocked (406) during early development, but that was a red
# herring from testing with a bare "Mozilla/5.0" User-Agent by hand — its bot filter
# blocks that specific generic string, not tool traffic in general. This pipeline's own
# USER_AGENT below always worked fine against it; don't re-add a "Mozilla/5.0" fallback
# without checking this first.
#
# Both endpoints are confirmed genuinely global (verified against the Colorado bbox
# above). Listed in order — earlier ones tried first each retry round — so if one mirror
# has an extended outage the other picks up the slack instead of exhausting retries
# against a dead host.
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
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

# Tags that identify a peak/summit (elevation is the defining attribute).
PEAK_TAGS = [("natural", "peak"), ("natural", "volcano")]
# Tags for hiking-relevant POIs (no elevation requirement, kept in a separate file/shape).
POI_TAGS = [
    ("tourism", "alpine_hut"),
    ("tourism", "wilderness_hut"),
    ("natural", "spring"),
]


def build_query(south, west, north, east):
    bbox = f"{south},{west},{north},{east}"
    clauses = "\n      ".join(f'node["{k}"="{v}"]({bbox});' for k, v in PEAK_TAGS + POI_TAGS)
    return f"""
    [out:json][timeout:170];
    (
      {clauses}
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


def load_seen_ids(path):
    seen = set()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
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


def poi_kind(tags):
    if tags.get("tourism") in ("alpine_hut", "wilderness_hut"):
        return "hut"
    if tags.get("natural") == "spring":
        return "spring"
    return None


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    progress = set(load_json(PROGRESS_PATH, []))
    failed = load_json(FAILED_PATH, [])
    seen_peak_ids = load_seen_ids(RAW_PEAKS_PATH)
    seen_poi_ids = load_seen_ids(RAW_POIS_PATH)

    tiles = all_tiles()
    remaining = [t for t in tiles if tile_key(t) not in progress]

    print(f"{len(tiles)} tiles total, {len(remaining)} remaining, "
          f"{len(seen_peak_ids)} peaks + {len(seen_poi_ids)} POIs already collected")

    new_peaks_count = 0
    new_pois_count = 0
    with open(RAW_PEAKS_PATH, "a", encoding="utf-8") as peaks_f, \
         open(RAW_POIS_PATH, "a", encoding="utf-8") as pois_f:
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
                el_id = el.get("id")
                tags = el.get("tags", {})
                kind = poi_kind(tags)

                if kind is None:
                    # peak or volcano
                    if el_id in seen_peak_ids:
                        continue
                    seen_peak_ids.add(el_id)
                    record = {
                        "id": el_id,
                        "lat": el.get("lat"),
                        "lon": el.get("lon"),
                        "name": tags.get("name") or tags.get("name:en"),
                        "ele": tags.get("ele"),
                        "prominence": tags.get("prominence"),
                        "wikidata": tags.get("wikidata"),
                    }
                    peaks_f.write(json.dumps(record) + "\n")
                    new_peaks_count += 1
                else:
                    if el_id in seen_poi_ids:
                        continue
                    seen_poi_ids.add(el_id)
                    record = {
                        "id": el_id,
                        "lat": el.get("lat"),
                        "lon": el.get("lon"),
                        "name": tags.get("name") or tags.get("name:en"),
                        "kind": kind,
                        "ele": tags.get("ele"),
                    }
                    pois_f.write(json.dumps(record) + "\n")
                    new_pois_count += 1
            peaks_f.flush()
            pois_f.flush()

            progress.add(key)
            save_json(PROGRESS_PATH, sorted(progress))
            if key in failed:
                failed.remove(key)
                save_json(FAILED_PATH, failed)

            time.sleep(REQUEST_DELAY_SECONDS)

    print(f"Done. {new_peaks_count} new peaks, {new_pois_count} new POIs this run "
          f"({len(seen_peak_ids)} peaks + {len(seen_poi_ids)} POIs total)")
    if failed:
        print(f"{len(failed)} tiles failed — re-run this script to retry just those.")


if __name__ == "__main__":
    import urllib.parse
    main()
