// duck.js — DuckDB-WASM: a full SQL engine running INSIDE the browser tab.
//
// Why this exists (Part 4 teaching artifact): the app already renders places from
// PMTiles. Here we take the SAME cleaned data, published once as public/data/places.parquet,
// and query it with SQL client-side. No API, no query server. DuckDB-WASM reads the Parquet
// over plain HTTP range requests — it pulls only the byte ranges a query needs, the same
// trick PMTiles uses for tiles. So "query the data" costs zero backend.
//
// The WASM engine binary loads ONCE at init (from the jsDelivr CDN). After that, running a
// query makes no request except range reads of places.parquet — which is what the StatsPanel
// success criterion checks in the Network tab.

import * as duckdb from '@duckdb/duckdb-wasm'

const PARQUET_URL = `${window.location.origin}/data/places.parquet`
const TABLE = 'places' // the name we register the Parquet under

// Lazy singleton: the first caller pays the init cost; everyone shares one connection.
let connectionPromise = null

function initDuck() {
  if (connectionPromise) return connectionPromise
  connectionPromise = (async () => {
    // Pick the best WASM bundle for this browser and load its worker from jsDelivr.
    const bundles = duckdb.getJsDelivrBundles()
    const bundle = await duckdb.selectBundle(bundles)
    const worker = new Worker(bundle.mainWorker)
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker)
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

    // Register the Parquet as an HTTP-backed file. DuckDB will range-read it on demand;
    // we never download the whole file up front.
    await db.registerFileURL(TABLE, PARQUET_URL, duckdb.DuckDBDataProtocol.HTTP, false)
    return db.connect()
  })()
  return connectionPromise
}

// Small helper: run a query, log its wall-clock time (the console-timing the spec asks for),
// return plain JS rows.
async function timedQuery(label, sql) {
  const conn = await initDuck()
  const t = performance.now()
  const result = await conn.query(sql)
  console.log(`🦆 ${label} ${(performance.now() - t).toFixed(0)}ms`)
  return result.toArray().map((row) => row.toJSON())
}

// Category counts for the current viewport. A simple BETWEEN-bounds predicate over the
// whole 400k-row dataset — DuckDB reads only the columns/rows it needs from the Parquet.
export async function viewportStats({ west, south, east, north }) {
  const rows = await timedQuery(
    'viewportStats',
    `SELECT category, count(*)::INT AS n
     FROM read_parquet('${TABLE}')
     WHERE lon BETWEEN ${west} AND ${east}
       AND lat BETWEEN ${south} AND ${north}
     GROUP BY category`,
  )
  return rows // [{category, n}, ...]
}

// Full-dataset name search (Part 4 upgrade): unlike querySourceFeatures, this sees ALL
// ~400k places, not just the ones in loaded tiles. Single quotes in the input are escaped
// so a stray apostrophe can't break the SQL (this is not error handling — it's building a
// valid query string).
export async function searchNames(text) {
  const safe = text.replace(/'/g, "''")
  const rows = await timedQuery(
    'searchNames',
    `SELECT name, lon, lat
     FROM read_parquet('${TABLE}')
     WHERE name ILIKE '%${safe}%'
     LIMIT 10`,
  )
  return rows.map((r) => ({ name: r.name, center: [r.lon, r.lat] }))
}
