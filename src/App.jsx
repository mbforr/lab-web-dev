import { useRef, useState } from 'react'
import Map from './Map'
import FilterBar from './FilterBar'
import Chat from './Chat'
import SearchBox, { geocode } from './SearchBox'
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
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [log, setLog] = useState([])

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
      <Map onReady={(controller) => (controllerRef.current = controller)} />

      {/* Filter chips overlay the map, top-left. */}
      <div className="overlay overlay-top">
        <FilterBar
          selected={selectedCategory}
          onSelect={(cat) => runAction({ action: 'setFilter', category: cat })}
        />
      </div>

      {/* The one search input, top-center: locations (Photon) + places (our data). */}
      <div className="overlay overlay-search">
        <SearchBox onAction={runAction} controllerRef={controllerRef} />
      </div>

      {/* Chat + action log panel, right side. */}
      <div className="overlay overlay-right">
        <Chat runAction={runAction} log={log} />
      </div>
    </div>
  )
}
