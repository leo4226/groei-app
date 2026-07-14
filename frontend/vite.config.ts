import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))
const BUILD_HASH = process.env.VERCEL_GIT_COMMIT_SHA || 'dev'
const SHORT_HASH = BUILD_HASH === 'dev' ? 'dev' : BUILD_HASH.slice(0, 7)

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // /version.json carries the deployed build hash so a long-lived PWA
      // instance can detect a newer deploy and offer a one-tap refresh
      // (see components/ui/UpdateToast.tsx).
      name: 'emit-version-json',
      apply: 'build' as const,
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ hash: SHORT_HASH }) + '\n',
        })
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_HASH__: JSON.stringify(SHORT_HASH),
  },
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
