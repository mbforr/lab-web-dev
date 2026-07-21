import { useRef, useState } from 'react'
import Map from './Map'
import FilterBar from './FilterBar'
import Chat from './Chat'
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

  function runAction(raw) {
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

    dispatchAction(result.action, controllerRef.current)

    // Keep the chip selection in sync when the action changes the filter, so a
    // chat "show me coffee" lights up the coffee chip too.
    if (result.action.action === 'setFilter') setSelectedCategory(result.action.category)
    if (result.action.action === 'reset') setSelectedCategory('all')

    setLog((l) => [...l, { valid: true, action: result.action }])
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

      {/* Chat + action log panel, right side. */}
      <div className="overlay overlay-right">
        <Chat runAction={runAction} log={log} />
      </div>
    </div>
  )
}
