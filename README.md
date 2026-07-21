# Bikeable NYC

The Spatial Lab Geospatial Web Dev series app. One purpose: **help a rider pick a
destination near a Citi Bike station with bikes available.**

This is **Part 2** — the static half: an Overture places layer served as PMTiles
(no tile server), a category filter, hover/click interaction, and an AI chat panel
that controls the map through a validated JSON action contract. Parts 3 (design pass)
and 4 (full stack) extend this same repo.

## Prerequisites

- Node 20+ and npm
- Python 3.11+
- [tippecanoe](https://github.com/felt/tippecanoe) (`brew install tippecanoe`)

## 1. Build the data (run once)

The pipeline downloads Overture places for NYC, cleans them in DuckDB, buckets them
into four categories, and packs them into `public/data/places.pmtiles`.

```bash
python3 -m venv pipeline/.venv
source pipeline/.venv/bin/activate
pip install -r pipeline/requirements.txt

python pipeline/build_places.py
```

Expect ~150k–250k places and a `places.pmtiles` around 30–80 MB. `public/data/` is a
gitignored build artifact — regenerate it any time by re-running the script.

## 2. Run the app

```bash
npm install
cp .env.example .env      # then fill in your LLM endpoint + key
npm run dev
```

Open the printed URL. The map loads NYC at zoom 12 and reads `places.pmtiles`
directly via HTTP range requests — check the Network tab: no tile server involved.

## Environment (`.env`)

The chat panel talks to any OpenAI-compatible `/chat/completions` endpoint.

| Var | Meaning |
| --- | --- |
| `VITE_LLM_BASE_URL` | API base URL (e.g. `https://api.openai.com/v1`) |
| `VITE_LLM_API_KEY`  | API key (ships to the browser — use a throwaway key) |
| `VITE_LLM_MODEL`    | Model id |

## How it works

- **Data**: prepared fully up front by `pipeline/build_places.py`; the app never asks
  a server for anything that could be precomputed.
- **The action contract**: the chat can only move the map by emitting JSON action
  objects (`flyTo`, `setFilter`, `toggleLayer`, `highlight`, `reset`). Every action —
  from chat or from a filter chip — is validated in `src/mapActions.js` and dispatched
  through one path. Invalid actions are shown in the action log and ignored; the map
  never breaks on bad model output.
- **Palette**: the four category colors live once in `PALETTE` (`src/mapActions.js`)
  and drive both the map dots and the filter chips.

Try typing **"show me coffee in Williamsburg"** — the chat produces a `setFilter` and a
`flyTo`, both logged, and the map obeys.
