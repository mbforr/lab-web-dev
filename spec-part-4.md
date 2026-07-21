# Code Asset Spec: bikeable-nyc (Part 4 full stack)

**Type:** Multi-file web app + FastAPI backend, extension of the Parts 2-3 repo
**Mode:** Claude Code spec
**Estimated complexity:** DuckDB-WASM module + live-feed hook + 1 FastAPI app + SQL migration + form component, ~700 lines added

## How to use this spec

Open Claude Code in the EXISTING bikeable-nyc repo (Parts 2-3 complete and running). Paste this spec. Run in planning mode first. Have a Supabase project created with its Postgres connection string ready in an env var before the backend step.

---

## Project goal

Make Bikeable NYC fully interactive: DuckDB-WASM runs SQL in the browser against the prepared places GeoParquet, the live Citi Bike GBFS feed completes the app's purpose (destinations near stations with bikes available), and a FastAPI service stores user-submitted spot reports in Supabase Postgres and serves them back as a map layer.

## Tech stack

- Everything from Parts 2-3
- New frontend: @duckdb/duckdb-wasm
- Live feed: Citi Bike GBFS (https://gbfs.lyft.com/gbfs/2.3/bkn/en/station_information.json and station_status.json), public, no key
- Backend: Python 3.11+, FastAPI, uvicorn, psycopg (or asyncpg), Pydantic v2
- Database: Supabase-hosted Postgres, connection string via DATABASE_URL env var (backend only, never in frontend env)
- Pipeline addition: build_places.py also publishes places.parquet (GeoParquet with lon/lat columns) to public/data/ for DuckDB-WASM

## File structure (delta)

```
bikeable-nyc/
├── pipeline/build_places.py   # EDIT: also emit public/data/places.parquet
├── api/
│   ├── main.py                # NEW: FastAPI app: POST /reports, GET /reports
│   ├── schema.sql             # NEW: reports table DDL (run once against Supabase)
│   └── requirements.txt       # NEW
├── src/
│   ├── duck.js                # NEW: DuckDB-WASM init + query helpers (viewport stats, name search)
│   ├── useStations.js         # NEW: GBFS hook: fetch, join info+status, poll every 30s
│   ├── StatsPanel.jsx         # NEW: viewport category counts, updates on moveend
│   ├── ReportForm.jsx         # NEW: submit a spot report for a clicked place
│   ├── Map.jsx                # EDIT: stations layer styled by bikes_available, reports layer
│   ├── SearchBox.jsx          # EDIT: feature search now queries DuckDB-WASM
│   └── mapActions.js          # EDIT: chat contract gains station-awareness (filterAvailable)
```

## Workflow steps

1. **Pipeline edit:** emit places.parquet alongside the PMTiles (same cleaned columns plus lon/lat doubles) so one prepared dataset serves both rendering (PMTiles) and querying (Parquet).
2. **DuckDB-WASM:** duck.js: lazy-init the WASM bundle, register the Parquet over HTTP. Two helpers: viewportStats(bounds) returns category counts via SQL between-bounds predicate; searchNames(text) returns top 10 ILIKE matches with coordinates. Log query timing to console.
3. **Stats panel:** StatsPanel.jsx: on map moveend (debounced), run viewportStats and render counts per category. This replaces nothing; it's the WASM teaching artifact.
4. **Search upgrade:** SearchBox.jsx Places group now uses searchNames instead of querySourceFeatures, so results cover all 200k places, not just loaded tiles.
5. **GBFS hook:** useStations.js: fetch station_information once, poll station_status every 30s, join on station_id, return GeoJSON. Map.jsx renders stations as circles: radius/color scaled by bikes_available, near-zero availability drawn dim.
6. **Chat update:** new action filterAvailable {minBikes} dims stations below the threshold; system prompt updated with the new schema and one example.
7. **Database:** schema.sql: reports(id uuid default, place_id text, place_name text, comment text, rating int check 1-5, lon double, lat double, created_at timestamptz default now()). Plain SQL, run once via the Supabase SQL editor.
8. **API:** api/main.py: FastAPI with CORS for the dev origin. POST /reports validates via Pydantic (rating bounds, comment length <= 280, lon/lat in NYC bbox) and inserts. GET /reports returns the latest 500 as GeoJSON. Run with uvicorn on :8000.
9. **Frontend flow:** ReportForm.jsx opens from the place popup, POSTs to the API, and on success refetches GET /reports; reports render as a small distinct layer.

## Data acquisition

- Places: already prepared in Parts 2-3; the pipeline edit re-runs once.
- Citi Bike GBFS: live public endpoints above; expect roughly 2,200 stations.
- Reports: user-generated at runtime; seed 3 sample rows in schema.sql comments for testing.

## Style requirements

- Heavy comments, especially in duck.js (what WASM is doing and why no server is involved) and main.py (why validation lives server-side)
- No try/except in teaching paths; the two allowed guards are the existing chat JSON gate and the GBFS poll (a failed poll keeps the last state, with a console warning)
- Backend code stays minimal: no routers, no ORM, no auth. One file.
- DATABASE_URL only in the API's environment; the frontend never sees Postgres.
- Timing logs on every DuckDB query, emoji status prints in the pipeline as before.

## Success criteria

- StatsPanel updates category counts within ~1s of pan/zoom, with query timing visible in the console and zero requests to any server during the query (Network tab shows only range requests to places.parquet)
- Stations render with live availability and visibly change on a 30s poll cycle
- Chat "coffee near a station with bikes in Fort Greene" fires setFilter + filterAvailable + flyTo and the map obeys
- Submitting a report from a popup returns 201, the row exists in Supabase, and it appears on the map after refetch
- A POST with rating 9 or out-of-NYC coordinates returns 422 and nothing is inserted

## Things to skip

- No auth, no user accounts, no row-level security setup (mention in README as the production next step)
- No websockets; polling is the pattern taught
- No deployment configs, no Docker, no tests
- No routing/isochrones, no clustering, no admin UI for reports
- Do not replace the PMTiles rendering path with WASM; both coexist by design