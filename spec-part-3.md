# Code Asset Spec: bikeable-nyc (Part 3 design pass)

**Type:** Multi-file web app (React), extension of the Part 2 repo
**Mode:** Claude Code spec
**Estimated complexity:** 1 custom style JSON + edits to 3 existing files + 1 new search component, ~400 lines changed/added

## How to use this spec

Open Claude Code in the EXISTING bikeable-nyc repo from Part 2 (do not scaffold fresh). Paste this spec. Run in planning mode first. The Part 2 app must run before starting.

---

## Project goal

Design pass on Bikeable NYC: replace the default basemap with an edited style, add zoom-level rendering rules and contextual styling, and add both location search (geocoder) and feature search (the places data) in a single search input. The app's look and interaction should now trace to explicit rules, not library defaults.

## Tech stack

- Everything from Part 2 (Vite, React 18, maplibre-gl, pmtiles, MUI)
- New: OpenFreeMap Liberty style JSON downloaded into the repo and edited locally (src/styles/bikeable-basemap.json)
- New: Photon geocoding API (free, no key) for location search, debounced fetch
- No new heavy dependencies. No geocoder plugin packages; build the input with MUI Autocomplete.

## File structure (delta from Part 2)

```
bikeable-nyc/
├── src/
│   ├── styles/
│   │   └── bikeable-basemap.json  # NEW: edited Liberty style
│   ├── Map.jsx                    # EDIT: custom style, zoom rules, contextual styling, highlight logic
│   ├── SearchBox.jsx              # NEW: one input, two result groups (locations / places)
│   ├── App.jsx                    # EDIT: mount SearchBox, wire filter state to dimming
│   └── mapActions.js              # EDIT: add search + highlight actions to the chat contract
```

## Workflow steps

1. **Basemap edit:** fetch the Liberty style JSON, save locally, then: remove POI label layers, transit icons, and 3D building layers; desaturate road and landuse colors toward gray. Comment every removal in the JSON handling code with the design reason.
2. **Zoom rules:** places circle layer: radius interpolates from 2px at z11 to 6px at z15; place name labels (symbol layer) only at z15+; set explicit minzoom 11 on the places layer.
3. **Color system:** one 4-color categorical palette for coffee/food/culture/shops (plus gray for other), defined once as a constant and used by both the layer paint and the FilterBar chips so UI and map always match.
4. **Contextual styling:** when a category filter is active, non-matching places drop to 0.15 opacity instead of being filtered out. Selected/highlighted feature gets a larger radius and a stroke.
5. **Location search:** SearchBox.jsx queries Photon with the typed text (debounced 300ms, results biased to the NYC bbox), result group "Locations"; selecting one flyTo's with easing.
6. **Feature search:** the same input also matches against place names in the loaded places source (querySourceFeatures or a preloaded name index from the pipeline output), result group "Places"; selecting one highlights the feature and flyTo's it.
7. **Chat contract update:** add actions: search {query}, highlight {name} reuses the same highlight path as feature search. Chat, search, and clicks all drive one shared map-state path.

## Data acquisition

- No new data. Reuses places.pmtiles from Part 2.
- Photon is a live free API; no key, no signup.

## Style requirements

- Heavy comments explaining every design decision (why POI labels are removed, why dim instead of filter)
- No try/except beyond the existing JSON validation gate; a failed Photon fetch may simply show no results
- One shared constant for the category palette; no color literals scattered in components
- All camera movement goes through one flyTo helper with consistent easing/duration
- No new widgets beyond the single SearchBox. No layer switcher.

## Success criteria

- The basemap shows no POI labels or transit icons at any zoom, and reads as muted gray/beige under the data
- At z12 places render as small unlabeled circles; at z15+ labels appear; check both states
- Activating the coffee filter dims all non-coffee places to 15% opacity rather than hiding them
- Typing "Williamsburg" shows a Locations result that flies the camera; typing "coffee shop names actually in the data" shows a Places result that highlights the feature
- Chat "take me to Central Park" produces a search action through the same path as manual search

## Things to skip

- No routing, no isochrones, no clustering
- No Mapbox migration (stay on the free stack; Mapbox trade-offs are deck material)
- No DuckDB-WASM, no backend, no live Citi Bike data (Part 4)
- No dark mode, no style switcher