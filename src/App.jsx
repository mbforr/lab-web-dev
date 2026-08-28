import { useEffect, useRef, useState } from 'react'
import Map from './Map'
import FilterBar from './FilterBar'
import Chat from './Chat'
import SearchBox, { geocode } from './SearchBox'
import StatsPanel from './StatsPanel'
import ReportForm from './ReportForm'
import useStations from './useStations'
import { validateAction, dispatchAction } from './mapActions'
import './App.css'

// App owns the shared app state (which category is active, the action log) and
// defines runAction — the ONE function that takes a candidate action, runs it
// through the validation gate, dispatches valid ones to the map, and records the
// outcome in the log. Chips and chat both call runAction; nothing else moves the
// map. This is the "single dispatch path" from CLAUDE.md, made concrete.
export default function App() {
  // The map's imperative controller, handed up by Map once it has loaded.
  const controllerRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [log, setLog] = useState([])
  const [selectedPlace, setSelectedPlace] = useState(null) // set on click → opens ReportForm

  // Live Citi Bike stations (GBFS hook), pushed into the map.
  const stations = useStations()

  // User spot-reports served by our API. Fetched on mount and re-fetched after each submit
  // so a new report shows up on the map. If the API isn't running yet this fails visibly in
  // the console (teaching code lets it fail) and the reports layer stays empty.
  const API = import.meta.env.VITE_API_BASE_URL
  const [reports, setReports] = useState({ type: 'FeatureCollection', features: [] })
  function refetchReports() {
    fetch(`${API}/reports`).then((r) => r.json()).then(setReports)
  }
  useEffect(() => { refetchReports() }, [])

  async function runAction(raw) {
    const result = validateAction(raw)

    if (!result.valid) {
      // Invalid → logged and ignored. The map never changes on bad input.
      const detail = `${result.error}: ${
        typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw)
      }`
      setLog((l) => [...l, { valid: false, detail }])
      return
    }

    // Readiness check (not error handling): ignore actions that arrive before the
    // map has finished loading. In practice the controller is set within a second.
    if (!controllerRef.current) return

    const action = result.action

    // `search` is a MACRO, not a direct map op: we geocode the text (the same Photon
    // call the SearchBox uses), then re-enter runAction with a flyTo. So chat search,
    // manual search, and clicks all move the camera through the ONE flyTo path.
    if (action.action === 'search') {
      setLog((l) => [...l, { valid: true, action }])
      const locations = await geocode(action.query)
      if (locations.length > 0) {
        runAction({ action: 'flyTo', center: locations[0].center, zoom: 14 })
      }
      return
    }

    dispatchAction(action, controllerRef.current)

    // Keep the chip selection in sync when the action changes the filter, so a
    // chat "show me coffee" lights up the coffee chip too.
    if (action.action === 'setFilter') setSelectedCategory(action.category)
    if (action.action === 'reset') setSelectedCategory('all')

    setLog((l) => [...l, { valid: true, action }])
  }

  return (
    <div className="app">
      <Map
        onReady={(controller) => {
          controllerRef.current = controller
          setMapReady(true)
        }}
        onPlaceClick={setSelectedPlace}
        stations={stations}
        reports={reports}
      />

      {/* Filter chips overlay the map, top-left. */}
      <div className="overlay overlay-top">
        <FilterBar
          selected={selectedCategory}
          onSelect={(cat) => runAction({ action: 'setFilter', category: cat })}
        />
      </div>

      {/* The one search input, top-center: locations (Photon) + places (DuckDB-WASM). */}
      <div className="overlay overlay-search">
        <SearchBox onAction={runAction} />
      </div>

      {/* Chat + action log panel, right side. */}
      <div className="overlay overlay-right">
        <Chat runAction={runAction} log={log} />
      </div>

      {/* Viewport category counts via DuckDB-WASM, bottom-left. */}
      <div className="overlay overlay-stats">
        <StatsPanel controllerRef={controllerRef} mapReady={mapReady} />
      </div>

      {/* Clicking a place opens this report dialog (the click-commit detail surface). */}
      <ReportForm
        place={selectedPlace}
        onClose={() => setSelectedPlace(null)}
        onSubmitted={refetchReports}
      />
    </div>
  )
}
