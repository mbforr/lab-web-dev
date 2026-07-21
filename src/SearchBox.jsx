import { useEffect, useState } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'

// NYC bbox (same study area as the pipeline) — biases Photon toward local results.
const NYC_BBOX = '-74.26,40.49,-73.70,40.92'

// geocode(text): location search via Photon (free, no key). Exported so the chat
// `search` action reuses the EXACT same call — chat and the SearchBox find locations
// the identical way. A failed fetch resolves to no results, which the Part 3 spec
// explicitly allows (the one place a soft failure is sanctioned besides the JSON gate).
export async function geocode(text) {
  const url = `https://photon.komoot.io/api?q=${encodeURIComponent(text)}&limit=5&bbox=${NYC_BBOX}`
  const data = await fetch(url)
    .then((r) => r.json())
    .catch(() => ({ features: [] }))
  return (data.features || []).map((f) => {
    const p = f.properties
    return {
      group: 'Locations',
      name: p.name || p.street || text,
      // A readable label: "Williamsburg, New York, New York"
      label: [p.name || p.street, p.city, p.state].filter(Boolean).join(', '),
      center: f.geometry.coordinates, // [lon, lat]
    }
  })
}

// One input, two result groups: "Locations" (Photon) and "Places" (our data). Both a
// location pick and a place pick emit ACTIONS through the shared dispatch (onAction),
// so manual search moves the map by the same path as chat and clicks. This is the only
// new widget in Part 3 (no layer switcher, no second box).
export default function SearchBox({ onAction, controllerRef }) {
  const [inputValue, setInputValue] = useState('')
  const [options, setOptions] = useState([])

  // Debounced 300ms: don't fire a Photon request (or scan the tiles) on every keystroke.
  useEffect(() => {
    const q = inputValue.trim()
    if (!q) {
      setOptions([])
      return
    }
    const timer = setTimeout(async () => {
      const locations = await geocode(q)
      // Feature search hits the places currently loaded in tiles via the map controller
      // (populated once the map is ready; read .current at call time). Full-dataset
      // search arrives in Part 4 (DuckDB-WASM).
      const places = (controllerRef.current?.searchFeatures(q) || []).map((p) => ({
        group: 'Places',
        name: p.name,
        label: p.name,
        center: p.center,
      }))
      setOptions([...locations, ...places])
    }, 300)
    return () => clearTimeout(timer)
  }, [inputValue, controllerRef])

  function handleSelect(_event, value) {
    // freeSolo can hand back a raw string on Enter; we only act on chosen options.
    if (!value || typeof value === 'string') return
    if (value.group === 'Locations') {
      onAction({ action: 'flyTo', center: value.center, zoom: 14 })
    } else {
      // A place: fly in close AND highlight it — the same highlight path chat uses.
      onAction({ action: 'flyTo', center: value.center, zoom: 16 })
      onAction({ action: 'highlight', name: value.name })
    }
  }

  return (
    <Autocomplete
      freeSolo
      options={options}
      groupBy={(o) => o.group}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.label || '')}
      filterOptions={(x) => x} // results are already server/tile-side filtered; don't re-filter
      onInputChange={(_e, v) => setInputValue(v)}
      onChange={handleSelect}
      className="search-box"
      renderInput={(params) => (
        <TextField {...params} size="small" placeholder="Search a place or neighborhood…" />
      )}
    />
  )
}
