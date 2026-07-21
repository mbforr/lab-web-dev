"""
build_places.py — Bikeable NYC data pipeline (Part 2).

Prepares the ONE static places dataset the app renders: Overture places for the
NYC area, cleaned and bucketed into the app's four categories, packed into vector
tiles as PMTiles. The app then serves that single file statically and reads it with
HTTP range requests — no tile server, ever (see CLAUDE.md "Data rules").

Pipeline stages, all in one pass:
  1. Download Overture places (GeoParquet) for the NYC bbox via the overturemaps CLI.
  2. Clean + bucket in DuckDB: keep 5 columns, drop low-confidence rows, map the huge
     Overture category taxonomy down to our 4 app categories (+ "other").
  3. Export newline-delimited GeoJSON (GeoJSONSeq), the format tippecanoe wants.
  4. tippecanoe → public/data/places.pmtiles.

Teaching-code rules (CLAUDE.md):
  - NO try/except anywhere. If a stage fails, it should fail loudly with a real
    traceback so the workshop can see exactly what broke.
  - Every stage prints an emoji status line WITH timing.
"""

import subprocess
import time
from pathlib import Path

import duckdb

# --- Paths -------------------------------------------------------------------
# Resolve everything relative to the repo root so the script runs from anywhere.
ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "pipeline" / "build"          # gitignored intermediates
DATA = ROOT / "public" / "data"              # gitignored build artifact the app serves
RAW_PARQUET = BUILD / "places_raw.parquet"
GEOJSONSEQ = BUILD / "places.geojsonseq"
PMTILES = DATA / "places.pmtiles"

# NYC bounding box (xmin, ymin, xmax, ymax) from the Part 2 spec. This is the ONLY
# place the study area is defined.
BBOX = "-74.26,40.49,-73.70,40.92"

BUILD.mkdir(parents=True, exist_ok=True)
DATA.mkdir(parents=True, exist_ok=True)


def done(label, start, extra=""):
    """Print one emoji status line with elapsed seconds. The pipeline's only output."""
    secs = time.time() - start
    print(f"✅ {label} ({secs:.1f}s){(' — ' + extra) if extra else ''}")


# --- Stage 1: download -------------------------------------------------------
# The overturemaps CLI streams the current Overture release for our bbox straight
# to GeoParquet. We ask only for the `place` type; the other Overture themes
# (buildings, transportation, …) are irrelevant to picking a destination.
t = time.time()
print(f"⬇️  Downloading Overture places for NYC bbox {BBOX} …")
subprocess.run(
    [
        "overturemaps", "download",
        "--bbox", BBOX,
        "-f", "geoparquet",
        "--type", "place",
        "-o", str(RAW_PARQUET),
    ],
    check=True,
)
done("Downloaded Overture places", t, f"{RAW_PARQUET.stat().st_size / 1e6:.0f} MB GeoParquet")

# --- Stage 2 & 3: clean, bucket, export --------------------------------------
# DuckDB does the heavy lifting in-process. We load the spatial extension so we
# can turn Overture's WKB geometry into real geometries and write GeoJSONSeq.
con = duckdb.connect()
con.execute("INSTALL spatial; LOAD spatial;")

# Build a cleaned table:
#   - keep only the columns the app actually uses (id, name, category, confidence,
#     address, geometry); everything else in Overture is dead weight in the tiles.
#   - confidence >= 0.5: Overture flags many low-confidence guesses; a rider does
#     not want to bike to a place that probably isn't there.
#   - app_category: collapse Overture's hundreds of leaf categories into our 4
#     buckets. This CASE is the SINGLE SOURCE OF TRUTH for the taxonomy — the
#     frontend palette keys (coffee/food/culture/shops/other) must match these.
#
# We match on category TOKENS via regex ('(^|_)word(_|$)'), not plain substrings,
# so "barber_shop" lands in shops (the "shop" token) instead of food (a naive
# '%bar%' substring would wrongly grab it). Order matters: "coffee_shop" contains
# the "shop" token too, so coffee is tested before shops.
t = time.time()
con.execute(
    f"""
    CREATE TABLE places AS
    SELECT
        id,
        names.primary                          AS name,
        categories.primary                     AS ov_category,
        confidence,
        -- first freeform address string if Overture has one (for the click popup)
        addresses[1].freeform                  AS address,
        -- overturemaps GeoParquet already types this column as GEOMETRY (CRS84),
        -- so DuckDB spatial reads it directly — no WKB conversion needed.
        geometry                               AS geom
    FROM read_parquet('{RAW_PARQUET.as_posix()}')
    WHERE confidence >= 0.5
      AND names.primary IS NOT NULL;
    """
)
raw_count = con.execute("SELECT count(*) FROM places").fetchone()[0]
done("Cleaned + confidence-filtered", t, f"{raw_count:,} places")

t = time.time()
con.execute(
    """
    ALTER TABLE places ADD COLUMN category VARCHAR;
    UPDATE places SET category = CASE
        WHEN regexp_matches(ov_category, '(^|_)(coffee|cafe|tea)(_|$)') THEN 'coffee'
        WHEN regexp_matches(ov_category, '(^|_)(restaurant|food|bar|pub|bakery|pizza|diner|bistro|brewery|eat_and_drink)(_|$)') THEN 'food'
        WHEN regexp_matches(ov_category, '(^|_)(museum|art|arts|gallery|theatre|theater|library|cinema|landmark|historic|monument|tourist|cultural)(_|$)') THEN 'culture'
        WHEN regexp_matches(ov_category, '(^|_)(shop|store|retail|market|grocery|supermarket|boutique|mall)(_|$)') THEN 'shops'
        ELSE 'other'
    END;
    """
)
breakdown = con.execute(
    "SELECT category, count(*) FROM places GROUP BY category ORDER BY count(*) DESC"
).fetchall()
done("Bucketed into app categories", t, ", ".join(f"{c}={n:,}" for c, n in breakdown))

# Export GeoJSONSeq (one JSON feature per line). DuckDB's GDAL writer takes the
# GEOMETRY column as the feature geometry and every other column as a property.
t = time.time()
con.execute(
    f"""
    COPY (SELECT id, name, category, confidence, address, geom FROM places)
    TO '{GEOJSONSEQ.as_posix()}'
    (FORMAT GDAL, DRIVER 'GeoJSONSeq', SRS 'EPSG:4326');
    """
)
done("Exported GeoJSONSeq", t, GEOJSONSEQ.name)

# --- Stage 4: tippecanoe → PMTiles -------------------------------------------
# -zg               : let tippecanoe choose a sensible max zoom for this density
# --drop-densest-as-needed : thin the densest tiles instead of blowing the size budget
# -l places         : pin the layer name to "places" so Map.jsx can name it as the
#                     source-layer with certainty
# --force           : overwrite the previous build
t = time.time()
print("🧩 Running tippecanoe → PMTiles …")
subprocess.run(
    [
        "tippecanoe",
        "-zg",
        "--drop-densest-as-needed",
        "-l", "places",
        "-o", str(PMTILES),
        "--force",
        str(GEOJSONSEQ),
    ],
    check=True,
)
done("Wrote PMTiles", t, f"{PMTILES} — {PMTILES.stat().st_size / 1e6:.0f} MB")
print(f"🎉 Done. Serve the app and it will read {PMTILES.name} via HTTP range requests.")
