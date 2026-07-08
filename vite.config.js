import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Vite's dev server crashes if it watches tests/results (Playwright's
    // report/trace output) while OneDrive has one of those files locked
    // mid-sync -- exclude it entirely, the dev server has no reason to watch it.
    watch: { ignored: ['**/tests/results/**'] },
  },
})
