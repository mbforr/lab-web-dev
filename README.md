# Bikeable NYC

The Spatial Lab **Geospatial Web Dev** series app. One purpose, one sentence:

> **Help a rider pick a destination near a Citi Bike station with bikes available.**

Every layer, control, and feature serves that goal. The app is built across three
workshop parts in this one repo, each tagged so you can check out and review any stage.

| Stage | Tag | What it adds |
|-------|-----|--------------|
| **Part 2** — scaffold | `part-2` | Overture places served as PMTiles (no tile server), category filter, hover/click, AI chat driven by a validated JSON action contract |
| **Part 3** — design pass | `part-3` | Locally edited basemap, zoom-aware rendering, filter *dimming*, one search box (locations + features) |
| **Part 4** — full stack | `part-4` | In-browser DuckDB-WASM queries, live Citi Bike GBFS stations, FastAPI + Supabase spot reports |

```bash
git checkout part-2   # review just the scaffold
git checkout part-3   # …the design pass
git checkout main     # everything, current
```

---

## Stack

- **Frontend**: Vite + React 18 (JavaScript only), `maplibre-gl` + `pmtiles`, `@mui/material`
  for widgets. Basemap: OpenFreeMap Liberty. State via `useState`/context only.
- **In-browser SQL**: `@duckdb/duckdb-wasm` (Part 4).
- **Pipeline**: Python + `overturemaps` CLI + DuckDB + tippecanoe.
- **Backend** (Part 4): FastAPI (one file) + Supabase-hosted Postgres.
- **Live data**: Citi Bike GBFS (public, no key).

## Prerequisites

- Node 20+ and npm
- Python 3.11+
- [tippecanoe](https://github.com/felt/tippecanoe) (`brew install tippecanoe`)
- (Part 4 backend only) a Supabase project + its `DATABASE_URL`

---

## Quick start

### 1 — Build the data (run once)

Downloads Overture places for NYC, cleans + buckets them in DuckDB, and writes two build
artifacts to `public/data/`: `places.pmtiles` (for rendering) and `places.parquet` (for
in-browser querying). `public/data/` is gitignored — regenerate any time.

```bash
python3 -m venv pipeline/.venv
source pipeline/.venv/bin/activate
pip install -r pipeline/requirements.txt
python pipeline/build_places.py
```

Expect ~400k places, a ~16 MB `places.pmtiles`, and a ~30 MB `places.parquet`. The pipeline
prints an emoji + timing line per stage.

### 2 — Run the frontend

```bash
npm install
cp .env.example .env      # fill in your LLM endpoint/key (and, for Part 4, the API URL)
npm run dev
```

Open the printed URL. The map loads NYC at zoom 12 and reads `places.pmtiles` via **HTTP
range requests** — check the Network tab: no tile server involved. The chat, DuckDB-WASM
stats, and live stations all work with just this.

### 3 — Run the reports API (Part 4 only — optional)

The spot-reports feature needs Postgres. Everything else runs without it.

```bash
# a. Create a Supabase project, then paste api/schema.sql into its SQL editor and run it.
# b. Put the connection string in api/.env (gitignored):
echo 'DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres' > api/.env
# c. Install + run:
python3 -m venv api/.venv && source api/.venv/bin/activate
pip install -r api/requirements.txt
cd api && set -a && source .env && set +a && uvicorn main:app --port 8000
```

Set `VITE_API_BASE_URL=http://localhost:8000` in your frontend `.env`.

---

## Environment (`.env`)

Copy `.env.example` → `.env`. Vite only exposes `VITE_`-prefixed vars to the browser.

| Var | Where | Meaning |
|-----|-------|---------|
| `VITE_LLM_BASE_URL` | frontend `.env` | OpenAI-compatible base URL (e.g. `https://api.openai.com/v1`) |
| `VITE_LLM_API_KEY`  | frontend `.env` | API key — **ships to the browser, use a throwaway key** |
| `VITE_LLM_MODEL`    | frontend `.env` | Model id |
| `VITE_API_BASE_URL` | frontend `.env` | Reports API address, e.g. `http://localhost:8000` |
| `DATABASE_URL`      | **`api/.env` only** | Supabase Postgres URI. **Never** a `VITE_` var — it would leak Postgres creds to the browser. |

---

## The build, part by part

Check out each tag to see the repo at that stage. Each part's success criteria are how you
know it works.

### Part 2 — scaffold (`part-2`)

The static half. Prepares data fully up front and serves it statically.

- **Pipeline** [`pipeline/build_places.py`](pipeline/build_places.py): Overture → DuckDB
  (keep 5 columns, `confidence ≥ 0.5`, bucket into coffee/food/culture/shops/other) →
  GeoJSONSeq → tippecanoe → `places.pmtiles`.
- **The action contract** [`src/mapActions.js`](src/mapActions.js): the chat controls the
  map ONLY through validated JSON action objects. `PALETTE` (the one color source),
  `validateAction` (the validation gate), and `dispatchAction` (the single path to the map)
  all live here.
- **Map** [`src/Map.jsx`](src/Map.jsx): MapLibre + pmtiles, one category-colored circle
  layer, hover tooltip (name) / click popup (details).
- **Widgets**: [`FilterBar.jsx`](src/FilterBar.jsx) chips, [`Chat.jsx`](src/Chat.jsx)
  (system prompt + few-shots → parse → validate → dispatch → visible action log).

**Verify:** pipeline writes `places.pmtiles`; `npm run dev` shows the layer at z12 with
range requests in the Network tab; chips filter instantly; chat *"show me coffee in
Williamsburg"* logs two actions and the map obeys; a malformed reply is logged invalid and
the map doesn't move.

### Part 3 — design pass (`part-3`)

The look and interaction now trace to explicit rules, not library defaults.

- **Edited basemap** [`src/styles/bikeable-basemap.json`](src/styles/bikeable-basemap.json)
  (vendored raw Liberty) + a documented transform in [`src/Map.jsx`](src/Map.jsx) that
  removes POI labels / transit icons / 3D buildings and desaturates roads + landuse.
- **Zoom rules**: circle radius interpolates 2px→6px (z11→z15); name labels appear at z15+.
- **Dimming, not hiding**: an active category filter drops non-matching places to 0.15
  opacity — context stays, focus shifts.
- **One search box** [`src/SearchBox.jsx`](src/SearchBox.jsx): MUI Autocomplete with two
  groups — *Locations* (Photon geocoder) and *Places* (the data). Chat gains a `search`
  action so chat, search, and clicks share one flyTo path.

**Verify:** no POI/transit labels at any zoom, muted base; small circles at z12, labels at
z15+; coffee filter dims the rest to 15%; typing *"Williamsburg"* flies the camera, a data
place-name highlights a feature; chat *"take me to Central Park"* goes through the search path.

### Part 4 — full stack (`part-4`)

Makes the app fully interactive and completes its purpose.

- **DuckDB-WASM** [`src/duck.js`](src/duck.js): SQL in the browser over `places.parquet`
  (range requests, no server). `viewportStats` powers [`StatsPanel.jsx`](src/StatsPanel.jsx)
  (live category counts on pan/zoom); `searchNames` upgrades the search box to all ~400k
  places, not just loaded tiles.
- **Live stations** [`src/useStations.js`](src/useStations.js): GBFS `station_information`
  once + `station_status` every 30s, joined to GeoJSON; the map sizes/colors stations by
  bikes available. Chat gains `filterAvailable` to dim low-availability stations.
- **Reports** [`api/main.py`](api/main.py) (FastAPI, one file) + [`api/schema.sql`](api/schema.sql):
  [`ReportForm.jsx`](src/ReportForm.jsx) opens on a place click and POSTs a rated comment;
  validation lives **server-side** (Pydantic) so a bad request is rejected 422 before any
  insert. `GET /reports` returns the latest 500 as GeoJSON, drawn as a distinct layer.

**Verify:** StatsPanel counts update within ~1s of pan/zoom with query timing in the console
and only `places.parquet` range requests in the Network tab; stations render and change on
the 30s poll; chat *"coffee near a station with bikes in Fort Greene"* fires
`setFilter` + `filterAvailable` + a flyTo; submitting a report returns 201 and appears on the
map; a rating of 9 or out-of-NYC coordinates returns 422 and inserts nothing.

---

## How it works (the rules that hold across all parts)

- **Prepare data up front.** The app serves static `places.pmtiles` / `places.parquet` and
  never re-asks a server for anything precomputable. Only truly live data (GBFS, user
  reports) touches a network service.
- **One JSON action contract.** Chat, search, and clicks all build action objects dispatched
  by [`src/mapActions.js`](src/mapActions.js). Invalid objects are logged and ignored — the
  map never breaks on bad model output. There is no second way to move the map.
- **One palette, one camera helper.** The four category colors live once in `PALETTE`; all
  camera movement goes through one `flyTo` helper.
- **Teaching code fails visibly.** No defensive try/except except the JSON validation gate
  and the GBFS poll (which keeps the last state on a failed fetch).

## Repo layout

```
bikeable-nyc/
├── pipeline/build_places.py     # Overture → DuckDB → PMTiles + Parquet
├── public/data/                 # build artifact (gitignored): places.pmtiles, places.parquet
├── src/
│   ├── mapActions.js            # PALETTE, action schema + validation gate, dispatch, flyTo
│   ├── Map.jsx                  # MapLibre: basemap, places, stations, reports layers
│   ├── FilterBar.jsx            # category chips
│   ├── SearchBox.jsx            # locations (Photon) + places (DuckDB-WASM)
│   ├── Chat.jsx                 # LLM → action JSON → action log
│   ├── StatsPanel.jsx           # viewport counts (DuckDB-WASM)
│   ├── ReportForm.jsx           # submit a spot report
│   ├── duck.js                  # DuckDB-WASM init + query helpers
│   ├── useStations.js           # Citi Bike GBFS hook
│   └── styles/bikeable-basemap.json  # edited Liberty style
└── api/
    ├── main.py                  # FastAPI: POST/GET /reports
    ├── schema.sql               # reports table DDL (run once in Supabase)
    └── requirements.txt
```
