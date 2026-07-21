# Code Asset Spec: bikeable-nyc (Part 2 scaffold)

**Type:** Multi-file web app (React) + data pipeline script
**Mode:** Claude Code spec
**Estimated complexity:** 1 Python pipeline script + Vite React app (~6 source files), ~600 lines total

## How to use this spec

Open Claude Code in a fresh project directory. Paste this spec as your initial instruction. Run in planning mode first and review the plan before generation.

---

## Project goal

Scaffold Bikeable NYC, the Geospatial Web Dev series app. Single purpose: help a rider pick a destination near a Citi Bike station with bikes available. Part 2 delivers the static half: an Overture places layer served as PMTiles, a category filter, hover/click interaction, and an AI chat panel that controls the map through a structured JSON action contract. No backend, no live data yet (Parts 3-4 extend this repo).

## Tech stack

- Python 3.11+ for the pipeline: overturemaps CLI (pip), DuckDB (latest), tippecanoe (brew/apt) for PMTiles generation
- Node 20+, Vite (latest), React 18
- maplibre-gl (v4+), pmtiles (JS package, registers the pmtiles:// protocol)
- @mui/material for widgets (filter chips, chat panel shell)
- Basemap: OpenFreeMap Liberty style (free, no key)
- AI chat: any OpenAI-compatible chat completions endpoint, base URL and key from .env (VITE_LLM_BASE_URL, VITE_LLM_API_KEY, VITE_LLM_MODEL). Default to an open model.

## File structure

```
bikeable-nyc/
├── pipeline/
│   └── build_places.py      # Overture download → DuckDB clean → GeoJSONSeq → tippecanoe → places.pmtiles
├── public/
│   └── data/places.pmtiles  # pipeline output, served statically
├── src/
│   ├── main.jsx             # entry
│   ├── App.jsx              # layout: map + filter bar + chat panel + action log
│   ├── Map.jsx              # MapLibre init, pmtiles protocol, sources/layers, hover + click popups
│   ├── FilterBar.jsx        # category chips (coffee, food, culture, shops, all)
│   ├── Chat.jsx             # chat UI, calls the model, renders the action log
│   └── mapActions.js        # JSON action schema validation + dispatch to the map
├── .env.example
└── README.md                # pipeline run + app run instructions
```

## Workflow steps

1. **Pipeline:** build_places.py: download Overture places for NYC bbox (-74.26, 40.49, -73.70, 40.92) via the overturemaps CLI to GeoParquet. In DuckDB, keep only id, name, primary category, confidence, geometry; filter confidence >= 0.5; map Overture categories into 4 app categories (coffee, food, culture, shops) plus other; export GeoJSONSeq; run tippecanoe (-zg, drop-densest-as-needed) to public/data/places.pmtiles. Print counts and timing at each stage.
2. **Map:** Map.jsx: register pmtiles protocol, init MapLibre with the OpenFreeMap Liberty style, center on NYC (zoom 12). Add places.pmtiles as a vector source, one circle layer colored by app category. Hover: pointer cursor + name in a lightweight tooltip. Click: popup with name, category, address if present.
3. **Filter:** FilterBar.jsx: MUI chips; selecting a category applies a MapLibre setFilter on the places layer. State via useState in App.jsx, no Redux.
4. **Chat contract:** mapActions.js: define and validate the action schema. Supported actions: flyTo {center, zoom}, setFilter {category}, toggleLayer {layer, visible}, highlight {name}, reset {}. Invalid objects are logged and ignored, never applied.
5. **Chat wiring:** Chat.jsx: send the user message plus a system prompt that instructs the model to reply ONLY with one JSON action object matching the schema (include the schema and 3 few-shot examples in the system prompt). Parse the reply, validate via mapActions.js, dispatch to the map, and append the raw action object to a visible action log under the chat.
6. **README:** how to run the pipeline once, then npm install / npm run dev.

## Data acquisition

- Overture places: overturemaps CLI against the current Overture release, NYC bbox above. Expect roughly 150k-250k places, a few hundred MB as GeoParquet, and a places.pmtiles around 30-80 MB.
- No other data in Part 2. Citi Bike GBFS arrives in Part 4.

## Style requirements

- Heavy comments in every source file explaining WHY, not what (this is teaching code)
- No try/except in the pipeline script (let failures show during teaching); the ONLY error handling in the app is the JSON validation gate in mapActions.js
- Pipeline prints emoji status lines with timing, e.g. "✅ 203,441 places after confidence filter (4.2s)"
- No CSS frameworks for the map itself; MUI only for widgets
- One way to do each thing. No alternative-implementation comments.

## Success criteria

- Pipeline runs end-to-end with a single python pipeline/build_places.py and writes places.pmtiles
- npm run dev shows the basemap plus the places layer at zoom 12 without a tile server (verify range requests in the Network tab)
- Category chips filter the layer instantly, client-side
- Typing "show me coffee in Williamsburg" in chat produces two logged actions (setFilter, flyTo) and the map obeys
- A malformed model reply appears in the log marked invalid and the map state does not change

## Things to skip

- No routing, no geocoding search box (Part 3), no DuckDB-WASM, no backend, no database (Part 4)
- No authentication, no deployment config, no tests
- No Redux, no TypeScript, no extra layers beyond places
- Do not add a layer switcher or additional filters beyond the category chips