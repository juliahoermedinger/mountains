# Data pipeline

Builds `data/peaks.json` (summits) and `data/pois.json` (huts, water sources, trailhead
parking) — the two files the web app fetches once and caches offline.

## Setup

Requires only Python 3's standard library — no `pip install` needed.

## Run (in order)

```
python fetch_osm_peaks.py          # pulls peaks, volcanoes, huts, and springs from OpenStreetMap
python fetch_trailhead_parking.py  # pulls amenity=parking, but only near what the above found
python backfill_elevation.py       # fills elevation for peaks OSM didn't tag with one
python build_database.py           # merges everything into data/peaks.json + data/pois.json
```

Each script checkpoints its progress in `data/` and is safe to interrupt (Ctrl+C) and
re-run — it picks up where it left off instead of starting over. `fetch_osm_peaks.py` in
particular can take a long time (1,800 Overpass queries against a shared public instance)
— run `check_progress.py` anytime to see a progress bar, peak count, and ETA.

**Why parking is a separate, narrower fetch**: `amenity=parking` exists at a completely
different scale than peaks/huts — every supermarket and office on Earth has one, and OSM
has no widely-used "this is a trailhead" tag to filter by. Fetching it globally the way
peaks are fetched would pull in millions of irrelevant nodes and put much more load on
the shared Overpass instance. `fetch_trailhead_parking.py` instead only looks inside
1-degree grid cells that `fetch_osm_peaks.py` already found a peak or hut/spring in, and
caps each query's result count — so it stays targeted to places actually relevant to
hiking. Run it after `fetch_osm_peaks.py` has produced at least one pass of output.

**Mirror warning**: only `overpass.kumi.systems` is used, and that's deliberate — an
earlier version of this pipeline also used `overpass.osm.ch`, which looks like a normal
global mirror (no error, no coverage disclaimer) but is actually the *Swiss* regional
Overpass instance. It silently returned valid, empty results for anywhere outside
Switzerland, and a full run went unnoticed until the total peak count came back
suspiciously low. If you ever add another mirror, verify it against a bbox far from
Europe (e.g. Colorado: `38.5,-105.5,39.5,-104.5`) before trusting it — "returns 200 with
no error" is not the same as "has global data."

After a full run, copy `data/peaks.json` and `data/pois.json` into `web/data/` to ship
them with the site.

## What's NOT in here, and why

- **Weather** isn't part of this pipeline at all — it's fetched live from the browser at
  the moment you view a peak (see `web/js/weather.js`, via Open-Meteo), since weather is
  only ever "right now" and can't meaningfully be bundled/cached ahead of time.
- **Hiking time** is computed client-side from distance + elevation gain (Naismith's
  rule), not fetched — there's no reliable global dataset of real trail times to draw
  from (OSM's route/duration tagging is far too sparse to trust at this scale).
- **Trail difficulty ratings** (OSM's `sac_scale` tag) aren't included — that's tagged on
  route relations and paths, not peaks/huts, and reliably associating a route with "the
  right" nearby peak is a much harder spatial-join problem than anything else here. Not
  attempted in this pass.

## Attribution requirement

This data comes from [OpenStreetMap](https://www.openstreetmap.org/copyright), licensed
under the **Open Database License (ODbL)**. The app must visibly credit
"© OpenStreetMap contributors" — this lives in the Settings screen. Don't strip it out.

## Re-running to pick up new/edited OSM data

OSM changes constantly. Delete `data/progress.json` (and optionally `data/raw_peaks.jsonl`
for a fully clean pull) and re-run the pipeline to refresh the dataset.
