import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Vitest 2.1 pins Vite 5 types internally while the app builds with Vite 6;
  // the React plugin is compatible with both at runtime.
  // @ts-expect-error -- duplicate Vite type trees from vitest/node_modules/vite
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
})
