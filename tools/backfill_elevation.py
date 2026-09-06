"""
Fill in elevation for peaks that came out of OpenStreetMap without an `ele` tag, using
the free Open-Elevation public API. Batched, retried, and cached by peak id so it can be
interrupted and re-run without re-querying peaks it already resolved.

Usage:
    python backfill_elevation.py

Input:
    data/raw_peaks.jsonl        from fetch_osm_peaks.py
Output:
    data/elevation_cache.json   {peak_id: elevation_meters}
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
RAW_PEAKS_PATH = os.path.join(DATA_DIR, "raw_peaks.jsonl")
CACHE_PATH = os.path.join(DATA_DIR, "elevation_cache.json")

OPEN_ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup"
BATCH_SIZE = 50
REQUEST_DELAY_SECONDS = 1.5
MAX_RETRIES = 5
REQUEST_TIMEOUT_SECONDS = 60

USER_AGENT = "MountainScope-DataPipeline/1.0 (personal hiking app; contact via github)"


def parse_ele(raw):
    """OSM `ele` tags are usually plain numbers but sometimes have units/junk, e.g. '1234 m'."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).strip().replace(",", ".")
    num = ""
    for ch in s:
        if ch.isdigit() or ch in ".-":
            num += ch
        elif num:
            break
    try:
        return float(num)
    except ValueError:
        return None


def load_records_missing_elevation():
    missing = []
    with open(RAW_PEAKS_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            if parse_ele(rec.get("ele")) is None:
                missing.append(rec)
    return missing


def load_cache():
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache):
    tmp = CACHE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cache, f)
    os.replace(tmp, CACHE_PATH)


def query_batch(batch):
    locations = [{"latitude": r["lat"], "longitude": r["lon"]} for r in batch]
    payload = json.dumps({"locations": locations}).encode("utf-8")
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                OPEN_ELEVATION_URL,
                data=payload,
                headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
                data = json.loads(resp.read())
                return data["results"]
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError) as e:
            last_error = e
            backoff = min(60, 2 ** attempt * 2)
            print(f"    attempt {attempt + 1}/{MAX_RETRIES} failed ({e}); retrying in {backoff}s", file=sys.stderr)
            time.sleep(backoff)
    raise RuntimeError(f"batch failed after {MAX_RETRIES} attempts: {last_error}")


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    missing = load_records_missing_elevation()
    cache = load_cache()

    todo = [r for r in missing if str(r["id"]) not in cache]
    print(f"{len(missing)} peaks missing elevation, {len(todo)} not yet in cache")

    for i in range(0, len(todo), BATCH_SIZE):
        batch = todo[i : i + BATCH_SIZE]
        print(f"[{i}/{len(todo)}] querying {len(batch)} points")
        try:
            results = query_batch(batch)
        except RuntimeError as e:
            print(f"  giving up on this batch: {e}", file=sys.stderr)
            continue

        for rec, res in zip(batch, results):
            cache[str(rec["id"])] = res.get("elevation")
        save_cache(cache)
        time.sleep(REQUEST_DELAY_SECONDS)

    print(f"Done. {len(cache)} elevations cached in {CACHE_PATH}")


if __name__ == "__main__":
    main()
