import { useEffect, useState } from 'react'
import { PALETTE } from './mapActions'
import { viewportStats } from './duck'

// The categories we show a tally for (four rider categories + the gray "other").
const ROWS = ['coffee', 'food', 'culture', 'shops', 'other']

// StatsPanel — the DuckDB-WASM teaching artifact. Every time the map settles after a
// pan/zoom, we ask DuckDB (in the browser) how many places of each category fall in the
// current viewport, and show the tally. Watch the console for query timing and the Network
// tab for range requests to places.parquet — there is no server in this loop.
export default function StatsPanel({ controllerRef, mapReady }) {
  const [counts, setCounts] = useState(null)

  useEffect(() => {
    if (!mapReady || !controllerRef.current) return
    const controller = controllerRef.current
    let timer = null

    // Debounced so a drag fires ONE query when the map settles, not one per frame.
    const run = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        const rows = await viewportStats(controller.getBounds())
        setCounts(Object.fromEntries(rows.map((r) => [r.category, r.n])))
      }, 300)
    }

    const unsubscribe = controller.onMoveEnd(run)
    run() // initial tally for the opening viewport
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [mapReady, controllerRef])

  return (
    <div className="stats-panel">
      <div className="stats-title">In view</div>
      {counts === null ? (
        <div className="stats-empty">computing…</div>
      ) : (
        ROWS.map((cat) => (
          <div key={cat} className="stats-row">
            <span className="stats-dot" style={{ backgroundColor: PALETTE[cat] }} />
            <span className="stats-cat">{cat}</span>
            <span className="stats-n">{(counts[cat] || 0).toLocaleString()}</span>
          </div>
        ))
      )}
    </div>
  )
}
