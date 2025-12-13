import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills()
  ],
  resolve: {
    alias: {
      'pino': path.resolve(__dirname, 'src/pino-shim.ts')
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    },
    exclude: ['@aztec/bb.js', '@noir-lang/noir_js']
  },
  build: {
    target: 'esnext'
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer (used by WASM threads)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
})
