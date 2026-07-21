import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import { PALETTE, flyTo } from './mapActions'
import rawLiberty from './styles/bikeable-basemap.json'

// --- Basemap: an EDITED Liberty style ---------------------------------------
// Part 3 design pass: we no longer load OpenFreeMap's default style URL. We vendor
// the raw Liberty style (src/styles/bikeable-basemap.json) and edit it here, in code,
// so every change carries the design reason WHY (JSON can't hold comments). The base
// must recede so our category dots read as the foreground.
//
// The sprite/glyphs/sources URLs in the vendored style are absolute (openfreemap.org),
// so tiles, icons, and fonts still load from OpenFreeMap — we only reshape the STYLE.

// Layers we delete outright.
const REMOVE_LAYER_IDS = new Set([
  // POI labels compete directly with our places dots — they're the same information
  // channel (points of interest), and the whole app is about OUR curated points.
  'poi_r20', 'poi_r7', 'poi_r1',
  // Transit icons are off-purpose for a bike-destination map and add visual noise.
  'poi_transit',
  // 3D building extrusions draw attention and occlude data at an angle; a flat base
  // reads calmer under the dots.
  'building-3d',
])

// Muted replacement colors. Roads and landuse desaturate toward gray/beige so nothing
// on the base competes with the four saturated category colors.
const ROAD_FILL = '#d9d6cf'    // road body: warm mid-gray (was bright yellow #fea etc.)
const ROAD_CASING = '#eae7e0'  // casing: a shade lighter so roads keep subtle structure
const LAND_FILL = '#ecebe4'    // landuse: pale beige
const GREEN_FILL = '#e4e7de'   // parks/wood/grass: barely-green gray (was #d8e8c8 etc.)

// Produce the edited style object. structuredClone keeps the imported JSON pristine
// (Vite may share the module across HMR reloads).
function buildBikeableStyle(raw) {
  const style = structuredClone(raw)
  style.layers = style.layers
    .filter((layer) => !REMOVE_LAYER_IDS.has(layer.id))
    .map((layer) => {
      const sl = layer['source-layer']
      // Roads (and bridges/tunnels, all under source-layer "transportation"): flatten
      // every line color to gray. Casings get the lighter tone. Widths are untouched,
      // so the network still reads — just quietly.
      if (sl === 'transportation' && layer.type === 'line') {
        layer.paint = { ...layer.paint, 'line-color': layer.id.includes('casing') ? ROAD_CASING : ROAD_FILL }
      }
      // Landuse / landcover / parks: desaturate the fills so green/color patches don't
      // read as meaningful next to our data.
      if ((sl === 'landuse' || sl === 'landcover' || sl === 'park') && layer.type === 'fill') {
        const green = sl === 'park' || layer.id.includes('wood') || layer.id.includes('grass')
        layer.paint = { ...layer.paint, 'fill-color': green ? GREEN_FILL : LAND_FILL }
      }
      return layer
    })
  return style
}

// --- Places data + layer ids -------------------------------------------------
// Read straight from public/ with HTTP range requests via the pmtiles:// protocol.
const PLACES_PMTILES = `pmtiles://${window.location.origin}/data/places.pmtiles`
const SOURCE = 'places'
const SOURCE_LAYER = 'places' // pinned by `tippecanoe -l places`
const LAYER = 'places-circles'
const LABEL_LAYER = 'places-labels'

// Default NYC overview (also where reset() returns to).
const NYC_CENTER = [-73.98, 40.74]
const NYC_ZOOM = 12

// Register the pmtiles protocol exactly ONCE for the whole app. maplibregl keeps
// protocols globally, so registering per-mount would throw on the second map.
const protocol = new Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile)

// --- Paint expressions -------------------------------------------------------
// Circle color is data-driven from the shared PALETTE: the map dot for a place and
// its category chip are guaranteed the same color because both read PALETTE.
const colorExpression = [
  'match',
  ['get', 'category'],
  'coffee', PALETTE.coffee,
  'food', PALETTE.food,
  'culture', PALETTE.culture,
  'shops', PALETTE.shops,
  PALETTE.other, // fallback for 'other'
]

// Zoom-aware radius: tiny dots at overview zoom, bigger as you close in (Part 3 rule).
const BASE_RADIUS = ['interpolate', ['linear'], ['zoom'], 11, 2, 15, 6]
const HIGHLIGHT_RADIUS = ['interpolate', ['linear'], ['zoom'], 11, 5, 15, 10]

// The three paint properties all depend on the SAME two pieces of state — the active
// category and the highlighted name — so we build them together. This is what lets
// "dim, don't hide" and "emphasize the highlight" coexist on the single circle layer.
const radiusExpr = (name) =>
  name ? ['case', ['==', ['get', 'name'], name], HIGHLIGHT_RADIUS, BASE_RADIUS] : BASE_RADIUS

const strokeExpr = (name) =>
  name ? ['case', ['==', ['get', 'name'], name], 2, 0] : 0

// Filtering DIMS instead of hiding (CLAUDE.md: context stays, focus shifts). A matching
// place keeps full opacity; a non-matching one drops to 0.15 but is still there. The
// highlighted place always stays bright, whatever the filter.
const opacityExpr = (category, name) => {
  const byCategory =
    category === 'all'
      ? 0.85
      : ['case', ['==', ['get', 'category'], category], 0.85, 0.15]
  return name ? ['case', ['==', ['get', 'name'], name], 0.9, byCategory] : byCategory
}

export default function Map({ onReady }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildBikeableStyle(rawLiberty),
      center: NYC_CENTER,
      zoom: NYC_ZOOM,
    })
    mapRef.current = map

    // Two popups with distinct jobs (CLAUDE.md interaction rule): hover shows ONLY the
    // cheap name; click commits to the full detail.
    const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    const clickPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false })

    // The two pieces of state the paint expressions depend on. applyPaint() rebuilds all
    // three paint properties from them, so category dimming and highlight never clobber
    // each other.
    let currentCategory = 'all'
    let highlightedName = null
    const applyPaint = () => {
      map.setPaintProperty(LAYER, 'circle-radius', radiusExpr(highlightedName))
      map.setPaintProperty(LAYER, 'circle-stroke-width', strokeExpr(highlightedName))
      map.setPaintProperty(LAYER, 'circle-opacity', opacityExpr(currentCategory, highlightedName))
    }

    map.on('load', () => {
      map.addSource(SOURCE, { type: 'vector', url: PLACES_PMTILES })

      // Circle layer: minzoom 11 so we never render the whole city as a smear of dots.
      map.addLayer({
        id: LAYER,
        type: 'circle',
        source: SOURCE,
        'source-layer': SOURCE_LAYER,
        minzoom: 11,
        paint: {
          'circle-color': colorExpression,
          'circle-radius': radiusExpr(null),
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': strokeExpr(null),
          'circle-opacity': opacityExpr('all', null),
        },
      })

      // Name labels only from z15+ (Part 3 zoom rule): at overview zoom labels would be
      // unreadable clutter; up close they help you actually read destinations.
      map.addLayer({
        id: LABEL_LAYER,
        type: 'symbol',
        source: SOURCE,
        'source-layer': SOURCE_LAYER,
        minzoom: 15,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 0.6],
          'text-optional': true, // drop labels rather than overlap
        },
        paint: {
          'text-color': '#333333',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2,
        },
      })

      // Hover: pointer cursor + name-only tooltip (cheap info).
      map.on('mousemove', LAYER, (e) => {
        map.getCanvas().style.cursor = 'pointer'
        hoverPopup.setLngLat(e.lngLat).setText(e.features[0].properties.name).addTo(map)
      })
      map.on('mouseleave', LAYER, () => {
        map.getCanvas().style.cursor = ''
        hoverPopup.remove()
      })

      // Click: full detail popup (name, category, address if present).
      map.on('click', LAYER, (e) => {
        const p = e.features[0].properties
        const address = p.address ? `<div class="popup-addr">${p.address}</div>` : ''
        clickPopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="popup-name">${p.name}</div>` +
            `<div class="popup-cat">${p.category}</div>` +
            address,
          )
          .addTo(map)
      })

      // The imperative controller: the ONLY surface anything outside this file uses to
      // mutate the map. dispatchAction() (mapActions.js) and SearchBox call these.
      onReady({
        flyTo: (center, zoom) => flyTo(map, center, zoom),

        // Part 3: filtering DIMS non-matching places (opacity) instead of hiding them.
        setCategoryFilter: (category) => {
          currentCategory = category
          applyPaint()
        },

        toggleLayer: (layer, visible) => {
          const id = layer === 'places' ? LAYER : layer
          map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
        },

        setHighlight: (name) => {
          highlightedName = name
          applyPaint()
          // If a matching place is already on screen, center on it. When the name comes
          // from feature search we also get an explicit flyTo with coordinates, so this
          // just covers the chat-highlight case.
          const matches = map.queryRenderedFeatures({ layers: [LAYER], filter: ['==', ['get', 'name'], name] })
          if (matches.length > 0) flyTo(map, matches[0].geometry.coordinates)
        },

        reset: () => {
          currentCategory = 'all'
          highlightedName = null
          applyPaint()
          flyTo(map, NYC_CENTER, NYC_ZOOM)
        },

        // Feature search for the SearchBox "Places" group. Searches the places currently
        // loaded in tiles (querySourceFeatures) — coverage is the loaded viewport, not all
        // 200k rows. Full-dataset search is a Part 4 DuckDB-WASM job by design.
        searchFeatures: (text) => {
          const q = text.trim().toLowerCase()
          if (!q) return []
          const feats = map.querySourceFeatures(SOURCE, { sourceLayer: SOURCE_LAYER })
          const seen = new Set()
          const out = []
          for (const f of feats) {
            const name = f.properties.name
            if (!name || seen.has(name) || !name.toLowerCase().includes(q)) continue
            seen.add(name)
            out.push({ name, center: f.geometry.coordinates })
            if (out.length >= 8) break
          }
          return out
        },
      })
    })

    return () => map.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} className="map-root" />
}
