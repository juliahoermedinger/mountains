# Data pipeline

Builds `data/peaks.json`, the global peak database the web app fetches and caches offline.

## Setup

Requires only Python 3's standard library — no `pip install` needed.

## Run (in order)

```
python fetch_osm_peaks.py      # pulls all natural=peak / natural=volcano nodes from OpenStreetMap
python backfill_elevation.py   # fills elevation for peaks OSM didn't tag with one
python build_database.py       # merges everything into data/peaks.json
```

Each script checkpoints its progress in `data/` and is safe to interrupt (Ctrl+C) and
re-run — it picks up where it left off instead of starting over. `fetch_osm_peaks.py` in
particular can take a long time (1,800 Overpass queries against a shared public instance)
— run `check_progress.py` anytime to see a progress bar, peak count, and ETA.

**Mirror warning**: only `overpass.kumi.systems` is used, and that's deliberate — an
earlier version of this pipeline also used `overpass.osm.ch`, which looks like a normal
global mirror (no error, no coverage disclaimer) but is actually the *Swiss* regional
Overpass instance. It silently returned valid, empty results for anywhere outside
Switzerland, and a full run went unnoticed until the total peak count came back
suspiciously low. If you ever add another mirror, verify it against a bbox far from
Europe (e.g. Colorado: `38.5,-105.5,39.5,-104.5`) before trusting it — "returns 200 with
no error" is not the same as "has global data."

After a full run, copy `data/peaks.json` into `web/data/peaks.json` to ship it with the site.

## Attribution requirement

This data comes from [OpenStreetMap](https://www.openstreetmap.org/copyright), licensed
under the **Open Database License (ODbL)**. The app must visibly credit
"© OpenStreetMap contributors" — this lives in the Settings screen. Don't strip it out.

## Re-running to pick up new/edited OSM data

OSM changes constantly. Delete `data/progress.json` (and optionally `data/raw_peaks.jsonl`
for a fully clean pull) and re-run the pipeline to refresh the dataset.
