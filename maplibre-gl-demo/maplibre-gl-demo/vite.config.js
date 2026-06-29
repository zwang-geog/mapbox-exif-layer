import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // mapbox-exif-layer imports Evented from mapbox-gl; redirect to MapLibre
      'mapbox-gl': 'maplibre-gl',
    },
  },
})
