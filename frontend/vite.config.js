import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/chat': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/fine': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/challan': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
