"""
Quick status check for the OSM peak fetch (fetch_osm_peaks.py), safe to run anytime,
including while the fetch is running in another window.

Usage:
    python check_progress.py
"""
import json
import os
import time

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
RAW_PEAKS_PATH = os.path.join(DATA_DIR, "raw_peaks.jsonl")
PROGRESS_PATH = os.path.join(DATA_DIR, "progress.json")
FAILED_PATH = os.path.join(DATA_DIR, "failed_tiles.json")
# Remembers when/where we first checked, so later checks can estimate a rate/ETA
# without relying on file creation-time semantics (unreliable across resumes).
CHECK_STATE_PATH = os.path.join(DATA_DIR, ".check_progress_state.json")

TOTAL_TILES = 1800
# A single tile can legitimately need all MAX_RETRIES attempts with exponential backoff
# (2+4+8+16+32+60+60+60s =~ 250s worst case, per fetch_osm_peaks.py's settings) before
# either succeeding or giving up, so only warn about a possible hang well past that.
STALE_WARNING_SECONDS = 360


def estimate_eta(tiles_done):
    """Returns estimated seconds remaining, or None if there's not yet enough history
    (first-ever check, or no progress since the first check)."""
    now = time.time()
    state = None
    if os.path.exists(CHECK_STATE_PATH):
        with open(CHECK_STATE_PATH, "r", encoding="utf-8") as f:
            state = json.load(f)

    if state is None:
        with open(CHECK_STATE_PATH, "w", encoding="utf-8") as f:
            json.dump({"tiles_done": tiles_done, "time": now}, f)
        return None

    elapsed = now - state["time"]
    tiles_since = tiles_done - state["tiles_done"]
    if elapsed < 5 or tiles_since <= 0:
        return None

    rate = tiles_since / elapsed  # tiles per second
    remaining = TOTAL_TILES - tiles_done
    return remaining / rate


def main():
    if not os.path.exists(PROGRESS_PATH):
        print("No progress file yet - the fetch either hasn't started or hasn't finished its first tile.")
        return

    with open(PROGRESS_PATH, "r", encoding="utf-8") as f:
        tiles_done = len(json.load(f))

    peaks_collected = 0
    if os.path.exists(RAW_PEAKS_PATH):
        with open(RAW_PEAKS_PATH, "r", encoding="utf-8") as f:
            peaks_collected = sum(1 for _ in f)

    failed_count = 0
    if os.path.exists(FAILED_PATH):
        with open(FAILED_PATH, "r", encoding="utf-8") as f:
            failed_count = len(json.load(f))

    last_update = os.path.getmtime(PROGRESS_PATH)
    seconds_since_update = time.time() - last_update

    pct = 100 * tiles_done / TOTAL_TILES
    bar_width = 30
    filled = int(bar_width * tiles_done / TOTAL_TILES)
    bar = "#" * filled + "-" * (bar_width - filled)

    print(f"[{bar}] {pct:5.1f}%  ({tiles_done}/{TOTAL_TILES} tiles)")
    print(f"Peaks collected so far: {peaks_collected}")
    if failed_count:
        print(f"Tiles that failed after retries (will retry next run): {failed_count}")

    eta = estimate_eta(tiles_done)
    if eta is not None:
        if eta < 60:
            print(f"Estimated time remaining: <1 min")
        else:
            print(f"Estimated time remaining: ~{eta / 60:.0f} min")
    else:
        print("Estimated time remaining: (run this again in a minute to get an estimate)")

    if seconds_since_update < STALE_WARNING_SECONDS:
        print(f"Status: RUNNING - last update {seconds_since_update:.0f}s ago")
    else:
        minutes = seconds_since_update / 60
        print(f"Status: possibly STOPPED - no progress in {minutes:.1f} minutes")
        print("  Check Task Manager for a python.exe process to confirm, or just re-run")
        print("  fetch_osm_peaks.py - it resumes from where it left off either way.")

    if tiles_done >= TOTAL_TILES:
        print("\nAll tiles done! Next steps: backfill_elevation.py, then build_database.py")


if __name__ == "__main__":
    main()
