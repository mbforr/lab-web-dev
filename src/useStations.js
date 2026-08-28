import { useEffect, useState } from 'react'

// useStations — the live Citi Bike feed that completes the app's purpose (destinations
// near a station WITH BIKES). GBFS splits the data in two: station_information is static
// (location, capacity) so we fetch it once; station_status changes constantly (bikes
// available) so we poll it every 30s. We join them on station_id into GeoJSON the map draws.
//
// GBFS is public, no key. Polling (not websockets) is the pattern taught in Part 4.

const GBFS = 'https://gbfs.lyft.com/gbfs/2.3/bkn/en'
const POLL_MS = 30_000

export default function useStations() {
  // A GeoJSON FeatureCollection; starts empty and fills once the first fetch lands.
  const [stations, setStations] = useState({ type: 'FeatureCollection', features: [] })

  useEffect(() => {
    let info = null // station_information keyed by station_id (fetched once)
    let timer = null
    let cancelled = false

    async function loadInfo() {
      const res = await fetch(`${GBFS}/station_information.json`)
      const data = await res.json()
      info = new Map(data.data.stations.map((s) => [s.station_id, s]))
    }

    async function poll() {
      // The ONE guard allowed here (CLAUDE.md error policy): if a status poll fails, keep
      // the last good state and warn — never blank the map or throw. Everything else in
      // this app fails loudly; the live feed is the documented exception.
      let status
      try {
        const res = await fetch(`${GBFS}/station_status.json`)
        status = (await res.json()).data.stations
      } catch (err) {
        console.warn('GBFS status poll failed; keeping last state', err)
        return
      }
      if (cancelled || !info) return

      const features = []
      for (const st of status) {
        const meta = info.get(st.station_id)
        if (!meta) continue // status for a station we have no location for — skip
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [meta.lon, meta.lat] },
          properties: {
            name: meta.name,
            capacity: meta.capacity,
            bikes: st.num_bikes_available, // the number that drives the styling
          },
        })
      }
      setStations({ type: 'FeatureCollection', features })
    }

    // Fetch the static info once, then poll status immediately and every 30s after.
    loadInfo().then(() => {
      if (cancelled) return
      poll()
      timer = setInterval(poll, POLL_MS)
    })

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [])

  return stations
}
