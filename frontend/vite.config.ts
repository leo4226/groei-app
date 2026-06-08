import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 1414,
    strictPort: true,
    open: false,
    proxy: {
      '/api': 'http://localhost:1415',
    },
  },
  build: {
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep React and its core deps together
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/scheduler/')) {
            return 'vendor-react'
          }
          // Zustand state management
          if (id.includes('node_modules/zustand')) {
            return 'vendor-state'
          }
          // React Router
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router'
          }
          // Everything else from node_modules
          if (id.includes('node_modules/')) {
            return 'vendor-other'
          }
        }
      }
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
