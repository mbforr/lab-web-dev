import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standard Vite + React setup. Nothing custom here: the PMTiles served from
// public/data/ are static assets fetched with HTTP range requests by the
// pmtiles JS protocol, so no dev-server middleware or tile route is needed.
export default defineConfig({
  plugins: [react()],
})
