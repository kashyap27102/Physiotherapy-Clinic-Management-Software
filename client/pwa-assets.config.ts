import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Generates the PNG icons referenced by the web app manifest from public/favicon.svg.
// Run: npm run generate-pwa-assets
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/favicon.svg'],
})
