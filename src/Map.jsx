import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import { PALETTE, flyTo } from './mapActions'

// --- Constants ---------------------------------------------------------------
// OpenFreeMap Liberty: a free, key-less basemap style. In Part 3 this gets
// swapped for a locally edited style JSON; keeping it as one constant makes that
// a one-line change.
const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

// The single places dataset the pipeline produced, read straight from public/
// with HTTP range requests via the pmtiles:// protocol. No tile server.
const PLACES_PMTILES = `pmtiles://${window.location.origin}/data/places.pmtiles`
const SOURCE = 'places'
const SOURCE_LAYER = 'places' // pinned by `tippecanoe -l places`
const LAYER = 'places-circles'

// Default NYC overview (also where reset() returns to).
const NYC_CENTER = [-73.98, 40.74]
const NYC_ZOOM = 12

// Register the pmtiles protocol exactly ONCE for the whole app. maplibregl keeps
// protocols globally, so registering per-mount would throw on the second map.
const protocol = new Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile)

// --- Paint expression builders -----------------------------------------------
// Circle color is data-driven from the shared PALETTE: the map dot for a place
// and its category chip are guaranteed the same color because both read PALETTE.
const colorExpression = [
  'match',
  ['get', 'category'],
  'coffee', PALETTE.coffee,
  'food', PALETTE.food,
  'culture', PALETTE.culture,
  'shops', PALETTE.shops,
  PALETTE.other, // fallback for 'other'
]

// Radius/stroke depend on whether a place is the currently highlighted one.
// highlight is handled by re-styling the SINGLE places layer (a data-driven
// expression), not by adding a second layer — Part 2 is allowed only the places
// layer (CLAUDE.md: no extra layers beyond the current spec's).
const radiusExpression = (name) =>
  name ? ['case', ['==', ['get', 'name'], name], 9, 4] : 4
const strokeExpression = (name) =>
  name ? ['case', ['==', ['get', 'name'], name], 2, 0] : 0

export default function Map({ onReady }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: NYC_CENTER,
      zoom: NYC_ZOOM,
    })
    mapRef.current = map

    // Two popups with distinct jobs (CLAUDE.md interaction rule): hover shows
    // ONLY the cheap name; click commits to the full detail. Nothing important
    // lives only behind a hover.
    const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    const clickPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false })

    // Track the highlighted name so the controller can rebuild paint expressions.
    let highlightedName = null

    map.on('load', () => {
      map.addSource(SOURCE, { type: 'vector', url: PLACES_PMTILES })
      map.addLayer({
        id: LAYER,
        type: 'circle',
        source: SOURCE,
        'source-layer': SOURCE_LAYER,
        paint: {
          'circle-color': colorExpression,
          'circle-radius': radiusExpression(null),
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': strokeExpression(null),
          'circle-opacity': 0.85,
        },
      })

      // Hover: pointer cursor + name-only tooltip (cheap info).
      map.on('mousemove', LAYER, (e) => {
        map.getCanvas().style.cursor = 'pointer'
        const f = e.features[0]
        hoverPopup.setLngLat(e.lngLat).setText(f.properties.name).addTo(map)
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

      // The imperative controller: the ONLY surface anything outside this file
      // uses to mutate the map. dispatchAction() (mapActions.js) calls these.
      onReady({
        flyTo: (center, zoom) => flyTo(map, center, zoom),

        // Part 2 filters by HIDING non-matching places (setFilter). 'all' clears.
        // (Part 3 changes this to dimming; not built here.)
        setCategoryFilter: (category) => {
          map.setFilter(LAYER, category === 'all' ? null : ['==', ['get', 'category'], category])
        },

        toggleLayer: (layer, visible) => {
          // Part 2 only exposes the logical 'places' layer.
          const id = layer === 'places' ? LAYER : layer
          map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
        },

        setHighlight: (name) => {
          highlightedName = name
          map.setPaintProperty(LAYER, 'circle-radius', radiusExpression(name))
          map.setPaintProperty(LAYER, 'circle-stroke-width', strokeExpression(name))
          // If a matching place is on screen, center on it. (Off-screen lookup by
          // name needs the name index built in Part 3, so we don't fly there yet.)
          const matches = map.queryRenderedFeatures({
            layers: [LAYER],
            filter: ['==', ['get', 'name'], name],
          })
          if (matches.length > 0) flyTo(map, matches[0].geometry.coordinates)
        },

        reset: () => {
          highlightedName = null
          map.setFilter(LAYER, null)
          map.setPaintProperty(LAYER, 'circle-radius', radiusExpression(null))
          map.setPaintProperty(LAYER, 'circle-stroke-width', strokeExpression(null))
          flyTo(map, NYC_CENTER, NYC_ZOOM)
        },
      })
    })

    return () => map.remove()
    // onReady is stable (defined once in App); we intentionally init the map once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} className="map-root" />
}
